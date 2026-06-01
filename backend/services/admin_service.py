from datetime import datetime
from bson import ObjectId
from database import db
from fastapi import HTTPException
from utils.password_handler import hash_password

def to_object_id(id_str: str):
    """Convert string to ObjectId if it's a valid hex string, otherwise return as is."""
    try:
        if len(id_str) == 24 and all(c in '0123456789abcdef' for c in id_str.lower()):
            return ObjectId(id_str)
    except:
        pass
    return id_str

# ── Dashboard Stats ──
async def get_dashboard_stats():
    total_passengers = await db.users.count_documents({"role": "passenger", "isActive": True})
    total_drivers = await db.users.count_documents({"role": "driver", "isActive": True})
    pending_applications = await db.driver_applications.count_documents({"applicationStatus": "pending"})
    total_routes = await db.routes.count_documents({})
    total_buses = await db.buses.count_documents({})
    live_buses = await db.live_buses.count_documents({"status": {"$in": ["running", "delayed"]}})
    trips_today = await db.trips.count_documents({"startTime": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}})
    return {
        "totalPassengers": total_passengers,
        "totalDrivers": total_drivers,
        "pendingApplications": pending_applications,
        "totalRoutes": total_routes,
        "totalBuses": total_buses,
        "liveBuses": live_buses,
        "tripsToday": trips_today
    }

# ── Driver Applications ──
async def get_driver_applications():
    apps = []
    async for app in db.driver_applications.find():
        app["_id"] = str(app["_id"])
        apps.append(app)
    return apps

async def get_application(app_id: str):
    app = await db.driver_applications.find_one({"_id": ObjectId(app_id)})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    app["_id"] = str(app["_id"])
    return app

async def approve_application(app_id: str):
    app = await db.driver_applications.find_one({"_id": ObjectId(app_id)})
    if not app or app["applicationStatus"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid application")
    # Create user from application
    user_doc = {
        "name": app["name"],
        "email": app["email"],
        "phone": app["phone"],
        "passwordHash": app["passwordHash"],
        "role": "driver",
        "isActive": True,
        "status": "approved",
        "assignedRouteId": app.get("routeId"),
        "licenseNumber": app["licenseNumber"],
        "licenseExpiryDate": app["licenseExpiryDate"],
        "experienceYears": app["experienceYears"],
        "operatorName": app.get("operatorName"),
        "createdAt": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    # Update application status
    await db.driver_applications.update_one(
        {"_id": ObjectId(app_id)},
        {"$set": {"applicationStatus": "approved", "approvedAt": datetime.utcnow()}}
    )
    # Notify (stub)
    await db.notifications.insert_one({
        "userId": str(result.inserted_id),
        "type": "driver_approved",
        "message": "Your driver application has been approved.",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return {"message": "Application approved"}

async def reject_application(app_id: str, reason: str):
    app = await db.driver_applications.find_one({"_id": ObjectId(app_id)})
    if not app or app["applicationStatus"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid application")
    await db.driver_applications.update_one(
        {"_id": ObjectId(app_id)},
        {"$set": {"applicationStatus": "rejected", "rejectionReason": reason, "rejectedAt": datetime.utcnow()}}
    )
    return {"message": "Application rejected"}

# ── Live Buses ──
async def get_live_buses():
    buses = []
    async for live_bus in db.live_buses.find({"status": {"$in": ["running", "delayed"]}}):
        route = None
        driver = None
        if live_bus.get("routeId"):
            route = await db.routes.find_one({"_id": to_object_id(live_bus["routeId"])})
        if live_bus.get("driverId"):
            driver = await db.users.find_one({"_id": to_object_id(live_bus["driverId"])})

        current_stop = "N/A"
        if route and isinstance(route.get("stops"), list):
            idx = live_bus.get("currentStopIndex")
            if isinstance(idx, int) and 0 <= idx < len(route["stops"]):
                current_stop = route["stops"][idx].get("name", "N/A")

        buses.append({
            "_id": str(live_bus.get("_id")),
            "tripId": live_bus.get("tripId") or str(live_bus.get("_id")),
            "busId": live_bus.get("busId"),
            "routeId": live_bus.get("routeId"),
            "driverId": live_bus.get("driverId"),
            "route": route.get("route_number") if route else "N/A",
            "driver": driver.get("name") if driver else "N/A",
            "status": live_bus.get("status"),
            "speed": live_bus.get("lastGps", {}).get("speed", 0),
            "current_stop": current_stop,
            "current_location": live_bus.get("lastGps"),
            "direction": live_bus.get("direction"),
            "delay": live_bus.get("delay", 0),
        })
    return buses

# ── Routes ──
async def get_all_routes():
    routes = []
    async for route in db.routes.find():
        route["_id"] = str(route["_id"])
        routes.append(route)
    return routes

async def create_route(route_data):
    route_data["_id"] = f"ROUTE{int(datetime.utcnow().timestamp())}"  # simple unique id
    await db.routes.insert_one(route_data.dict())
    return {"message": "Route created"}

async def update_route(route_id: str, route_data):
    await db.routes.update_one({"_id": route_id}, {"$set": route_data.dict()})
    return {"message": "Route updated"}

async def delete_route(route_id: str):
    await db.routes.delete_one({"_id": route_id})
    return {"message": "Route deleted"}

# ── Trips ──
async def get_all_trips():
    trips = []
    async for trip in db.trips.find().sort("startTime", -1):
        trip["_id"] = str(trip["_id"])
        trips.append(trip)
    return trips

async def get_trip(trip_id: str):
    trip = await db.trips.find_one({"_id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip["_id"] = str(trip["_id"])
    return trip

# ── Users ──
async def get_users(role: str = None):
    query = {}
    if role:
        query["role"] = role
    users = []
    async for user in db.users.find(query):
        user["_id"] = str(user["_id"])
        user.pop("passwordHash", None)
        users.append(user)
    return users

async def get_user(user_id: str):
    user = await db.users.find_one({"_id": to_object_id(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    user.pop("passwordHash", None)
    return user

async def suspend_user(user_id: str):
    res = await db.users.update_one({"_id": to_object_id(user_id)}, {"$set": {"isActive": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User suspended"}

async def activate_user(user_id: str):
    res = await db.users.update_one({"_id": to_object_id(user_id)}, {"$set": {"isActive": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User activated"}

async def delete_user(user_id: str):
    res = await db.users.delete_one({"_id": to_object_id(user_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

async def assign_route_to_driver(user_id: str, route_id: str):
    user = await db.users.find_one({"_id": to_object_id(user_id), "role": "driver"})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.users.update_one({"_id": to_object_id(user_id)}, {"$set": {"assignedRouteId": route_id}})
    return {"message": "Route assigned"}

async def remove_route_from_driver(user_id: str):
    await db.users.update_one({"_id": to_object_id(user_id)}, {"$unset": {"assignedRouteId": ""}})
    return {"message": "Route removed"}

# ── Buses ──
async def get_all_buses():
    buses = []
    async for bus in db.buses.find():
        bus["_id"] = str(bus["_id"])
        buses.append(bus)
    return buses

async def create_bus(bus_data):
    bus_data["_id"] = f"BUS{int(datetime.utcnow().timestamp())}"
    await db.buses.insert_one(bus_data.dict())
    return {"message": "Bus created"}

async def update_bus(bus_id: str, updates):
    await db.buses.update_one({"_id": bus_id}, {"$set": updates})
    return {"message": "Bus updated"}

async def delete_bus(bus_id: str):
    await db.buses.delete_one({"_id": bus_id})
    return {"message": "Bus deleted"}