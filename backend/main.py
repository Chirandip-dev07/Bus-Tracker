from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import check_connection, setup_indexes, setup_registration_indexes, seed_routes
from routes.auth_routes import router as auth_router
from routes.forgot_password_routes import router as forgot_password_router
from routes.register_routes import router as register_router
from routes.route_routes import router as route_router
from routes.admin_routes import router as admin_router
from database import db
from routes.driver_routes import router as driver_router
from routes.bus_routes import router as bus_router
from routes.passenger_routes import router as passenger_router

app = FastAPI(title="Where Is My Bus - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(forgot_password_router, prefix="/api/auth/forgot-password")
app.include_router(register_router, prefix="/api/auth/register")
app.include_router(route_router, prefix="/api/routes")
app.include_router(admin_router, prefix="/api")
app.include_router(driver_router, prefix="/api")
app.include_router(bus_router, prefix="/api/buses")
app.include_router(passenger_router, prefix="/api")

@app.on_event("startup")
async def startup():
    await check_connection()
    await setup_indexes()
    await setup_registration_indexes()
    # await seed_routes()
    # await seed_admin_demo_data()
    print("Registered routes:")
    for route in app.routes:
        methods = getattr(route, 'methods', None)
        print(route.path, methods)

@app.get("/")
async def root():
    return {"message": "Where Is My Bus API is running"}

async def seed_admin_demo_data():
    """Insert sample buses, trips, and an admin user if not present."""
    from datetime import datetime, timedelta
    # Ensure admin user exists
    admin = await db.users.find_one({"role": "admin"})
    if not admin:
        from utils.password_handler import hash_password
        await db.users.insert_one({
            "_id": "ADM001",
            "name": "Admin User",
            "email": "admin@busapp.com",
            "phone": "0000000000",
            "passwordHash": hash_password("Admin@123"),
            "role": "admin",
            "isActive": True,
            "createdAt": datetime.utcnow()
        })
    # Buses
    if await db.buses.count_documents({}) == 0:
        buses = [
            {"_id": "BUS001", "busId": "77A-001", "routeId": "ROUTE001", "ownership": "Private", "busType": "Non AC", "status": "active", "current_status": "running", "driver_id": None, "current_location": {"lat": 22.5726, "lng": 88.3639}, "speed": 35, "current_stop": "MG Road", "trip_id": "TRIP001"},
            {"_id": "BUS002", "busId": "259-001", "routeId": "ROUTE002", "ownership": "Government", "busType": "AC", "status": "active", "current_status": "running", "driver_id": None, "current_location": {"lat": 22.5435, "lng": 88.3342}, "speed": 40, "current_stop": "Airport", "trip_id": "TRIP002"},
            {"_id": "BUS003", "busId": "30B-001", "routeId": "ROUTE003", "ownership": "Private", "busType": "Non AC", "status": "maintenance", "current_status": None, "driver_id": None},
        ]
        await db.buses.insert_many(buses)
    # Trips
    if await db.trips.count_documents({}) == 0:
        trips = [
            {"_id": "TRIP001", "busId": "BUS001", "routeId": "ROUTE001", "driverId": None, "startTime": datetime.utcnow() - timedelta(hours=1), "endTime": None, "status": "running", "stopsCovered": 5, "avgSpeed": 35, "passengerContributors": 12},
            {"_id": "TRIP002", "busId": "BUS002", "routeId": "ROUTE002", "driverId": None, "startTime": datetime.utcnow() - timedelta(minutes=30), "endTime": None, "status": "running", "stopsCovered": 2, "avgSpeed": 40, "passengerContributors": 8},
            {"_id": "TRIP003", "busId": "BUS001", "routeId": "ROUTE001", "driverId": None, "startTime": datetime.utcnow() - timedelta(hours=5), "endTime": datetime.utcnow() - timedelta(hours=4), "status": "completed", "stopsCovered": 10, "avgSpeed": 38, "passengerContributors": 20},
        ]
        await db.trips.insert_many(trips)
    # Notifications collection empty okay
    print("✅ Demo admin data seeded")

from fastapi import WebSocket

@app.websocket("/testws")
async def testws(websocket: WebSocket):
    print("TEST WS HIT")

    await websocket.accept()

    print("TEST WS ACCEPTED")

    while True:
        data = await websocket.receive_text()
        print("MSG:", data)