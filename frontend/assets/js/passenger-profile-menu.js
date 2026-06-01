(function() {
    const token = localStorage.getItem('passengerToken');
    const userStr = localStorage.getItem('passengerProfile');
    if (!token || !userStr) return;
    let user;
    try { user = JSON.parse(userStr); } catch (e) { return; }
    if (user.role !== 'passenger') return;

    const header = document.querySelector('header');
    if (!header) return;

    // Use existing profile menu container placed in the header HTML
    const container = document.getElementById('profile-menu');
    if (!container) return;
    container.style.position = 'relative';

    // Initial avatar with placeholder initials until profile loads
    let initials = '👤';
    container.innerHTML = `
        <div class="passenger-avatar" id="avatarBtn">
            <span class="avatar-text">${initials}</span>
        </div>
        <div class="profile-dropdown" id="profileDropdown" style="display:none;">
            <div class="profile-info">
                <div class="avatar-large" id="ddAvatar">${initials}</div>
                <div class="user-detail">
                    <span class="user-name" id="ddName">Loading...</span>
                    <span class="user-email" id="ddEmail">Loading...</span>
                    <span class="user-phone" id="ddPhone">Loading...</span>
                </div>
            </div>
            <div class="dropdown-section">
                <span class="dropdown-item" id="memberSince">Loading...</span>
            </div>
        </div>
    `;

    // Attach top-level logout (header) button behavior if present
    const topLogoutBtn = document.getElementById('logoutBtn');
    if (topLogoutBtn) {
        topLogoutBtn.addEventListener('click', () => {
            // Remove only passenger-specific session entries
            try {
                localStorage.removeItem('passengerToken');
                localStorage.removeItem('passengerProfile');
            } catch (e) {
                console.warn('Logout cleanup failed', e);
            }
            // Redirect to passenger login
            window.location.href = 'login.html';
        });
    }

    const avatarBtn = document.getElementById('avatarBtn');
    const dropdown = document.getElementById('profileDropdown');

    // ── Fetch profile from API ──
    async function fetchAndRenderProfile() {
        try {
            const res = await fetch('http://localhost:8000/api/passenger/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch profile');
            const data = await res.json();

            // Compute initials from name
            const name = data.name || '';
            const initialsStr = name.split(' ').map(s => s[0]).join('').toUpperCase() || '👤';

            // Update avatar button
            document.querySelector('.avatar-text').textContent = initialsStr;
            document.getElementById('ddAvatar').textContent = initialsStr;

            // Update info fields
            document.getElementById('ddName').textContent = name;
            document.getElementById('ddEmail').textContent = data.email || 'N/A';
            document.getElementById('ddPhone').textContent = data.phone || 'N/A';

            // Member since
            if (data.createdAt) {
                const createdDate = new Date(data.createdAt);
                const istDate = createdDate.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                document.getElementById('memberSince').textContent = 'Member Since: ' + istDate;
            } else {
                document.getElementById('memberSince').textContent = '';
            }
        } catch (err) {
            console.warn('Profile fetch error:', err);
            // Keep existing UI as fallback
        }
    }

    // Fetch on page load to set initials correctly
    fetchAndRenderProfile();

    // Toggle dropdown and refresh data
    avatarBtn.addEventListener('click', () => {
        if (dropdown.style.display === 'none' || dropdown.style.display === '') {
            fetchAndRenderProfile(); // refresh data every time
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // logout handled by header logout button; nothing else here
})();