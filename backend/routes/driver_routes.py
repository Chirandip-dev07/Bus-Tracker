from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from models.driver_models import TripStartRequest, RouteChangeRequestModel
from services import driver_service as service
from services.eta_engine import process_gps_update
from utils.websocket_manager import manager
from utils.auth_dependencies import get_current_driver
from utils.jwt_handler import decode_access_token
import json

print("DRIVER ROUTES FILE LOADED")

router = APIRouter(prefix="/driver")

# ── REST endpoints ──
@router.get("/profile")
async def profile(driver=Depends(get_current_driver)):
    return await service.get_driver_profile(driver["sub"])

@router.post("/trip/start")
async def start_trip(request: TripStartRequest, driver=Depends(get_current_driver)):
    # The service now validates driver location vs first stop
    return await service.start_trip(
        driver["sub"],
        request.busId,
        request.latitude,
        request.longitude,
        request.direction,
        request.tripSource,
        request.tripDestination
    )

@router.post("/trip/end")
async def end_trip(driver=Depends(get_current_driver)):
    return await service.end_trip(driver["sub"])

@router.get("/trip/active")
async def active_trip(driver=Depends(get_current_driver)):
    trip = await service.get_active_trip(driver["sub"])
    if not trip:
        return {"active": False}
    return {"active": True, **trip}

@router.get("/trips")
async def trip_history(driver=Depends(get_current_driver)):
    return await service.get_trip_history(driver["sub"])

@router.post("/route-change")
async def route_change(request: RouteChangeRequestModel, driver=Depends(get_current_driver)):
    return await service.request_route_change(driver["sub"], request.requestedRouteId)

print("WEBSOCKET ROUTE REGISTERED")
# # ── WebSocket endpoint for GPS streaming ──
@router.websocket("/ws/gps")
async def websocket_gps(websocket: WebSocket, token: str = None):

    print("WS HIT")

    await websocket.accept()

    print("WS ACCEPTED")

    if not token:
        await websocket.send_json({
            "error": "Missing token"
        })
        await websocket.close(code=4001)
        return

    payload = decode_access_token(token)

    if not payload or payload.get("role") != "driver":
        await websocket.send_json({
            "error": "Invalid token"
        })
        await websocket.close(code=4003)
        return