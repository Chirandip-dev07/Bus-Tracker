from fastapi import APIRouter
from services.virtual_bus_service import get_virtual_buses_for_route

router = APIRouter()

@router.get("/{route_id}/virtual")
async def virtual_buses(route_id: str):
    buses = await get_virtual_buses_for_route(route_id)
    return buses