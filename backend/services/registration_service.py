import random
import string
from datetime import datetime, timedelta
import logging
from database import db
from fastapi import HTTPException
from utils.password_handler import hash_password

OTP_EXPIRY_MINUTES = 5
MAX_ATTEMPTS = 5
MAX_RESEND = 3

def _make_id(email: str, phone: str) -> str:
    return f"{email}::{phone}"

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

async def _check_duplicates(email: str, phone: str):
    # Check in users
    user = await db.users.find_one({"$or": [{"email": email}, {"phone": phone}]})
    if user:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists.")
    # Check in driver_applications
    app = await db.driver_applications.find_one({"$or": [{"email": email}, {"phone": phone}]})
    if app:
        raise HTTPException(status_code=400, detail="A driver application with this email or phone already exists.")

async def send_email_otp(email: str, phone: str):
    await _check_duplicates(email, phone)
    doc_id = _make_id(email, phone)
    doc = await db.registration_otps.find_one({"_id": doc_id})
    if doc and doc.get("email_resend_count", 0) >= MAX_RESEND:
        raise HTTPException(status_code=429, detail="Maximum OTP resend limit reached for email.")
    otp = generate_otp()
    expires = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    update = {
        "email_otp": otp,
        "email_otp_expires_at": expires,
        "email_verified": False,
        "email_attempts": 0,
        "email_resend_count": (doc.get("email_resend_count", 0) + 1) if doc else 1,
        "email": email,
        "phone": phone,
    }
    await db.registration_otps.update_one(
        {"_id": doc_id},
        {"$set": update, "$setOnInsert": {"phone_otp": None, "phone_verified": False, "phone_resend_count": 0, "phone_attempts": 0}},
        upsert=True
    )
    # Do not log OTP values in production logs
    logging.info("Email OTP generated and sent to %s", email)

async def send_phone_otp(email: str, phone: str):
    await _check_duplicates(email, phone)
    doc_id = _make_id(email, phone)
    doc = await db.registration_otps.find_one({"_id": doc_id})
    if doc and doc.get("phone_resend_count", 0) >= MAX_RESEND:
        raise HTTPException(status_code=429, detail="Maximum OTP resend limit reached for phone.")
    otp = generate_otp()
    expires = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    update = {
        "phone_otp": otp,
        "phone_otp_expires_at": expires,
        "phone_verified": False,
        "phone_attempts": 0,
        "phone_resend_count": (doc.get("phone_resend_count", 0) + 1) if doc else 1,
        "phone": phone,
        "email": email,
    }
    await db.registration_otps.update_one(
        {"_id": doc_id},
        {"$set": update, "$setOnInsert": {"email_otp": None, "email_verified": False, "email_resend_count": 0, "email_attempts": 0}},
        upsert=True
    )
    # Do not log OTP values in production logs
    logging.info("Phone OTP generated and sent to %s", phone)

async def verify_email_otp(email: str, phone: str, otp: str):
    doc = await db.registration_otps.find_one({"_id": _make_id(email, phone)})
    if not doc or not doc.get("email_otp"):
        raise HTTPException(status_code=400, detail="No OTP requested for email.")
    if doc.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified.")
    if doc["email_otp_expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired.")
    if doc.get("email_attempts", 0) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Maximum attempts reached.")
    await db.registration_otps.update_one(
        {"_id": doc["_id"]},
        {"$inc": {"email_attempts": 1}}
    )
    if doc["email_otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")
    await db.registration_otps.update_one(
        {"_id": doc["_id"]},
        {"$set": {"email_verified": True, "email_otp": None}}
    )
    return True

async def verify_phone_otp(email: str, phone: str, otp: str):
    doc = await db.registration_otps.find_one({"_id": _make_id(email, phone)})
    if not doc or not doc.get("phone_otp"):
        raise HTTPException(status_code=400, detail="No OTP requested for phone.")
    if doc.get("phone_verified"):
        raise HTTPException(status_code=400, detail="Phone already verified.")
    if doc["phone_otp_expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired.")
    if doc.get("phone_attempts", 0) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Maximum attempts reached.")
    await db.registration_otps.update_one(
        {"_id": doc["_id"]},
        {"$inc": {"phone_attempts": 1}}
    )
    if doc["phone_otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")
    await db.registration_otps.update_one(
        {"_id": doc["_id"]},
        {"$set": {"phone_verified": True, "phone_otp": None}}
    )
    return True

async def check_both_verified(email: str, phone: str):
    doc = await db.registration_otps.find_one({"_id": _make_id(email, phone)})
    if not doc or not doc.get("email_verified") or not doc.get("phone_verified"):
        raise HTTPException(status_code=400, detail="Both email and phone must be verified.")

async def create_passenger(data) -> str:
    await check_both_verified(data.email, data.phone)
    hashed = hash_password(data.password)
    user_doc = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "passwordHash": hashed,
        "role": "passenger",
        "isActive": True,
        "emailVerified": True,
        "phoneVerified": True,
        "status": "approved",
        "createdAt": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    await db.registration_otps.delete_one({"_id": _make_id(data.email, data.phone)})
    return str(result.inserted_id)

async def create_driver_application(data):
    await check_both_verified(data.email, data.phone)
    route = await db.routes.find_one({"_id": data.route_id})
    if not route:
        raise HTTPException(status_code=400, detail="Invalid route selected.")
    hashed = hash_password(data.password)
    app_doc = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "passwordHash": hashed,
        "role": "driver",
        "licenseNumber": data.license_number,
        "licenseExpiryDate": data.license_expiry_date.isoformat(),
        "experienceYears": data.experience_years,
        "operatorName": data.operator_name,
        "routeId": data.route_id,
        "applicationStatus": "pending",
        "emailVerified": True,
        "phoneVerified": True,
        "submittedAt": datetime.utcnow().isoformat()
    }
    result = await db.driver_applications.insert_one(app_doc)
    await db.registration_otps.delete_one({"_id": _make_id(data.email, data.phone)})
    return {"application_id": str(result.inserted_id), "status": "pending"}