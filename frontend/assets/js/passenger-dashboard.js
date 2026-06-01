document.addEventListener('DOMContentLoaded', () => {
    const session = requireRoleSession('passenger');
    if (!session) return;
    const { token } = session;

    // Elements
    const sourceRadios = document.querySelectorAll('input[name="sourceType"]');
    const manualSourceGroup = document.getElementById('manualSourceGroup');
    const detectSourceGroup = document.getElementById('detectSourceGroup');
    const detectLocationBtn = document.getElementById('detectLocationBtn');
    const detectedResult = document.getElementById('detectedResult');
    const nearestStopName = document.getElementById('nearestStopName');
    const detectedSourceInput = document.getElementById('detectedSource');
    const sourceInput = document.getElementById('sourceInput');
    const destinationInput = document.getElementById('destinationInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchError = document.getElementById('searchError');
    const sourceSuggestions = document.getElementById('sourceSuggestions');
    const destinationSuggestions = document.getElementById('destinationSuggestions');
    const resultsContainer = document.getElementById('resultsContainer');

    let allStops = [];
    let selectedSource = null;   // stop name
    let selectedDestination = null;

    // Fetch all stops for autocomplete
    async function fetchStops() {
        try {
            allStops = await apiRequest('/api/passenger/stops', {}, { token, role: 'passenger' });
        } catch (err) {
            console.error(err);
        }
    }
    fetchStops();

    // Toggle source input type
    sourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'manual') {
                manualSourceGroup.style.display = 'block';
                detectSourceGroup.style.display = 'none';
                selectedSource = null;
                detectedSourceInput.value = '';
                detectedResult.style.display = 'none';
            } else {
                manualSourceGroup.style.display = 'none';
                detectSourceGroup.style.display = 'block';
                selectedSource = null;
            }
            validateForm();
        });
    });

    // Detect location
    detectLocationBtn.addEventListener('click', async () => {
        if (!navigator.geolocation) {
            alert('Geolocation not supported');
            return;
        }
        detectLocationBtn.disabled = true;
        detectLocationBtn.textContent = 'Detecting...';
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const data = await apiRequest('/api/passenger/nearest-stop', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ latitude: lat, longitude: lng })
                }, { token, role: 'passenger' });
                nearestStopName.textContent = data.stopName;
                detectedSourceInput.value = data.stopName;
                selectedSource = data.stopName;
                detectedResult.style.display = 'block';
            } catch (err) {
                alert('Could not detect nearest stop. Try manual selection.');
            } finally {
                detectLocationBtn.disabled = false;
                detectLocationBtn.textContent = '📍 Detect My Location';
                validateForm();
            }
        }, (err) => {
            alert('Location permission denied. Use manual selection.');
            detectLocationBtn.disabled = false;
            detectLocationBtn.textContent = '📍 Detect My Location';
        }, { enableHighAccuracy: true });
    });

    // Autocomplete functions
    function setupAutocomplete(input, suggestionsDiv, onSelect) {
        input.addEventListener('input', () => {
            const query = input.value.trim().toLowerCase();
            if (!query) {
                suggestionsDiv.style.display = 'none';
                return;
            }
            const filtered = allStops.filter(s => s.toLowerCase().includes(query));
            if (filtered.length === 0) {
                suggestionsDiv.style.display = 'none';
                return;
            }
            suggestionsDiv.innerHTML = filtered.map(s => `<div class="suggestion-item">${s}</div>`).join('');
            suggestionsDiv.style.display = 'block';
            suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    input.value = item.textContent;
                    suggestionsDiv.style.display = 'none';
                    onSelect(item.textContent);
                });
            });
        });
        input.addEventListener('blur', () => {
            setTimeout(() => suggestionsDiv.style.display = 'none', 200);
        });
    }

    setupAutocomplete(sourceInput, sourceSuggestions, (val) => {
        selectedSource = val;
        validateForm();
    });
    setupAutocomplete(destinationInput, destinationSuggestions, (val) => {
        selectedDestination = val;
        validateForm();
    });

    function validateForm() {
        const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
        if (sourceType === 'detect') {
            selectedSource = detectedSourceInput.value || null;
        } else {
            selectedSource = sourceInput.value.trim() || null;
        }
        selectedDestination = destinationInput.value.trim() || null;
        searchBtn.disabled = !(selectedSource && selectedDestination);
    }

    sourceInput.addEventListener('input', validateForm);
    destinationInput.addEventListener('input', validateForm);

    // Search
    searchBtn.addEventListener('click', async () => {
        searchError.textContent = '';
        resultsContainer.innerHTML = '';
        if (!selectedSource || !selectedDestination) return;
        if (selectedSource.toLowerCase() === selectedDestination.toLowerCase()) {
            searchError.textContent = 'Source and destination cannot be the same.';
            return;
        }
        try {
            searchBtn.disabled = true;
            searchBtn.innerHTML = '<span class="spinner"></span> Searching...';
            const data = await apiRequest('/api/passenger/search-routes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: selectedSource, destination: selectedDestination })
            }, { token, role: 'passenger' });
            if (data.error) {
                searchError.textContent = data.error;
                return;
            }
            renderResults(data);
        } catch (err) {
            searchError.textContent = 'Search failed. Try again.';
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Find Routes';
        }
    });

    function renderResults(routes) {
        if (!routes || routes.length === 0) {
            resultsContainer.innerHTML = '<div class="card" style="text-align:center;">No routes found for this journey.</div>';
            return;
        }
        resultsContainer.innerHTML = routes.map(route => `
            <div class="route-card">
                <div class="route-header">
                    <span class="route-number">${route.routeNumber}</span>
                    <span class="direction-badge">${route.direction}</span>
                </div>
                <div class="route-stops">
                    <span>${route.source}</span>
                    <span class="stop-arrow">→</span>
                    <span>${route.destination}</span>
                </div>
                <div class="route-details">
                    <div>💰 Fare: ₹${route.fare}</div>
                    <div>⏱️ Duration: ${route.duration} min</div>
                    <div>🚌 Type: ${route.busType}</div>
                    <div>🏢 Ownership: ${route.ownership}</div>
                </div>
                <button class="schedule-btn" data-route='${JSON.stringify(route).replace(/'/g, "&#39;")}'>View Bus Schedule</button>
                <button class="view-btn" data-route='${JSON.stringify(route).replace(/'/g, "&#39;")}'>View Live Buses</button>
            </div>
        `).join('');

        document.querySelectorAll('.schedule-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const route = JSON.parse(btn.dataset.route);
                window.location.href = `schedule.html?routeId=${route.routeId}&source=${encodeURIComponent(route.source)}&destination=${encodeURIComponent(route.destination)}&direction=${route.direction}`;
            });
        });

        // Attach "View Live Buses" click handlers
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const route = JSON.parse(btn.dataset.route);
                // Store selected route and passenger stops for tracking page
                localStorage.setItem('selectedRoute', JSON.stringify(route));
                localStorage.setItem('passengerSource', route.source);
                localStorage.setItem('passengerDestination', route.destination);
                fetchLiveBuses(route);
            });
        });
    }

    // ── Live Buses Modal (Phase 2) ──
    const liveBusesModal = document.getElementById('liveBusesModal');
    const liveBusesContainer = document.getElementById('liveBusesContainer');
    const closeModalBtn = document.getElementById('closeModalBtn');

    closeModalBtn.addEventListener('click', () => {
        liveBusesModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === liveBusesModal) liveBusesModal.style.display = 'none';
    });

    async function fetchLiveBuses(route) {
        try {
            liveBusesContainer.innerHTML = '<p>Loading live buses...</p>';
            liveBusesModal.style.display = 'flex';
            const buses = await apiRequest(`/api/passenger/live-buses?routeId=${route.routeId}&direction=${route.direction}`, {}, { token, role: 'passenger' });
            if (buses.length === 0) {
                liveBusesContainer.innerHTML = '<p>No live buses currently available on this route.</p>';
                return;
            }
            liveBusesContainer.innerHTML = buses.map(bus => `
                <div class="live-bus-card">
                    <div class="bus-header">
                        <strong>${bus.routeNumber}</strong>
                        <span class="status-badge ${bus.status === 'delayed' ? 'delayed' : 'live'}">
                            ${bus.status === 'delayed' ? '🟠 Delayed' : '🟢 Running'}
                        </span>
                    </div>
                    <div>Bus: ${bus.busId}</div>
                    <div>Current Stop: ${bus.currentStop}</div>
                    <div>Next Stop: ${bus.nextStop}</div>
                    <div>Delay: ${bus.delay} min</div>
                    <button class="track-btn" data-trip='${JSON.stringify(bus)}'>Track Bus</button>
                </div>
            `).join('');

            // Add track bus event listeners
            document.querySelectorAll('.track-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const busData = JSON.parse(btn.dataset.trip);
                    window.location.href = `passenger-tracking.html?tripId=${busData.tripId}&routeId=${route.routeId}&direction=${route.direction}`;
                });
            });
        } catch (err) {
            liveBusesContainer.innerHTML = '<p>Error loading live buses. Please try again.</p>';
        }
    }
});
