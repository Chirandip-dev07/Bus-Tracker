from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class RouteCreate(BaseModel):
    routeNumber: str
    source: str
    destination: str
    ownership: str  # Private or Government
    busType: str    # AC, Non AC, Electric, CNG, Volvo
    fare: float
    avgDuration: int  # minutes
    firstBus: str     # HH:MM
    lastBus: str
    frequency: int    # minutes
    stops: List[str] = []

class RouteUpdate(RouteCreate):
    pass

class BusCreate(BaseModel):
    busId: str
    routeId: str
    ownership: str
    busType: str
    status: str = "active"  # active, inactive, maintenance

class BusUpdate(BaseModel):
    status: Optional[str] = None
    routeId: Optional[str] = None
    ownership: Optional[str] = None
    busType: Optional[str] = None

class RejectRequest(BaseModel):
    reason: str

class AssignRouteRequest(BaseModel):
    routeId: str