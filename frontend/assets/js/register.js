document.addEventListener('DOMContentLoaded', () => {
    // Use `API_BASE` from config.js. Registration endpoints are under /auth/register on the backend.

    // State
    let userData = {
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'passenger',
        license: '',
        licenseExpiry: '',
        experience: '',
        operator: '',
        routeId: ''
    };
    let emailVerified = false;
    let phoneVerified = false;
    let emailResendSeconds = 0;
    let phoneResendSeconds = 0;
    let emailTimerInterval, phoneTimerInterval;

    // DOM elements
    const basicStep = document.getElementById('step-basic');
    const emailOtpStep = document.getElementById('step-email-otp');
    const phoneOtpStep = document.getElementById('step-phone-otp');
    const processingStep = document.getElementById('step-processing');
    const successPassenger = document.getElementById('step-success-passenger');
    const successDriver = document.getElementById('step-success-driver');

    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const confirmError = document.getElementById('confirmError');
    const roleRadios = document.querySelectorAll('input[name="role"]');
    const driverFields = document.getElementById('driverFields');
    const licenseInput = document.getElementById('license');
    const licenseExpiryInput = document.getElementById('licenseExpiry');
    const experienceInput = document.getElementById('experience');
    const operatorInput = document.getElementById('operator');
    const routeSelect = document.getElementById('routeSelect');
    const routeInfoCard = document.getElementById('routeInfoCard');

    const nextBtn = document.getElementById('nextToOtpBtn');
    const emailOtpInput = document.getElementById('emailOtpInput');
    const verifyEmailBtn = document.getElementById('verifyEmailOtpBtn');
    const resendEmailBtn = document.getElementById('resendEmailOtpBtn');
    const emailResendTimer = document.getElementById('resendEmailTimer');
    const emailOtpError = document.getElementById('emailOtpError');

    const phoneOtpInput = document.getElementById('phoneOtpInput');
    const verifyPhoneBtn = document.getElementById('verifyPhoneOtpBtn');
    const resendPhoneBtn = document.getElementById('resendPhoneOtpBtn');
    const phoneResendTimer = document.getElementById('resendPhoneTimer');
    const phoneOtpError = document.getElementById('phoneOtpError');

    // Strength meter elements
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');

    // Password visibility
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePassword.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });
    toggleConfirmPassword.addEventListener('click', () => {
        const type = confirmPasswordInput.type === 'password' ? 'text' : 'password';
        confirmPasswordInput.type = type;
        toggleConfirmPassword.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    // Password strength
    function calcStrength(pw) {
        let s = 0;
        if (pw.length >= 8) s++;
        if (/[A-Z]/.test(pw)) s++;
        if (/[a-z]/.test(pw)) s++;
        if (/[0-9]/.test(pw)) s++;
        if (/[^A-Za-z0-9]/.test(pw)) s++;
        return s;
    }
    passwordInput.addEventListener('input', () => {
        const strength = calcStrength(passwordInput.value);
        const percent = (strength / 5) * 100;
        strengthFill.style.width = percent + '%';
        if (strength <= 2) {
            strengthFill.style.backgroundColor = '#ef4444';
            strengthText.textContent = 'Weak';
        } else if (strength === 3) {
            strengthFill.style.backgroundColor = '#f59e0b';
            strengthText.textContent = 'Medium';
        } else {
            strengthFill.style.backgroundColor = '#10b981';
            strengthText.textContent = 'Strong';
        }
    });

    // Role change
    roleRadios.forEach(radio => radio.addEventListener('change', () => {
        if (radio.value === 'driver') {
            driverFields.style.display = 'block';
        } else {
            driverFields.style.display = 'none';
            licenseInput.value = '';
            licenseExpiryInput.value = '';
            experienceInput.value = '';
            operatorInput.value = '';
            routeSelect.value = '';
            routeInfoCard.style.display = 'none';
        }
    }));

    // Fetch routes
    async function loadRoutes() {
        try {
            const routes = await apiRequest('/api/routes');
            routeSelect.innerHTML = '<option value="">-- Choose a route --</option>';
            routes.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r._id;
                opt.textContent = r.route_number;
                routeSelect.appendChild(opt);
            });
        } catch (err) {
            routeSelect.innerHTML = '<option value="">Routes unavailable</option>';
        }
    }
    loadRoutes();

    // Show route info when selected
    routeSelect.addEventListener('change', async () => {
        const routeId = routeSelect.value;
        if (!routeId) {
            routeInfoCard.style.display = 'none';
            return;
        }
        try {
            const routes = await apiRequest('/api/routes');
            const route = routes.find(r => r._id === routeId);
            if (route) {
                routeInfoCard.innerHTML = `
                    <p><strong>Route:</strong> ${route.route_number}</p>
                    <p><strong>Source:</strong> ${route.source}</p>
                    <p><strong>Destination:</strong> ${route.destination}</p>
                    <p><strong>Ownership:</strong> ${route.ownership}</p>
                    <p><strong>Bus Type:</strong> ${route.bus_type}</p>
                `;
                routeInfoCard.style.display = 'block';
            }
        } catch (err) {
            routeInfoCard.innerHTML = '<p>Unable to load route details.</p>';
            routeInfoCard.style.display = 'block';
        }
    });

    // Step navigation
    function showStep(step) {
        [basicStep, emailOtpStep, phoneOtpStep, processingStep, successPassenger, successDriver].forEach(s => s.classList.remove('active'));
        step.classList.add('active');
    }

    // Validate basic info
    function validateBasic() {
        userData.name = nameInput.value.trim();
        userData.email = emailInput.value.trim();
        userData.phone = phoneInput.value.trim();
        userData.password = passwordInput.value;
        const confirm = confirmPasswordInput.value;
        userData.role = document.querySelector('input[name="role"]:checked').value;

        if (!userData.name || !userData.email || !userData.phone || !userData.password || !confirm) {
            alert('All fields are required.');
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
            alert('Invalid email format.');
            return false;
        }
        if (userData.password.length < 8 || calcStrength(userData.password) < 4) {
            alert('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
            return false;
        }
        if (userData.password !== confirm) {
            confirmError.textContent = 'Passwords do not match.';
            return false;
        }
        confirmError.textContent = '';

        if (userData.role === 'driver') {
            userData.license = licenseInput.value.trim();
            userData.licenseExpiry = licenseExpiryInput.value;
            userData.experience = experienceInput.value.trim();
            userData.operator = operatorInput.value.trim();
            userData.routeId = routeSelect.value;
            if (!userData.license || !userData.licenseExpiry || !userData.experience || !userData.routeId) {
                alert('Please fill all driver details and select a route.');
                return false;
            }
        }
        return true;
    }

    // OTP functions
    function startResendTimer(type) {
        if (type === 'email') {
            emailResendSeconds = 60;
            resendEmailBtn.disabled = true;
            emailResendTimer.textContent = ` in ${emailResendSeconds}s`;
            if (emailTimerInterval) clearInterval(emailTimerInterval);
            emailTimerInterval = setInterval(() => {
                emailResendSeconds--;
                if (emailResendSeconds <= 0) {
                    clearInterval(emailTimerInterval);
                    resendEmailBtn.disabled = false;
                    emailResendTimer.textContent = '';
                } else {
                    emailResendTimer.textContent = ` in ${emailResendSeconds}s`;
                }
            }, 1000);
        } else if (type === 'phone') {
            phoneResendSeconds = 60;
            resendPhoneBtn.disabled = true;
            phoneResendTimer.textContent = ` in ${phoneResendSeconds}s`;
            if (phoneTimerInterval) clearInterval(phoneTimerInterval);
            phoneTimerInterval = setInterval(() => {
                phoneResendSeconds--;
                if (phoneResendSeconds <= 0) {
                    clearInterval(phoneTimerInterval);
                    resendPhoneBtn.disabled = false;
                    phoneResendTimer.textContent = '';
                } else {
                    phoneResendTimer.textContent = ` in ${phoneResendSeconds}s`;
                }
            }, 1000);
        }
    }

    async function sendEmailOtp() {
        await apiRequest('/api/auth/register/send-email-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: userData.email, phone: userData.phone })
        });
    }

    async function sendPhoneOtp() {
        await apiRequest('/api/auth/register/send-phone-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone: userData.phone, email: userData.email })
        });
    }

    async function verifyEmailOtp(otp) {
        await apiRequest('/api/auth/register/verify-email-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: userData.email, phone: userData.phone, otp })
        });
    }

    async function verifyPhoneOtp(otp) {
        await apiRequest('/api/auth/register/verify-phone-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: userData.email, phone: userData.phone, otp })
        });
    }

    // Step 2: Send email OTP and move to step2
    nextBtn.addEventListener('click', async () => {
        if (!validateBasic()) return;
        try {
            nextBtn.disabled = true;
            await sendEmailOtp();
            showStep(emailOtpStep);
            startResendTimer('email');
            emailOtpInput.value = '';
            emailOtpError.textContent = '';
        } catch (err) {
            alert(err.message);
        } finally {
            nextBtn.disabled = false;
        }
    });

    // Verify Email OTP
    verifyEmailBtn.addEventListener('click', async () => {
        const otp = emailOtpInput.value.trim();
        if (!otp || otp.length !== 6) {
            emailOtpError.textContent = 'Enter a 6-digit OTP';
            return;
        }
        try {
            verifyEmailBtn.disabled = true;
            await verifyEmailOtp(otp);
            emailVerified = true;
            // Now send phone OTP automatically
            await sendPhoneOtp();
            showStep(phoneOtpStep);
            startResendTimer('phone');
            phoneOtpInput.value = '';
            phoneOtpError.textContent = '';
        } catch (err) {
            emailOtpError.textContent = err.message;
        } finally {
            verifyEmailBtn.disabled = false;
        }
    });

    // Resend Email OTP
    resendEmailBtn.addEventListener('click', async () => {
        try {
            resendEmailBtn.disabled = true;
            await sendEmailOtp();
            startResendTimer('email');
        } catch (err) {
            alert(err.message);
            resendEmailBtn.disabled = false;
        }
    });

    // Verify Phone OTP
    verifyPhoneBtn.addEventListener('click', async () => {
        const otp = phoneOtpInput.value.trim();
        if (!otp || otp.length !== 6) {
            phoneOtpError.textContent = 'Enter a 6-digit OTP';
            return;
        }
        try {
            verifyPhoneBtn.disabled = true;
            await verifyPhoneOtp(otp);
            phoneVerified = true;
            // Proceed to final submission
            showStep(processingStep);
            await finalizeRegistration();
        } catch (err) {
            phoneOtpError.textContent = err.message;
        } finally {
            verifyPhoneBtn.disabled = false;
        }
    });

    // Resend Phone OTP
    resendPhoneBtn.addEventListener('click', async () => {
        try {
            resendPhoneBtn.disabled = true;
            await sendPhoneOtp();
            startResendTimer('phone');
        } catch (err) {
            alert(err.message);
            resendPhoneBtn.disabled = false;
        }
    });

    async function finalizeRegistration() {
        try {
            if (userData.role === 'passenger') {
                const payload = {
                    name: userData.name,
                    email: userData.email,
                    phone: userData.phone,
                    password: userData.password
                };
                await apiRequest('/api/auth/register/passenger', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                showStep(successPassenger);
                startRedirect(3, 'passenger');
            } else {
                const payload = {
                    name: userData.name,
                    email: userData.email,
                    phone: userData.phone,
                    password: userData.password,
                    license_number: userData.license,
                    license_expiry_date: userData.licenseExpiry,
                    experience_years: parseInt(userData.experience),
                    operator_name: userData.operator || null,
                    route_id: userData.routeId
                };
                const data = await apiRequest('/api/auth/register/driver', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                document.getElementById('appIdDisplay').textContent = data.application_id;
                showStep(successDriver);
            }
        } catch (err) {
            alert(err.message);
            // Go back to basic step on error
            showStep(basicStep);
        }
    }

    function startRedirect(sec, type) {
        const timerId = type === 'passenger' ? 'passengerRedirectTimer' : null;
        if (!timerId) return;
        let countdown = sec;
        const timerEl = document.getElementById(timerId);
        const interval = setInterval(() => {
            countdown--;
            timerEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                window.location.href = 'login.html';
            }
        }, 1000);
    }

    // Buttons for final navigation
    document.getElementById('gotoLoginPassenger').addEventListener('click', () => window.location.href = 'login.html');
    document.getElementById('gotoLoginDriver').addEventListener('click', () => window.location.href = 'login.html');
});
