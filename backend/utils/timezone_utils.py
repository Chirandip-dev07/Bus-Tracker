from datetime import timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

def utc_to_ist(dt):
    if not dt:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(IST)

def utc_to_ist_iso(dt):
    converted = utc_to_ist(dt)
    return converted.isoformat() if converted else None