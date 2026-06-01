document.addEventListener('DOMContentLoaded', () => {
    const session = requireRoleSession('driver');
    if (!session) return;
    const { token } = session;

    // ── Global state ──
    let activeTrip = null;        // trip object from API
    let ws = null;
    let gpsInterval = null;
    let durationInterval = null;
    let map = null;
    let routePolyline = null;
    let stopMarkers = [];
    let currentPosMarker = null;
    let driverLocation = null;    // latest {lat, lng}

    // ── UI references ──
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const directionModal = document.getElementById('directionModal');
    const upStopName = document.getElementById('upStopName');
    const upTowards = document.getElementById('upTowards');
    const downStopName = document.getElementById('downStopName');
    const downTowards = document.getElementById('downTowards');
    const cancelDirectionBtn = document.getElementById('cancelDirectionBtn');

    // ── Navigation ──
    function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const screen = document.getElementById(screenId);

    if (screen) {
        screen.classList.add('active');
    }

    const navLive = document.getElementById('navLive');

    if (navLive) {
        navLive.style.display = activeTrip ? 'block' : 'none';
    }
}

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            showScreen(section === 'home' ? 'homeScreen' : section + 'Screen');
        });
    });

    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });

    document.getElementById('logoutSidebar').addEventListener('click', () => {
        clearRoleSession('driver');
        window.location.href = 'login.html';
    });

    // ── Clock ──
    function updateClock() {
        const now = new Date();
        document.getElementById('headerDateTime').textContent =
            now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }
    updateClock();
    setInterval(updateClock, 1000);

    // ── API wrapper ──
    async function apiFetch(url, options = {}) {
        return apiRequest(`/api${url}`, options, { token, role: 'driver' });
    }

    // ── Driver profile & route data ──
    async function loadProfile() {
        try {
            const profile = await apiFetch('/driver/profile');
            // profile received
            // Sidebar & header
            document.getElementById('sidebarName').textContent = profile.name;
            document.getElementById('headerName').textContent = profile.name;
            document.getElementById('accountName').textContent = profile.name;
            document.getElementById('accountEmail').textContent = profile.email;
            document.getElementById('accountStatus').textContent = profile.status || 'Active';

            if (profile.assignedRoute) {
                const route = profile.assignedRoute;
                const stops = route.stops;
                document.getElementById('routeNumber').textContent = route.route_number;
                document.getElementById('routeSource').textContent = stops[0].name;
                document.getElementById('routeDest').textContent = stops[stops.length - 1].name;
                document.getElementById('routeBusType').textContent = route.bus_type;
                document.getElementById('routeOwnership').textContent = route.ownership;

                document.getElementById('tripRoute').textContent = route.route_number;
                document.getElementById('tripSource').textContent = stops[0].name;
                document.getElementById('tripDest').textContent = stops[stops.length - 1].name;
                document.getElementById('startTripBtn').disabled = false;
                document.getElementById('tripBadge').textContent = 'No Active Trip';

                // Update direction modal labels
                if (upStopName && upTowards && downStopName && downTowards) {
                    upStopName.textContent = stops[0].name;
                    upTowards.textContent = `Towards ${stops[stops.length - 1].name}`;
                    downStopName.textContent = stops[stops.length - 1].name;
                    downTowards.textContent = `Towards ${stops[0].name}`;
                }

                localStorage.setItem('assignedRoute', JSON.stringify(route));
            } else {
                document.querySelector('.route-card').innerHTML =
                    '<div class="card-header">Assigned Route</div><p>No route assigned yet.</p>';
                document.getElementById('startTripBtn').disabled = true;
            }

            // Check for existing active trip
            const trip = await apiFetch('/driver/trip/active');
            if (trip && trip.active) {
                activeTrip = trip;
                const assignedRoute = JSON.parse(localStorage.getItem('assignedRoute') || 'null');
                if (!activeTrip.route && assignedRoute) {
                    activeTrip.route = {
                        routeNumber: assignedRoute.route_number || assignedRoute.routeNumber,
                        route_number: assignedRoute.route_number || assignedRoute.routeNumber
                    };
                }
                // active trip present
                document.getElementById('tripBadge').textContent = 'Trip Active';
                updateHomeDirectionDisplay(activeTrip);
                updateLiveStats(activeTrip);
                updateLiveRouteDisplay(activeTrip);
                startLiveDurationTimer(activeTrip.startedAt);
                showScreen('liveScreen');
                initMapAndWebSocket();
                localStorage.setItem('activeTrip', JSON.stringify(activeTrip));
            }
        } catch (e) {
            alert('Error loading profile: ' + e.message);
        }
        document.getElementById('homeSkeleton').style.display = 'none';
        document.getElementById('homeContent').style.display = 'block';
        // load profile finished
    }

    // ── Start Trip (with location validation) ──
    document.getElementById('startTripBtn').addEventListener('click', async () => {
        if (!driverLocation) {
            alert('Unable to get your location. Please allow GPS and try again.');
            return;
        }
        if (directionModal) {
            directionModal.style.display = 'flex';
        }
    });

    cancelDirectionBtn?.addEventListener('click', () => {
        if (directionModal) directionModal.style.display = 'none';
    });

    document.getElementById('directionUpBtn')?.addEventListener('click', async () => {
        if (directionModal) directionModal.style.display = 'none';
        const route = JSON.parse(localStorage.getItem('assignedRoute'));
        await startTripWithDirection('UP', route.stops[0].name, route.stops[route.stops.length - 1].name);
    });

    document.getElementById('directionDownBtn')?.addEventListener('click', async () => {
        if (directionModal) directionModal.style.display = 'none';
        const route = JSON.parse(localStorage.getItem('assignedRoute'));
        await startTripWithDirection('DOWN', route.stops[route.stops.length - 1].name, route.stops[0].name);
    });

    async function startTripWithDirection(direction, tripSource, tripDestination) {
        try {
            const res = await apiFetch('/driver/trip/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    busId: 'BUS001',
                    latitude: driverLocation.lat,
                    longitude: driverLocation.lng,
                    direction,
                    tripSource,
                    tripDestination
                })
            });
            activeTrip = {
                tripId: res.tripId,
                startedAt: res.startedAt || new Date().toISOString(),
                direction: res.direction || direction,
                tripSource: res.tripSource || tripSource,
                tripDestination: res.tripDestination || tripDestination,
                delay: res.delay || 0,
                status: res.status || 'running',
                currentStopIndex: res.currentStopIndex || 0,
                etas: res.etas || {}
            };
            const assignedRoute = JSON.parse(localStorage.getItem('assignedRoute') || 'null');
            if (assignedRoute) {
                activeTrip.route = {
                    routeNumber: assignedRoute.route_number || assignedRoute.routeNumber,
                    route_number: assignedRoute.route_number || assignedRoute.routeNumber
                };
            }
            // active trip started
            localStorage.setItem('activeTrip', JSON.stringify(activeTrip));
            document.getElementById('tripBadge').textContent = 'Trip Active';
            updateHomeDirectionDisplay(activeTrip);
            updateLiveStats(activeTrip);
            updateLiveRouteDisplay(activeTrip);
            startLiveDurationTimer(activeTrip.startedAt);
            showScreen('liveScreen');
            initMapAndWebSocket();
        } catch (err) {
            alert(err.message);
        }
    }

    function updateHomeDirectionDisplay(trip) {
        document.getElementById('tripSource').textContent = trip.tripSource || '--';
        document.getElementById('tripDest').textContent = trip.tripDestination || '--';
    }

    function updateLiveRouteDisplay(trip) {
        let routeNumber = trip?.route?.routeNumber || trip?.route?.route_number || trip?.routeNumber;
        if (!routeNumber) {
            const assignedRoute = JSON.parse(localStorage.getItem('assignedRoute') || 'null');
            routeNumber = assignedRoute?.route_number || assignedRoute?.routeNumber;
        }
        document.getElementById('liveRouteText').textContent = `Route: ${routeNumber || '--'}`;
    }

    // ── End Trip ──
    document.getElementById('endTripBtn').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to end this trip?')) return;
        try {
            await apiFetch('/driver/trip/end', { method: 'POST' });
            activeTrip = null;
            localStorage.removeItem('activeTrip');
            if (gpsInterval) clearInterval(gpsInterval);
            if (durationInterval) clearInterval(durationInterval);
            if (ws) ws.close();
            if (map) { map.remove(); map = null; }
            showScreen('homeScreen');
            await loadProfile();
        } catch (e) {
            alert(e.message);
        }
    });

    // ── Map & WebSocket setup ──
    function initMapAndWebSocket() {
        // init map

        if (!activeTrip) return;

        if (map) {
            map.off();
            map.remove();
            map = null;
        }

        routePolyline = null;
        stopMarkers = [];

        map = L.map('liveMap', {
            zoomControl: true
        }).setView([22.57, 88.36], 13);

        L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                attribution: '&copy; OpenStreetMap contributors'
            }
        ).addTo(map);

        drawRoute();

        startWebSocket();

        startGPSTracking();
    }

    function drawRoute() {
        const route = JSON.parse(localStorage.getItem('assignedRoute') || 'null');
        if (!route || !route.stops) return;
        const latlngs = route.stops.map(s => [s.latitude, s.longitude]);

        if (routePolyline) map.removeLayer(routePolyline);
        routePolyline = L.polyline(latlngs, { color: 'blue', weight: 5 }).addTo(map);

        stopMarkers.forEach(m => map.removeLayer(m));
        stopMarkers = [];
        route.stops.forEach(stop => {
            const marker = L.marker([stop.latitude, stop.longitude]).addTo(map).bindPopup(stop.name);
            stopMarkers.push(marker);
        });
        // route polyline drawn
        const bounds = routePolyline.getBounds();

if (bounds && bounds.isValid()) {

    setTimeout(() => {

        map.invalidateSize();

        map.fitBounds(
            bounds.pad(0.1),
            {
                animate: false
            }
        );

    }, 100);

}
    }

    function updateMapPosition(lat, lng) {
        if (!map) return;
        if (currentPosMarker) map.removeLayer(currentPosMarker);
        currentPosMarker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'custom-marker', html: '🚌', iconSize: [30, 30] })
        }).addTo(map);
        // Optional: pan to follow
        // map.panTo([lat, lng]);
    }

    // ── WebSocket for GPS ──
    function startWebSocket() {
        if (ws) ws.close();
        ws = new WebSocket(buildWsUrl(`/api/driver/ws/gps?token=${encodeURIComponent(token)}`));
        ws.onopen = () => {
            document.getElementById('headerStatus').textContent = 'Online';
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'gps_update') {
                if (activeTrip) {
                    activeTrip.delay = data.delay || activeTrip.delay;
                    activeTrip.status = data.status || activeTrip.status;
                    activeTrip.speed = data.speed || activeTrip.speed;
                }
                document.getElementById('liveSpeed').textContent = data.speed || 0;
                document.getElementById('liveDelay').textContent = data.delay || 0;
                document.getElementById('liveBadge').textContent = data.status || 'Running';
            } else if (data.type === 'eta_update') {
                updateLiveStats({
                    delay: data.delay,
                    status: data.status,
                    etas: data.etas
                });
            } else if (data.type === 'trip_ended') {
                alert('Trip completed automatically.');
                activeTrip = null;
                localStorage.removeItem('activeTrip');
                if (gpsInterval) clearInterval(gpsInterval);
                if (durationInterval) clearInterval(durationInterval);
                if (ws) ws.close();
                if (map) { map.remove(); map = null; }
                showScreen('homeScreen');
                loadProfile();
            }
        };
        ws.onerror = () => {
            document.getElementById('headerStatus').textContent = 'Connection issue';
        };
        ws.onclose = () => {
            document.getElementById('headerStatus').textContent = activeTrip ? 'Reconnecting...' : 'Offline';
            if (activeTrip) {
                setTimeout(() => {
                    if (!ws || ws.readyState === WebSocket.CLOSED) startWebSocket();
                }, 5000);
            }
        };
    }

    function renderStopProgress(etas, status) {
        const container = document.getElementById('stopProgress');
        const route = JSON.parse(localStorage.getItem('assignedRoute') || 'null');
        if (!route || !activeTrip) return;

        const direction = activeTrip.direction || 'UP';
        let stops = route.stops;
        if (direction === 'DOWN') {
            stops = [...stops].reverse();
        }

        let html = '';
        const now = Date.now();
        stops.forEach((stop, i) => {
            let icon = '○';
            let cls = 'pending';
            const etaStr = etas[stop.stop_id];
            if (etaStr) {
                const etaTime = new Date(etaStr).getTime();
                if (etaTime < now) {
                    icon = '✓'; cls = 'reached';
                } else if (i === (activeTrip.currentStopIndex || 0)) {
                    icon = '→'; cls = 'current';
                }
            }
            html += `<div class="stop-item">
                <span class="stop-icon ${cls}">${icon}</span> ${stop.name}
                <small>${etaStr ? new Date(etaStr).toLocaleTimeString() : ''}</small>
            </div>`;
        });
        container.innerHTML = html;
    }

    function updateLiveStats(trip) {
        document.getElementById('liveSpeed').textContent = trip.speed != null ? trip.speed : document.getElementById('liveSpeed').textContent || 0;
        document.getElementById('liveDelay').textContent = trip.delay != null ? trip.delay : 0;
        document.getElementById('liveBadge').textContent = trip.status || 'Running';
        if (trip.etas) {
            renderStopProgress(trip.etas, trip.status);
        }
    }

    function formatDuration(startedAt) {
        const start = new Date(startedAt).getTime();
        const diffSeconds = Math.max(
            0,
            Math.floor((Date.now() - start) / 1000)
        );

        const hours = String(
            Math.floor(diffSeconds / 3600)
        ).padStart(2, '0');

        const minutes = String(
            Math.floor((diffSeconds % 3600) / 60)
        ).padStart(2, '0');

        const seconds = String(
            diffSeconds % 60
        ).padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    }

    function startLiveDurationTimer(startedAt) {
        if (!startedAt) return;
        // duration timer started
        if (durationInterval) clearInterval(durationInterval);
        document.getElementById('liveDuration').textContent = formatDuration(startedAt);
        durationInterval = setInterval(() => {
            document.getElementById('liveDuration').textContent = formatDuration(startedAt);
        }, 1000);
    }

    // ── GPS tracking (sends to WebSocket) ──
    function startGPSTracking() {
        if (!navigator.geolocation) {
            alert('Geolocation not supported on this device.');
            return;
        }
        if (gpsInterval) clearInterval(gpsInterval);
        gpsInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(pos => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                driverLocation = { lat, lng };
                const speed = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : 0;
                updateMapPosition(lat, lng);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        tripId: activeTrip.tripId,
                        latitude: lat,
                        longitude: lng,
                        speed: parseFloat(speed),
                        timestamp: new Date().toISOString()
                    }));
                }
            }, () => {
                document.getElementById('headerStatus').textContent = 'GPS unavailable';
            }, { enableHighAccuracy: true, maximumAge: 2000 });
        }, 5000);
    }

    // ── Initial location capture (for start trip validation) ──
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => { driverLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
            () => {
                document.getElementById('headerStatus').textContent = 'GPS unavailable';
            },
            { enableHighAccuracy: true }
        );
    }

    // ── Trip History & Profile screens (simplified) ──
    async function loadHistory() {
        const container = document.getElementById('historyContent');
        const skeleton = document.getElementById('historySkeleton');
        skeleton.style.display = 'block';
        container.style.display = 'none';
        try {
            const trips = await apiFetch('/driver/trips');
            container.innerHTML = trips.map(t => {
                const directionText = t.direction
                    ? (t.direction === 'DOWN' ? `Towards ${t.tripSource || '?'}` : `Towards ${t.tripSource || '?'}`)
                    : '';
                return `
                <div class="trip-item" style="border-bottom:1px solid #e2e8f0; padding:1rem 0;">
                    <strong>${t.routeNumber}</strong> ${directionText ? '· ' + directionText : ''} – ${new Date(t.startTime).toLocaleString()}<br>
                    Status: ${t.status} | Duration: ${t.duration} min | Stops: ${t.stopsCovered}
                    ${t.stopArrivals && t.stopArrivals.length ? `<div class="stop-arrivals">
                        ${t.stopArrivals.map(sa => `<div class="stop-arrival-item">${sa.stop_name}: ${sa.actual_arrival ? new Date(sa.actual_arrival).toLocaleTimeString() : 'N/A'}${sa.delay_minutes != null ? ` (+${sa.delay_minutes} min)` : ''}</div>`).join('')}
                    </div>` : ''}
                </div>`;
            }).join('') || '<p>No trips yet.</p>';
        } catch (e) {
            container.innerHTML = '<p>Error loading trips.</p>';
        } finally {
            skeleton.style.display = 'none';
            container.style.display = 'block';
        }
    }

    async function loadProfileScreen() {
        const container = document.getElementById('profileContent');
        const skeleton = document.getElementById('profileSkeleton');
        skeleton.style.display = 'block';
        container.style.display = 'none';
        try {
            const profile = await apiFetch('/driver/profile');
            container.innerHTML = `
                <p><strong>Name:</strong> ${profile.name}</p>
                <p><strong>Email:</strong> ${profile.email}</p>
                <p><strong>Phone:</strong> ${profile.phone}</p>
                <p><strong>Route:</strong> ${profile.assignedRoute?.routeNumber || profile.assignedRoute?.route_number || 'Not assigned'}</p>
            `;
        } catch (e) {
            container.innerHTML = '<p>Error loading profile.</p>';
        } finally {
            skeleton.style.display = 'none';
            container.style.display = 'block';
        }
    }

    // Attach history/profile loading to navigation clicks
    document.querySelector('[data-section="history"]').addEventListener('click', loadHistory);
    document.querySelector('[data-section="profile"]').addEventListener('click', loadProfileScreen);

    // ── Initialize ──
    loadProfile();
    showScreen('homeScreen');

});
