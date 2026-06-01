from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # trip_id -> list of WebSocket connections (passengers, admin, etc.)
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # driver connections: driver_id -> WebSocket (for receiving GPS from driver)
        self.driver_connections: Dict[str, WebSocket] = {}

    async def connect_driver(self, driver_id: str, websocket: WebSocket):
        await websocket.accept()
        self.driver_connections[driver_id] = websocket

    def disconnect_driver(self, driver_id: str):
        self.driver_connections.pop(driver_id, None)

    async def connect_subscriber(self, trip_id: str, websocket: WebSocket):
        await websocket.accept()
        if trip_id not in self.active_connections:
            self.active_connections[trip_id] = []
        self.active_connections[trip_id].append(websocket)

    def disconnect_subscriber(self, trip_id: str, websocket: WebSocket):
        if trip_id in self.active_connections:
            self.active_connections[trip_id].remove(websocket)
            if not self.active_connections[trip_id]:
                del self.active_connections[trip_id]

    async def broadcast_to_trip(self, trip_id: str, message: dict):
        if trip_id in self.active_connections:
            for ws in self.active_connections[trip_id]:
                try:
                    await ws.send_json(message)
                except:
                    pass  # dead connection will be cleaned up later

    async def send_to_driver(self, driver_id: str, message: dict):
        ws = self.driver_connections.get(driver_id)
        if ws:
            await ws.send_json(message)

manager = ConnectionManager()