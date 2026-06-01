document.addEventListener('DOMContentLoaded', () => {
    // State management
    let currentStep = 1;
    let userIdentifier = '';
    let resendTimerInterval = null;
    let resendSeconds = 0;

    // DOM elements
    const steps = document.querySelectorAll('.step');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const stepSuccess = document.getElementById('stepSuccess');
    const identifierInput = document.getElementById('identifierInput');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const otpInput = document.getElementById('otpInput');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const resendTimer = document.getElementById('resendTimer');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    const passwordStrengthFill = document.getElementById('strengthFill');
    const passwordStrengthText = document.getElementById('strengthText');
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const autoRedirectTimer = document.getElementById('autoRedirectTimer');

    // Backend base URL (same as login)
    const API_BASE = 'http://localhost:8000/api/auth/forgot-password';

    // Show a specific step
    function showStep(step) {
        steps.forEach(s => s.classList.remove('active'));
        if (step === 1) step1.classList.add('active');
        else if (step === 2) step2.classList.add('active');
        else if (step === 3) step3.classList.add('active');
        else if (step === 4) stepSuccess.classList.add('active');
        currentStep = step;
    }

    // Reset all forms when going back
    function resetForms() {
        identifierInput.value = '';
        otpInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        if (resendTimerInterval) clearInterval(resendTimerInterval);
        resendOtpBtn.disabled = true;
        resendTimer.textContent = '';
    }

    // Toggle password visibility
    function setupPasswordToggle(toggleBtn, inputField) {
        toggleBtn.addEventListener('click', () => {
            const type = inputField.type === 'password' ? 'text' : 'password';
            inputField.type = type;
            toggleBtn.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }
    setupPasswordToggle(toggleNewPassword, newPasswordInput);
    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

    // Password strength calculator
    function calculateStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        return score; // 0-5
    }

    function updatePasswordStrength() {
        const password = newPasswordInput.value;
        const strength = calculateStrength(password);
        let percent = (strength / 5) * 100;
        passwordStrengthFill.style.width = percent + '%';
        if (strength <= 2) {
            passwordStrengthFill.style.backgroundColor = '#ef4444'; // weak
            passwordStrengthText.textContent = 'Weak';
        } else if (strength === 3) {
            passwordStrengthFill.style.backgroundColor = '#f59e0b'; // medium
            passwordStrengthText.textContent = 'Medium';
        } else if (strength >= 4) {
            passwordStrengthFill.style.backgroundColor = '#10b981'; // strong
            passwordStrengthText.textContent = 'Strong';
        }
    }
    newPasswordInput.addEventListener('input', updatePasswordStrength);

    // Backend communication with error handling
    async function apiCall(endpoint, body) {
        try {
            const res = await fetch(`${API_BASE}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Request failed');
            return data;
        } catch (error) {
            throw error;
        }
    }

    // Step 1: Send OTP
    sendOtpBtn.addEventListener('click', async () => {
        const identifier = identifierInput.value.trim();
        if (!identifier) {
            alert('Please enter your email or phone number.');
            return;
        }
        userIdentifier = identifier;

        try {
            sendOtpBtn.disabled = true;
            sendOtpBtn.innerHTML = '<span class="spinner"></span> Sending...';
            await apiCall('send-otp', { identifier: userIdentifier });
            // Show step 2
            showStep(2);
            startResendTimer(60);
        } catch (err) {
            alert(err.message);
        } finally {
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = 'Send OTP';
        }
    });

    function startResendTimer(seconds) {
        resendSeconds = seconds;
        resendOtpBtn.disabled = true;
        updateResendButtonText();
        if (resendTimerInterval) clearInterval(resendTimerInterval);
        resendTimerInterval = setInterval(() => {
            resendSeconds--;
            if (resendSeconds <= 0) {
                clearInterval(resendTimerInterval);
                resendOtpBtn.disabled = false;
                resendTimer.textContent = '';
            } else {
                updateResendButtonText();
            }
        }, 1000);
    }

    function updateResendButtonText() {
        resendTimer.textContent = ` in ${resendSeconds}s`;
    }

    // Step 2: Verify OTP
    verifyOtpBtn.addEventListener('click', async () => {
        const otp = otpInput.value.trim();
        if (!otp || otp.length !== 6) {
            alert('Please enter a valid 6-digit OTP.');
            return;
        }
        try {
            verifyOtpBtn.disabled = true;
            await apiCall('verify-otp', { identifier: userIdentifier, otp });
            showStep(3);
        } catch (err) {
            alert(err.message);
        } finally {
            verifyOtpBtn.disabled = false;
        }
    });

    // Resend OTP
    resendOtpBtn.addEventListener('click', async () => {
        try {
            resendOtpBtn.disabled = true;
            await apiCall('send-otp', { identifier: userIdentifier });
            startResendTimer(60);
        } catch (err) {
            alert(err.message);
        }
    });

    // Step 3: Reset password
    savePasswordBtn.addEventListener('click', async () => {
        const newPass = newPasswordInput.value;
        const confirmPass = confirmPasswordInput.value;

        if (newPass.length < 8) {
            alert('Password must be at least 8 characters.');
            return;
        }
        if (calculateStrength(newPass) < 4) {
            alert('Password is too weak. It must contain uppercase, lowercase, number, and special character.');
            return;
        }
        if (newPass !== confirmPass) {
            alert('Passwords do not match.');
            return;
        }

        try {
            savePasswordBtn.disabled = true;
            savePasswordBtn.innerHTML = '<span class="spinner"></span> Saving...';
            await apiCall('reset-password', { identifier: userIdentifier, newPassword: newPass });
            showStep(4);
            startAutoRedirect();
        } catch (err) {
            alert(err.message);
        } finally {
            savePasswordBtn.disabled = false;
            savePasswordBtn.textContent = 'Save Password';
        }
    });

    function startAutoRedirect() {
        let sec = 3;
        autoRedirectTimer.textContent = sec;
        const interval = setInterval(() => {
            sec--;
            autoRedirectTimer.textContent = sec;
            if (sec <= 0) {
                clearInterval(interval);
                window.location.href = 'login.html';
            }
        }, 1000);
    }

    // Navigation buttons
    document.getElementById('backToLogin1').addEventListener('click', () => {
        window.location.href = 'login.html';
    });
    document.getElementById('backToLogin2').addEventListener('click', () => {
        window.location.href = 'login.html';
    });
    document.getElementById('backToLogin3').addEventListener('click', () => {
        window.location.href = 'login.html';
    });
    document.getElementById('goToLoginBtn').addEventListener('click', () => {
        window.location.href = 'login.html';
    });

    // Initialize to step 1
    showStep(1);
});