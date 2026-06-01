import motor.motor_asyncio
from pymongo.errors import ConnectionFailure
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = "bus_tracking_app"

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

async def check_connection():
    try:
        await client.admin.command('ping')
        print("✅ Connected to MongoDB")
    except ConnectionFailure:
        print("❌ MongoDB connection failed")

async def setup_indexes():
    """Create TTL index on otps collection to auto-delete expired documents."""
    await db.otps.create_index("expires_at", expireAfterSeconds=0)
    print("✅ OTP TTL index created/verified")

async def setup_registration_indexes():
    """TTL indexes for registration OTPs and unique index for duplicate check"""
    await db.registration_otps.create_index("email_otp_expires_at", expireAfterSeconds=0)
    await db.registration_otps.create_index("phone_otp_expires_at", expireAfterSeconds=0)
    # Compound unique index for email+phone (optional)
    await db.registration_otps.create_index([("email", 1), ("phone", 1)], unique=True, sparse=True)
    print("✅ Registration indexes created/verified")

async def seed_routes():
    """Insert sample routes if collection is empty."""
    count = await db.routes.count_documents({})
    if count == 0:
        sample_routes = [
            {"_id": "ROUTE001", "route_number": "77A", "source": "Howrah Station", "destination": "Esplanade", "ownership": "Private", "bus_type": "Non AC"},
            {"_id": "ROUTE002", "route_number": "259", "source": "Airport", "destination": "Tollygunge", "ownership": "Government", "bus_type": "AC"},
            {"_id": "ROUTE003", "route_number": "30B", "source": "Garia", "destination": "Ballygunge", "ownership": "Private", "bus_type": "Non AC"},
            {"_id": "ROUTE004", "route_number": "S12", "source": "New Town", "destination": "Salt Lake", "ownership": "Private", "bus_type": "AC"},
            {"_id": "ROUTE005", "route_number": "AC12", "source": "Howrah", "destination": "Sealdah", "ownership": "Government", "bus_type": "AC"},
            {"_id": "ROUTE006", "route_number": "VS1", "source": "Esplanade", "destination": "VIP Road", "ownership": "Private", "bus_type": "Non AC"},
            {"_id": "ROUTE007", "route_number": "DN46", "source": "Dunlop", "destination": "Nagerbazar", "ownership": "Government", "bus_type": "AC"},
        ]
        await db.routes.insert_many(sample_routes)
        print("✅ Sample routes seeded")