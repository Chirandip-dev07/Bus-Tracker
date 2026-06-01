from datetime import datetime
from fastapi import HTTPException
from database import db
from utils.password_handler import verify_password
from utils.jwt_handler import create_access_token

async def authenticate_user(identifier: str, password: str):
    # 1. Check users collection
    user_doc = await db.users.find_one({
        "$or": [{"email": identifier}, {"phone": identifier}]
    })
    if user_doc:
        if not verify_password(password, user_doc["passwordHash"]):
            return None
        if not user_doc.get("isActive", True):
            raise HTTPException(status_code=403, detail="Account disabled")
        token_data = {
            "sub": str(user_doc["_id"]),
            "name": user_doc["name"],
            "role": user_doc["role"]
        }
        access_token = create_access_token(token_data)
        return {
            "token": access_token,
            "user": {
                "id": str(user_doc["_id"]),
                "name": user_doc["name"],
                "role": user_doc["role"]
            }
        }

    # 2. Not in users – check driver applications
    app_doc = await db.driver_applications.find_one({
        "$or": [{"email": identifier}, {"phone": identifier}]
    })
    if app_doc:
        if not verify_password(password, app_doc["passwordHash"]):
            return None
        status = app_doc.get("applicationStatus", "pending")
        if status == "pending":
            raise HTTPException(status_code=403, detail="Your driver application is currently under review.")
        elif status == "rejected":
            reason = app_doc.get("rejectionReason", "No reason provided.")
            raise HTTPException(status_code=403, detail=f"Your application was rejected. Reason: {reason}")
        elif status == "approved":
            # Auto-create user if not already present
            existing_user = await db.users.find_one({"_id": app_doc["_id"]})
            if not existing_user:
                user_doc = {
                    "_id": app_doc["_id"],
                    "name": app_doc["name"],
                    "email": app_doc["email"],
                    "phone": app_doc["phone"],
                    "passwordHash": app_doc["passwordHash"],
                    "role": "driver",
                    "isActive": True,
                    "status": "approved",
                    "createdAt": datetime.utcnow()
                }
                await db.users.insert_one(user_doc)
            token_data = {
                "sub": str(app_doc["_id"]),
                "name": app_doc["name"],
                "role": "driver"
            }
            access_token = create_access_token(token_data)
            return {
                "token": access_token,
                "user": {
                    "id": str(app_doc["_id"]),
                    "name": app_doc["name"],
                    "role": "driver"
                }
            }
        else:
            raise HTTPException(status_code=400, detail="Unknown application status")
    return None