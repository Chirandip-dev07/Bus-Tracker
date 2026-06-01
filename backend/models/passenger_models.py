from pydantic import BaseModel

class SearchRequest(BaseModel):
    source: str
    destination: str

class FavoriteRequest(BaseModel):
    route_id: str

class GpsSubmitRequest(BaseModel):
    trip_id: str
    latitude: float
    longitude: float