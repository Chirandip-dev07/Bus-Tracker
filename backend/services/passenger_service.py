import math
from database import db
from fastapi import HTTPException
from datetime import datetime, timedelta
import pytz
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

async def get_all_stops():
    pipeline = [
        {"$unwind": "$stops"},
        {"$group": {"_id": "$stops.name"}},
        {"$sort": {"_id": 1}}
    ]
    cursor = db.routes.aggregate(pipeline)
    stops = [doc["_id"] async for doc in cursor]
    return stops

async def find_nearest_stop(latitude: float, longitude: float):
    all_stops = []
    async for route in db.routes.find({}, {"stops": 1}):
        for stop in route.get("stops", []):
            all_stops.append(stop)
    if not all_stops:
        raise HTTPException(status_code=404, detail="No stops found")
    closest = None
    min_dist = float('inf')
    for stop in all_stops:
        d = haversine(latitude, longitude, stop["latitude"], stop["longitude"])
        if d < min_dist:
            min_dist = d
            closest = stop
    return {"stopName": closest["name"], "distance": round(min_dist)}

async def search_routes(source: str, destination: str):
    routes_cursor = db.routes.find({}, {"_id": 1, "route_number": 1, "stops": 1, "ownership": 1, "bus_type": 1, "fare": 1, "duration": 1})
    results = []
    async for route in routes_cursor:
        stops = route.get("stops", [])
        src_stop = next((s for s in stops if s["name"].lower() == source.lower()), None)
        dst_stop = next((s for s in stops if s["name"].lower() == destination.lower()), None)
        if not src_stop or not dst_stop:
            continue
        direction = "UP" if src_stop["order"] < dst_stop["order"] else "DOWN"
        results.append({
            "routeId": str(route["_id"]),
            "routeNumber": route["route_number"],
            "source": src_stop["name"],
            "destination": dst_stop["name"],
            "direction": direction,
            "fare": route.get("fare", 0),
            "duration": route.get("duration", 0),
            "ownership": route.get("ownership", ""),
            "busType": route.get("bus_type", "")
        })
    return results

# NEW – now queries only live_buses collection
async def get_live_buses(route_id: str, direction: str):
    live_cursor = db.live_buses.find({
        "routeId": route_id,
        "direction": direction,
        "status": {"$in": ["running", "delayed"]}
    })
    live_buses = []
    async for live_doc in live_cursor:
        # Fetch route for stop names
        route = await db.routes.find_one({"_id": route_id})
        if not route:
            continue
        stops = route.get("stops", [])
        idx = live_doc.get("currentStopIndex", 0)
        current_stop = stops[idx]["name"] if 0 <= idx < len(stops) else "N/A"
        next_stop = stops[idx+1]["name"] if idx+1 < len(stops) else "Destination"

        live_buses.append({
            "tripId": live_doc["_id"],   # live_buses uses same _id as trip
            "routeNumber": route.get("route_number", ""),
            "busId": live_doc.get("busId", "N/A"),
            "status": live_doc["status"],
            "direction": live_doc.get("direction", "UP"),
            "currentStop": current_stop,
            "nextStop": next_stop,
            "delay": live_doc.get("delay", 0),
            "startedAt": live_doc.get("startedAt", "").isoformat() if live_doc.get("startedAt") else "",
            "currentStopIndex": idx,
            "lastGps": live_doc.get("lastGps", None)   # {lat, lng, speed, timestamp}
        })
    return live_buses

async def get_live_bus_detail(trip_id: str):
    live_doc = await db.live_buses.find_one({"_id": trip_id})
    if not live_doc:
        raise HTTPException(status_code=404, detail="Live bus not found")
    route = await db.routes.find_one({"_id": live_doc["routeId"]})
    if not route:
        raise HTTPException(status_code=500, detail="Route data missing")
    stops = route["stops"]
    idx = live_doc.get("currentStopIndex", 0)
    current_stop = stops[idx]["name"] if 0 <= idx < len(stops) else "N/A"
    next_stop = stops[idx+1]["name"] if idx+1 < len(stops) else "Destination"

    return {
        "tripId": live_doc["_id"],
        "routeId": live_doc["routeId"],
        "routeNumber": route.get("route_number", ""),
        "busId": live_doc.get("busId", ""),
        "status": live_doc["status"],
        "direction": live_doc.get("direction", "UP"),
        "currentStop": current_stop,
        "nextStop": next_stop,
        "delay": live_doc.get("delay", 0),
        "startedAt": live_doc.get("startedAt", "").isoformat() if live_doc.get("startedAt") else "",
        "currentStopIndex": idx,
        "etas": live_doc.get("etas", {}),
        "lastGps": live_doc.get("lastGps", None),
        "tripSource": live_doc.get("tripSource", ""),
        "tripDestination": live_doc.get("tripDestination", "")
    }

def generate_route_schedule(route: dict, direction: str, source: str, destination: str):
    stops = route["stops"]
    # Order stops based on direction
    if direction == "DOWN":
        stops = list(reversed(stops))

    total_duration = route["duration"]  # minutes
    num_stops = len(stops)
    if num_stops < 2:
        raise HTTPException(status_code=400, detail="Route has fewer than 2 stops")

    segment_duration = total_duration / (num_stops - 1)  # minutes per segment

    first_bus_str = route["schedule"]["first_bus"]
    last_bus_str = route["schedule"]["last_bus"]
    frequency = route["schedule"]["frequency"]  # number of buses

    # Convert first and last bus times to datetime for calculation
    today = datetime.now(IST).date()
    first_bus_dt = datetime.combine(today, datetime.strptime(first_bus_str, "%H:%M").time(), tzinfo=IST)
    last_bus_dt = datetime.combine(today, datetime.strptime(last_bus_str, "%H:%M").time(), tzinfo=IST)

    total_minutes = (last_bus_dt - first_bus_dt).total_seconds() / 60
    if frequency > 1:
        interval = total_minutes / (frequency - 1)
    else:
        interval = 0  # only one bus

    departures = []
    for i in range(frequency):
        departure = first_bus_dt + timedelta(minutes=i * interval)
        # For each stop, calculate arrival time
        stop_times = []
        for j, stop in enumerate(stops):
            arrival = departure + timedelta(minutes=j * segment_duration)
            stop_times.append({
                "stopName": stop["name"],
                "time": arrival.strftime("%H:%M")
            })
        departures.append({
            "busNumber": i + 1,
            "departureTime": departure.strftime("%H:%M"),
            "stopTimes": stop_times
        })

    # Determine next available bus based on current IST time
    now_ist = datetime.now(IST).strftime("%H:%M")
    next_bus = None
    for bus in departures:
        # The boarding stop is source; find its time
        for stop_time in bus["stopTimes"]:
            if stop_time["stopName"] == source and stop_time["time"] >= now_ist:
                if not next_bus or stop_time["time"] < next_bus["boardingTime"]:
                    next_bus = {
                        "busNumber": bus["busNumber"],
                        "boardingStop": source,
                        "boardingTime": stop_time["time"],
                        "destinationStop": destination,
                        "destinationTime": next(st["time"] for st in bus["stopTimes"] if st["stopName"] == destination)
                    }
                break

    return {
        "routeNumber": route["route_number"],
        "direction": direction,
        "firstBus": first_bus_str,
        "lastBus": last_bus_str,
        "frequency": frequency,
        "duration": total_duration,
        "stops": [s["name"] for s in stops],  # ordered for table header
        "schedule": departures,
        "nextAvailableBus": next_bus
    }