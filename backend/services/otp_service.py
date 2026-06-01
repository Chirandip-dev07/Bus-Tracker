import random
import string
from datetime import datetime, timedelta
from database import db
from fastapi import HTTPException

# In‑memory rate limiter (simple, for development)
rate_limit_store = {}  # key: identifier, value: list of timestamps

MAX_ATTEMPTS = 5
MAX_RESEND = 3
OTP_EXPIRY_MINUTES = 5
RESEND_WINDOW_MINUTES = 60  # within 60 min max resends

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

async def can_send_otp(identifier: str) -> bool:
    # Check resend count in database
    existing = await db.otps.find_one(
        {"identifier": identifier, "expires_at": {"$gt": datetime.utcnow()}}
    )
    if existing and existing.get("resend_count", 0) >= MAX_RESEND:
        raise HTTPException(status_code=429, detail="Maximum resend limit reached. Please try later.")

    # Rate limit by time window (simple memory‑based)
    now = datetime.utcnow()
    if identifier in rate_limit_store:
        # Remove old entries
        rate_limit_store[identifier] = [
            t for t in rate_limit_store[identifier]
            if t > now - timedelta(minutes=RESEND_WINDOW_MINUTES)
        ]
        if len(rate_limit_store[identifier]) >= MAX_RESEND:
            raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait before trying again.")
    else:
        rate_limit_store[identifier] = []
    rate_limit_store[identifier].append(now)
    return True

async def store_otp(identifier: str, otp: str):
    # Remove any previous active OTPs for this identifier
    await db.otps.delete_many({"identifier": identifier})
    doc = {
        "identifier": identifier,
        "otp": otp,
        "attempts": 0,
        "resend_count": 1,  # this is the first send (if resend, will be incremented)
        "verified": False,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    }
    await db.otps.insert_one(doc)

async def verify_otp(identifier: str, otp: str):
    record = await db.otps.find_one(
        {"identifier": identifier, "expires_at": {"$gt": datetime.utcnow()}}
    )
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    if record["attempts"] >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Maximum OTP attempts reached.")

    # Increment attempts
    await db.otps.update_one(
        {"_id": record["_id"]},
        {"$inc": {"attempts": 1}}
    )

    if record["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    # Mark verified
    await db.otps.update_one(
        {"_id": record["_id"]},
        {"$set": {"verified": True, "verified_at": datetime.utcnow()}}
    )
    return True

async def invalidate_otp(identifier: str):
    await db.otps.delete_many({"identifier": identifier})

async def can_reset_password(identifier: str) -> bool:
    """Check if there is a recently verified OTP for this identifier."""
    record = await db.otps.find_one(
        {"identifier": identifier, "verified": True, "expires_at": {"$gt": datetime.utcnow()}}
    )
    if not record:
        raise HTTPException(status_code=400, detail="No verified OTP found. Please verify your identity first.")
    # Check that verification was done within the last 5 minutes
    if "verified_at" not in record or (datetime.utcnow() - record["verified_at"]).total_seconds() > 300:
        raise HTTPException(status_code=400, detail="Verification expired. Please start again.")
    return True

async def reset_user_password(identifier: str, new_password_hash: str):
    # Update the user's password hash
    result = await db.users.update_one(
        {"$or": [{"email": identifier}, {"phone": identifier}]},
        {"$set": {"passwordHash": new_password_hash}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
    # Remove OTP record so it cannot be reused
    await db.otps.delete_many({"identifier": identifier})