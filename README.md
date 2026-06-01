# Bus Tracker Application

A comprehensive full-stack bus tracking system with real-time location updates, route management, and multi-role user authentication (Passenger, Driver, Admin).

## 🎯 Features

### Passenger Features
- Real-time bus tracking with live map display
- Route search and schedule viewing
- Bus booking and trip management
- Live ETA calculation
- Profile management and logout

### Driver Features
- Dashboard with assigned trips
- Real-time location sharing
- Trip status management
- Navigation and route guidance

### Admin Features
- Live bus monitoring and management
- Route CRUD operations
- User management (Passengers & Drivers)
- Application approvals
- Dashboard statistics and analytics

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: JWT tokens with role-based access control
- **Real-time**: WebSocket support for live updates
- **Server**: Uvicorn

### Frontend
- **HTML5**, **CSS3**, **Vanilla JavaScript**
- **Maps**: Leaflet.js for interactive mapping
- **Responsive Design**: Mobile-first, works on all screen sizes
- **No Framework Dependencies**: Pure vanilla JS for lightweight performance

## 📁 Project Structure

```
New Bus Tracker/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── database.py             # MongoDB connection
│   ├── requirements.txt         # Python dependencies
│   ├── models/                 # Data models
│   │   ├── user_model.py
│   │   ├── route_models.py
│   │   ├── admin_models.py
│   │   ├── driver_models.py
│   │   ├── passenger_models.py
│   │   └── register_models.py
│   ├── routes/                 # API endpoints
│   │   ├── auth_routes.py
│   │   ├── admin_routes.py
│   │   ├── driver_routes.py
│   │   ├── passenger_routes.py
│   │   ├── bus_routes.py
│   │   ├── route_routes.py
│   │   ├── register_routes.py
│   │   └── forgot_password_routes.py
│   ├── services/               # Business logic
│   │   ├── admin_service.py
│   │   ├── auth_service.py
│   │   ├── driver_service.py
│   │   ├── passenger_service.py
│   │   ├── registration_service.py
│   │   ├── eta_engine.py
│   │   ├── otp_service.py
│   │   ├── virtual_bus_service.py
│   │   └── websocket_manager.py
│   └── utils/                  # Utilities
│       ├── auth_dependencies.py
│       ├── jwt_handler.py
│       ├── password_handler.py
│       ├── timezone_utils.py
│       └── websocket_manager.py
│
├── frontend/
│   ├── assets/
│   │   ├── css/                # Responsive stylesheets
│   │   │   ├── login.css
│   │   │   ├── register.css
│   │   │   ├── forgot-password.css
│   │   │   ├── admin-dashboard.css
│   │   │   ├── driver-dashboard.css
│   │   │   ├── passenger-dashboard.css
│   │   │   ├── passenger-tracking.css
│   │   │   ├── passenger-profile-menu.css
│   │   │   └── schedule.css
│   │   └── js/                 # JavaScript logic
│   │       ├── login.js
│   │       ├── register.js
│   │       ├── forgot-password.js
│   │       ├── admin-dashboard.js
│   │       ├── driver-dashboard.js
│   │       ├── passenger-dashboard.js
│   │       ├── passenger-tracking.js
│   │       ├── passenger-profile-menu.js
│   │       └── schedule.js
│   └── pages/                  # HTML pages
│       ├── login.html
│       ├── register.html
│       ├── forgot-password.html
│       ├── admin-dashboard.html
│       ├── driver-dashboard.html
│       ├── passenger-dashboard.html
│       ├── passenger-tracking.html
│       └── schedule.html
│
├── .gitignore
├── README.md
└── requirements.txt            # All project dependencies
```

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- MongoDB running locally or connection string available
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   Create a `.env` file in the `backend/` directory:
   ```env
   MONGODB_URL=mongodb://localhost:27017
   DB_NAME=bus_tracker
   JWT_SECRET_KEY=your_secret_key_here
   JWT_ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ```

5. **Run the server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

   Backend API will be available at: `http://localhost:8000`
   API documentation: `http://localhost:8000/docs`

### Frontend Setup

1. **Navigate to project root:**
   ```bash
   cd frontend
   ```

2. **Open in browser:**
   Simply open any HTML file in your browser or serve using a local server:
   ```bash
   # Using Python
   python -m http.server 8080
   
   # Or use Live Server extension in VS Code
   ```

   Frontend will be available at: `http://localhost:8080/frontend/pages/`

## 🔐 Authentication

The application uses JWT-based authentication with role-based access control:

