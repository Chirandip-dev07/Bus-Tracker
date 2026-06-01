from datetime import datetime, timedelta
import math
from database import db
from utils.websocket_manager import manager

# Haversine distance (meters)
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

async def process_gps_update(driver_id: str, trip_id: str, lat: float, lng: float, speed: float, timestamp: str):
    trip = await db.trips.find_one({"_id": trip_id, "driverId": driver_id, "status": "running"})
    if not trip:
        return

    route = await db.routes.find_one({"_id": trip["routeId"]})
    if not route or "stops" not in route:
        return

    direction = trip.get("direction", "UP") 
    if direction == "DOWN":
        stops = route["stops"][::-1]
    else:
        stops = route["stops"]
    # Find the current stop (first unreached)
    current_stop_index = trip.get("currentStopIndex", 0)
    next_stop = stops[current_stop_index] if current_stop_index < len(stops) else None

    # If we are at or past the last stop, complete trip
    if next_stop is None:
        await _complete_trip(trip, driver_id)
        return

    dist = haversine(lat, lng, next_stop["latitude"], next_stop["longitude"])
    if dist < 50:  # Stop arrival threshold
        await _mark_stop_reached(trip, driver_id, current_stop_index, stops)
        current_stop_index += 1
        # Check if all stops done
        if current_stop_index >= len(stops):
            await _complete_trip(trip, driver_id)
            return
        else:
            # Recalculate ETAs for remaining stops
            await _recalculate_etas(trip, driver_id, current_stop_index, route)
            await db.trips.update_one(
                {"_id": trip_id},
                {"$set": {"currentStopIndex": current_stop_index, "nextStop": stops[current_stop_index]["name"]}}
            )
    else:
        last_gps = {"lat": lat, "lng": lng, "speed": speed, "timestamp": timestamp}
        await db.trips.update_one(
            {"_id": trip_id},
            {"$set": {"lastGps": last_gps, "currentStopIndex": current_stop_index}}
        )
        await db.live_buses.update_one(
            {"_id": trip_id},
            {"$set": {"lastGps": last_gps, "currentStopIndex": current_stop_index, "delay": trip.get("delay", 0), "status": trip.get("status")}}
        )
        await manager.broadcast_to_trip(trip_id, {
            "type": "gps_update",
            "latitude": lat,
            "longitude": lng,
            "speed": speed,
            "timestamp": timestamp,
            "next_stop": next_stop["name"] if next_stop else None,
            "delay": trip.get("delay", 0),
            "status": trip.get("status")
        })

async def _mark_stop_reached(trip, driver_id, stop_index, stops):
    now = datetime.utcnow()
    scheduled_arrival = trip.get("etas", {}).get(stops[stop_index]["stop_id"])
    actual = now.isoformat()
    delay = 0
    # Compute delay
    if scheduled_arrival:
        scheduled_dt = datetime.fromisoformat(scheduled_arrival)
        diff_minutes = (now - scheduled_dt).total_seconds() / 60
        delay = max(0, round(diff_minutes))
        if delay >= 2:
            await db.trips.update_one({"_id": trip["_id"]}, {"$set": {"status": "delayed", "delay": delay}})
            await db.live_buses.update_one({"_id": trip["_id"]}, {"$set": {"status": "delayed", "delay": delay}})
    stop_event = {
        "stop_id": stops[stop_index]["stop_id"],
        "stop_name": stops[stop_index]["name"],
        "scheduled_arrival": scheduled_arrival,
        "actual_arrival": actual,
        "delay_minutes": delay if scheduled_arrival else 0
    }
    await db.trips.update_one(
        {"_id": trip["_id"]},
        {
            "$push": {"stopArrivals": stop_event},
            "$inc": {"stopsCovered": 1}
        }
    )
    await db.live_buses.update_one(
        {"_id": trip["_id"]},
        {
            "$push": {"stopArrivals": stop_event},
            "$inc": {"stopsCovered": 1}
        }
    )

async def _recalculate_etas(trip, driver_id, from_index, route):
    """Recalculate ETAs for all remaining stops relative to the trip start time."""
    started_at = trip.get("startedAt", datetime.utcnow())
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at)
    direction = trip.get("direction", "UP")
    if direction == "DOWN":
        stops = route["stops"][::-1]
    else:
        stops = route["stops"]
    remaining = stops[from_index:]
    total_duration = route["duration"]  # total trip duration in minutes
    total_stops = len(stops)
    # Simple linear distribution from the original trip start time
    time_per_stop = total_duration / (total_stops - 1) if total_stops > 1 else total_duration
    new_etas = {}
    for i, stop in enumerate(remaining):
        eta = started_at + timedelta(minutes=((from_index + i) * time_per_stop))
        new_etas[stop["stop_id"]] = eta.isoformat()
    await db.trips.update_one(
        {"_id": trip["_id"]},
        {"$set": {"etas": new_etas}}
    )
    await db.live_buses.update_one(
        {"_id": trip["_id"]},
        {"$set": {"etas": new_etas}}
    )
    # Broadcast updated ETAs
    await manager.broadcast_to_trip(trip["_id"], {
        "type": "eta_update",
        "etas": new_etas,
        "delay": trip.get("delay", 0),
        "status": trip.get("status")
    })

async def _complete_trip(trip, driver_id):
    now = datetime.utcnow()
    duration = (now - trip["startedAt"]).total_seconds() / 60
    await db.trips.update_one(
        {"_id": trip["_id"]},
        {"$set": {"status": "completed", "endAt": now, "duration": duration}}
    )
    if trip.get("busId"):
        await db.buses.update_one({"_id": trip["busId"]}, {"$unset": {"current_status": "", "driver_id": "", "trip_id": ""}})
    await db.live_buses.delete_one({"_id": trip["_id"]})
    await manager.broadcast_to_trip(trip["_id"], {"type": "trip_ended", "tripId": trip["_id"]})