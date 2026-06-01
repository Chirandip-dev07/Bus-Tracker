from pydantic import BaseModel, EmailStr, validator
from typing import Optional
from datetime import date

class SendEmailOtpRequest(BaseModel):
    email: EmailStr
    phone: str

class SendPhoneOtpRequest(BaseModel):
    phone: str
    email: EmailStr

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    phone: str
    otp: str

class PassengerRegistrationRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str

class DriverRegistrationRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    license_number: str
    license_expiry_date: date
    experience_years: int
    operator_name: Optional[str] = None
    route_id: str