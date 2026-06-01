from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
import logging
from services.otp_service import (
    generate_otp,
    can_send_otp,
    store_otp,
    verify_otp,
    can_reset_password,
    reset_user_password,
    invalidate_otp,
)
from utils.password_handler import hash_password
from database import db

router = APIRouter()

class SendOtpRequest(BaseModel):
    identifier: str  # email or phone

class VerifyOtpRequest(BaseModel):
    identifier: str
    otp: str

class ResetPasswordRequest(BaseModel):
    identifier: str
    newPassword: str

@router.post("/send-otp")
async def send_otp(request: SendOtpRequest):
    identifier = request.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifier is required.")

    # Check if user exists (do not reveal if not found)
    user = await db.users.find_one({
        "$or": [{"email": identifier}, {"phone": identifier}]
    })

    if not user:
        # Return same message even if account doesn't exist
        return {
            "success": True,
            "message": "If an account exists, a verification code has been sent."
        }

    # Check rate limits and resend limits
    await can_send_otp(identifier)

    # Increment resend count if an active OTP already exists
    existing = await db.otps.find_one(
        {"identifier": identifier, "expires_at": {"$gt": datetime.utcnow()}}
    )
    if existing:
        await db.otps.update_one(
            {"_id": existing["_id"]},
            {"$inc": {"resend_count": 1}, "$set": {"attempts": 0, "verified": False}}
        )
    else:
        # First time request
        pass

    otp = generate_otp()
    await store_otp(identifier, otp)

    # In a real app, send via email/SMS. Do NOT log the OTP value.
    logging.info("OTP sent to %s", identifier)

    return {
        "success": True,
        "message": "If an account exists, a verification code has been sent."
    }

@router.post("/verify-otp")
async def verify_otp_endpoint(request: VerifyOtpRequest):
    try:
        await verify_otp(request.identifier, request.otp)
        return {"success": True, "message": "OTP verified successfully."}
    except HTTPException as e:
        # Re-raise as generic error to avoid leaking details
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    # Validate password strength (server-side)
    password = request.newPassword
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if not any(c.isupper() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number.")
    if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?`~" for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character.")

    # Check that there is a valid, recently verified OTP
    await can_reset_password(request.identifier)

    # Hash the new password and update user
    hashed = hash_password(password)
    await reset_user_password(request.identifier, hashed)

    return {
        "success": True,
        "message": "Password reset successfully."
    }