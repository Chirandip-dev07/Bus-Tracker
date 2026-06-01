from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TripStartRequest(BaseModel):
    busId: str

class GpsUpdate(BaseModel):
    tripId: str
    latitude: float
    longitude: float
    speed: float
    timestamp: str  # ISO format

class RouteChangeRequestModel(BaseModel):
    requestedRouteId: str

class TripStartRequest(BaseModel):
    busId: str
    latitude: float
    longitude: float
    direction: Optional[str] = "UP"          # "UP" or "DOWN"
    tripSource: Optional[str] = None
    tripDestination: Optional[str] = None

class TripSummary(BaseModel):
    tripId: str
    routeNumber: str
    startTime: datetime
    endTime: Optional[datetime]
    duration: int  # minutes
    stopsCovered: int
    avgSpeed: float
    delay: int  # minutes
    status: str