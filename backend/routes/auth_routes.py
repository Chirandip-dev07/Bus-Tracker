from fastapi import APIRouter, HTTPException
from models.user_model import LoginRequest, TokenResponse
from services.auth_service import authenticate_user

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    if not request.identifier or not request.password:
        raise HTTPException(status_code=400, detail="Email/Phone and password required")

    # Authentication
    result = await authenticate_user(request.identifier, request.password)

    if result is None:
        return TokenResponse(
            success=False,
            message="Invalid credentials"
        )

    return TokenResponse(
        success=True,
        token=result["token"],
        user=result["user"]
    )