from fastapi import APIRouter
from database import db

router = APIRouter()

@router.get("/")
async def get_routes():
    routes_cursor = db.routes.find()
    routes = []
    async for route in routes_cursor:
        route["_id"] = str(route["_id"])
        routes.append(route)
    return routes