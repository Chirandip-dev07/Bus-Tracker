document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:8000/api';
    const token = localStorage.getItem('adminToken');
    const userStr = localStorage.getItem('adminProfile');
    if (!token || !userStr) { window.location.href = 'login.html'; return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') { window.location.href = 'login.html'; return; }

    // Set admin name
    document.getElementById('adminName').textContent = user.name;
    updateDateTime();
    setInterval(updateDateTime, 1000);
    function updateDateTime() {
        document.getElementById('currentDateTime').textContent = new Date().toLocaleString();
    }

    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

    // Navigation
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const contentArea = document.getElementById('contentArea');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const section = item.dataset.section;
            loadSection(section);
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminProfile');
        window.location.href = 'login.html';
    });

    // Fetch wrapper
    async function apiFetch(url, options = {}) {
        const headers = { 'Authorization': `Bearer ${token}`, ...options.headers };
        const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            alert('Session expired or unauthorized');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminProfile');
            window.location.href = 'login.html';
            return null;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Error' }));
            throw new Error(err.detail || 'Request failed');
        }
        return res.json();
    }

    // Load section content
    async function loadSection(section) {
        contentArea.innerHTML = '<div class="spinner"></div>';
        try {
            let html = '';
            switch(section) {
                case 'dashboard': html = await renderDashboard(); break;
                case 'driver-applications': html = await renderDriverApplications(); break;
                case 'live-buses': html = await renderLiveBuses(); break;
                case 'routes': html = await renderRoutes(); break;
                case 'trips': html = await renderTrips(); break;
                case 'users': html = await renderUsers(); break;
                case 'buses': html = await renderBuses(); break;
                default: html = '<p>Section not found.</p>';
            }
            contentArea.innerHTML = html;
            // Post-render actions (maps, events)
            if (section === 'live-buses') {
                initLiveMap();
                if (liveBusesRefreshInterval) clearInterval(liveBusesRefreshInterval);
                liveBusesRefreshInterval = setInterval(() => loadSection('live-buses'), 15000);
            } else if (liveBusesRefreshInterval) {
                clearInterval(liveBusesRefreshInterval);
                liveBusesRefreshInterval = null;
            }
            attachEvents(section);
        } catch (err) {
            contentArea.innerHTML = `<p class="error">Error loading section: ${err.message}</p>`;
        }
    }

    // Template rendering helpers
    function fillTemplate(tplId, data) {
        let html = document.getElementById(tplId).innerHTML;
        for (const [key, val] of Object.entries(data)) {
            html = html.replace(new RegExp(`{{${key}}}`, 'g'), val);
        }
        return html;
    }

    // ── Dashboard ──
    async function renderDashboard() {
        const stats = await apiFetch('/admin/stats');
        return fillTemplate('template-stats', stats);
    }

    // ── Driver Applications ──
    async function renderDriverApplications() {
        const apps = await apiFetch('/admin/driver-applications');
        let tableHtml = `<table class="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Route</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
        apps.forEach(app => {
            tableHtml += `<tr>
                <td>${app._id}</td>
                <td>${app.name}</td>
                <td>${app.email}</td>
                <td>${app.routeId || 'N/A'}</td>
                <td>${app.applicationStatus}</td>
                <td>
                    <button class="action-btn btn-view view-app" data-id="${app._id}">View</button>
                    ${app.applicationStatus==='pending' ? `
                        <button class="action-btn btn-approve approve-btn" data-id="${app._id}">Approve</button>
                        <button class="action-btn btn-reject reject-btn" data-id="${app._id}">Reject</button>
                    ` : ''}
                </td></tr>`;
        });
        tableHtml += '</tbody></table>';
        return tableHtml;
    }

    // ── Live Buses ──
    async function renderLiveBuses() {
        const buses = await apiFetch('/admin/live-buses');
        let html = '<div id="liveMap"></div>';
        if (!buses || buses.length === 0) {
            html += '<div class="empty-state">No live buses currently running</div>';
            return html;
        }

        html += '<table class="data-table"><thead><tr><th>Bus ID</th><th>Route</th><th>Driver</th><th>Status</th><th>Speed</th><th>Current Stop</th><th>Action</th></tr></thead><tbody>';
        buses.forEach(bus => {
            html += `<tr>
                <td>${bus.busId}</td>
                <td>${bus.route}</td>
                <td>${bus.driver}</td>
                <td>${bus.status}</td>
                <td>${bus.speed || 0} km/h</td>
                <td>${bus.current_stop || 'N/A'}</td>
                <td><button class="action-btn btn-view bus-detail-btn" data-id="${bus._id}" data-tripid="${bus.tripId || ''}" data-routeid="${bus.routeId || ''}" data-driverid="${bus.driverId || ''}">Details</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    }

    let map;
    let liveBusesRefreshInterval = null;
    let liveBusMarkerInterval = null;
    let currentUserRole = 'passenger';
    let currentUserSearch = '';
    let currentUserSort = 'name';
    let currentUserSortOrder = 'asc';
    function initLiveMap() {
        if (map) {
            if (liveBusMarkerInterval) {
                clearInterval(liveBusMarkerInterval);
                liveBusMarkerInterval = null;
            }
            map.remove();
            map = null;
        }

        map = L.map('liveMap').setView([22.57, 88.36], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        loadBusMarkers();
        // Refresh markers every 30s
        liveBusMarkerInterval = setInterval(loadBusMarkers, 30000);
    }

    async function loadBusMarkers() {
        try {
            const buses = await apiFetch('/admin/live-buses');
            if (!map) return;
            // Clear existing markers
            map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
            buses.forEach(bus => {
                if (bus.current_location) {
                    const marker = L.marker([bus.current_location.lat, bus.current_location.lng]).addTo(map);
                    marker.bindPopup(`<b>${bus.busId}</b><br>Route: ${bus.route}<br>Speed: ${bus.speed} km/h<br>Stop: ${bus.current_stop}`);
                }
            });
        } catch (e) { console.error(e); }
    }

    // ── Routes ──
    async function renderRoutes() {
        const routes = await apiFetch('/admin/routes');
        if (!routes || routes.length === 0) {
            return '<div class="empty-state">No routes available</div>';
        }

        let html = '<button class="submit-btn add-route-btn">Add Route</button>';
        html += '<table class="data-table"><thead><tr><th>Route Number</th><th>Source</th><th>Destination</th><th>Ownership</th><th>Bus Type</th><th>Actions</th></tr></thead><tbody>';
        routes.forEach(r => {
            const source = Array.isArray(r.stops) && r.stops.length > 0 ? r.stops[0].name || 'N/A' : 'N/A';
            const destination = Array.isArray(r.stops) && r.stops.length > 0 ? r.stops[r.stops.length - 1].name || 'N/A' : 'N/A';
            html += `<tr>
                <td>${r.route_number || 'N/A'}</td>
                <td>${source}</td>
                <td>${destination}</td>
                <td>${r.ownership || 'N/A'}</td>
                <td>${r.bus_type || 'N/A'}</td>
                <td>
                    <button class="action-btn btn-view edit-route-btn" data-id="${r._id}">Edit</button>
                    <button class="action-btn btn-delete delete-route-btn" data-id="${r._id}">Delete</button>
                </td></tr>`;
        });
        html += '</tbody></table>';
        return html;
    }

    // ── Trips ──
    async function renderTrips() {
        const trips = await apiFetch('/admin/trips');
        let html = '<table class="data-table"><thead><tr><th>Trip ID</th><th>Bus ID</th><th>Route</th><th>Status</th><th>Start Time</th><th>Action</th></tr></thead><tbody>';
        trips.forEach(t => {
            html += `<tr>
                <td>${t._id}</td>
                <td>${t.busId}</td>
                <td>${t.routeId}</td>
                <td>${t.status}</td>
                <td>${new Date(t.startTime).toLocaleString()}</td>
                <td><button class="action-btn btn-view view-trip-btn" data-id="${t._id}">View</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    }

    // ── Users ──
    async function renderUsers() {
        let html = `<div class="users-controls">
            <div class="search-group">
                <input id="userSearchInput" placeholder="Search by name, email, or phone" autocomplete="off">
                <button class="secondary-btn" id="clearUserSearch">Clear</button>
            </div>
            <div class="sort-group">
                <label for="userSortSelect">Sort by</label>
                <select id="userSortSelect">
                    <option value="name">Name</option>
                    <option value="role">Role</option>
                    <option value="status">Status</option>
                </select>
                <button class="secondary-btn" id="toggleUserSortOrder">Asc</button>
            </div>
        </div>`;
        html += '<ul class="tab-nav"><li class="tab active" data-tab="passenger">Passengers</li><li class="tab" data-tab="driver">Drivers</li></ul>';
        html += '<div id="tabContent"></div>';
        return html;
    }

    // ── Buses ──
    async function renderBuses() {
        const buses = await apiFetch('/admin/buses');
        let html = '<button class="submit-btn add-bus-btn">Add Bus</button>';
        html += '<table class="data-table"><thead><tr><th>Bus ID</th><th>Route</th><th>Ownership</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        buses.forEach(b => {
            html += `<tr>
                <td>${b.busId}</td>
                <td>${b.routeId}</td>
                <td>${b.ownership}</td>
                <td>${b.busType}</td>
                <td>${b.status}</td>
                <td>
                    <button class="action-btn btn-view edit-bus-btn" data-id="${b._id}">Edit</button>
                    <button class="action-btn btn-delete delete-bus-btn" data-id="${b._id}">Delete</button>
                </td></tr>`;
        });
        html += '</tbody></table>';
        return html;
    }

    // ── Event Attachment ──
    function attachEvents(section) {
        if (section === 'driver-applications') {
            document.querySelectorAll('.view-app').forEach(btn => btn.addEventListener('click', async () => {
                const app = await apiFetch(`/admin/driver-applications/${btn.dataset.id}`);
                showModal(`<h3>Application Details</h3>
                    <p><b>Name:</b> ${app.name}</p>
                    <p><b>Email:</b> ${app.email}</p>
                    <p><b>Phone:</b> ${app.phone}</p>
                    <p><b>License:</b> ${app.licenseNumber}</p>
                    <p><b>Expiry:</b> ${app.licenseExpiryDate}</p>
                    <p><b>Experience:</b> ${app.experienceYears} years</p>
                    <p><b>Operator:</b> ${app.operatorName || 'N/A'}</p>
                    <p><b>Route ID:</b> ${app.routeId}</p>
                    <p><b>Submitted:</b> ${new Date(app.submittedAt).toLocaleString()}</p>
                `);
            }));
            document.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', async () => {
                if (confirm('Approve this application?')) {
                    await apiFetch(`/admin/driver-applications/${btn.dataset.id}/approve`, { method: 'POST' });
                    loadSection('driver-applications');
                }
            }));
            document.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', async () => {
                const reason = prompt('Enter rejection reason:');
                if (reason) {
                    await apiFetch(`/admin/driver-applications/${btn.dataset.id}/reject`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason })
                    });
                    loadSection('driver-applications');
                }
            }));
        } else if (section === 'routes') {
            document.querySelector('.add-route-btn')?.addEventListener('click', showRouteForm);
            document.querySelectorAll('.edit-route-btn').forEach(btn => btn.addEventListener('click', async () => {
                const route = await apiFetch(`/admin/routes/${btn.dataset.id}`); // Assuming you could fetch single route, but not implemented - adjust: we'll fetch all and find
                // Instead fetch all routes and find
                const routes = await apiFetch('/admin/routes');
                const r = routes.find(r => r._id === btn.dataset.id);
                showRouteForm(r);
            }));
            document.querySelectorAll('.delete-route-btn').forEach(btn => btn.addEventListener('click', async () => {
                if (confirm('Delete this route?')) {
                    await apiFetch(`/admin/routes/${btn.dataset.id}`, { method: 'DELETE' });
                    loadSection('routes');
                }
            }));
        } else if (section === 'buses') {
            document.querySelector('.add-bus-btn')?.addEventListener('click', showBusForm);
            document.querySelectorAll('.edit-bus-btn').forEach(btn => btn.addEventListener('click', async () => {
                const buses = await apiFetch('/admin/buses');
                const b = buses.find(b => b._id === btn.dataset.id);
                showBusForm(b);
            }));
            document.querySelectorAll('.delete-bus-btn').forEach(btn => btn.addEventListener('click', async () => {
                if (confirm('Delete bus?')) {
                    await apiFetch(`/admin/buses/${btn.dataset.id}`, { method: 'DELETE' });
                    loadSection('buses');
                }
            }));
        } else if (section === 'users') {
            // Tab switching and load users
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentUserRole = tab.dataset.tab;
                    loadUsersTab(currentUserRole);
                });
            });
            const searchInput = document.getElementById('userSearchInput');
            const sortSelect = document.getElementById('userSortSelect');
            const orderBtn = document.getElementById('toggleUserSortOrder');
            document.getElementById('clearUserSearch')?.addEventListener('click', () => {
                currentUserSearch = '';
                if (searchInput) searchInput.value = '';
                loadUsersTab(currentUserRole);
            });
            searchInput?.addEventListener('input', () => {
                currentUserSearch = searchInput.value.trim();
                loadUsersTab(currentUserRole);
            });
            sortSelect?.addEventListener('change', () => {
                currentUserSort = sortSelect.value;
                loadUsersTab(currentUserRole);
            });
            orderBtn?.addEventListener('click', () => {
                currentUserSortOrder = currentUserSortOrder === 'asc' ? 'desc' : 'asc';
                orderBtn.textContent = currentUserSortOrder === 'asc' ? 'Asc' : 'Desc';
                loadUsersTab(currentUserRole);
            });
            loadUsersTab(currentUserRole);
        } else if (section === 'live-buses') {
            document.querySelectorAll('.bus-detail-btn').forEach(btn => btn.addEventListener('click', async () => {
                const bus = (await apiFetch('/admin/live-buses')).find(b => b._id === btn.dataset.id);
                if (bus) showModal(`<h3>Bus Details</h3>
                    <p><b>Trip ID:</b> ${bus.tripId || 'N/A'}</p>
                    <p><b>Bus ID:</b> ${bus.busId}</p>
                    <p><b>Route:</b> ${bus.route}</p>
                    <p><b>Route ID:</b> ${btn.dataset.routeid || bus.routeId || 'N/A'}</p>
                    <p><b>Driver:</b> ${bus.driver}</p>
                    <p><b>Driver ID:</b> ${btn.dataset.driverid || bus.driverId || 'N/A'}</p>
                    <p><b>Status:</b> ${bus.status}</p>
                    <p><b>Speed:</b> ${bus.speed || 0} km/h</p>
                    <p><b>Current Stop:</b> ${bus.current_stop || 'N/A'}</p>
                `);
            }));
        }
    }

    async function loadUsersTab(role) {
        const users = await apiFetch(`/admin/users?role=${role}`);
        const normalizedSearch = currentUserSearch.toLowerCase();
        const filteredUsers = users.filter(u => {
            const searchable = `${u.name || ''} ${u.email || ''} ${u.phone || ''}`.toLowerCase();
            return normalizedSearch === '' || searchable.includes(normalizedSearch);
        });

        const statusLabel = user => {
            if (user.status === 'pending') return '🟡 Pending';
            return user.isActive ? '🟢 Active' : '🔴 Suspended';
        };

        const sortValue = (user, field) => {
            if (field === 'name') return (user.name || '').toLowerCase();
            if (field === 'role') return (user.role || '').toLowerCase();
            if (field === 'status') {
                if (user.status === 'pending') return '1';
                return user.isActive ? '2' : '3';
            }
            return '';
        };

        filteredUsers.sort((a, b) => {
            const aVal = sortValue(a, currentUserSort);
            const bVal = sortValue(b, currentUserSort);
            return currentUserSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });

        if (!filteredUsers || filteredUsers.length === 0) {
            document.getElementById('tabContent').innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }

        let html = `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
        filteredUsers.forEach(u => {
            html += `<tr>
                <td>${u.name || 'N/A'}</td>
                <td>${u.email || 'N/A'}</td>
                <td>${u.role === 'driver' ? 'Driver' : 'Passenger'}</td>
                <td>${statusLabel(u)}</td>
                <td><button class="action-btn btn-view view-user-btn" data-id="${u._id}">View</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('tabContent').innerHTML = html;

        document.querySelectorAll('.view-user-btn').forEach(b => b.addEventListener('click', async () => {
            const user = await apiFetch(`/admin/users/${b.dataset.id}`);
            const statusText = user.status === 'pending' ? '🟡 Pending' : user.isActive ? '🟢 Active' : '🔴 Suspended';
            showModal(`<h3>User Details</h3>
                <p><b>Name:</b> ${user.name || 'N/A'}</p>
                <p><b>Email:</b> ${user.email || 'N/A'}</p>
                <p><b>Phone:</b> ${user.phone || 'N/A'}</p>
                <p><b>Role:</b> ${user.role === 'driver' ? 'Driver' : 'Passenger'}</p>
                <p><b>Status:</b> ${statusText}</p>
                <p><b>Created Date:</b> ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}</p>
                <div class="modal-actions">
                    ${user.isActive ? `<button id="modalSuspendBtn" class="action-btn btn-warning">Suspend User</button>` : `<button id="modalActivateBtn" class="action-btn btn-success">Activate User</button>`}
                    <button id="modalDeleteBtn" class="action-btn btn-danger">Delete User</button>
                </div>
            `);
            document.getElementById('modalSuspendBtn')?.addEventListener('click', async () => {
                await apiFetch(`/admin/users/${user._id}/suspend`, { method:'POST' });
                document.querySelector('.modal-overlay')?.remove();
                loadUsersTab(role);
            });
            document.getElementById('modalActivateBtn')?.addEventListener('click', async () => {
                await apiFetch(`/admin/users/${user._id}/activate`, { method:'POST' });
                document.querySelector('.modal-overlay')?.remove();
                loadUsersTab(role);
            });
            document.getElementById('modalDeleteBtn')?.addEventListener('click', async () => {
                if (confirm('Delete this user?')) {
                    await apiFetch(`/admin/users/${user._id}`, { method:'DELETE' });
                    document.querySelector('.modal-overlay')?.remove();
                    loadUsersTab(role);
                }
            });
        }));
    }

    // ── Modal ──
    function showModal(content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal"><button class="modal-close">&times;</button><div>${content}</div></div>`;
        overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // ── Route Form ──
    function showRouteForm(data = null) {
        // data may have stops array
        let stopsHtml = '';
        if (data && data.stops) {
            data.stops.forEach((s, idx) => {
                stopsHtml += `
                    <div class="stop-row">
                        <input placeholder="Stop Name" value="${s.name}" data-field="name" data-index="${idx}">
                        <input placeholder="Latitude" type="number" step="0.0001" value="${s.latitude}" data-field="lat" data-index="${idx}">
                        <input placeholder="Longitude" type="number" step="0.0001" value="${s.longitude}" data-field="lng" data-index="${idx}">
                        <button class="remove-stop-btn">X</button>
                    </div>`;
            });
        }
        const formHtml = `
            <form id="routeForm" class="admin-form">
                <h3>${data ? 'Edit Route' : 'Add Route'}</h3>
                <div class="form-group"><label>Route Number</label><input name="route_number" required value="${data?.route_number || ''}"></div>
                <div class="form-group"><label>Ownership</label><select name="ownership"><option>Private</option><option>Government</option></select></div>
                <div class="form-group"><label>Bus Type</label><select name="bus_type"><option>AC</option><option>Non AC</option><option>Electric</option><option>CNG</option><option>Volvo</option></select></div>
                <div class="form-group"><label>Fare</label><input type="number" name="fare" value="${data?.fare || ''}"></div>
                <div class="form-group"><label>Duration (min)</label><input type="number" name="duration" value="${data?.duration || ''}"></div>
                <div class="form-group"><label>First Bus (HH:MM)</label><input name="first_bus" value="${data?.schedule?.first_bus || ''}"></div>
                <div class="form-group"><label>Last Bus (HH:MM)</label><input name="last_bus" value="${data?.schedule?.last_bus || ''}"></div>
                <div class="form-group"><label>Frequency (min)</label><input type="number" name="frequency" value="${data?.schedule?.frequency || ''}"></div>
                <h4>Stops</h4>
                <div id="stopsContainer">${stopsHtml}</div>
                <button type="button" id="addStopBtn">+ Add Stop</button>
                <button type="submit" class="submit-btn">Save</button>
            </form>
        `;
        showModal(formHtml);
        // Populate selects with actual route data
        if (data) {
            const ownershipSelect = document.querySelector('[name="ownership"]');
            const busTypeSelect = document.querySelector('[name="bus_type"]');
            if (ownershipSelect) ownershipSelect.value = data.ownership || ownershipSelect.value;
            if (busTypeSelect) busTypeSelect.value = data.bus_type || busTypeSelect.value;
        }

        // Attach events
        document.getElementById('addStopBtn').addEventListener('click', () => {
            const container = document.getElementById('stopsContainer');
            const idx = container.children.length;
            const row = document.createElement('div');
            row.className = 'stop-row';
            row.innerHTML = `
                <input placeholder="Stop Name" data-field="name" data-index="${idx}">
                <input placeholder="Latitude" type="number" step="0.0001" data-field="lat" data-index="${idx}">
                <input placeholder="Longitude" type="number" step="0.0001" data-field="lng" data-index="${idx}">
                <button class="remove-stop-btn">X</button>`;
            container.appendChild(row);
            row.querySelector('.remove-stop-btn').addEventListener('click', () => row.remove());
        });
        document.querySelectorAll('.remove-stop-btn').forEach(btn => btn.addEventListener('click', () => btn.parentElement.remove()));

        document.getElementById('routeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const schedule = {
                first_bus: form.first_bus.value,
                last_bus: form.last_bus.value,
                frequency: parseInt(form.frequency.value) || 0
            };
            // Collect stops
            const stopRows = document.querySelectorAll('.stop-row');
            const stops = [];
            let order = 1;
            stopRows.forEach(row => {
                const name = row.querySelector('[data-field="name"]').value;
                const lat = parseFloat(row.querySelector('[data-field="lat"]').value);
                const lng = parseFloat(row.querySelector('[data-field="lng"]').value);
                if (name && !isNaN(lat) && !isNaN(lng)) {
                    stops.push({
                        stop_id: `STOP${Date.now()}${order}`, // temporary id
                        name, latitude: lat, longitude: lng, order: order,
                        type: order === 1 ? 'source' : (order === stopRows.length ? 'destination' : 'stop')
                    });
                    order++;
                }
            });
            const payload = {
                route_number: form.route_number.value,
                ownership: form.ownership.value,
                bus_type: form.bus_type.value,
                fare: parseFloat(form.fare.value),
                duration: parseInt(form.duration.value),
                schedule,
                stops
            };
            if (data) {
                await apiFetch(`/admin/routes/${data._id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            } else {
                await apiFetch('/admin/routes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            }
            document.querySelector('.modal-overlay').remove();
            loadSection('routes');
        });
    }
    // ── Bus Form ──
    function showBusForm(data = null) {
        const formHtml = `
            <form id="busForm" class="admin-form">
                <h3>${data ? 'Edit Bus' : 'Add Bus'}</h3>
                <div class="form-group"><label>Bus ID (e.g., 77A-001)</label><input name="busId" required value="${data?.busId || ''}"></div>
                <div class="form-group"><label>Route ID</label><input name="routeId" required value="${data?.routeId || ''}"></div>
                <div class="form-group"><label>Ownership</label><select name="ownership"><option>Private</option><option>Government</option></select></div>
                <div class="form-group"><label>Bus Type</label><select name="busType"><option>AC</option><option>Non AC</option></select></div>
                <div class="form-group"><label>Status</label><select name="status"><option>active</option><option>inactive</option><option>maintenance</option></select></div>
                <button type="submit" class="submit-btn">Save</button>
            </form>
        `;
        showModal(formHtml);
        document.getElementById('busForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const payload = {
                busId: form.busId.value,
                routeId: form.routeId.value,
                ownership: form.ownership.value,
                busType: form.busType.value,
                status: form.status.value
            };
            if (data) {
                await apiFetch(`/admin/buses/${data._id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            } else {
                await apiFetch('/admin/buses', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            }
            document.querySelector('.modal-overlay').remove();
            loadSection('buses');
        });
    }

    // Load default section
    loadSection('dashboard');
});