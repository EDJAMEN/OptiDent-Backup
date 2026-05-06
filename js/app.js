// DentAssist JS - Full Backend Integration
const app = {
    // Current logged-in user session
    currentUser: null,
    currentAppointments: [],
    globalQueueCache: [], // Cache for searching
    patientCache: [], // Cache for searching patient directory
    bookingServicesCache: [], // Cache for service details
    rewardsCache: [], // Cache for reward details
    resetUserId: null,

    // Helper: Get YYYY-MM-DD in local time
    formatDate: function (date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    init: function () {
        // Setup listeners for auto-role detection
        const regEmail = document.getElementById('reg-email');
        if (regEmail) {
            regEmail.addEventListener('input', (e) => {
                const val = e.target.value.toLowerCase();
                const extraFields = document.getElementById('dentist-extra-fields');
                if (val.includes('@dentassist.com')) {
                    extraFields.classList.remove('hidden');
                } else {
                    extraFields.classList.add('hidden');
                }
            });
        }

        this.setupAuthTabs();
        this.setupBookingSlots();
        this.setupOTPAuth();
        this.loadDentists();
        this.loadBookingServices();
        this.initQuickDatePicker(); // New: Initialize frictionless date cards
        this.initDarkMode(); // New: Initialize theme preference

        // Disable past dates in booking calendar
        const dateInput = document.getElementById('booking-date');
        if (dateInput) {
            const todayStr = this.formatDate(new Date());
            dateInput.setAttribute('min', todayStr);
        }

        console.log("DentAssist Initialized with PHP Backend!");

        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('hide-splash');
            }

            // Ensure login screen is ready
            this.switchScreen('auth-section');

            // Re-enable interactions after splash
            document.body.style.overflow = 'auto';
        }, 1200);
    },

    // --- Loading & Notifications ---
    showLoader: function (text = 'Processing...') {
        const loader = document.getElementById('global-loader');
        const loaderText = document.getElementById('loader-text');
        if (loaderText) loaderText.textContent = text;
        if (loader) loader.classList.remove('hidden');
    },

    hideLoader: function () {
        const loader = document.getElementById('global-loader');
        if (loader) loader.classList.add('hidden');
    },

    showToast: function (message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconMap = {
            'success': 'bx-check-circle',
            'error': 'bx-error-circle',
            'info': 'bx-info-circle',
            'warning': 'bx-error'
        };

        toast.innerHTML = `
            <i class='bx ${iconMap[type] || 'bx-info-circle'} bx-sm'></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => toast.classList.remove('hide'), 100);
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    confirmAction: function (message) {
        return new Promise((resolve) => {
            document.getElementById('confirm-message').textContent = message;
            document.getElementById('confirm-modal').classList.remove('hidden');
            this._pendingConfirm = resolve;
        });
    },

    closeConfirm: function (result) {
        const modal = document.getElementById('confirm-modal');
        if (modal) modal.classList.add('hidden');

        if (this._pendingConfirm) {
            this._pendingConfirm(result);
            this._pendingConfirm = null;
        }
    },

    // --- Authentication ---
    setupAuthTabs: function () {
        const tabs = document.querySelectorAll('.auth-tabs .tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

                e.target.classList.add('active');
                let targetId = `form-${e.target.dataset.target}`;

                // If register is clicked, show agreement first
                if (e.target.dataset.target === 'register') {
                    targetId = 'register-agreement';
                }

                document.getElementById(targetId).classList.add('active');
            });
        });
    },

    togglePassword: function (btn) {
        const input = btn.parentElement.querySelector('.password-field');
        const icon = btn.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('bx-hide', 'bx-show');
        } else {
            input.type = 'password';
            icon.classList.replace('bx-show', 'bx-hide');
        }
    },

    acceptAgreement: function () {
        const checkbox = document.getElementById('agree-checkbox');
        if (!checkbox || !checkbox.checked) {
            this.showToast("Please agree to the terms and conditions to proceed.", "warning");
            return;
        }

        // Hide agreement and show registration form
        document.getElementById('register-agreement').classList.remove('active');
        document.getElementById('form-register').classList.add('active');
        this.showToast("Agreement accepted. Please provide your details.", "success");
    },

    login: async function () {
        const emailInput = document.querySelector('#form-login input[type="text"]').value;
        const passwordInput = document.querySelector('#form-login .password-field').value;

        if (!emailInput || !passwordInput) {
            this.showToast("Please enter email and password.", "warning");
            return;
        }

        this.showLoader('Authenticating...');

        try {
            const recaptchaResponse = grecaptcha.getResponse(0); // 0 is usually login if it's first
            if (!recaptchaResponse) {
                this.showToast("Please complete the reCAPTCHA.", "warning");
                return;
            }

            const formData = { 
                email: emailInput, 
                password: passwordInput,
                recaptcha_token: recaptchaResponse 
            };
            const response = await fetch('api/auth/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await response.json();

            this.hideLoader();

            if (response.ok && result.status === 'success') {
                // Store user session
                this.currentUser = result.user;
                this.currentAppointments = result.appointments || [];

                const role = result.user.role;

                if (role === 'patient' || role === 'user') {
                    this.renderPatientDashboard();
                    this.switchScreen('patient-section');
                } else {
                    // Admin logic — Access Control for Super Admin (Master)
                    const masterMenus = ['menu-approvals', 'menu-dentists', 'menu-archive'];

                    masterMenus.forEach(menuId => {
                        const el = document.getElementById(menuId);
                        if (el) {
                            if (result.user.is_master) {
                                el.classList.remove('hidden');
                            } else {
                                el.classList.add('hidden');
                            }
                        }
                    });

                    // Exception: Staff/Dentists might still need Archive for cancelled appointments (as requested earlier)
                    // But if the user wants Super Admin to be truly unique, we restrict it.
                    // Let's keep Archive available only to Master/Admins if specifically requested, 
                    // but for now, we'll follow the "Super Admin is Unique" rule.

                    this.renderAdminDashboard();
                    this.switchScreen('admin-section');
                }
                this.showToast(`Welcome back, ${result.user.name}!`, "success");
            } else {
                grecaptcha.reset(0);
                this.showToast(result.message || "Invalid credentials", "error");
            }
        } catch (error) {
            console.error("Login Error:", error);
            grecaptcha.reset(0);
            this.hideLoader();
            this.showToast("Failed to connect to backend server.", "error");
        }
    },

    register: async function () {
        const nameInput = document.getElementById('reg-name').value;
        const phoneInput = document.getElementById('reg-phone').value;
        const emailInput = document.getElementById('reg-email').value;
        const passwordInput = document.getElementById('reg-password').value;
        const isStaffForced = document.getElementById('reg-is-staff').value === '1';

        // Auto-determine role: Admin/Dentist if email contains clinic domain OR if staff mode is on
        const isAdminEmail = emailInput.toLowerCase().includes('@dentassist.com');
        const role = (isAdminEmail || isStaffForced) ? 'admin' : 'patient';

        if (!nameInput || !phoneInput || !emailInput || !passwordInput) {
            this.showToast("Please fill in all fields.", "warning");
            return;
        }

        this.showLoader("Creating secure account...");

        try {
            const recaptchaResponse = grecaptcha.getResponse(1); // 1 is usually register
            if (!recaptchaResponse) {
                this.showToast("Please complete the reCAPTCHA.", "warning");
                return;
            }

            const formData = {
                full_name: nameInput,
                phone: phoneInput,
                email: emailInput,
                password: passwordInput,
                role: role,
                professional_id: role !== 'patient' ? document.getElementById('reg-professional-id').value : '',
                position: role !== 'patient' ? document.getElementById('reg-dentist-position').value : '',
                recaptcha_token: recaptchaResponse
            };

            const response = await fetch('api/auth/register.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await response.json();

            this.hideLoader();

            if (response.ok && result.status === 'success') {
                // If account is pending (Admins/Dentists), do NOT log in yet
                if (result.user.status === 'pending') {
                    this.hideLoader();
                    this.showToast("Account submitted for review.", "info");

                    // Show specialized 'Pending' view
                    document.getElementById('pending-name').textContent = result.user.name;
                    this.switchScreen('pending-section');
                    return;
                }

                // Normal login for patients
                this.currentUser = result.user;
                this.currentAppointments = [];

                this.showToast("Account created successfully!", "success");

                if (result.user.role === 'patient') {
                    this.switchScreen('onboarding-section');
                } else {
                    this.renderAdminDashboard();
                    this.switchScreen('admin-section');
                }
            } else {
                grecaptcha.reset(1);
                this.showToast(result.message || "Registration failed", "error");
            }
        } catch (error) {
            console.error("Register Error:", error);
            grecaptcha.reset(1);
            this.hideLoader();
            this.showToast("Failed to connect to backend server.", "error");
        }
    },

    // --- Forgot Password Flow ---
    verifyForReset: async function () {
        const email = document.getElementById('forgot-email').value;
        const phone = document.getElementById('forgot-phone').value;

        if (!email || !phone) {
            this.showToast("Please provide both email and phone.", "warning");
            return;
        }

        this.showLoader("Verifying account...");

        try {
            const response = await fetch('api/auth/verify_reset.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone })
            });
            const result = await response.json();

            this.hideLoader();

            if (result.status === 'success') {
                this.resetUserId = result.user_id;
                document.getElementById('forgot-step-1').classList.add('hidden');
                document.getElementById('forgot-step-2').classList.remove('hidden');
                this.showToast("Account verified! Enter your new password.", "success");
            } else {
                this.showToast(result.message || "Verification failed.", "error");
            }
        } catch (error) {
            console.error("Verify Error:", error);
            this.hideLoader();
            this.showToast("Error connecting to server.", "error");
        }
    },

    resetPassword: async function () {
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-new-password').value;

        if (!newPass || newPass.length < 4) {
            this.showToast("Password must be at least 4 characters.", "warning");
            return;
        }

        if (newPass !== confirmPass) {
            this.showToast("Passwords do not match.", "error");
            return;
        }

        this.showLoader("Updating password...");

        try {
            const response = await fetch('api/auth/reset_password.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: this.resetUserId,
                    new_password: newPass
                })
            });
            const result = await response.json();

            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                setTimeout(() => {
                    // Reset UI
                    document.getElementById('forgot-step-1').classList.remove('hidden');
                    document.getElementById('forgot-step-2').classList.add('hidden');
                    document.getElementById('forgot-email').value = '';
                    document.getElementById('forgot-phone').value = '';
                    document.getElementById('new-password').value = '';
                    document.getElementById('confirm-new-password').value = '';
                    this.switchScreen('auth-section');
                }, 2000);
            } else {
                this.showToast(result.message || "Update failed.", "error");
            }
        } catch (error) {
            console.error("Reset Error:", error);
            this.hideLoader();
            this.showToast("Error connecting to server.", "error");
        }
    },

    submitOnboarding: async function () {
        if (!this.currentUser) {
            this.showToast("Session expired. Please login again.", "error");
            this.switchScreen('auth-section');
            return;
        }

        const form = document.getElementById('form-onboarding');
        const dob = form.querySelector('input[type="date"]').value;
        const emergName = form.querySelectorAll('input[type="text"]')[0].value;
        const emergPhone = form.querySelector('input[type="tel"]').value;
        const textareas = form.querySelectorAll('textarea');
        const allergies = textareas[0] ? textareas[0].value : '';
        const medications = textareas[1] ? textareas[1].value : '';

        this.showLoader("Saving medical history...");

        try {
            const payload = {
                user_id: this.currentUser.id,
                dob: dob,
                emergency_contact_name: emergName,
                emergency_contact_phone: emergPhone,
                allergies: allergies,
                medications: medications
            };

            const response = await fetch('api/patients/onboarding.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            this.hideLoader();

            if (response.ok && result.status === 'success') {
                // Update local session with new meta
                this.currentUser.dob = dob;
                this.currentUser.emergency_contact_name = emergName;
                this.currentUser.emergency_contact_phone = emergPhone;
                this.currentUser.allergies = allergies;
                this.currentUser.medications = medications;

                this.renderPatientDashboard();
                this.switchScreen('patient-section');
                this.showToast("Welcome to DentAssist Dashboard!", "success");
            } else {
                this.showToast(result.message || "Failed to save.", "error");
            }
        } catch (error) {
            console.error("Onboarding Error:", error);
            this.hideLoader();
            this.showToast("Failed to connect to backend server.", "error");
        }
    },

    // ===================================================================
    // RENDER PATIENT DASHBOARD — Dynamic from currentUser + appointments
    // ===================================================================
    renderPatientDashboard: function () {
        const user = this.currentUser;
        if (!user) return;

        // Ensure we have a valid name to work with
        const displayName = user.name || user.full_name || "Valued Patient";

        // --- Update nav bar name & initials ---
        const nameEl = document.getElementById('patient-nav-name');
        if (nameEl) nameEl.textContent = displayName;

        const avatarEl = document.getElementById('patient-avatar');
        if (avatarEl) {
            const initials = displayName.split(' ').filter(n => n).map(w => w[0]).join('').toUpperCase().substring(0, 2);
            avatarEl.textContent = initials || "??";
        }

        // --- Update dashboard greeting ---
        const greetingEl = document.getElementById('patient-greeting');
        if (greetingEl) {
            const firstName = displayName.split(' ')[0];
            greetingEl.textContent = `Hello, ${firstName}! 👋`;
        }

        // --- Update reward points ---
        const pointsEl = document.getElementById('patient-reward-points');
        if (pointsEl) {
            const pts = user.reward_points || 0;
            pointsEl.innerHTML = `<i class='bx bx-star text-lg mr-1'></i> ${pts} Reward Points <span class="profile-indicator">View Rewards <i class='bx bx-chevron-right'></i></span>`;
        }

        // --- Update Personal Information Dashboard Card ---
        const emailEl = document.getElementById('patient-info-email');
        if (emailEl) emailEl.textContent = user.email || "No email provided";

        const phoneEl = document.getElementById('patient-info-phone');
        if (phoneEl) phoneEl.textContent = user.phone || "No phone provided";

        const dobEl = document.getElementById('patient-info-dob');
        if (dobEl) dobEl.textContent = user.dob || 'Pending Onboarding';

        const joinedEl = document.getElementById('patient-info-joined');
        if (joinedEl) {
            const joinedDate = new Date(user.created_at || new Date());
            joinedEl.textContent = joinedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }

        // --- Render upcoming appointment card or empty state ---
        const upcomingCard = document.getElementById('upcoming-appointment-card');

        // Sort upcoming: soonest first
        const upcoming = this.currentAppointments
            .filter(a => a.status === 'upcoming')
            .sort((a, b) => new Date(a.appointment_date + ' ' + a.start_time) - new Date(b.appointment_date + ' ' + b.start_time));

        // Sort past: newest first
        const past = this.currentAppointments
            .filter(a => a.status === 'completed' || a.status === 'cancelled')
            .sort((a, b) => new Date(b.appointment_date + ' ' + b.start_time) - new Date(a.appointment_date + ' ' + a.start_time));

        // --- NEW: Check for recent cancellations to notify patient ---
        const recentCancellation = past.find(a => a.status === 'cancelled' && a.cancellation_reason);
        const alertContainer = document.getElementById('patient-alerts');
        if (alertContainer) {
            if (recentCancellation) {
                alertContainer.innerHTML = `
                    <div class="card bg-danger-light border-none p-1 mb-2 flex items-center gap-1 slide-up" style="border-left: 4px solid var(--danger);">
                        <i class='bx bx-error-circle text-danger text-xl'></i>
                        <div class="flex-1">
                            <p class="text-sm font-bold text-danger mb-0">Booking Declined: ${recentCancellation.service_name}</p>
                            <p class="text-xs text-dim"><b>Reason:</b> ${recentCancellation.cancellation_reason}</p>
                        </div>
                        <button class="btn-text p-0" onclick="this.parentElement.remove()"><i class='bx bx-x text-lg'></i></button>
                    </div>
                `;
            } else {
                alertContainer.innerHTML = '';
            }
        }

        if (upcomingCard) {
            if (upcoming.length > 0) {
                const apt = upcoming[0];
                const date = new Date(apt.appointment_date);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const day = date.getDate();
                const month = monthNames[date.getMonth()];
                const startFmt = this.formatTime(apt.start_time);
                const endFmt = this.formatTime(apt.end_time);

                upcomingCard.innerHTML = `
                    <div class="flex-center-between border-bottom pb-1 mb-1">
                        <h3 class="card-title mb-0 border-none pb-0"><i class='bx bx-calendar-check text-success mr-1'></i> Next Upcoming Visit</h3>
                        <span class="badge border-badge badge-active"><span class="dot blink bg-success"></span> Confirmed</span>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                        <div class="avatar-large flex-col flex-center bg-muted text-dim border-dashed">
                            <h2 class="m-0 text-xl font-bold">${day}</h2>
                            <span class="text-xs uppercase font-bold text-center">${month}</span>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-lg">${apt.service_name}</h3>
                            <p class="text-dim text-sm mt-1 flex items-center gap-1"><i class='bx bx-time'></i> ${startFmt} - ${endFmt}</p>
                            <p class="text-dim text-sm flex items-center gap-1"><i class='bx bx-user-pin'></i> ${apt.dentist_name || 'Assigned Dentist'}</p>
                        </div>
                        <div class="btn-primary shadow-hover w-auto" onclick="app.switchPatientTab('my-appointments')"><i class='bx bx-calendar-edit mr-1'></i> Manage</div>
                    </div>
                `;
                upcomingCard.classList.remove('hidden');
            } else {
                upcomingCard.innerHTML = `
                    <div class="text-center py-2">
                        <div class="avatar-large mx-auto flex-center bg-muted text-dim border-dashed mb-1"><i class='bx bx-calendar-x text-xl'></i></div>
                        <h3 class="font-bold mt-1">No Upcoming Appointments</h3>
                        <p class="text-dim text-sm mt-1">You haven't booked any visits yet. Schedule one now!</p>
                        <button class="btn-primary mt-2 shadow-hover w-auto" onclick="app.switchPatientTab('booking')"><i class='bx bx-calendar-plus mr-1'></i> Book Your First Visit</button>
                    </div>
                `;
                upcomingCard.classList.remove('hidden');
            }
        }

        // --- Render My Records & Appointments tab ---
        const apptListEl = document.getElementById('appointments-list-dynamic');
        if (apptListEl) {
            let html = '';

            // Upcoming section
            html += `<h4 class="font-bold text-dim uppercase text-xs tracking-wide mb-1 flex items-center"><i class='bx bx-calendar mr-1'></i> Upcoming</h4>`;
            if (upcoming.length > 0) {
                upcoming.forEach(apt => {
                    const date = new Date(apt.appointment_date);
                    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                    html += `
                    <div class="card appointment-card list-row hover-lift bg-white shadow-sm border-l-success">
                        <div class="apt-date text-center pattern-bg flex-col flex-center">
                            <span class="month text-xs font-bold text-dim">${monthNames[date.getMonth()]}</span>
                            <span class="day text-xl font-bold">${date.getDate()}</span>
                        </div>
                        <div class="apt-info flex-1">
                            <h4 class="font-bold text-lg mb-1">${apt.service_name}</h4>
                            <div class="flex items-center gap-2 text-sm text-dim">
                                <span class="info-badge bg-muted"><i class='bx bx-time'></i> ${this.formatTime(apt.start_time)} - ${this.formatTime(apt.end_time)}</span>
                                <span class="info-badge bg-muted"><i class='bx bx-user-pin'></i> ${apt.dentist_name || 'TBD'}</span>
                            </div>
                        </div>
                        <div class="apt-status">
                            <span class="badge border-badge badge-active"><span class="dot blink bg-success"></span> Confirmed</span>
                        </div>
                        <div class="apt-actions">
                            <button class="btn-icon circle outline" title="Reschedule" onclick="app.switchPatientTab('booking')"><i class='bx bx-calendar-edit'></i></button>
                            <button class="btn-icon circle outline text-danger ml-1" title="Cancel Appointment" onclick="app.cancelAppointment(${apt.id})"><i class='bx bx-trash'></i></button>
                        </div>
                    </div>`;
                });
            } else {
                html += `
                <div class="card text-center py-2 bg-muted border-dashed">
                    <p class="text-dim text-sm"><i class='bx bx-info-circle mr-1'></i> No upcoming appointments. <a href="#" class="font-bold" onclick="app.switchPatientTab('booking')">Book one now!</a></p>
                </div>`;
            }

            // Past section
            html += `<h4 class="font-bold text-dim uppercase text-xs tracking-wide mt-2 mb-1 flex items-center"><i class='bx bx-history mr-1'></i> Past Visits</h4>`;
            if (past.length > 0) {
                past.forEach(apt => {
                    const date = new Date(apt.appointment_date);
                    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                    const isCancelled = apt.status === 'cancelled';
                    const clickAction = isCancelled ? `onclick="app.viewCancellationReason(${apt.id})" style="cursor:pointer;"` : '';

                    html += `
                    <div class="card appointment-card list-row hover-lift bg-muted border-none ${isCancelled ? 'border-l-danger' : 'opacity-70'}" ${clickAction}>
                        <div class="apt-date text-center bg-white border-dashed flex-col flex-center">
                            <span class="month text-xs font-bold text-dim">${monthNames[date.getMonth()]}</span>
                            <span class="day text-lg font-bold">${date.getDate()}</span>
                        </div>
                        <div class="apt-info flex-1">
                            <h4 class="font-bold text-md mb-1 text-dim">${apt.service_name}</h4>
                            <div class="flex items-center gap-2 text-sm text-dim">
                                <span class="info-badge bg-white"><i class='bx bx-time'></i> ${this.formatTime(apt.start_time)}</span>
                                <span class="info-badge bg-white"><i class='bx bx-user-pin'></i> ${apt.dentist_name || 'TBD'}</span>
                            </div>
                        </div>
                        <div class="apt-status">
                            <span class="badge ${isCancelled ? 'bg-danger-light text-danger' : 'bg-white text-dim'} border-dashed">
                                <i class='bx ${isCancelled ? 'bx-error-circle' : 'bx-check-double'}'></i> 
                                ${isCancelled ? 'View Reason' : 'Completed'}
                            </span>
                        </div>
                    </div>`;
                });
            } else {
                html += `
                <div class="card text-center py-2 bg-muted border-dashed">
                    <p class="text-dim text-sm"><i class='bx bx-info-circle mr-1'></i> No past visits yet.</p>
                </div>`;
            }

            apptListEl.innerHTML = html;
        }

        // --- Render Treatment History tab ---
        const historyBody = document.getElementById('treatment-history-body');
        if (historyBody) {
            if (past.length > 0) {
                let rows = '';
                past.forEach(apt => {
                    const date = new Date(apt.appointment_date);
                    const options = { year: 'numeric', month: 'short', day: 'numeric' };
                    rows += `
                    <tr class="table-row-hover">
                        <td class="pl-2 font-medium">${date.toLocaleDateString('en-US', options)}</td>
                        <td><span class="info-badge">${apt.service_name}</span></td>
                        <td class="font-bold">N/A</td>
                        <td>${apt.dentist_name || 'TBD'}</td>
                        <td class="text-right pr-2"><button class="btn-icon circle outline sm bg-white inline-flex" title="View Clinical Notes" onclick="app.showToast('No clinical notes available yet.', 'info')"><i class='bx bx-file'></i></button></td>
                    </tr>`;
                });
                historyBody.innerHTML = rows;
            } else {
                historyBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-2 text-dim">
                        <i class='bx bx-info-circle mr-1'></i> No treatment history yet. Your records will appear here after your first visit.
                    </td>
                </tr>`;
            }
        }

        // --- Update Recommended Services based on user history ---
        const recommendedEl = document.getElementById('recommended-service-list');
        if (recommendedEl) {
            if (past.length === 0) {
                // New user - recommend consultation
                recommendedEl.innerHTML = `
                    <div class="list-row items-center border-bottom pb-1 pt-1 mb-0 hover-lift bg-transparent pattern-bg-subtle"
                        style="cursor: pointer;" onclick="app.switchPatientTab('booking')">
                        <div class="avatar bg-primary-light text-primary flex-center border-dashed"><i class='bx bx-plus'></i></div>
                        <div class="flex-1">
                            <h4 class="font-bold">Initial Dental Consultation</h4>
                            <p class="text-sm text-dim">Complete your first checkup assessment today.</p>
                        </div>
                        <button class="btn-outline w-auto shadow-hover" onclick="app.switchPatientTab('booking')">
                            <i class='bx bx-calendar-plus mr-1'></i> Book Now</button>
                    </div>`;
            } else {
                // Return to default or another specific one
                recommendedEl.innerHTML = `
                    <div class="list-row items-center border-bottom pb-1 pt-1 mb-0 hover-lift bg-transparent pattern-bg-subtle"
                        style="cursor: pointer;" onclick="app.switchPatientTab('booking')">
                        <div class="avatar bg-muted text-dim flex-center border-dashed"><i class='bx bx-smile'></i></div>
                        <div class="flex-1">
                            <h4 class="font-bold">Laser Teeth Whitening</h4>
                            <p class="text-sm text-dim">Special 15% discount for returning patients.</p>
                        </div>
                        <button class="btn-outline w-auto shadow-hover" onclick="app.switchPatientTab('booking')">
                            <i class='bx bx-calendar-plus mr-1'></i> Book Now</button>
                    </div>`;
            }
        }
    },

    // ===================================================================
    // RENDER ADMIN DASHBOARD — Dynamic from currentUser
    // ===================================================================
    renderAdminDashboard: async function () {
        const user = this.currentUser;
        if (!user) return;

        // Update sidebar admin name & avatar
        const adminName = document.getElementById('admin-sidebar-name');
        if (adminName) adminName.textContent = user.name;

        const adminRole = document.getElementById('admin-sidebar-role');
        const roleBadge = document.getElementById('admin-role-badge');

        if (user.is_master) {
            if (adminRole) adminRole.textContent = 'Master Administrator';
            if (roleBadge) {
                roleBadge.textContent = 'MASTER';
                roleBadge.style.background = 'var(--primary)';
                roleBadge.style.color = 'white';
                roleBadge.style.borderColor = 'var(--primary)';
            }
        } else {
            if (adminRole) adminRole.textContent = user.role === 'admin' ? 'Administrator' : (user.role === 'staff' ? 'Clinic Staff' : 'Dentist');
            if (roleBadge) {
                roleBadge.textContent = user.role.toUpperCase();
                roleBadge.style.background = 'transparent';
                roleBadge.style.color = 'var(--dim)';
                roleBadge.style.borderColor = 'var(--border)';
            }
        }

        // Dashboard table: Only show Dentist column to Master Admin
        const dentistColHeader = document.getElementById('header-dentist-col');
        if (dentistColHeader) {
            if (user.is_master) dentistColHeader.classList.remove('hidden');
            else dentistColHeader.classList.add('hidden');
        }

        const adminAvatar = document.getElementById('admin-avatar-sidebar');
        const dashboardTitle = document.getElementById('admin-dashboard-title');

        if (dashboardTitle) {
            dashboardTitle.textContent = user.is_master ? "Clinic Overview" : "Staff Dashboard";
        }

        if (adminAvatar) {
            const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
            adminAvatar.textContent = initials;
            if (user.is_master) adminAvatar.style.background = 'var(--primary)';
        }

        // Update Admin Dashboard Header Date
        const dateBadge = document.getElementById('admin-date-badge');
        if (dateBadge) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            dateBadge.innerHTML = `<i class='bx bx-calendar'></i> <span>${dateStr}</span>`;
        }

        // Fetch appointments from backend for admin view
        try {
            // Isolation Rule: Only fetch current user's data if NOT Master Admin (as requested: only master sees all)
            const dentistFilter = !user.is_master ? `?dentist_id=${user.id}` : '';
            const response = await fetch(`api/appointments/get.php${dentistFilter}`);
            const result = await response.json();

            if (response.ok && result.status === 'success') {
                const allAppts = result.data;

                // Update stats
                const nowDt = new Date();
                const y = nowDt.getFullYear();
                const mStr = String(nowDt.getMonth() + 1).padStart(2, '0');
                const dStr = String(nowDt.getDate()).padStart(2, '0');
                const todayStr = `${y}-${mStr}-${dStr}`;

                const todayAppts = allAppts.filter(a => a.appointment_date === todayStr && ['upcoming', 'pending', 'walk-in'].includes(a.status));
                const completedToday = allAppts.filter(a => a.appointment_date === todayStr && a.status === 'completed');
                const totalRevenue = allAppts.reduce((acc, curr) => acc + (parseFloat(curr.price) || 0), 0);

                const todayEl = document.getElementById('admin-stat-today');
                if (todayEl) todayEl.textContent = todayAppts.length;

                const completedEl = document.getElementById('admin-stat-completed');
                if (completedEl) completedEl.textContent = completedToday.length;

                const revenueEl = document.getElementById('admin-stat-revenue');
                if (revenueEl) revenueEl.textContent = `₱${totalRevenue.toLocaleString()}`;

                // Update upcoming schedule table
                const scheduleBody = document.getElementById('admin-schedule-body');
                if (scheduleBody) {
                    scheduleBody.innerHTML = ''; // Clear previous
                    // Exclude completed/cancelled from Upcoming Schedule
                    const upcomingAppts = allAppts.filter(a => !['completed', 'cancelled'].includes(a.status));
                    if (upcomingAppts.length > 0) {
                        let rows = '';
                        upcomingAppts.slice(0, 10).forEach(apt => {
                            const pName = apt.patient_name || 'Quick Booking';
                            const initials = pName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                            const aptDate = new Date(apt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                            const statusClass = apt.status === 'pending' ? 'bg-warning-light text-warning' :
                                (apt.status === 'upcoming' ? 'bg-success-light text-success' : 'badge-upcoming');

                            let actionsHtml = `<button class="btn-icon circle outline sm mr-1" onclick="app.viewPatientDetails(${apt.patient_id})" title="View Patient Profile"><i class='bx bx-show'></i></button>`;

                            if (apt.status === 'pending') {
                                actionsHtml += `
                                    <button class="btn-icon circle bg-success-light text-success sm mr-1" onclick="app.updateAppointmentStatus(${apt.id}, 'upcoming')" title="Approve Request">
                                        <i class='bx bx-check'></i>
                                    </button>
                                    <button class="btn-icon circle bg-muted text-danger sm" onclick="app.updateAppointmentStatus(${apt.id}, 'cancelled')" title="Decline Request">
                                        <i class='bx bx-x'></i>
                                    </button>
                                `;
                            } else {
                                actionsHtml += `
                                    <button class="btn-icon circle outline text-danger sm" onclick="app.updateAppointmentStatus(${apt.id}, 'cancelled')" title="Cancel Appointment">
                                        <i class='bx bx-trash'></i>
                                    </button>
                                `;
                            }

                            const dentistColHtml = user.is_master ? `
                                <td>
                                    <div class="flex items-center gap-1">
                                        <div class="avatar-tiny bg-muted text-dim" style="font-size: 9px;">${apt.dentist_name ? apt.dentist_name[0] : 'U'}</div>
                                        <span class="text-xs font-medium">${apt.dentist_name || 'Unassigned'}</span>
                                    </div>
                                </td>` : '';

                            rows += `
                            <tr class="table-row-hover" onclick="app.viewPatientDetails(${apt.patient_id})">
                                <td class="text-dim text-xs">${aptDate}</td>
                                <td class="font-bold">${this.formatTime(apt.start_time)}</td>
                                <td>
                                    <div class="flex items-center gap-1">
                                        <div class="avatar-tiny bg-primary-light text-dim">${initials}</div>
                                        <div class="flex-col">
                                            <span class="font-bold block text-sm">${pName}</span>
                                            <span class="text-xs text-dim block"><i class='bx bx-time-five'></i> Request: ${apt.created_at ? new Date(apt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="info-badge">${apt.service_name}</span></td>
                                ${dentistColHtml}
                                <td><span class="badge ${statusClass} uppercase text-xs">${apt.status}</span></td>
                                <td class="text-right" onclick="event.stopPropagation()">${actionsHtml}</td>
                            </tr>`;
                        });
                        scheduleBody.innerHTML = rows;
                    } else {
                        scheduleBody.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-center py-3 text-dim bg-muted border-dashed rounded-lg">
                                <div class="py-2">
                                    <i class='bx bx-calendar-x text-2xl mb-1 opacity-50'></i>
                                    <p class="font-bold">No Upcoming Bookings</p>
                                    <p class="text-xs">All clear for today!</p>
                                </div>
                            </td>
                        </tr>`;
                    }
                }

                // Populate Completed Appointments (Today)
                const completedBody = document.getElementById('admin-completed-body');
                if (completedBody) {
                    const todayCompleted = allAppts.filter(a => a.appointment_date === todayStr && a.status === 'completed');
                    if (todayCompleted.length > 0) {
                        let compRows = '';
                        todayCompleted.forEach(apt => {
                            const pName = apt.patient_name || 'Walk-in';
                            compRows += `
                            <tr class="table-row-hover" onclick="app.viewPatientDetails(${apt.patient_id})">
                                <td class="font-bold">${this.formatTime(apt.start_time)}</td>
                                <td>
                                    <div class="flex items-center gap-1">
                                        <div class="avatar-tiny bg-success-light text-success">${pName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}</div>
                                        <span class="font-bold text-sm">${pName}</span>
                                    </div>
                                </td>
                                <td><span class="info-badge">${apt.service_name}</span></td>
                                <td class="text-sm">${apt.dentist_name}</td>
                                <td><span class="badge bg-success-light text-success uppercase text-xs"><i class='bx bx-check-double mr-1'></i>Completed</span></td>
                            </tr>`;
                        });
                        completedBody.innerHTML = compRows;
                    } else {
                        completedBody.innerHTML = `<tr><td colspan="5" class="text-center py-2 text-dim"><i class='bx bx-info-circle mr-1'></i> No appointments completed today yet.</td></tr>`;
                    }
                }
            }
        } catch (err) {
            console.error("Critical error fetching admin data:", err);
            const scheduleBody = document.getElementById('admin-schedule-body');
            if (scheduleBody) scheduleBody.innerHTML = '<tr><td colspan="6" class="text-center text-error py-2">Failed to load live data. Check database connection.</td></tr>';
        }
    },

    // --- Helper: Format time from 24h to 12h ---
    formatTime: function (timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        let h = parseInt(parts[0]);
        const m = parts[1];
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    },

    logout: function () {
        document.getElementById('logout-modal').classList.remove('hidden');
    },

    closeLogoutModal: function () {
        document.getElementById('logout-modal').classList.add('hidden');
    },

    confirmLogout: function () {
        this.closeLogoutModal();
        this.currentUser = null;
        this.currentAppointments = [];
        this.switchScreen('auth-section');
        this.showToast("Logged out successfully.", "info");
    },

    // --- Theme Management ---
    initDarkMode: function () {
        const savedTheme = localStorage.getItem('dentassist-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeLogos(savedTheme);
    },

    toggleDarkMode: function () {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('dentassist-theme', newTheme);
        this.updateThemeLogos(newTheme);

        this.showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode activated!`, "info");
    },

    updateThemeLogos: function (theme) {
        const logoPath = theme === 'dark' ? 'assets/darkmode_dentassist.png' : 'assets/lightmode_dentassist.png';
        const themeIcon = theme === 'dark' ? 'bx-sun' : 'bx-moon';

        document.querySelectorAll('.logo-img').forEach(img => {
            img.src = logoPath;
        });

        // Update all theme icons
        const icons = ['theme-icon-patient', 'theme-icon-admin'];
        icons.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = `bx ${themeIcon}`;
        });
    },

    // --- Screen Navigation ---
    switchScreen: function (screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');

        const chatToggle = document.getElementById('chat-toggle');
        const chatUI = document.getElementById('chatbot-ui');
        if (['auth-section', 'onboarding-section', 'forgot-password-section', 'phone-login-section', 'google-account-section', 'phone-otp-section'].includes(screenId)) {
            if (chatToggle) chatToggle.classList.add('hidden');
            if (chatUI) chatUI.classList.add('hidden');
        } else {
            if (chatToggle) chatToggle.classList.remove('hidden');
        }

        if (screenId === 'phone-otp-section') {
            const otpInputs = document.querySelectorAll('.otp-input');
            otpInputs.forEach(i => i.value = '');
            setTimeout(() => { if (otpInputs[0]) otpInputs[0].focus(); }, 100);
        }
    },

    // --- Patient Flow ---
    switchPatientTab: function (tabId) {
        document.querySelectorAll('.patient-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`patient-${tabId}`).classList.add('active');

        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        if (event && event.target && event.target.tagName === 'A') event.target.classList.add('active');

        // Dynamic Loading for Tabs
        if (tabId === 'booking') {
            this.loadBookingServices();
            this.loadDentists();
        }
        if (tabId === 'billing') {
            this.loadPatientInvoices();
        }
    },

    loadPatientInvoices: async function () {
        const body = document.getElementById('billing-history-body');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="4" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Loading invoices...</td></tr>';

        try {
            const response = await fetch(`api/invoices/get.php?patient_id=${this.currentUser.id}`);
            const result = await response.json();

            if (result.status === 'success') {
                if (result.data.length === 0) {
                    body.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-dim"><i class="bx bx-info-circle mr-1"></i> No billing records found.</td></tr>';
                    return;
                }

                let html = '';
                result.data.forEach(inv => {
                    const date = new Date(inv.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    const statusClass = inv.status === 'paid' ? 'bg-success-light text-success' :
                        (inv.status === 'unpaid' ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning');

                    html += `
                        <tr class="table-row-hover">
                            <td class="pl-2 font-medium">${date}</td>
                            <td><span class="info-badge">${inv.service_name}</span></td>
                            <td><span class="badge ${statusClass} uppercase text-xs">${inv.status}</span></td>
                            <td class="text-right pr-2 font-bold">₱${parseFloat(inv.total_amount).toFixed(2)}</td>
                        </tr>
                    `;
                });
                body.innerHTML = html;
            } else {
                body.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-error">Failed to load invoices.</td></tr>';
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-error">Connection error.</td></tr>';
        }
    },

    checkAvailability: async function () {
        const dentistId = document.getElementById('selected-dentist-id').value;
        const dateInput = document.getElementById('booking-date').value;

        if (!dentistId) {
            // Silently return if no dentist is selected yet (prevents popups on page load/refresh)
            return;
        }
        if (!dateInput) {
            this.showToast("Please select a date.", "warning");
            return;
        }

        const slotsCard = document.getElementById('time-slots');
        const slotsContainer = document.getElementById('slots-container');

        this.showLoader("Scanning availability...");

        try {
            const serviceId = document.getElementById('booking-service').value;
            const response = await fetch(`api/appointments/get_available_slots.php?dentist_id=${dentistId}&date=${dateInput}&service_id=${serviceId}`);
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                if (result.slots.length > 0) {
                    let html = '';
                    result.slots.forEach(slot => {
                        html += `<button class="slot-btn" onclick="app.selectSlot(this)">${slot}</button>`;
                    });
                    slotsContainer.innerHTML = html;
                    slotsCard.style.opacity = '1';
                    slotsCard.style.pointerEvents = 'auto';
                    this.showToast("Real-time slots updated!", "success");
                } else {
                    slotsContainer.innerHTML = '<div class="text-center w-full py-2 text-error text-xs">No available slots for this day.</div>';
                    this.showToast("Oops! Dentist is fully booked for this day.", "info");
                }
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Connection error checking slots.", "error");
        }
    },

    selectSlot: function (btn) {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    },

    setupBookingSlots: function () {
        const slots = document.querySelectorAll('.slot-btn');
        slots.forEach(slot => {
            slot.addEventListener('click', (e) => {
                slots.forEach(s => s.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
    },

    confirmBooking: async function () {
        const user = this.currentUser;
        if (!user) {
            this.showToast("Please login first.", "error");
            return;
        }

        const dentistId = document.getElementById('selected-dentist-id').value;
        const serviceId = document.getElementById('booking-service').value;
        const dateInput = document.getElementById('booking-date').value;
        const selectedSlot = document.querySelector('.slot-btn.selected');

        if (!dentistId) {
            this.showToast("Please select a dentist first.", "warning");
            return;
        }
        if (!serviceId) {
            this.showToast("Please select a dental service.", "warning");
            return;
        }
        if (!dateInput || !selectedSlot) {
            this.showToast("Please select a date and an available time slot.", "warning");
            return;
        }

        // --- Gather display info for the confirmation modal ---
        const service = this.bookingServicesCache.find(s => s.id == serviceId);
        const serviceText = service ? service.name : '--';
        const price = service ? `₱${parseFloat(service.price).toLocaleString()}` : '--';
        const duration = service ? `${service.duration_minutes} minutes` : 'See service details';

        // Dentist name — read from the badge which selectDentist() always keeps in sync
        const dentistName = document.getElementById('selected-dentist-name-badge')?.textContent?.trim() || `Dentist #${dentistId}`;

        // Format date nicely
        const dateObj = new Date(dateInput + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Populate modal
        document.getElementById('bc-patient-name').textContent = user.name;
        document.getElementById('bc-dentist-name').textContent = dentistName;
        document.getElementById('bc-service-name').textContent = serviceText;
        document.getElementById('bc-service-price').textContent = price;
        document.getElementById('bc-date').textContent = formattedDate;
        document.getElementById('bc-time').textContent = selectedSlot.textContent;
        document.getElementById('bc-duration').textContent = duration;

        // Store pending booking data on the app object so submitBooking can use it
        this._pendingBooking = {
            patient_id: user.id,
            dentist_id: dentistId,
            service_id: serviceId,
            appointment_date: dateInput,
            slot_text: selectedSlot.textContent
        };

        // Show the confirmation modal
        // Populate Reward Options if applicable
        this.appliedReward = null; // Reset
        this.populateBookingRewards();

        document.getElementById('booking-confirm-modal').classList.remove('hidden');
    },

    toggleBookingRewards: function (checkbox) {
        const controls = document.getElementById('booking-reward-controls');
        const msgEl = document.getElementById('booking-reward-msg');
        if (checkbox.checked) {
            controls.classList.remove('hidden');
        } else {
            controls.classList.add('hidden');
            msgEl.classList.add('hidden');
            this.appliedReward = null;
            document.getElementById('booking-reward-select').value = '';
        }
    },

    populateBookingRewards: async function () {
        const rewardSection = document.getElementById('booking-reward-section');
        const select = document.getElementById('booking-reward-select');
        const toggle = document.getElementById('use-points-toggle');
        if (!rewardSection || !select) return;

        // Reset state
        if (toggle) toggle.checked = false;
        document.getElementById('booking-reward-controls').classList.add('hidden');
        document.getElementById('booking-reward-msg').classList.add('hidden');
        this.appliedReward = null;

        const u = this.currentUser;
        if (u.role !== 'patient') {
            rewardSection.classList.add('hidden');
            return;
        }

        try {
            const response = await fetch('api/rewards/list.php');
            const result = await response.json();
            if (result.status === 'success') {
                this.rewardsCache = result.data;
                const availableRewards = result.data.filter(r => (u.reward_points || 0) >= r.points_required);

                if (availableRewards.length > 0) {
                    rewardSection.classList.remove('hidden');
                    const optionsList = document.getElementById('booking-reward-options');
                    let html = `<div class="option" onclick="app.setCustomSelect('booking-reward-custom', 'Select a reward...', 'booking-reward-select', '')">Select a reward...</div>`;

                    availableRewards.forEach(r => {
                        html += `
                            <div class="option" onclick="app.setCustomSelect('booking-reward-custom', '${r.name}', 'booking-reward-select', '${r.id}')">
                                ${r.name} (${r.points_required} Pts)
                            </div>`;
                    });
                    optionsList.innerHTML = html;
                } else {
                    rewardSection.classList.add('hidden');
                }
            }
        } catch (e) {
            console.error("Failed to load booking rewards", e);
        }
    },

    appliedReward: null,

    applyRewardToBooking: function () {
        const rewardId = document.getElementById('booking-reward-select').value;
        const msgEl = document.getElementById('booking-reward-msg');
        const btn = document.getElementById('apply-reward-btn');

        // If already applied, clicking the button again will "Remove" it
        if (this.appliedReward) {
            this.appliedReward = null;
            if (msgEl) msgEl.classList.add('hidden');
            if (btn) {
                btn.textContent = "Apply";
                btn.classList.remove('bg-danger');
            }
            this.showToast("Reward removed.", "info");
            return;
        }

        if (!rewardId) {
            this.showToast("Please select a reward first.", "warning");
            return;
        }

        const reward = this.rewardsCache.find(r => r.id == rewardId);
        if (!reward) return;

        this.appliedReward = {
            id: reward.id,
            name: reward.name,
            points: reward.points_required,
            type: reward.reward_type,
            value: reward.value,
            service_id: reward.service_id
        };

        if (msgEl) {
            msgEl.innerHTML = `<i class='bx bx-check-circle text-success'></i> Applied: <strong>${reward.name}</strong>. Points will be deducted after booking.`;
            msgEl.classList.remove('hidden');
        }

        if (btn) {
            btn.textContent = "Remove";
            btn.classList.add('bg-danger');
        }

        this.showToast("Reward applied!", "success");
    },

    closeBookingConfirmModal: function () {
        document.getElementById('booking-confirm-modal').classList.add('hidden');
        this._pendingBooking = null;
    },

    submitBooking: async function () {
        const booking = this._pendingBooking;
        if (!booking) {
            this.showToast("No booking data found. Please try again.", "error");
            return;
        }

        // Close preview modal
        document.getElementById('booking-confirm-modal').classList.add('hidden');

        // Convert slot text (e.g., "10:00 AM") to 24h format
        let [time, ampm] = booking.slot_text.split(' ');
        let [hours, minutes] = time.split(':');
        hours = parseInt(hours);
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        const startTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`;

        this.showLoader("Securing your appointment...");

        try {
            const payload = {
                patient_id: booking.patient_id,
                dentist_id: booking.dentist_id,
                service_id: booking.service_id,
                appointment_date: booking.appointment_date,
                start_time: startTime,
                reward_id: this.appliedReward ? this.appliedReward.id : null
            };

            const response = await fetch('api/appointments/book.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            this.hideLoader();
            this._pendingBooking = null;

            if (response.ok && result.status === 'success') {
                this.showToast(result.message || "Appointment confirmed! See you then. 🎉", "success");

                // Fetch updated appointments immediately
                await this.refreshUserAppointments();

                setTimeout(() => {
                    this.switchPatientTab('my-appointments');
                }, 1000);
            } else {
                this.showToast(result.message || "Failed to book.", "error");
            }
        } catch (error) {
            console.error("Booking Error:", error);
            this.hideLoader();
            this.showToast("Connection lost. Please try again.", "error");
        }
    },

    refreshUserAppointments: async function () {
        if (!this.currentUser) return;
        try {
            // We just use the login endpoint logic to get full refreshed state or a dedicated endpoint
            // For now, let's just use the current appointments array and manually add if we wanted, 
            // but a fresh fetch is safer. We'll simulate a re-fetch since login.php does this.
            // Since we don't have a dedicated 'get_my_appointments.php', we can add one or 
            // just use the appointments/get.php if it's filtered (it's not).
            // Let's just update the local array for now to show visual change.
            const response = await fetch('api/appointments/get.php');
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                // Filter for current user only
                this.currentAppointments = result.data.filter(a => a.patient_id == this.currentUser.id);
                this.renderPatientDashboard();
            }
        } catch (e) { }
    },

    // --- Admin Flow ---
    switchAdminTab: function (tabId, el) {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`admin-${tabId}`).classList.add('active');

        // Trigger real-time data fetch for specific tabs
        if (tabId === 'calendar') this.renderAdminCalendar();
        if (tabId === 'services') this.updateServiceList();
        if (tabId === 'dashboard') this.renderAdminDashboard();
        if (tabId === 'patients') this.updatePatientList();
        if (tabId === 'approvals') this.updateApprovalList();
        if (tabId === 'global-queue') this.renderGlobalQueue();
        if (tabId === 'settings') this.loadClinicSettings();
        if (tabId === 'dentists') this.updateDentistManageList();
        if (tabId === 'archive') this.updateArchiveList();
        if (tabId === 'reports') this.handleReportQuickSelect();

        if (el) {
            document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
            el.classList.add('active');
        } else {
            document.querySelectorAll('.sidebar-menu li').forEach(li => {
                li.classList.remove('active');
                if (li.getAttribute('onclick') && li.getAttribute('onclick').includes(tabId)) {
                    li.classList.add('active');
                }
            });
        }
    },

    sendOTP: function () {
        const phoneInput = document.querySelector('#phone-login-section input[type="tel"]');
        const phone = phoneInput ? phoneInput.value.trim() : '';

        if (!phone || phone.length < 7) {
            this.showToast("Please enter a valid phone number first.", "warning");
            if (phoneInput) phoneInput.focus();
            return;
        }

        this.triggerMockAction('Sending OTP code to ' + phone + '...', 'info');
        setTimeout(() => {
            const phoneRole = document.querySelector('input[name="phone-role"]:checked');
            if (phoneRole) {
                const loginRole = document.querySelector(`input[name="login-role"][value="${phoneRole.value}"]`);
                if (loginRole) loginRole.checked = true;
            }
            this.switchScreen('phone-otp-section');
        }, 500);
    },

    setupOTPAuth: function () {
        const otpInputs = document.querySelectorAll('.otp-input');
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                input.value = input.value.replace(/[^0-9]/g, '');
                if (input.value.length === 1 && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            const otpScreen = document.getElementById('phone-otp-section');
            if (!otpScreen || !otpScreen.classList.contains('active')) return;
            if (!document.activeElement || !document.activeElement.classList.contains('otp-input')) {
                if (/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    for (let input of otpInputs) {
                        if (!input.value) { input.focus(); input.value = e.key; input.dispatchEvent(new Event('input')); break; }
                    }
                }
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    for (let i = otpInputs.length - 1; i >= 0; i--) {
                        if (otpInputs[i].value) { otpInputs[i].value = ''; otpInputs[i].focus(); break; }
                    }
                }
            }
        });
    },

    verifyOTP: function () {
        const otpInputs = document.querySelectorAll('.otp-input');
        let code = '';
        otpInputs.forEach(i => code += i.value);

        if (code.length < 6) {
            this.showToast("Please enter the complete 6-digit verification code.", "warning");
            for (let input of otpInputs) {
                if (!input.value) { input.focus(); break; }
            }
            return;
        }

        this.triggerMockAction('Verifying secure code...', 'info');
        setTimeout(() => {
            this.login();
        }, 500);
    },

    // --- Loading & Notification Actions ---
    triggerMockAction: function (actionName, actionType = 'info') {
        if (actionType === 'info') {
            this.showLoader("Processing detail block...");
            setTimeout(() => {
                this.hideLoader();
                this.showToast(actionName, "success");
            }, 500);
        } else {
            this.showToast(actionName, actionType);
        }
    },

    // --- Chatbot Logic ---
    toggleChat: function () {
        const chat = document.getElementById('chatbot-ui');
        chat.classList.toggle('hidden');
    },

    handleChatEnter: function (e) {
        if (e.key === 'Enter') {
            this.sendChatMessage();
        }
    },

    sendChatMessage: function () {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        this.appendChatMessage(text, 'user');
        input.value = '';

        setTimeout(() => {
            const lowerText = text.toLowerCase();
            let response = "I can help with that! Do you want me to check available slots?";

            if (lowerText.includes('book') || lowerText.includes('cleaning')) {
                response = "I see you want to book a cleaning. We have a slot tomorrow at 10:00 AM. Should I lock that in for you?";
            } else if (lowerText.includes('yes') || lowerText.includes('confirm')) {
                response = "Great! Your appointment is successfully booked. You will receive an SMS reminder. 🎉";
                this.showToast("AI automatically booked appointment", "success");
            } else if (lowerText.includes('cancel')) {
                response = "Please go to the 'My Appointments' tab to manage cancellations.";
            }

            this.appendChatMessage(response, 'bot');
        }, 800);
    },

    appendChatMessage: function (text, sender) {
        const chatBody = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${sender}`;

        if (sender === 'bot') {
            msgDiv.innerHTML = `
                <div class="msg-icon"><i class='bx bx-bot'></i></div>
                <div class="msg-bubble"><p>${text}</p></div>
            `;
        } else {
            msgDiv.innerHTML = `<div class="msg-bubble"><p>${text}</p></div>`;
        }

        chatBody.appendChild(msgDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    },

    // --- Admin Calendar & Services Logic ---
    renderAdminCalendar: async function () {
        const calendarGrid = document.getElementById('admin-calendar-days');
        if (!calendarGrid) return;

        // Initialize state if not set
        if (this.adminCalendarMonth === undefined) {
            const now = new Date();
            this.adminCalendarMonth = now.getMonth();
            this.adminCalendarYear = now.getFullYear();
        }

        calendarGrid.innerHTML = '<div class="col-span-full py-5 text-center text-dim"><i class="bx bx-loader-alt bx-spin mr-1"></i> Syncing Calendar...</div>';

        try {
            // Isolation Rule: Only fetch current user's appointments if NOT Master Admin
            const dentistFilter = !this.currentUser.is_master ? `?dentist_id=${this.currentUser.id}` : '';
            const response = await fetch(`api/appointments/get.php${dentistFilter}`);
            const result = await response.json();
            const appointments = result.data || [];

            calendarGrid.innerHTML = '';

            const now = new Date();
            const currMonth = this.adminCalendarMonth;
            const currYear = this.adminCalendarYear;

            // Update Header Title
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const monthTitleEl = document.getElementById('admin-calendar-month-title');
            if (monthTitleEl) {
                monthTitleEl.textContent = `${monthNames[currMonth]} ${currYear}`;
            }

            // Get first day of month and total days
            const firstDay = new Date(currYear, currMonth, 1).getDay(); // 0 (Sun) to 6 (Sat)
            const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();

            // Render empty slots for days of prev month
            for (let i = 0; i < firstDay; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'cal-day empty';
                calendarGrid.appendChild(emptyDay);
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const dayEl = document.createElement('div');
                dayEl.className = 'cal-day';

                // Highlight today
                const isToday = (day === now.getDate() && currMonth === now.getMonth() && currYear === now.getFullYear());
                if (isToday) dayEl.classList.add('today', 'bg-primary-light');

                const dateKey = `${currYear}-${(currMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const dailyEvents = appointments.filter(a => a.appointment_date === dateKey);

                let eventsHtml = '';
                dailyEvents.forEach(evt => {
                    eventsHtml += `
                        <div class="cal-event blue soft-shadow-sm bg-white" style="font-size: 10px; padding: 2px; line-height: 1.2; cursor: pointer;" onclick="app.viewAppointmentDetails(${evt.id})">
                            <b>${this.formatTime(evt.start_time)}</b><br>${evt.patient_name}
                        </div>
                    `;
                });

                dayEl.innerHTML = `
                    <span class="day-num ${isToday ? 'font-bold' : ''}">${day}</span>
                    <div class="cal-events-wrap mt-1">${eventsHtml}</div>
                `;
                calendarGrid.appendChild(dayEl);
            }
        } catch (e) {
            calendarGrid.innerHTML = '<p class="text-error p-2">Calendar sync failed.</p>';
        }
    },

    prevAdminMonth: function () {
        if (this.adminCalendarMonth === undefined) return;
        this.adminCalendarMonth--;
        if (this.adminCalendarMonth < 0) {
            this.adminCalendarMonth = 11;
            this.adminCalendarYear--;
        }
        this.renderAdminCalendar();
    },

    nextAdminMonth: function () {
        if (this.adminCalendarMonth === undefined) return;
        this.adminCalendarMonth++;
        if (this.adminCalendarMonth > 11) {
            this.adminCalendarMonth = 0;
            this.adminCalendarYear++;
        }
        this.renderAdminCalendar();
    },

    updateServiceList: async function () {
        const body = document.getElementById('admin-services-body');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="4" class="text-center py-2">Loading services...</td></tr>';

        try {
            const response = await fetch('api/services/get.php');
            const result = await response.json();
            if (result.status === 'success') {
                let rows = '';
                result.data.forEach(s => {
                    rows += `
                    <tr class="table-row-hover">
                        <td class="pl-2 font-medium">
                            <div class="flex items-center gap-1">
                                <i class='bx bx-check-circle text-success opacity-70'></i>
                                ${s.name}
                            </div>
                        </td>
                        <td><span class="info-badge">${s.duration_minutes} mins</span></td>
                        <td class="font-bold">₱${s.price}</td>
                        <td class="text-right pr-2">
                            <div class="flex items-center justify-end gap-1">
                                <button class="btn-icon circle outline bg-white text-primary" onclick="app.openEditServiceModal(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${s.duration_minutes}, ${s.price})"><i class='bx bx-edit-alt'></i></button>
                                <button class="btn-icon circle outline bg-white text-danger" onclick="app.deleteService(${s.id})"><i class='bx bx-trash'></i></button>
                            </div>
                        </td>
                    </tr>`;
                });
                body.innerHTML = rows;
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-error py-2">Service sync failed.</td></tr>';
        }
    },

    openServiceModal: function () {
        document.getElementById('service-modal-id').value = '';
        document.getElementById('new-service-name').value = '';
        document.getElementById('new-service-duration').value = '30';
        document.getElementById('new-service-price').value = '100';
        document.getElementById('service-modal-title').textContent = "Add New Service";
        document.getElementById('service-modal-btn').textContent = "Save Service";
        document.getElementById('service-modal').classList.remove('hidden');
    },

    openEditServiceModal: function (id, name, duration, price) {
        document.getElementById('service-modal-id').value = id;
        document.getElementById('new-service-name').value = name;
        document.getElementById('new-service-duration').value = duration;
        document.getElementById('new-service-price').value = price;
        document.getElementById('service-modal-title').textContent = "Edit Service Details";
        document.getElementById('service-modal-btn').textContent = "Update Changes";
        document.getElementById('service-modal').classList.remove('hidden');
    },

    closeServiceModal: function () {
        document.getElementById('service-modal').classList.add('hidden');
    },

    saveService: async function () {
        const id = document.getElementById('service-modal-id').value;
        const name = document.getElementById('new-service-name').value;
        const duration = document.getElementById('new-service-duration').value;
        const price = document.getElementById('new-service-price').value;

        if (!name || !price || !duration) {
            this.showToast("Please fill all fields.", "warning");
            return;
        }

        const endpoint = id ? 'api/services/update.php' : 'api/services/add.php';
        const payload = id ? { id, name, price, duration } : { name, price, duration };

        this.showLoader(id ? "Synchronizing changes..." : "Publishing service...");
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            this.hideLoader();
            if (result.status === 'success') {
                this.showToast(id ? "Service updated!" : "New service is live!", "success");
                this.closeServiceModal();
                this.updateServiceList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Network failure.", "error");
        }
    },

    deleteService: async function (serviceId) {
        if (!await app.confirmAction("Are you sure you want to remove this service? This may affect historical data visibility if any.")) {
            return;
        }

        this.showLoader("Removing service...");
        try {
            const response = await fetch('api/services/delete.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service_id: serviceId })
            });

            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast("Service removed successfully.", "success");
                this.updateServiceList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Service removal failed.", "error");
        }
    },

    cancelAppointment: async function (appointmentId) {
        if (!await app.confirmAction("Are you sure you want to cancel this appointment? This action cannot be undone.")) {
            return;
        }

        this.showLoader("Cancelling appointment...");
        try {
            const response = await fetch('api/appointments/cancel.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointment_id: appointmentId })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast("Appointment cancelled successfully.", "success");
                // Refresh data
                await this.refreshUserAppointments();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Connection error.", "error");
        }
    },

    updatePatientList: async function () {
        const body = document.getElementById('admin-patient-list-body');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="4" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Scanning directory...</td></tr>';

        try {
            const response = await fetch('api/patients/list.php');
            const result = await response.json();

            if (result.status === 'success') {
                this.patientCache = result.data;
                this.filterPatientList(''); // Initial render
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-error py-2">Directory sync failed.</td></tr>';
        }
    },

    filterPatientList: function (query = '') {
        const body = document.getElementById('admin-patient-list-body');
        if (!body || !this.patientCache) return;

        const filtered = this.patientCache.filter(p => {
            const q = query.toLowerCase();
            return p.full_name.toLowerCase().includes(q) ||
                p.email.toLowerCase().includes(q) ||
                p.phone.includes(q);
        });

        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="4" class="text-center py-2 text-dim italic">No patients matching "${query}" found.</td></tr>`;
            return;
        }

        let rows = '';
        filtered.forEach(p => {
            const joined = new Date(p.created_at).toLocaleDateString();
            rows += `
            <tr class="table-row-hover" onclick="app.viewPatientDetails(${p.id})">
                <td class="pl-2 font-medium">${p.full_name}</td>
                <td class="text-dim text-sm">${p.email}<br>${p.phone}</td>
                <td class="text-dim text-sm">${joined}</td>
                <td class="text-right pr-2" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-end gap-1">
                        <button class="btn-primary sm py-1" onclick="app.viewPatientDetails(${p.id})">
                            <i class='bx bx-show'></i>
                        </button>
                        <button class="btn-icon circle outline text-danger sm" onclick="app.removeUser(${p.id}, '${p.full_name}', 'patient')" title="Archive Patient">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
        body.innerHTML = rows;
    },

    viewPatientDetails: async function (patientId) {
        this.showLoader("Retrieving patient file...");
        try {
            const response = await fetch(`api/patients/details.php?id=${patientId}`);
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                const p = result.patient;

                // Populate Modal Header
                document.getElementById('detail-patient-name').textContent = p.full_name;
                document.getElementById('detail-patient-email').textContent = p.email;

                // Populate Personal Info
                document.getElementById('detail-patient-phone').textContent = p.phone || '--';
                document.getElementById('detail-patient-dob').textContent = p.dob || 'Not Provided';
                document.getElementById('detail-patient-points').textContent = p.reward_points || '0';

                // Populate Medical Flags
                document.getElementById('detail-patient-allergies').textContent = p.allergies || 'None';
                document.getElementById('detail-patient-medications').textContent = p.medications || 'None';

                // Populate Appointments Table
                const apptBody = document.getElementById('detail-patient-appts');
                if (result.appointments.length > 0) {
                    let rows = '';
                    result.appointments.forEach(a => {
                        rows += `
                        <tr>
                            <td>${new Date(a.appointment_date).toLocaleDateString()}</td>
                            <td>${a.service_name}</td>
                            <td><span class="badge border-badge">${a.status}</span></td>
                        </tr>`;
                    });
                    apptBody.innerHTML = rows;
                } else {
                    apptBody.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-dim italic">No recorded appointments.</td></tr>';
                }

                document.getElementById('patient-detail-modal').classList.remove('hidden');
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("System crash while loading detail.", "error");
        }
    },

    closePatientModal: function () {
        document.getElementById('patient-detail-modal').classList.add('hidden');
    },

    loadClinicSettings: async function () {
        this.showLoader("Fetching clinic configuration...");
        try {
            const response = await fetch('api/settings/get.php');
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                const s = result.data;
                document.getElementById('set-clinic-open').value = s.clinic_open || '';
                document.getElementById('set-clinic-close').value = s.clinic_close || '';
                document.getElementById('set-break-start').value = s.break_start || '';
                document.getElementById('set-break-end').value = s.break_end || '';

                // Minimal Design for Staff: Only show Personal Status
                const opCard = document.getElementById('card-operation-hours');
                const brCard = document.getElementById('card-break-policy');

                if (this.currentUser && !this.currentUser.is_master) {
                    if (opCard) opCard.classList.add('hidden');
                    if (brCard) brCard.classList.add('hidden');
                } else {
                    if (opCard) opCard.classList.remove('hidden');
                    if (brCard) brCard.classList.remove('hidden');

                    // Role-based Labeling for Master
                    const groupTitle = document.getElementById('settings-group-title');
                    const groupDesc = document.getElementById('settings-group-desc');
                    const breakTitle = document.getElementById('break-group-title');
                    const breakDesc = document.getElementById('break-group-desc');

                    if (groupTitle) groupTitle.textContent = "Global Clinic Operations";
                    if (groupDesc) groupDesc.textContent = "Define the clinic's standard operating hours for all staff.";
                    if (breakTitle) breakTitle.textContent = "Global Break Policy";
                    if (breakDesc) breakDesc.textContent = "Standard break times applied to the entire clinic.";
                }

                // NEW: Initialize personal status toggle from current session
                if (this.currentUser) {
                    const statusToggle = document.getElementById('set-is-active');
                    if (statusToggle) {
                        statusToggle.checked = this.currentUser.is_active !== false;
                    }
                }

                this.showToast("Configuration loaded.", "info");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Failed to load settings.", "error");
        }
    },

    saveClinicSettings: async function () {
        const payload = {
            clinic_open: document.getElementById('set-clinic-open').value,
            clinic_close: document.getElementById('set-clinic-close').value,
            break_start: document.getElementById('set-break-start').value,
            break_end: document.getElementById('set-break-end').value
        };

        this.showLoader("Synchronizing configurations...");
        try {
            // 1. Save global settings
            const response = await fetch('api/settings/update.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            // 2. Save personal status if user is staff
            if (this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'dentist')) {
                const isActive = document.getElementById('set-is-active').checked ? 1 : 0;

                const personalPayload = {
                    user_id: this.currentUser.id,
                    full_name: this.currentUser.name,
                    email: this.currentUser.email,
                    phone: this.currentUser.phone,
                    professional_id: this.currentUser.professional_id,
                    position: this.currentUser.position,
                    is_active: isActive
                };

                const personalRes = await fetch('api/auth/update_profile.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(personalPayload)
                });
                const personalResult = await personalRes.json();

                // Update local session
                if (personalResult.status === 'success') {
                    this.currentUser = personalResult.user;
                }
            }

            this.hideLoader();

            if (result.status === 'success') {
                this.showToast("Clinic and Personal settings updated!", "success");
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("System error while saving.", "error");
        }
    },

    updateApprovalList: async function () {
        const body = document.getElementById('admin-approval-list');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="4" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Checking registrations...</td></tr>';

        try {
            const response = await fetch('api/admin/pending_list.php');
            const result = await response.json();
            if (result.status === 'success') {
                if (result.data.length === 0) {
                    body.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-dim italic">No pending requests at the moment.</td></tr>';
                    return;
                }

                let html = '';
                result.data.forEach(u => {
                    html += `
                    <tr>
                        <td class="font-bold">${u.full_name}<br><span class="text-xs text-dim">${u.email}</span></td>
                        <td><span class="badge border-badge uppercase">${u.role}</span></td>
                        <td class="text-sm">${u.phone}</td>
                        <td class="text-right">
                            <button class="btn-icon circle bg-success-light text-success mr-1" onclick="app.processApproval(${u.id}, 'approve')" title="Approve">
                                <i class='bx bx-check'></i>
                            </button>
                            <button class="btn-icon circle bg-muted text-danger" onclick="app.processApproval(${u.id}, 'reject')" title="Reject">
                                <i class='bx bx-trash'></i>
                            </button>
                        </td>
                    </tr>`;
                });
                body.innerHTML = html;
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-error py-2">Approval gateway error.</td></tr>';
        }
    },

    processApproval: async function (userId, action) {
        if (!await app.confirmAction(`Are you sure you want to ${action} this potential staff member?`)) return;

        this.showLoader(`${action === 'approve' ? 'Verifying' : 'Removing'} user...`);
        try {
            const response = await fetch('api/admin/approve_user.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, action: action })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                this.updateApprovalList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Critical error during approval process.", "error");
        }
    },

    renderGlobalQueue: async function () {
        const body = document.getElementById('global-queue-body');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="5" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Syncing Clinic Queue...</td></tr>';

        try {
            const dentistFilter = !this.currentUser.is_master ? `?dentist_id=${this.currentUser.id}` : '';
            const response = await fetch(`api/appointments/get.php${dentistFilter}`);
            const result = await response.json();

            if (result.status === 'success') {
                this.globalQueueCache = result.data; // Store in cache for searching
                this.filterGlobalQueue(''); // Trigger initial render
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="5" class="text-center text-error py-2">Queue connection error.</td></tr>';
        }
    },

    filterGlobalQueue: function (query = '') {
        const body = document.getElementById('global-queue-body');
        if (!body) return;

        const filtered = this.globalQueueCache.filter(a => {
            const q = query.toLowerCase();
            return a.patient_name.toLowerCase().includes(q) ||
                a.dentist_name.toLowerCase().includes(q) ||
                a.service_name.toLowerCase().includes(q) ||
                a.appointment_date.includes(q);
        });

        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="text-center py-2 text-dim italic">No matching records found for "${query}".</td></tr>`;
            return;
        }

        let html = '';
        filtered.forEach(a => {
            const statusClass = a.status === 'completed' ? 'bg-success-light text-success' :
                (a.status === 'processing' ? 'bg-warning-light text-warning' : 'bg-muted text-dim');

            html += `
            <tr class="table-row-hover" onclick="app.viewPatientDetails(${a.patient_id})">
                <td class="font-medium">${a.appointment_date}<br><span class="text-xs text-dim">${this.formatTime(a.start_time)}</span></td>
                <td class="text-sm">
                    <span class="font-bold block">${a.patient_name}</span>
                    <span class="text-xs text-dim block"><i class='bx bx-time-five'></i> Request: ${a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                </td>
                <td class="text-sm font-bold text-primary">${a.service_name}</td>
                <td>
                    <div class="flex items-center gap-1">
                        <div class="avatar-tiny bg-primary-light text-primary">${a.dentist_name[0]}</div>
                        <span class="text-xs font-bold">${a.dentist_name}</span>
                    </div>
                </td>
                <td><span class="badge ${statusClass} uppercase text-xs">${a.status}</span></td>
                <td class="text-right" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-end gap-1">
                         <button class="btn-icon circle outline sm" onclick="app.viewPatientDetails(${a.patient_id})" title="View Profile"><i class='bx bx-show'></i></button>
                         
                         ${a.status === 'pending' ? `
                            <button class="btn-icon circle bg-success-light text-success sm" onclick="app.updateAppointmentStatus(${a.id}, 'upcoming')" title="Approve Request">
                                <i class='bx bx-check'></i>
                            </button>
                            <button class="btn-icon circle bg-muted text-danger sm" onclick="app.updateAppointmentStatus(${a.id}, 'cancelled')" title="Decline Request">
                                <i class='bx bx-x'></i>
                            </button>
                         ` : `
                            <button class="btn-icon circle text-dim" onclick="app.updateAppointmentStatus(${a.id}, 'pending')" title="Mark as Pending"><i class='bx bx-undo'></i></button>
                            <button class="btn-icon circle text-warning" onclick="app.updateAppointmentStatus(${a.id}, 'processing')" title="Processing"><i class='bx bx-play'></i></button>
                            <button class="btn-icon circle text-success" onclick="app.updateAppointmentStatus(${a.id}, 'completed')" title="Mark as Completed"><i class='bx bx-check-double'></i></button>
                         `}
                         <button class="btn-icon circle bg-muted text-danger sm" onclick="app.deleteAppointmentRecord(${a.id})" title="Delete Record"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            </tr>`;
        });
        body.innerHTML = html;
    },

    deleteAppointmentRecord: async function (id) {
        if (!await app.confirmAction("Permanently delete this appointment record? This action cannot be undone.")) return;

        this.showLoader("Deleting record...");
        try {
            const response = await fetch('api/appointments/cancel.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointment_id: id })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast("Appointment record deleted.", "success");
                if (document.getElementById('admin-dashboard').classList.contains('active')) this.renderAdminDashboard();
                if (document.getElementById('admin-global-queue').classList.contains('active')) this.renderGlobalQueue();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Delete failed. Check connection.", "error");
        }
    },

    updateAppointmentStatus: async function (id, newStatus) {
        if (newStatus === 'cancelled') {
            this.openDeclineModal(id);
            return;
        }

        if (newStatus === 'completed') {
            if (!await app.confirmAction("Mark this appointment as completed? This will finalize the record, auto-generate an invoice, and award reward points to the patient.")) {
                return;
            }
        }

        this.showLoader(`Marking as ${newStatus}...`);
        try {
            const response = await fetch('api/appointments/update_status.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointment_id: id, status: newStatus })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                // Refresh both current views
                if (document.getElementById('admin-dashboard').classList.contains('active')) this.renderAdminDashboard();
                if (document.getElementById('admin-global-queue').classList.contains('active')) this.renderGlobalQueue();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Failed to update status.", "error");
        }
    },

    generateGlobalReport: function () {
        if (this.globalQueueCache.length === 0) {
            this.showToast("No data to export.", "warning");
            return;
        }

        // Generate CSV header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Time,Patient,Service,Dentist,Status\n";

        // Add rows
        this.globalQueueCache.forEach(a => {
            const row = `${a.appointment_date},${a.start_time},${a.patient_name},${a.service_name},${a.dentist_name},${a.status}`;
            csvContent += row + "\n";
        });

        // Download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `DentAssist_Clinic_Report_${this.formatDate(new Date())}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast("Report downloaded successfully!", "success");
    },

    // --- Dentist-First Booking Logic ---
    loadDentists: async function () {
        const dentistList = document.getElementById('dentist-list');
        if (!dentistList) return;

        try {
            const response = await fetch('api/dentists/list.php');
            const result = await response.json();
            if (result.status === 'success') {
                let html = '';
                result.data.forEach(d => {
                    const initials = d.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    const isActive = parseInt(d.is_active) === 1;
                    const cardClass = isActive ? '' : 'inactive-dentist';

                    html += `
                        <div class="dentist-card ${cardClass}" onclick="app.handleDentistSelect(this, '${d.id}', '${d.full_name}', ${isActive})">
                            <div class="avatar-wrap">
                                <div class="avatar-tiny">
                                    ${initials}
                                </div>
                                <div class="online-status-dot ${isActive ? 'active' : ''}"></div>
                            </div>
                            <div class="dentist-info">
                                <h4>${d.full_name}</h4>
                                <p>${d.position || 'Specialist'}</p>
                            </div>
                            <div class="selection-check">
                                <i class='bx bx-check'></i>
                            </div>
                        </div>
                    `;
                });
                dentistList.innerHTML = html;
            }
        } catch (e) {
            dentistList.innerHTML = '<div class="text-error italic">Could not load experts.</div>';
        }
    },

    handleDentistSelect: function (el, id, name, isActive) {
        if (!isActive) {
            this.showToast(`${name} is currently not accepting new bookings.`, "warning");
            return;
        }
        this.selectDentist(el, id, name);
    },

    selectDentist: function (el, id, name) {
        // Update UI selection
        document.querySelectorAll('.dentist-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        // Store value
        document.getElementById('selected-dentist-id').value = id;

        // Show badge
        const badge = document.getElementById('dentist-badge-placeholder');
        badge.classList.remove('hidden');
        document.getElementById('selected-dentist-name-badge').textContent = name;

        // Auto-check availability if date is already set
        const dateInput = document.getElementById('booking-date').value;
        if (dateInput) {
            this.checkAvailability();
        }
    },

    loadBookingServices: async function () {
        const optionsList = document.getElementById('booking-service-options');
        if (!optionsList) return;

        try {
            const response = await fetch('api/services/get.php');
            const result = await response.json();
            if (result.status === 'success') {
                this.bookingServicesCache = result.data; // Save for later retrieval
                let html = `<div class="option" onclick="app.setCustomSelect('booking-service-custom', '-- Choose a Service --', 'booking-service', ''); app.checkAvailability();">-- Choose a Service --</div>`;

                result.data.forEach(s => {
                    const displayName = `${s.name} - ₱${s.price} (${s.duration_minutes}m)`;
                    html += `
                        <div class="option" onclick="app.setCustomSelect('booking-service-custom', '${s.name}', 'booking-service', '${s.id}'); app.checkAvailability();">
                            ${displayName}
                        </div>`;
                });
                optionsList.innerHTML = html;
            }
        } catch (e) {
            console.error("Failed to load services for booking.");
            optionsList.innerHTML = '<div class="text-error italic p-1">Failed to load services.</div>';
        }
    },

    initQuickDatePicker: function () {
        const picker = document.getElementById('quick-date-picker');
        if (!picker) return;

        const days = 14;
        let html = '';
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(today.getDate() + i);

            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            const fullDate = this.formatDate(date);

            html += `
                <div class="date-card" data-date="${fullDate}" onclick="app.handleDateSelect(this, '${fullDate}')">
                    <span class="day-name">${dayName}</span>
                    <span class="day-number">${dayNum}</span>
                    <span class="month-name">${monthName}</span>
                </div>
            `;
        }
        picker.innerHTML = html;

        // Select today by default
        const firstCard = picker.querySelector('.date-card');
        if (firstCard) this.handleDateSelect(firstCard, this.formatDate(today));
    },

    handleDateSelect: function (el, date) {
        // UI
        document.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        // Data
        const input = document.getElementById('booking-date');
        input.value = date;

        this.checkAvailability();
    },

    handleCustomDateSelect: function (date) {
        if (!date) return;

        // Try to find matching card
        const cards = document.querySelectorAll('.date-card');
        let found = false;
        cards.forEach(c => {
            if (c.dataset.date === date) {
                this.handleDateSelect(c, date);
                found = true;
            }
        });

        if (!found) {
            // Unselect all cards if it's a custom far date
            cards.forEach(c => c.classList.remove('selected'));
            this.checkAvailability();
        }
    },

    currentCalendarDate: new Date(),

    openCalendarModal: function () {
        this.currentCalendarDate = new Date();
        document.getElementById('calendar-modal').classList.remove('hidden');
        this.renderCalendar();
    },

    closeCalendarModal: function () {
        document.getElementById('calendar-modal').classList.add('hidden');
    },

    changeCalendarMonth: function (dir) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + dir);
        this.renderCalendar();
    },

    renderCalendar: function () {
        const grid = document.getElementById('calendar-days');
        const monthYear = document.getElementById('calendar-month-year');
        if (!grid || !monthYear) return;

        const date = new Date(this.currentCalendarDate);
        monthYear.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        let html = '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Padding for first day
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-date disabled"></div>';
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const currentDay = new Date(date.getFullYear(), date.getMonth(), i);
            const isToday = currentDay.getTime() === today.getTime();
            const isDisabled = currentDay < today;
            const fullDate = this.formatDate(currentDay);
            const isSelected = document.getElementById('booking-date').value === fullDate;

            html += `
                <div class="calendar-date ${isToday ? 'today' : ''} ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}"
                     onclick="${!isDisabled ? `app.selectCalendarDate('${fullDate}')` : ''}">
                    ${i}
                </div>
            `;
        }
        grid.innerHTML = html;
    },

    selectCalendarDate: function (date) {
        this.handleCustomDateSelect(date);
        this.closeCalendarModal();
    },

    // --- Master Admin Professional Management ---
    updateDentistManageList: async function () {
        const body = document.getElementById('admin-dentist-manage-list');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="5" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Scanning staff directory...</td></tr>';

        try {
            // Re-use the list API (now filtered by active in previous task, but let's check ALL or just active/suspended)
            // Actually, Master Admin should see ACTIVE + SUSPENDED, but not pending (that's in Approvals TAB)
            const response = await fetch('api/dentists/list.php'); // Note: I might need a new API to show Suspended ones too, but let's stick to active for now
            const result = await response.json();

            if (result.status === 'success') {
                if (result.data.length === 0) {
                    body.innerHTML = '<tr><td colspan="5" class="text-center py-2 text-dim italic">No active professionals found.</td></tr>';
                    return;
                }

                let html = '';
                result.data.forEach(d => {
                    const removeBtn = (d.id === 1 || d.id === this.currentUser.id) ? '' : `
                        <button class="btn-icon circle outline text-danger" onclick="app.removeDentist(${d.id}, '${d.full_name}')" title="Remove Professional">
                            <i class='bx bx-user-minus'></i>
                        </button>
                    `;

                    const statusBadge = d.is_active
                        ? '<span class="badge bg-success-light text-success uppercase text-xs">Active</span>'
                        : '<span class="badge bg-muted text-dim uppercase text-xs">Inactive</span>';

                    html += `
                    <tr>
                        <td class="font-bold">${d.full_name}</td>
                        <td>
                            <div class="text-xs font-bold uppercase text-primary">${d.role}</div>
                            <div class="text-sm text-dim">${d.position || '--'}</div>
                        </td>
                        <td class="text-sm font-mono">${d.professional_id || '--'}</td>
                        <td>${statusBadge}</td>
                        <td class="text-sm text-dim">${d.email}</td>
                        <td class="text-right">
                            ${removeBtn}
                        </td>
                    </tr>`;
                });
                body.innerHTML = html;
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="5" class="text-center text-error py-2">Staff lookup failed.</td></tr>';
        }
    },

    removeUser: async function (userId, name, type) {
        const confirmMsg = type === 'patient'
            ? `Are you sure you want to archive patient ${name}? Their records will be moved to the Archive (Backup).`
            : `CAUTION: You are about to remove ${name} from the system. This will revoke their access immediately. Proceed?`;

        if (!await app.confirmAction(confirmMsg)) return;

        this.showLoader("Archiving user...");
        try {
            const response = await fetch('api/admin/delete_user.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, action: 'delete' })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                if (type === 'patient') this.updatePatientList();
                else this.updateDentistManageList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Critical failure during removal.", "error");
        }
    },

    removeDentist: function (id, name) {
        this.removeUser(id, name, 'dentist');
    },

    updateArchiveList: async function () {
        const body = document.getElementById('admin-archive-list-body');
        if (!body) return;

        body.innerHTML = '<tr><td colspan="4" class="text-center py-2"><i class="bx bx-loader-alt bx-spin mr-1"></i> Checking backup vault...</td></tr>';

        try {
            const response = await fetch('api/admin/archived_list.php');
            const result = await response.json();

            if (result.status === 'success') {
                this.archiveCache = result.data;
                this.filterArchiveList('');
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-error py-2">Archive lookup failed.</td></tr>';
        }
    },

    filterArchiveList: function (query = '') {
        const body = document.getElementById('admin-archive-list-body');
        if (!body || !this.archiveCache) return;

        const filtered = this.archiveCache.filter(u => {
            const q = query.toLowerCase();
            return u.full_name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="4" class="text-center py-2 text-dim italic">No archived users matching "${query}".</td></tr>`;
            return;
        }

        let rows = '';
        filtered.forEach(u => {
            const archivedDate = new Date(u.deleted_at).toLocaleString();
            rows += `
            <tr>
                <td class="pl-2 font-bold">${u.full_name}</td>
                <td><span class="badge border-badge uppercase text-xs">${u.role}</span></td>
                <td class="text-dim text-sm">${archivedDate}</td>
                <td class="text-right pr-2">
                    <button class="btn-outline sm py-1 mr-1" onclick="app.restoreUser(${u.id}, '${u.full_name}')">
                        <i class='bx bx-undo mr-1'></i> Restore
                    </button>
                    <button class="btn-primary sm py-1" style="background: var(--danger); border: none;" onclick="app.purgeUser(${u.id}, '${u.full_name}')">
                        <i class='bx bx-trash mr-1'></i> Purge
                    </button>
                </td>
            </tr>`;
        });
        body.innerHTML = rows;
    },

    restoreUser: async function (userId, name) {
        if (!await app.confirmAction(`Do you want to restore ${name} and grant them access again?`)) return;

        this.showLoader("Restoring from backup...");
        try {
            const response = await fetch('api/admin/delete_user.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, action: 'restore' })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                this.updateArchiveList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Restoration failed.", "error");
        }
    },

    purgeUser: async function (userId, name) {
        const warning = `CRITICAL ACTION: You are about to PERMANENTLY DELETE ${name} from the database.\n\nThis cannot be undone and will erase all their profile data. Appointments and medical history linked to this ID may become orphaned. Continue?`;

        if (!await app.confirmAction(warning)) return;

        this.showLoader("Purging user permanently...");
        try {
            const response = await fetch('api/admin/delete_user.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, action: 'purge' })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                this.updateArchiveList();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Purge failed. Database connection issue.", "error");
        }
    },

    toggleRegisterFields: function (role) {
        const extra = document.getElementById('dentist-extra-fields');
        if (role === 'admin') {
            extra.classList.remove('hidden');
        } else {
            extra.classList.add('hidden');
        }
    },

    // --- Profile Management ---
    openProfileModal: function () {
        const u = this.currentUser;
        if (!u) return;

        document.getElementById('profile-name').value = u.name || u.full_name || '';
        document.getElementById('profile-email').value = u.email || '';
        document.getElementById('profile-phone').value = u.phone || '';

        const staffFields = document.getElementById('profile-staff-fields');
        const patientFields = document.getElementById('profile-patient-fields');

        if (u.role === 'admin' || u.role === 'dentist') {
            staffFields.classList.remove('hidden');
            patientFields.classList.add('hidden');
            document.getElementById('profile-pro-id').value = u.professional_id || '';
            document.getElementById('profile-position').value = u.position || '';
            document.getElementById('profile-is-active').checked = u.is_active !== false; // Default to true if not present
        } else {
            staffFields.classList.add('hidden');
            patientFields.classList.remove('hidden');
            document.getElementById('profile-dob').value = u.dob || '';
            document.getElementById('profile-emergency-name').value = u.emergency_contact_name || '';
            document.getElementById('profile-emergency-phone').value = u.emergency_contact_phone || '';
            document.getElementById('profile-allergies').value = u.allergies || '';
            document.getElementById('profile-medications').value = u.medications || '';
        }

        document.getElementById('profile-modal').classList.remove('hidden');
    },

    closeProfileModal: function () {
        document.getElementById('profile-modal').classList.add('hidden');
    },

    // --- Decline Reason Modal ---
    openDeclineModal: function (id) {
        document.getElementById('decline-appt-id').value = id;
        document.getElementById('decline-reason-select').value = 'Schedule Conflict';
        document.getElementById('decline-reason-text').value = '';
        document.getElementById('decline-custom-reason-wrap').classList.add('hidden');
        document.getElementById('decline-modal').classList.remove('hidden');
    },

    handleDeclineReasonChange: function (val) {
        const wrap = document.getElementById('decline-custom-reason-wrap');
        if (val === 'Other') {
            wrap.classList.remove('hidden');
            document.getElementById('decline-reason-text').focus();
        } else {
            wrap.classList.add('hidden');
        }
    },

    closeDeclineModal: function () {
        document.getElementById('decline-modal').classList.add('hidden');
    },

    submitDecline: async function () {
        const id = document.getElementById('decline-appt-id').value;
        const selectVal = document.getElementById('decline-reason-select').value;
        const customVal = document.getElementById('decline-reason-text').value.trim();

        let reason = selectVal;
        if (selectVal === 'Other') {
            if (!customVal) {
                this.showToast("Please describe the reason.", "warning");
                return;
            }
            reason = customVal;
        }

        this.closeDeclineModal();
        this.showLoader("Processing decline...");
        try {
            const response = await fetch('api/appointments/update_status.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appointment_id: id,
                    status: 'cancelled',
                    reason: reason
                })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                if (document.getElementById('admin-dashboard').classList.contains('active')) this.renderAdminDashboard();
                if (document.getElementById('admin-global-queue').classList.contains('active')) this.renderGlobalQueue();
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Failed to decline appointment.", "error");
        }
    },

    viewCancellationReason: function (id) {
        const apt = this.currentAppointments.find(a => a.id == id);
        if (!apt) return;

        document.getElementById('view-cancel-service').textContent = `${apt.service_name} (${apt.appointment_date})`;
        document.getElementById('view-cancel-reason').textContent = apt.cancellation_reason || 'No specific reason provided by the clinic.';
        document.getElementById('view-cancellation-modal').classList.remove('hidden');
    },

    closeViewCancellation: function () {
        document.getElementById('view-cancellation-modal').classList.add('hidden');
    },

    toggleStaffRegistration: function (isStaff) {
        const extraFields = document.getElementById('dentist-extra-fields');
        const toggleText = document.getElementById('staff-reg-toggle-text');
        const staffFlag = document.getElementById('reg-is-staff');

        if (isStaff) {
            extraFields.classList.remove('hidden');
            staffFlag.value = "1";
            toggleText.innerHTML = `<span class="font-bold text-main">Registering as Clinic Personnel.</span> <a href="#" class="font-bold text-primary" onclick="app.toggleStaffRegistration(false)">Switch to Patient</a>`;
            this.showToast("Staff registration mode activated.", "info");
        } else {
            extraFields.classList.add('hidden');
            staffFlag.value = "0";
            toggleText.innerHTML = `Are you a clinic member? <a href="#" class="font-bold text-primary" onclick="app.toggleStaffRegistration(true)">Register as Staff</a>`;
        }
    },

    updateProfile: async function () {
        const payload = {
            user_id: this.currentUser.id,
            full_name: document.getElementById('profile-name').value,
            email: document.getElementById('profile-email').value,
            phone: document.getElementById('profile-phone').value,
            professional_id: document.getElementById('profile-pro-id').value,
            position: document.getElementById('profile-position').value,
            is_active: document.getElementById('profile-is-active').checked ? 1 : 0,
            // Patient Fields
            dob: document.getElementById('profile-dob').value,
            emergency_contact_name: document.getElementById('profile-emergency-name').value,
            emergency_contact_phone: document.getElementById('profile-emergency-phone').value,
            allergies: document.getElementById('profile-allergies').value,
            medications: document.getElementById('profile-medications').value
        };

        this.showLoader("Saving profile...");
        try {
            const response = await fetch('api/auth/update_profile.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(result.message, "success");
                this.currentUser = result.user; // Update local session
                this.closeProfileModal();

                // Refresh UI
                if (this.currentUser.role === 'patient') {
                    this.renderPatientDashboard();
                } else {
                    this.renderAdminDashboard();
                    this.updateDentistManageList();
                }
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Connection failed.", "error");
        }
    },

    // --- Reward Points System ---
    openRewardsModal: function () {
        const u = this.currentUser;
        if (!u) return;

        document.getElementById('rewards-total-balance').textContent = u.reward_points || 0;
        document.getElementById('rewards-modal').classList.remove('hidden');

        this.loadRewards();
        this.loadRewardHistory();
    },

    closeRewardsModal: function () {
        document.getElementById('rewards-modal').classList.add('hidden');
    },

    switchRewardsTab: function (tabId, el) {
        // Update tab buttons
        const tabContainer = el.parentElement;
        tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        el.classList.add('active');

        // Update content
        document.getElementById('reward-options').classList.add('hidden');
        document.getElementById('reward-history').classList.add('hidden');

        if (tabId === 'options') document.getElementById('reward-options').classList.remove('hidden');
        if (tabId === 'history') document.getElementById('reward-history').classList.remove('hidden');
    },

    loadRewards: async function () {
        const container = document.getElementById('rewards-list-container');
        if (!container) return;

        try {
            const response = await fetch('api/rewards/list.php');
            const result = await response.json();
            if (result.status === 'success') {
                let html = '';
                result.data.forEach(r => {
                    const canAfford = (this.currentUser.reward_points || 0) >= r.points_required;
                    const opacityClass = canAfford ? '' : 'opacity-70';
                    const buttonClass = canAfford ? 'btn-primary' : 'btn-outline';
                    const icon = r.reward_type === 'discount' ? 'bx-purchase-tag' : 'bx-gift';

                    html += `
                        <div class="card p-1 border-badge ${opacityClass} hover-lift">
                            <div class="flex items-center gap-1 mb-1">
                                <div class="logo-icon bg-muted text-dim sm"><i class='bx ${icon}'></i></div>
                                <h4 class="font-bold text-sm" style="font-size: 13px;">${r.name}</h4>
                            </div>
                            <p class="text-xs text-dim mb-1">${r.description}</p>
                            <div class="flex-center-between mt-auto">
                                <span class="badge border-badge text-warning font-bold" style="font-size: 9px;">${r.points_required} PTS</span>
                                <button class="${buttonClass} py-0 px-1 text-xs" style="font-size: 10px; padding: 4px 8px;" ${canAfford ? `onclick="app.redeemReward(${r.id}, '${r.name}', ${r.points_required})"` : 'disabled'}>
                                    ${canAfford ? 'Redeem' : 'Locked'}
                                </button>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            }
        } catch (e) {
            container.innerHTML = '<div class="text-error italic">Failed to load rewards.</div>';
        }
    },

    loadRewardHistory: async function () {
        const body = document.getElementById('reward-history-body');
        if (!body) return;

        try {
            const response = await fetch(`api/rewards/history.php?patient_id=${this.currentUser.id}`);
            const result = await response.json();
            if (result.status === 'success') {
                if (result.data.length === 0) {
                    body.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-dim">No point activity yet.</td></tr>';
                    return;
                }
                let html = '';
                result.data.forEach(h => {
                    const colorClass = h.action === 'earned' ? 'text-success' : 'text-danger';
                    const prefix = h.action === 'earned' ? '+' : '-';
                    html += `
                        <tr>
                            <td>${new Date(h.created_at).toLocaleDateString()}</td>
                            <td>
                                <div class="font-bold">${h.reason}</div>
                                <div class="text-dim uppercase" style="font-size: 8px;">${h.action}</div>
                            </td>
                            <td class="${colorClass} font-bold">${prefix}${h.points}</td>
                        </tr>
                    `;
                });
                body.innerHTML = html;
            }
        } catch (e) {
            body.innerHTML = '<tr><td colspan="3" class="text-center text-error">Failed to load history.</td></tr>';
        }
    },

    redeemReward: async function (rewardId, rewardName, points) {
        if (!await this.confirmAction(`Redeem ${points} points for "${rewardName}"?`)) return;

        this.showLoader("Processing redemption...");
        try {
            const response = await fetch('api/rewards/redeem.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: this.currentUser.id,
                    reward_id: rewardId
                })
            });
            const result = await response.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.showToast(`Success! You redeemed: ${rewardName}`, "success");
                this.currentUser.reward_points = result.new_balance;
                this.renderPatientDashboard(); // Refresh dash
                this.openRewardsModal(); // Refresh modal info
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Redemption failed. Check connection.", "error");
        }
    },

    // ===================================================================
    // WALK-IN BOOKING (Admin)
    // ===================================================================
    openWalkinModal: async function () {
        // Default date to today
        const today = this.formatDate(new Date());
        document.getElementById('walkin-date').value = today;
        document.getElementById('walkin-time').value = '08:00';
        document.getElementById('walkin-notes').value = '';

        // Show modal immediately
        document.getElementById('walkin-modal').classList.remove('hidden');

        // Load patients, dentists, services in parallel
        try {
            const [pRes, dRes, sRes] = await Promise.all([
                fetch('api/patients/list.php'),
                fetch('api/dentists/list.php'),
                fetch('api/services/get.php')
            ]);
            const [pData, dData, sData] = await Promise.all([pRes.json(), dRes.json(), sRes.json()]);

            // Patients
            const pSelect = document.getElementById('walkin-patient');
            if (pData.status === 'success' && pData.data.length > 0) {
                pSelect.innerHTML = '<option value="">-- Select Patient --</option>' +
                    pData.data.map(p => `<option value="${p.id}">${p.full_name} (${p.phone})</option>`).join('');
            } else {
                pSelect.innerHTML = '<option value="">No patients found</option>';
            }

            // Dentists
            const dSelect = document.getElementById('walkin-dentist');
            if (dData.status === 'success' && dData.data.length > 0) {
                dSelect.innerHTML = '<option value="">-- Select Dentist --</option>' +
                    dData.data.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
            } else {
                dSelect.innerHTML = '<option value="">No dentists available</option>';
            }

            // Services
            const sSelect = document.getElementById('walkin-service');
            if (sData.status === 'success' && sData.data.length > 0) {
                sSelect.innerHTML = '<option value="">-- Select Service --</option>' +
                    sData.data.map(s => `<option value="${s.id}">₱${s.price} — ${s.name} (${s.duration_minutes} mins)</option>`).join('');
            } else {
                sSelect.innerHTML = '<option value="">No services available</option>';
            }

        } catch (e) {
            this.showToast("Failed to load form data. Check your connection.", "error");
        }
    },

    closeWalkinModal: function () {
        document.getElementById('walkin-modal').classList.add('hidden');
    },

    submitWalkin: async function () {
        const patientId = document.getElementById('walkin-patient').value;
        const dentistId = document.getElementById('walkin-dentist').value;
        const serviceId = document.getElementById('walkin-service').value;
        const date = document.getElementById('walkin-date').value;
        const time = document.getElementById('walkin-time').value;

        if (!patientId) { this.showToast("Please select a patient.", "warning"); return; }
        if (!dentistId) { this.showToast("Please select a dentist.", "warning"); return; }
        if (!serviceId) { this.showToast("Please select a service.", "warning"); return; }
        if (!date) { this.showToast("Please choose a date.", "warning"); return; }
        if (!time) { this.showToast("Please choose a start time.", "warning"); return; }

        // Validate clinic hours (08:00–17:00)
        const [h] = time.split(':').map(Number);
        if (h < 8 || h >= 17) {
            this.showToast("Walk-in time must be between 08:00 AM and 05:00 PM.", "warning");
            return;
        }

        const btn = document.getElementById('walkin-submit-btn');
        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin mr-1'></i> Registering...";

        this.showLoader("Registering walk-in appointment...");

        try {
            const response = await fetch('api/appointments/walkin.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: parseInt(patientId),
                    dentist_id: parseInt(dentistId),
                    service_id: parseInt(serviceId),
                    appointment_date: date,
                    start_time: time + ':00'
                })
            });
            const result = await response.json();
            this.hideLoader();

            if (response.ok && result.status === 'success') {
                this.closeWalkinModal();
                this.showToast("Walk-in registered successfully! ✅", "success");
                // Refresh dashboard data
                this.renderAdminDashboard();
                if (document.getElementById('admin-global-queue').classList.contains('active')) {
                    this.renderGlobalQueue();
                }
            } else {
                this.showToast(result.message || "Failed to register walk-in.", "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Connection error. Please try again.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = "<i class='bx bx-check-circle mr-1'></i> Register Walk-in";
        }
    },

    // ===================================================================
    // REPORTS & ANALYTICS
    // ===================================================================
    handleReportQuickSelect: function () {
        const val = document.getElementById('report-quick-select').value;
        const startInput = document.getElementById('report-start-date');
        const endInput = document.getElementById('report-end-date');

        const now = new Date();
        const y = now.getFullYear();
        const mStr = String(now.getMonth() + 1).padStart(2, '0');
        const dStr = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${mStr}-${dStr}`;

        let start, end;

        if (val === 'today') {
            start = end = todayStr;
        } else if (val === 'this_week') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            const lastDay = new Date(now.setDate(now.getDate() - now.getDay() + 6));
            start = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
            end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        } else if (val === 'this_month') {
            const now2 = new Date();
            start = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-01`;
            const lastDayObj = new Date(now2.getFullYear(), now2.getMonth() + 1, 0);
            end = `${lastDayObj.getFullYear()}-${String(lastDayObj.getMonth() + 1).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
        }

        if (val !== 'custom') {
            startInput.value = start;
            endInput.value = end;
        }
    },

    generateReport: async function () {
        const start = document.getElementById('report-start-date').value;
        const end = document.getElementById('report-end-date').value;

        if (!start || !end) {
            this.showToast("Please select a valid date range.", "warning");
            return;
        }

        this.showLoader("Aggregating report data...");
        try {
            const dentistParam = !this.currentUser.is_master ? `&dentist_id=${this.currentUser.id}` : '';
            const res = await fetch(`api/reports/generate.php?start_date=${start}&end_date=${end}${dentistParam}`);
            const result = await res.json();
            this.hideLoader();

            if (result.status === 'success') {
                this.lastReportData = result.data; // Store for export
                this.renderReportData(result.data);
                document.getElementById('report-content').classList.remove('hidden');
                this.showToast("Report generated successfully.", "success");
            } else {
                this.showToast(result.message, "error");
            }
        } catch (e) {
            this.hideLoader();
            this.showToast("Failed to fetch report data.", "error");
        }
    },

    renderReportData: function (data) {
        // Summary Stats
        document.getElementById('report-stat-revenue').textContent = '₱' + parseFloat(data.revenue.total_billed).toFixed(2);
        document.getElementById('report-stat-appointments').textContent = data.appointments.total_appointments;
        document.getElementById('report-stat-patients').textContent = data.patients.total_seen;

        // Deep Dive Stats
        document.getElementById('report-appts-completed').textContent = data.appointments.completed || 0;
        document.getElementById('report-appts-cancelled').textContent = data.appointments.cancelled || 0;
        document.getElementById('report-appts-walkin').textContent = data.appointments.walk_in || 0;
        document.getElementById('report-appts-upcoming').textContent = data.appointments.upcoming || 0;

        document.getElementById('report-rev-paid').textContent = '₱' + parseFloat(data.revenue.total_paid).toFixed(2);
        document.getElementById('report-rev-unpaid').textContent = '₱' + parseFloat(data.revenue.total_unpaid).toFixed(2);

        document.getElementById('report-pat-total').textContent = data.patients.total_seen || 0;
        document.getElementById('report-pat-new').textContent = data.patients.new_patients || 0;

        // Services Table
        const sBody = document.getElementById('report-services-body');
        if (!data.services || data.services.length === 0) {
            sBody.innerHTML = '<tr><td colspan="3" class="text-center py-1 text-dim">No services rendered in this period.</td></tr>';
        } else {
            sBody.innerHTML = data.services.map(s => `
                <tr class="table-row-hover">
                    <td>${s.service_name}</td>
                    <td class="text-center font-bold">${s.usage_count}</td>
                    <td class="text-right text-success font-bold">₱${parseFloat(s.total_revenue).toFixed(2)}</td>
                </tr>
            `).join('');
        }

        // Dentists Table
        const dBody = document.getElementById('report-dentists-body');
        if (!data.dentists || data.dentists.length === 0) {
            dBody.innerHTML = '<tr><td colspan="3" class="text-center py-1 text-dim">No dentist activity in this period.</td></tr>';
        } else {
            dBody.innerHTML = data.dentists.map(d => `
                <tr class="table-row-hover">
                    <td>${d.dentist_name}</td>
                    <td class="text-center font-bold">${d.total_appointments}</td>
                    <td class="text-right">${d.unique_patients}</td>
                </tr>
            `).join('');
        }
    },

    exportReport: function (format) {
        if (!this.lastReportData) {
            this.showToast("Please generate a report first.", "warning");
            return;
        }

        if (format === 'print') {
            window.print();
        } else if (format === 'csv') {
            this.downloadReportCSV();
        }
    },

    downloadReportCSV: function () {
        const data = this.lastReportData;
        let csvContent = "data:text/csv;charset=utf-8,";

        // Section: Summary
        csvContent += "DENTASSIST ANALYTICS REPORT\n";
        csvContent += `Period,${data.date_range.start} to ${data.date_range.end}\n`;
        csvContent += `Generated At,${new Date().toLocaleString()}\n\n`;

        csvContent += "APPOINTMENT SUMMARY\n";
        csvContent += "Metric,Value\n";
        csvContent += `Total Bookings,${data.appointments.total_appointments}\n`;
        csvContent += `Completed,${data.appointments.completed}\n`;
        csvContent += `Cancelled,${data.appointments.cancelled}\n`;
        csvContent += `Walk-ins,${data.appointments.walk_in}\n\n`;

        // Section: Revenue
        csvContent += "REVENUE INSIGHTS\n";
        csvContent += "Status,Amount (PHP)\n";
        csvContent += `Total Billed,${data.revenue.total_billed}\n`;
        csvContent += `Total Collected,${data.revenue.total_paid}\n`;
        csvContent += `Outstanding,${data.revenue.total_unpaid}\n\n`;

        // Section: Services
        csvContent += "SERVICE PERFORMANCE\n";
        csvContent += "Service Name,Usage Count,Total Revenue (PHP)\n";
        data.services.forEach(s => {
            csvContent += `"${s.service_name}",${s.usage_count},${s.total_revenue}\n`;
        });
        csvContent += "\n";

        // Section: Dentists
        if (data.dentists && data.dentists.length > 0) {
            csvContent += "STAFF PERFORMANCE\n";
            csvContent += "Staff Name,Appointments Handled,Unique Patients\n";
            data.dentists.forEach(d => {
                csvContent += `"${d.dentist_name}",${d.total_appointments},${d.unique_patients}\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `DentAssist_Report_${data.date_range.start}_to_${data.date_range.end}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("CSV report downloaded.", "success");
    },

    setCustomSelect: function (containerId, displayValue, hiddenInputId, actualValue = null) {
        const container = document.getElementById(containerId);
        const trigger = container.querySelector('.select-trigger span');
        const hiddenInput = document.getElementById(hiddenInputId);
        const options = container.querySelectorAll('.option');

        // Update UI
        trigger.textContent = displayValue;
        hiddenInput.value = actualValue !== null ? actualValue : displayValue;

        // Trigger change event if needed
        const event = new Event('change');
        hiddenInput.dispatchEvent(event);

        // Update active class
        options.forEach(opt => {
            if (opt.textContent.trim() === displayValue.trim()) opt.classList.add('selected');
            else opt.classList.remove('selected');
        });

        // Close dropdown
        container.classList.remove('active');
    }
};

// Global click listener for custom selects
document.addEventListener('click', (e) => {
    // Toggle logic
    const trigger = e.target.closest('.select-trigger');
    if (trigger) {
        const container = trigger.closest('.custom-select');
        container.classList.toggle('active');

        // Close others
        document.querySelectorAll('.custom-select').forEach(cs => {
            if (cs !== container) cs.classList.remove('active');
        });
        return;
    }

    // Close all if clicking outside
    if (!e.target.closest('.custom-select')) {
        document.querySelectorAll('.custom-select').forEach(cs => cs.classList.remove('active'));
    }
});

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