- **Passenger**: Search routes, book buses, track trips
- **Driver**: Manage assigned trips, share location
- **Admin**: Manage users, routes, and system operations

Authentication tokens are stored in role-specific localStorage keys:
- `passengerToken` / `passengerProfile`
- `driverToken` / `driverProfile`
- `adminToken` / `adminProfile`

## 📱 Responsive Design

The application is fully responsive across all device sizes:
- **Desktop** (1440px+): Full multi-column layout
- **Laptop** (1024px): Optimized column sizing
- **Tablet** (768px): 2-column to 1-column adaptation
- **Mobile** (480px): Single column, stacked layouts, touch-friendly controls

All buttons and form inputs have a minimum height of 44px for easy mobile interaction.

## 🗄️ Database Models

### Users Collection
```json
{
  "_id": ObjectId,
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "passenger|driver|admin",
  "passwordHash": "string",
  "status": "pending|active|suspended",
  "isActive": boolean,
  "createdAt": ISODate
}
```

### Routes Collection
```json
{
  "_id": ObjectId,
  "route_number": "string",
  "source": "string",
  "destination": "string",
  "bus_type": "string",
  "ownership": "string",
  "fare": number,
  "duration": number,
  "stops": [
    {
      "name": "string",
      "latitude": number,
      "longitude": number,
      "order": number
    }
  ]
}
```

### Live Buses Collection
```json
{
  "_id": ObjectId,
  "tripId": ObjectId,
  "busId": ObjectId,
  "driverId": ObjectId,
  "routeId": ObjectId,
  "status": "running|delayed|completed|cancelled",
  "lastGps": {
    "latitude": number,
    "longitude": number,
    "speed": number
  },
  "currentStopIndex": number,
  "updatedAt": ISODate
}
```

## 🔌 API Endpoints Overview

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/forgot-password` - Initiate password reset
- `POST /auth/reset-password` - Complete password reset

### Passenger Routes
- `GET /passenger/profile` - Get passenger profile
- `GET /passenger/search-routes` - Search available routes
- `POST /passenger/book-trip` - Book a trip
- `GET /passenger/trips` - Get passenger trips
- `GET /passenger/tracking/:tripId` - Live trip tracking

### Driver Routes
- `GET /driver/profile` - Get driver profile
- `GET /driver/trips` - Get assigned trips
- `PUT /driver/update-location` - Update GPS location
- `PUT /driver/trip/:tripId/status` - Update trip status

### Admin Routes
- `GET /admin/stats` - Dashboard statistics
- `GET /admin/users?role=passenger|driver` - Get users by role
- `POST /admin/users/:userId/suspend` - Suspend user
- `POST /admin/users/:userId/activate` - Activate user
- `GET /admin/routes` - Get all routes
- `POST /admin/routes` - Create route
- `PUT /admin/routes/:routeId` - Update route
- `DELETE /admin/routes/:routeId` - Delete route
- `GET /admin/live-buses` - Get running buses

## 🧪 Testing

The application uses WebSocket connections for real-time updates. Test endpoints:
1. Open browser DevTools (F12)
2. Navigate to API documentation: `http://localhost:8000/docs`
3. Use Swagger UI to test endpoints
4. Check Console for WebSocket messages

## 📝 Development Notes

### Adding New Features
1. Create model in `backend/models/`
2. Add service logic in `backend/services/`
3. Create API route in `backend/routes/`
4. Create corresponding HTML/CSS/JS in frontend
5. Update this README with new endpoints

### Database Connections
- MongoDB is accessed through `database.py`
- All database operations use PyMongo
- ObjectId conversions handled in service layer

### WebSocket Usage
- Real-time bus location updates
- Live ETA calculations
- Admin notifications

## 🐛 Troubleshooting

**Backend won't start:**
- Check MongoDB is running: `mongod`
- Verify `requirements.txt` dependencies installed
- Check `.env` file has correct MongoDB URL

**Frontend not loading:**
- Ensure backend is running on port 8000
- Check browser console for CORS errors
- Verify all HTML/CSS/JS files exist in `frontend/` directory

**API 404 errors:**
- Check endpoint spelling matches `backend/routes/`
- Verify route is registered in `main.py`
- Check request method (GET, POST, etc.)

## 📞 Support

For issues or questions:
1. Check API documentation at `http://localhost:8000/docs`
2. Review backend logs in terminal
3. Check browser console for frontend errors
4. Verify MongoDB collections have required data

## 📄 License

This project is private. All rights reserved.

---

**Last Updated**: June 2026
**Version**: 1.0.0
