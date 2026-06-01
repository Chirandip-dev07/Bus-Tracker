from fastapi import APIRouter
from models.register_models import (
    SendEmailOtpRequest, SendPhoneOtpRequest, VerifyOtpRequest,
    PassengerRegistrationRequest, DriverRegistrationRequest
)
from services.registration_service import (
    send_email_otp, send_phone_otp, verify_email_otp, verify_phone_otp,
    create_passenger, create_driver_application
)

router = APIRouter()

@router.post("/send-email-otp")
async def send_email_otp_route(request: SendEmailOtpRequest):
    await send_email_otp(request.email, request.phone)
    return {"success": True, "message": "OTP sent to email"}

@router.post("/send-phone-otp")
async def send_phone_otp_route(request: SendPhoneOtpRequest):
    await send_phone_otp(request.email, request.phone)
    return {"success": True, "message": "OTP sent to phone"}

@router.post("/verify-email-otp")
async def verify_email_otp_route(request: VerifyOtpRequest):
    await verify_email_otp(request.email, request.phone, request.otp)
    return {"success": True, "message": "Email verified"}

@router.post("/verify-phone-otp")
async def verify_phone_otp_route(request: VerifyOtpRequest):
    await verify_phone_otp(request.email, request.phone, request.otp)
    return {"success": True, "message": "Phone verified"}

@router.post("/passenger")
async def register_passenger(request: PassengerRegistrationRequest):
    user_id = await create_passenger(request)
    return {"success": True, "message": "Account created successfully", "user_id": user_id}

@router.post("/driver")
async def register_driver(request: DriverRegistrationRequest):
    result = await create_driver_application(request)
    return {
        "success": True,
        "message": "Driver application submitted for review",
        "application_id": result["application_id"],
        "status": result["status"]
    }