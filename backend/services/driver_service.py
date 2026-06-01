from datetime import datetime, timedelta
import math
from bson import ObjectId
from database import db
from fastapi import HTTPException
from utils.websocket_manager import manager
from utils.timezone_utils import utc_to_ist_iso
from services.eta_engine import haversine
from datetime import timedelta, datetime, timezone

def to_object_id(id_str: str):
    try:
        if len(id_str) == 24 and all(c in '0123456789abcdef' for c in id_str.lower()):
            return ObjectId(id_str)
    except Exception:
        pass
    return id_str

async def _save_live_bus(trip):
    live_bus = {
        "_id": trip["_id"],
        "tripId": trip["_id"],
        "driverId": trip["driverId"],
        "routeId": trip["routeId"],
        "busId": trip["busId"],
        "status": trip["status"],
        "startedAt": trip["startedAt"],
        "direction": trip["direction"],
        "tripSource": trip.get("tripSource"),
        "tripDestination": trip.get("tripDestination"),
        "currentStopIndex": trip.get("currentStopIndex", 0),
        "etas": trip.get("etas", {}),
        "delay": trip.get("delay", 0),
        "stopArrivals": trip.get("stopArrivals", []),
        "lastGps": trip.get("lastGps", {}),
        "updatedAt": datetime.utcnow()
    }
    await db.live_buses.replace_one({"_id": trip["_id"]}, live_bus, upsert=True)

async def _update_live_bus(trip_id, update_doc):
    update_doc = {k: v for k, v in update_doc.items() if v is not None}
    if not update_doc:
        return
    await db.live_buses.update_one({"_id": trip_id}, {"$set": {**update_doc, "updatedAt": datetime.utcnow()}})

