from fastapi import APIRouter, Query
from pydantic import BaseModel
from fastapi import HTTPException, Depends
from bson import ObjectId
from database import db
from services import passenger_service as service
from fastapi import WebSocket, WebSocketDisconnect
from utils.websocket_manager import manager
from utils.jwt_handler import decode_access_token
from utils.auth_dependencies import get_current_passenger

router = APIRouter(prefix="/passenger")

class NearestStopRequest(BaseModel):
    latitude: float
    longitude: float

class SearchRoutesRequest(BaseModel):
    source: str
    destination: str

@router.get("/stops")
async def get_stops():
    stops = await service.get_all_stops()
    return stops

@router.get("/profile")
async def passenger_profile(user=Depends(get_current_passenger)):
    user_id = user["sub"]
    if ObjectId.is_valid(user_id):
        user_query_id = ObjectId(user_id)
    else:
        user_query_id = user_id

    user_doc = await db.users.find_one({"_id": user_query_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "name": user_doc["name"],
        "email": user_doc["email"],
        "phone": user_doc.get("phone", ""),
        "status": user_doc.get("status", "active"),
        "createdAt": user_doc.get("createdAt", "")
    }

@router.post("/nearest-stop")
async def nearest_stop(req: NearestStopRequest):
    return await service.find_nearest_stop(req.latitude, req.longitude)

@router.post("/search-routes")
async def search_routes(req: SearchRoutesRequest):
    if req.source.lower() == req.destination.lower():
        return {"error": "Source and destination cannot be the same."}
    results = await service.search_routes(req.source, req.destination)
    return results

@router.get("/live-buses")
async def live_buses(routeId: str, direction: str):
    buses = await service.get_live_buses(routeId, direction)
    return buses

@router.get("/live-bus/{trip_id}")
async def live_bus_detail(trip_id: str):
    return await service.get_live_bus_detail(trip_id)

@router.get("/route-schedule")
async def route_schedule(routeId: str, source: str, destination: str, direction: str):
    route = await db.routes.find_one({"_id": routeId})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    # The generate_route_schedule function expects route doc, direction, source, dest
    try:
        result = service.generate_route_schedule(route, direction, source, destination)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.websocket("/ws/trip/{trip_id}")
async def passenger_trip_ws(websocket: WebSocket, trip_id: str, token: str = None):
    if not token:
        await websocket.close(code=4001)
        return
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4003)
        return
    # Connect passenger to the trip's broadcast room
    await manager.connect_subscriber(trip_id, websocket)
    try:
        while True:
            # Keep the connection alive; all messages are sent by the server
            await websocket.receive_text()  # ignore incoming
    except WebSocketDisconnect:
        manager.disconnect_subscriber(trip_id, websocket)
    except Exception:
        manager.disconnect_subscriber(trip_id, websocket)