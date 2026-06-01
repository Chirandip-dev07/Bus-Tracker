from pydantic import BaseModel, Field
from typing import List, Optional

class Stop(BaseModel):
    stop_id: str
    name: str
    latitude: float
    longitude: float
    order: int
    type: str  # source, stop, destination

class RouteCreateRequest(BaseModel):
    route_number: str
    ownership: str
    bus_type: str
    fare: float
    duration: int
    schedule: dict  # {first_bus, last_bus, frequency}
    stops: List[Stop]

class RouteUpdateRequest(BaseModel):
    route_number: Optional[str]
    ownership: Optional[str]
    bus_type: Optional[str]
    fare: Optional[float]
    duration: Optional[int]
    schedule: Optional[dict]
    stops: Optional[List[Stop]]