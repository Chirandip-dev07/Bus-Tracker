document.addEventListener('DOMContentLoaded', () => {
    const session = requireRoleSession('passenger');
    if (!session) return;
    const { token } = session;

    const params = new URLSearchParams(window.location.search);
    const tripId = params.get('tripId');
    const routeId = params.get('routeId');
    const direction = params.get('direction');
    if (!tripId || !routeId) { window.location.href = 'passenger-dashboard.html'; return; }

    const passengerSource = localStorage.getItem('passengerSource') || '';
    const passengerDestination = localStorage.getItem('passengerDestination') || '';

    // Use API_BASE from config.js
    let map, busMarker, passengerMarker, routePolyline;
    let routeStops = [];
    let liveBusData = null;
    let currentRoute = null;
    let pageIsUnloading = false;

    const backBtn = document.getElementById('backBtn');
    backBtn.addEventListener('click', () => window.location.href = 'passenger-dashboard.html');

    // ── Map ──
    function initMap() {
        map = L.map('trackingMap').setView([22.57, 88.36], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
    }

    // ── Fetch initial live bus data ──
    async function fetchLiveBusData() {
        try {
            liveBusData = await apiRequest(`/api/passenger/live-bus/${tripId}`, {}, { token, role: 'passenger' });
            return liveBusData;
        } catch (err) {
            alert('This bus is no longer active.');
            window.location.href = 'passenger-dashboard.html';
            throw err;
        }
    }

    // ── Load route and draw map ──
    async function loadRouteData() {
        try {
            const routes = await apiRequest('/api/routes', {}, { token, role: 'passenger' });
            const route = routes.find(r => r._id === routeId);
            if (!route || !route.stops) throw new Error('Route not found');
            routeStops = route.stops;
            currentRoute = route;

            // Polyline
            const latlngs = routeStops.map(s => [s.latitude, s.longitude]);
            if (routePolyline) map.removeLayer(routePolyline);
            routePolyline = L.polyline(latlngs, { color: '#2563EB', weight: 4, opacity: 0.7 }).addTo(map);
            map.fitBounds(routePolyline.getBounds().pad(0.1));
            // Ensure the map redraws correctly after layout changes
            setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 250);
        } catch (err) {
            document.getElementById('timelineContainer').innerHTML = '<div class="error">Unable to load route details.</div>';
        }
    }

    // ── Populate UI from liveBusData ──
    function populateUI(data) {
        // Route info card
        document.getElementById('routeNumberBig').textContent = data.routeNumber;
        document.getElementById('routeSource').textContent = routeStops[0]?.name || data.tripSource;
        document.getElementById('routeDest').textContent = routeStops[routeStops.length-1]?.name || data.tripDestination;
        document.getElementById('directionBadge').textContent = data.direction;

        // Status card
        updateStatusCard(data);
        // Header status badge
        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            if (data.status === 'running') statusBadge.textContent = '🟢 Running';
            else if (data.status === 'delayed') statusBadge.textContent = '🟠 Delayed';
            else statusBadge.textContent = data.status || '--';
        }
        const routeShort = document.getElementById('routeShort');
        if (routeShort) routeShort.textContent = data.routeNumber || document.getElementById('routeNumberBig').textContent;
        // optional properties (if provided by API)
        // Use route document (single source of truth) for fare/duration if available
        document.getElementById('busType').textContent = data.busType || (currentRoute?.busType || 'Non AC');
        document.getElementById('ownership').textContent = data.ownership || (currentRoute?.ownership || 'Private');
        if (currentRoute && typeof currentRoute.fare !== 'undefined' && currentRoute.fare !== null) {
            document.getElementById('fare').textContent = '₹' + currentRoute.fare;
        } else if (data.fare) {
            document.getElementById('fare').textContent = '₹' + data.fare;
        } else {
            document.getElementById('fare').textContent = '₹--';
        }
        if (currentRoute && typeof currentRoute.duration !== 'undefined' && currentRoute.duration !== null) {
            document.getElementById('duration').textContent = currentRoute.duration + ' min';
        } else if (data.duration) {
            document.getElementById('duration').textContent = data.duration + ' min';
        } else {
            document.getElementById('duration').textContent = '--';
        }

        // Passenger ETA card
        if (passengerSource) {
            document.getElementById('passengerStopName').textContent = passengerSource;
            document.getElementById('passengerDestStop').textContent = passengerDestination || data.tripDestination;
            document.getElementById('passengerEtaCard').style.display = 'block';
            updatePassengerETA(data.etas);
        }

        // Timeline
        buildTimeline(data.etas, data.currentStopIndex);

        // Bus marker
        if (data.lastGps && data.lastGps.lat && data.lastGps.lng) {
            updateBusPosition(data.lastGps.lat, data.lastGps.lng);
        }
    }

    function updateStatusCard(data) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        if (data.status === 'running') {
            statusIndicator.textContent = '🟢'; statusText.textContent = 'Running';
        } else if (data.status === 'delayed') {
            statusIndicator.textContent = '🟠'; statusText.textContent = 'Delayed';
        } else {
            statusIndicator.textContent = '⚪'; statusText.textContent = data.status;
        }
        document.getElementById('currentStop').textContent = data.currentStop;
        document.getElementById('nextStop').textContent = data.nextStop;
        document.getElementById('delayVal').textContent = data.delay;
        document.getElementById('speedVal').textContent = data.lastGps?.speed || 0;
    }

    function buildTimeline(etas, currentStopIndex) {
        const container = document.getElementById('timelineContainer');
        if (!routeStops.length) return;

        const now = new Date();
        let html = '';
        routeStops.forEach((stop, idx) => {
            const etaStr = etas[stop.stop_id];
            let cls = 'pending';
            let statusText = '';
            let etaDisplay = '--';

            if (etaStr) {
                const etaTime = new Date(etaStr);
                if (etaTime < now) {
                    cls = 'reached';
                    statusText = 'Reached';
                }
                etaDisplay = new Date(etaStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            if (idx === currentStopIndex && cls !== 'reached') {
                cls = 'current';
                statusText = 'Current Stop';
            } else if (idx === currentStopIndex + 1 && cls !== 'reached') {
                cls = 'next';
                statusText = `ETA ${etaDisplay}`;
            }

            html += `
                <div class="timeline-item ${cls}">
                    <div class="timeline-dot ${cls}"></div>
                    <div class="timeline-content">
                        <div class="stop-name">${stop.name}</div>
                        <div class="eta">${statusText || `ETA ${etaDisplay}`}</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html;
    }

    function updatePassengerETA(etas) {
        if (!passengerSource) return;
        const stop = routeStops.find(s => s.name === passengerSource);
        if (!stop || !etas[stop.stop_id]) return;
        const etaTime = new Date(etas[stop.stop_id]);
        const now = new Date();
        const diffMin = Math.max(0, Math.round((etaTime - now) / 60000));
        document.getElementById('passengerEtaMinutes').textContent = diffMin + ' min';
        document.getElementById('passengerEtaTime').textContent = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ── WebSocket (real‑time updates) ──
    function connectWebSocket() {
        const ws = new WebSocket(buildWsUrl(`/api/passenger/ws/trip/${tripId}?token=${encodeURIComponent(token)}`));
        ws.onopen = () => {
            const statusBadge = document.getElementById('statusBadge');
            if (statusBadge && statusBadge.textContent === 'Connection issue') statusBadge.textContent = liveBusData?.status || '--';
        };
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'gps_update') {
                updateBusPosition(msg.latitude, msg.longitude);
                if (liveBusData) {
                    // Update local copy with new values
                    liveBusData.status = msg.status || liveBusData.status;
                    liveBusData.nextStop = msg.next_stop || liveBusData.nextStop;
                    liveBusData.delay = msg.delay ?? liveBusData.delay;
                    if (msg.speed) {
                        if (!liveBusData.lastGps) liveBusData.lastGps = {};
                        liveBusData.lastGps.speed = msg.speed;
                    }
                    updateStatusCard(liveBusData);
                }
            } else if (msg.type === 'eta_update') {
                if (liveBusData) {
                    liveBusData.etas = msg.etas;
                    liveBusData.currentStopIndex = msg.currentStopIndex ?? liveBusData.currentStopIndex;
                    buildTimeline(liveBusData.etas, liveBusData.currentStopIndex);
                    updatePassengerETA(liveBusData.etas);
                    updateStatusCard(liveBusData); // currentStop may have changed
                }
            } else if (msg.type === 'trip_ended') {
                alert('This trip has ended.');
                window.location.href = 'passenger-dashboard.html';
            }
        };
        ws.onerror = () => {
            const statusBadge = document.getElementById('statusBadge');
            if (statusBadge) statusBadge.textContent = 'Connection issue';
        };
        ws.onclose = () => {
            if (pageIsUnloading) return;
            const statusBadge = document.getElementById('statusBadge');
            if (statusBadge) statusBadge.textContent = 'Reconnecting...';
            setTimeout(connectWebSocket, 5000);
        };
        return ws;
    }

    function updateBusPosition(lat, lng) {
        if (!map) return;
        if (busMarker) map.removeLayer(busMarker);
        busMarker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'bus-icon', html: '🚌', iconSize: [30, 30] })
        }).addTo(map);
    }

    // ── Passenger location ──
    function requestPassengerLocation() {
        if (!navigator.geolocation) return;
        navigator.geolocation.watchPosition(pos => {
            const { latitude, longitude } = pos.coords;
            if (passengerMarker) map.removeLayer(passengerMarker);
            passengerMarker = L.marker([latitude, longitude], {
                icon: L.divIcon({ className: 'passenger-marker', html: '🧑', iconSize: [24, 24] })
            }).addTo(map);
        }, null, { enableHighAccuracy: true });
    }

    // ── Map controls ──
    document.getElementById('centerBusBtn').addEventListener('click', () => {
        if (busMarker) map.panTo(busMarker.getLatLng());
    });
    document.getElementById('centerMeBtn').addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                map.panTo([pos.coords.latitude, pos.coords.longitude]);
            });
        }
    });
    document.getElementById('fitRouteBtn').addEventListener('click', () => {
        if (routePolyline) map.fitBounds(routePolyline.getBounds().pad(0.1));
    });

    // ── Initialization ──
    initMap();
    Promise.all([loadRouteData(), fetchLiveBusData()]).then(([_, data]) => {
        populateUI(data);
        const ws = connectWebSocket();
        window.addEventListener('beforeunload', () => {
            pageIsUnloading = true;
            ws.close();
        });
    });
    requestPassengerLocation();
});
