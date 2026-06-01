from datetime import datetime, timedelta
from database import db
import math
from services.eta_engine import haversine

async def get_virtual_buses_for_route(route_id: str):
    route = await db.routes.find_one({"_id": route_id})
    if not route:
        return []
    schedule = route.get("schedule", {})
    first_bus_str = schedule.get("first_bus")
    last_bus_str = schedule.get("last_bus")
    frequency = schedule.get("frequency", 15)  # minutes
    duration = route.get("duration", 60)

    # Parse times
    now = datetime.utcnow()
    today_str = now.strftime("%Y-%m-%d")
    first_bus_dt = datetime.fromisoformat(f"{today_str}T{first_bus_str}:00")
    last_bus_dt = datetime.fromisoformat(f"{today_str}T{last_bus_str}:00")
    if now > last_bus_dt:
        # No more virtual buses today
        return []

    # Generate departures from first_bus to now (or a window around now)
    virtual_buses = []
    departure = first_bus_dt
    while departure <= now:
        # If this departure hasn't ended yet
        end_time = departure + timedelta(minutes=duration)
        if now < end_time:
            # Bus is en route
            progress = (now - departure).total_seconds() / (duration * 60)
            progress = min(progress, 1.0)
            position = _interpolate_position(route["stops"], progress)
            virtual_buses.append({
                "busId": f"VIR-{route['_id']}-{departure.strftime('%H%M')}",
                "routeId": route_id,
                "route_number": route["route_number"],
                "departure": departure.isoformat(),
                "progress": progress,
                "latitude": position["lat"],
                "longitude": position["lng"],
                "status": "estimated"
            })
        departure += timedelta(minutes=frequency)
    return virtual_buses

def _interpolate_position(stops, progress):
    if progress <= 0:
        return {"lat": stops[0]["latitude"], "lng": stops[0]["longitude"]}
    if progress >= 1:
        return {"lat": stops[-1]["latitude"], "lng": stops[-1]["longitude"]}

    # Cumulative distances between stops
    distances = []
    total_dist = 0
    for i in range(1, len(stops)):
        d = haversine(stops[i-1]["latitude"], stops[i-1]["longitude"], stops[i]["latitude"], stops[i]["longitude"])
        distances.append(d)
        total_dist += d
    target_dist = progress * total_dist

    cumulative = 0
    for i, d in enumerate(distances):
        if cumulative + d >= target_dist:
            seg_progress = (target_dist - cumulative) / d
            lat1, lon1 = stops[i]["latitude"], stops[i]["longitude"]
            lat2, lon2 = stops[i+1]["latitude"], stops[i+1]["longitude"]
            lat = lat1 + (lat2 - lat1) * seg_progress
            lng = lon1 + (lon2 - lon1) * seg_progress
            return {"lat": lat, "lng": lng}
        cumulative += d
    return {"lat": stops[-1]["latitude"], "lng": stops[-1]["longitude"]}