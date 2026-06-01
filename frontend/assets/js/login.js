document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const identifierInput = document.getElementById('identifier');
    const passwordInput = document.getElementById('password');
    const identifierError = document.getElementById('identifier-error');
    const passwordError = document.getElementById('password-error');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const spinner = document.getElementById('spinner');
    const togglePasswordBtn = document.getElementById('togglePassword');

    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePasswordBtn.querySelector('.eye-icon').textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    // Form validation
    function showError(field, message) {
        const errorEl = field === 'identifier' ? identifierError : passwordError;
        errorEl.textContent = message;
    }

    function clearErrors() {
        identifierError.textContent = '';
        passwordError.textContent = '';
    }

    function validateForm() {
        let isValid = true;
        clearErrors();

        // Identifier validation
        const identifier = identifierInput.value.trim();
        if (!identifier) {
            showError('identifier', 'Email or phone number is required');
            isValid = false;
        }

        // Password validation
        const password = passwordInput.value;
        if (!password) {
            showError('password', 'Password is required');
            isValid = false;
        } else if (password.length < 6) {
            showError('password', 'Password must be at least 6 characters');
            isValid = false;
        }

        return isValid;
    }

    // UI state management
    function setLoading(isLoading) {
        if (isLoading) {
            loginBtn.disabled = true;
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
        } else {
            loginBtn.disabled = false;
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
        }
    }

    // API call
    async function performLogin(identifier, password) {
        try {
            return await apiRequest('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ identifier, password }),
            });
        } catch (error) {
            console.error('Login error:', error.message || error);
            return { success: false, message: error.message || 'Network error. Please try again.' };
        }
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        setLoading(true);

        const identifier = identifierInput.value.trim();
        const password = passwordInput.value;

        const result = await performLogin(identifier, password);

        setLoading(false);

        if (!result.success) {
            // Show general error above form or as alert
            alert(result.message || 'Invalid credentials');
            return;
        }

        // Success: store token and profile under role-specific keys
        const role = result.user.role;
        if (role === 'passenger') {
            localStorage.setItem('passengerToken', result.token);
            localStorage.setItem('passengerProfile', JSON.stringify(result.user));
        } else if (role === 'driver') {
            localStorage.setItem('driverToken', result.token);
            localStorage.setItem('driverProfile', JSON.stringify(result.user));
        } else if (role === 'admin') {
            localStorage.setItem('adminToken', result.token);
            localStorage.setItem('adminProfile', JSON.stringify(result.user));
        }

        // Redirect based on role
        let redirectPage = '';
        switch (role) {
            case 'passenger':
                redirectPage = 'passenger-dashboard.html';
                break;
            case 'driver':
                redirectPage = 'driver-dashboard.html';
                break;
            case 'admin':
                redirectPage = 'admin-dashboard.html';
                break;
            default:
                redirectPage = 'login.html';
        }

        window.location.href = redirectPage;
    });
});
