from fastapi import APIRouter, Depends
from utils.auth_dependencies import get_current_admin
from models.admin_models import RouteCreate, RouteUpdate, BusCreate, BusUpdate, RejectRequest, AssignRouteRequest
from services import admin_service as service
from models.route_models import RouteCreateRequest, RouteUpdateRequest
import datetime
import database as db

router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)])

# Dashboard stats
@router.get("/stats")
async def dashboard_stats():
    return await service.get_dashboard_stats()

# ── Driver Applications ──
@router.get("/driver-applications")
async def list_applications():
    return await service.get_driver_applications()

@router.get("/driver-applications/{app_id}")
async def get_application(app_id: str):
    return await service.get_application(app_id)

@router.post("/driver-applications/{app_id}/approve")
async def approve_application(app_id: str):
    return await service.approve_application(app_id)

@router.post("/driver-applications/{app_id}/reject")
async def reject_application(app_id: str, req: RejectRequest):
    return await service.reject_application(app_id, req.reason)

# ── Live Buses ──
@router.get("/live-buses")
async def live_buses():
    return await service.get_live_buses()

# ── Routes ──
@router.get("/routes")
async def list_routes():
    return await service.get_all_routes()

@router.post("/routes")
async def create_route(route: RouteCreateRequest):
    # Convert to dict and add an _id
    doc = route.dict()
    doc["_id"] = f"ROUTE{int(datetime.utcnow().timestamp())}"
    # Ensure stops have proper order
    for i, stop in enumerate(doc["stops"]):
        stop["order"] = i + 1
    await db.routes.insert_one(doc)
    return {"message": "Route created"}

@router.put("/routes/{route_id}")
async def update_route(route_id: str, route: RouteUpdateRequest):
    update_doc = {k: v for k, v in route.dict().items() if v is not None}
    if "stops" in update_doc:
        for i, stop in enumerate(update_doc["stops"]):
            stop["order"] = i + 1
    await db.routes.update_one({"_id": route_id}, {"$set": update_doc})
    return {"message": "Route updated"}

@router.delete("/routes/{route_id}")
async def delete_route(route_id: str):
    return await service.delete_route(route_id)

# ── Trips ──
@router.get("/trips")
async def list_trips():
    return await service.get_all_trips()

@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    return await service.get_trip(trip_id)

# ── Users ──
@router.get("/users")
async def list_users(role: str = None):
    return await service.get_users(role)

@router.get("/users/{user_id}")
async def get_user(user_id: str):
    return await service.get_user(user_id)

@router.post("/users/{user_id}/suspend")
async def suspend_user(user_id: str):
    return await service.suspend_user(user_id)

@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str):
    return await service.activate_user(user_id)

@router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    return await service.delete_user(user_id)

@router.post("/users/{user_id}/assign-route")
async def assign_route(user_id: str, req: AssignRouteRequest):
    return await service.assign_route_to_driver(user_id, req.routeId)

@router.post("/users/{user_id}/remove-route")
async def remove_route(user_id: str):
    return await service.remove_route_from_driver(user_id)

# ── Buses ──
@router.get("/buses")
async def list_buses():
    return await service.get_all_buses()

@router.post("/buses")
async def create_bus(bus: BusCreate):
    return await service.create_bus(bus)

@router.put("/buses/{bus_id}")
async def update_bus(bus_id: str, updates: BusUpdate):
    # Convert to dict excluding unset fields
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    return await service.update_bus(bus_id, update_data)

@router.delete("/buses/{bus_id}")
async def delete_bus(bus_id: str):
    return await service.delete_bus(bus_id)