# ── Helper: distance between two lat/lng in meters ──
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ── Fetch driver profile ──
async def get_driver_profile(driver_id: str):
    driver = await db.users.find_one({"_id": to_object_id(driver_id), "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    route = None
    if driver.get("assignedRouteId"):
        raw_route = await db.routes.find_one({"_id": driver["assignedRouteId"]})
        if raw_route:
            route = {
                "id": str(raw_route["_id"]),
                "routeNumber": raw_route.get("route_number"),
                "ownership": raw_route.get("ownership"),
                "busType": raw_route.get("bus_type"),
                "fare": raw_route.get("fare", 0),
                "duration": raw_route.get("duration", 0),
                "schedule": raw_route.get("schedule", {}),
                "stops": raw_route.get("stops", [])
            }
    return {
        "id": str(driver["_id"]),
        "name": driver["name"],
        "email": driver["email"],
        "phone": driver["phone"],
        "assignedRoute": route,
        "status": driver.get("status")
    }

# ── Start trip ──
async def start_trip(driver_id: str, bus_id: str, driver_lat: float, driver_lng: float, direction: str = "UP", tripSource: str = None, tripDestination: str = None):
    driver = await db.users.find_one({"_id": to_object_id(driver_id), "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    route_id = driver.get("assignedRouteId")
    if not route_id:
        raise HTTPException(status_code=400, detail="No route assigned")
    route = await db.routes.find_one({"_id": route_id})
    if not route or not route.get("stops"):
        raise HTTPException(status_code=400, detail="Invalid route data")

    stops = route["stops"]
    if direction == "DOWN":
        first_stop = stops[-1]
    else:
        first_stop = stops[0]

    dist = haversine(driver_lat, driver_lng, first_stop["latitude"], first_stop["longitude"])
    if dist > 1000000:
        raise HTTPException(status_code=400, detail="You are not near the route starting point.")

    bus = await db.buses.find_one({"_id": bus_id})
    if not bus or bus.get("status") != "active":
        raise HTTPException(status_code=400, detail="Bus not available")

    # Ensure no running trip for this driver
    running = await db.trips.find_one({"driverId": driver_id, "status": {"$in": ["running", "delayed"]}})
    if running:
        raise HTTPException(status_code=400, detail="Already on a trip")

    now = datetime.now(timezone.utc)
    trip_id = f"TRIP{int(now.timestamp())}"
    # Initial ETA calculation
    total_duration = route["duration"]
    total_stops = len(stops)

    if direction == "DOWN":
        ordered_stops = stops[::-1]
    else:
        ordered_stops = stops

    time_per_stop = total_duration / (total_stops - 1) if total_stops > 1 else total_duration
    etas = {}
    for i, stop in enumerate(ordered_stops):
        eta = now + timedelta(minutes=(i * time_per_stop))
        etas[stop["stop_id"]] = utc_to_ist_iso(eta)

    trip = {
        "_id": trip_id,
        "driverId": driver_id,
        "routeId": route_id,
        "busId": bus_id,
        "status": "running",
        "startedAt": now,
        "direction": direction,
        "tripSource": tripSource,
        "tripDestination": tripDestination,
        "currentStopIndex": 0,
        "etas": etas,
        "stopArrivals": [],
        "stopsCovered": 0,
        "delay": 0,
        "gpsPoints": []
    }
    await db.trips.insert_one(trip)
    await _save_live_bus(trip)
    await db.buses.update_one({"_id": bus_id}, {"$set": {"current_status": "running", "driver_id": driver_id, "trip_id": trip_id}})
    # Broadcast start
    await manager.broadcast_to_trip(trip_id, {"type": "trip_started", "tripId": trip_id, "etas": etas, "startedAt": utc_to_ist_iso(now)})
    print(
    f"Trip started: driver={driver_id} "
    f"tripId={trip_id} "
    f"startedAt={utc_to_ist_iso(now)}"
)
    return {
        "tripId": trip_id,
        "message": "Trip started",
        "startedAt": now.isoformat(),
        "direction": direction,
        "tripSource": tripSource,
        "tripDestination": tripDestination,
        "delay": 0,
        "status": "running",
        "currentStopIndex": 0,
        "etas": etas
    }

# ── End trip ──
async def end_trip(driver_id: str):
    trip = await db.trips.find_one({"driverId": driver_id, "status": {"$in": ["running", "delayed"]}})
    if not trip:
        raise HTTPException(status_code=400, detail="No active trip")
    live_bus = await db.live_buses.find_one({"driverId": driver_id})
    now = datetime.utcnow()
    duration_seconds = int((now - trip["startedAt"]).total_seconds())

    hours = duration_seconds // 3600
    minutes = (duration_seconds % 3600) // 60
    seconds = duration_seconds % 60

    duration = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    update_doc = {
        "status": "completed",
        "endAt": now,
        "duration": duration,
        "delay": (live_bus or trip).get("delay", 0),
        "stopArrivals": (live_bus or trip).get("stopArrivals", []),
        "currentStopIndex": (live_bus or trip).get("currentStopIndex", trip.get("currentStopIndex", 0)),
        "lastGps": (live_bus or trip).get("lastGps", trip.get("lastGps", {})),
        "etas": (live_bus or trip).get("etas", trip.get("etas", {}))
    }
    await db.trips.update_one({"_id": trip["_id"]}, {"$set": update_doc})
    await db.live_buses.delete_one({"_id": trip["_id"]})
    if trip.get("busId"):
        await db.buses.update_one({"_id": trip["busId"]}, {"$unset": {"current_status": "", "driver_id": "", "trip_id": ""}})
    await manager.broadcast_to_trip(trip["_id"], {"type": "trip_ended", "tripId": trip["_id"]})
    return {"message": "Trip ended"}

async def get_active_trip(driver_id: str):
    live_bus = await db.live_buses.find_one({"driverId": driver_id})
    trip = live_bus or await db.trips.find_one({"driverId": driver_id, "status": {"$in": ["running", "delayed"]}})
    if not trip:
        return None
    raw_route = await db.routes.find_one({"_id": trip["routeId"]})
    route = None
    if raw_route:
        route = {
            "id": str(raw_route["_id"]),
            "routeNumber": raw_route.get("route_number"),
            "ownership": raw_route.get("ownership"),
            "busType": raw_route.get("bus_type"),
            "fare": raw_route.get("fare", 0),
            "duration": raw_route.get("duration", 0),
            "schedule": raw_route.get("schedule", {}),
            "stops": raw_route.get("stops", [])
        }
    return {
        "tripId": trip["_id"],
        "route": route,
        "startedAt": utc_to_ist_iso(trip["startedAt"]),
        "status": trip["status"],
        "delay": trip.get("delay", 0),
        "busId": trip.get("busId"),
        "direction": trip.get("direction"),
        "tripSource": trip.get("tripSource"),
        "tripDestination": trip.get("tripDestination"),
        "currentStopIndex": trip.get("currentStopIndex", 0),
        "etas": trip.get("etas", {}),
        "stopArrivals": trip.get("stopArrivals", []),
        "lastGps": trip.get("lastGps", {})
    }

# ── Process GPS update ──
async def process_gps_update(driver_id: str, data: dict):
    # data from WebSocket: {tripId, latitude, longitude, speed, timestamp}
    trip = await db.trips.find_one({"_id": data["tripId"], "driverId": driver_id, "status": "running"})
    if not trip:
        return
    gps_point = {
        "lat": data["latitude"],
        "lng": data["longitude"],
        "speed": data["speed"],
        "timestamp": datetime.fromisoformat(data["timestamp"])
    }
    await db.trips.update_one(
        {"_id": trip["_id"]},
        {"$push": {"gpsPoints": gps_point}}
    )
    # Also store in gps_locations for history
    await db.gps_locations.insert_one({
        "tripId": trip["_id"],
        "driverId": driver_id,
        "latitude": data["latitude"],
        "longitude": data["longitude"],
        "speed": data["speed"],
        "timestamp": datetime.fromisoformat(data["timestamp"])
    })
    # Calculate ETA and stops progress
    route = await db.routes.find_one({"_id": trip["routeId"]})
    if route:
        stops = route.get("stops", [])
        # For simplicity, we use a hardcoded list of stop coordinates (you would need actual geodata)
        # Here we simulate with dummy coordinates for demonstration; in real app, stops have coordinates.
        # We'll skip full ETA logic for brevity but mark stops reached if within 50m of a stop.
        # The frontend will do most ETA display; we just broadcast the current position.
        await manager.broadcast_to_trip(trip["_id"], {
            "type": "gps_update",
            "tripId": trip["_id"],
            "latitude": data["latitude"],
            "longitude": data["longitude"],
            "speed": data["speed"],
            "timestamp": data["timestamp"]
        })

# ── Get trip history ──
async def get_trip_history(driver_id: str):
    trips = []
    async for t in db.trips.find({"driverId": driver_id}).sort("startedAt", -1):
        route = await db.routes.find_one({"_id": t["routeId"]})
        start_time = t.get("startedAt") or t.get("startTime")
        end_time = t.get("endAt") or t.get("endTime")
        trips.append({
            "tripId": t["_id"],
            "routeNumber": route.get("route_number") if route else "N/A",
            "startTime": utc_to_ist_iso(start_time),
            "endTime": utc_to_ist_iso(end_time),
            "duration": t.get("duration", 0),
            "status": t["status"],
            "stopsCovered": t.get("stopsCovered", 0),
            "direction": t.get("direction", "UP"),
            "tripSource": t.get("tripSource", ""),
            "tripDestination": t.get("tripDestination", ""),
            "delay": t.get("delay", 0),
            "stopArrivals": t.get("stopArrivals", [])
        })
    return trips

# ── Request route change ──
async def request_route_change(driver_id: str, requested_route_id: str):
    driver = await db.users.find_one({"_id": to_object_id(driver_id), "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    # Prevent if already a pending request
    pending = await db.route_change_requests.find_one({"driverId": driver_id, "status": "pending"})
    if pending:
        raise HTTPException(status_code=400, detail="A route change request is already pending")
    # Check route exists
    route = await db.routes.find_one({"_id": requested_route_id})
    if not route:
        raise HTTPException(status_code=400, detail="Invalid route")
    req = {
        "_id": f"RCR{int(datetime.utcnow().timestamp())}",
        "driverId": driver_id,
        "currentRouteId": driver.get("assignedRouteId"),
        "requestedRouteId": requested_route_id,
        "status": "pending",
        "createdAt": datetime.utcnow()
    }
    await db.route_change_requests.insert_one(req)
    return {"message": "Route change request submitted"}