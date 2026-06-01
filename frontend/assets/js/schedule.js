document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('passengerToken');
    const profileStr = localStorage.getItem('passengerProfile');
    if (!token || !profileStr) { window.location.href = 'login.html'; return; }

    const params = new URLSearchParams(window.location.search);
    const routeId = params.get('routeId');
    const source = params.get('source');
    const destination = params.get('destination');
    const direction = params.get('direction');

    if (!routeId || !source || !destination) {
        alert('Missing parameters');
        window.location.href = 'passenger-dashboard.html';
        return;
    }

    const API_BASE = 'http://localhost:8000/api';
    const backBtn = document.getElementById('backBtn');
    backBtn.addEventListener('click', () => window.location.href = 'passenger-dashboard.html');

    const scheduleContent = document.getElementById('scheduleContent');

    async function fetchSchedule() {
        try {
            const res = await fetch(
                `${API_BASE}/passenger/route-schedule?routeId=${routeId}&source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}&direction=${direction}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error('Failed to load schedule');
            const data = await res.json();
            renderSchedule(data);
        } catch (err) {
            scheduleContent.innerHTML = '<p class="error">Failed to load schedule. Please try again.</p>';
        }
    }

    function renderSchedule(data) {
        document.getElementById('routeTitle').textContent = `Route ${data.routeNumber} Schedule`;
        let html = '';

        // Route summary card
        html += `
            <div class="summary-card">
                <h2>${data.routeNumber} · ${data.stops[0]} → ${data.stops[data.stops.length-1]}</h2>
                <div class="summary-details">
                    <div><strong>Direction:</strong> ${data.direction}</div>
                    <div><strong>First Bus:</strong> ${data.firstBus}</div>
                    <div><strong>Last Bus:</strong> ${data.lastBus}</div>
                    <div><strong>Total Buses:</strong> ${data.frequency}</div>
                    <div><strong>Duration:</strong> ${data.duration} min</div>
                </div>
            </div>`;

        // Next Available Bus card
        if (data.nextAvailableBus) {
            const next = data.nextAvailableBus;
            html += `
                <div class="next-bus-card">
                    <div class="next-bus-info">
                        <span class="label">Next Available Bus</span>
                        <span class="value">Bus #${next.busNumber}</span>
                    </div>
                    <div class="next-bus-info">
                        <span class="label">Boards at ${next.boardingStop}</span>
                        <span class="value">${next.boardingTime}</span>
                    </div>
                    <div class="next-bus-info">
                        <span class="label">Arrives ${next.destinationStop}</span>
                        <span class="value">${next.destinationTime}</span>
                    </div>
                </div>`;
        }

        // Journey helper
        html += `
            <div class="journey-helper">
                <div class="stop">
                    <div class="stop-name">${source}</div>
                    <small>Boarding</small>
                </div>
                <div class="stop-arrow">→</div>
                <div class="stop">
                    <div class="stop-name">${destination}</div>
                    <small>Alighting</small>
                </div>
            </div>`;

        // Timetable table
        html += `<div class="table-wrapper"><table class="schedule-table"><thead><tr><th>Bus #</th>`;
        data.stops.forEach(stop => {
            html += `<th class="${stop === source ? 'highlight-source' : stop === destination ? 'highlight-destination' : ''}">${stop}</th>`;
        });
        html += `</tr></thead><tbody>`;

        data.schedule.forEach(bus => {
            html += `<tr><td>${bus.busNumber}</td>`;
            bus.stopTimes.forEach(st => {
                let cls = '';
                if (st.stopName === source) cls = 'highlight-source';
                else if (st.stopName === destination) cls = 'highlight-destination';
                html += `<td class="${cls}">${st.time}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        scheduleContent.innerHTML = html;
    }

    fetchSchedule();
});