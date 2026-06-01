from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    role: Literal["passenger", "driver", "admin"]
    isActive: bool = True

class UserInDB(UserBase):
    id: str = Field(alias="_id")
    passwordHash: str
    createdAt: datetime

class LoginRequest(BaseModel):
    identifier: str   # email or phone
    password: str

class TokenResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[dict] = None
    message: Optional[str] = None