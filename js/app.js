/**
 * TMHIS Application Router & UI Controller
 */

// Initialize PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[TMHIS PWA] Service Worker registered with scope:', reg.scope))
            .catch(err => console.error('[TMHIS PWA] Service Worker registration failed:', err));
    });
}

// Online / Offline Detection
function updateNetworkStatus() {
    const banner = document.getElementById('offline-banner');
    if (banner) {
        if (!navigator.onLine) {
            banner.classList.add('active');
            banner.innerHTML = '⚠️ Offline Mode: Working locally. Data will sync when connection returns.';
        } else {
            banner.classList.remove('active');
        }
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// App Router
const App = {
    init() {
        updateNetworkStatus();
        this.renderHeader();
        window.addEventListener('hashchange', () => this.route());
        this.route();
    },

    renderHeader() {
        const headerActions = document.getElementById('header-actions');
        if (!headerActions) return;

        const user = Auth.getUser();
        if (user && Auth.isAuthenticated()) {
            const roleLabels = {
                'learner': 'Learner (P1–P7)',
                'parent': 'Parent / Guardian',
                'teacher': 'Teacher',
                'curriculum_officer': 'Curriculum Officer',
                'administrator': 'System Admin'
            };

            const displayName = user.profile?.full_name || user.profile?.first_name || user.username || user.email;

            headerActions.innerHTML = `
                <div class="user-badge">
                    <span>${this.escapeHtml(displayName)}</span>
                    ${this.formatRoleBadge(user.role_code)}
                </div>
                <button class="btn btn-secondary btn-sm" onclick="App.navigate('#profile')">Profile</button>
                <button class="btn btn-danger btn-sm" onclick="Auth.logout()">Logout</button>
            `;
        } else {
            headerActions.innerHTML = `
                <a href="#login" class="btn btn-secondary btn-sm">Login</a>
                <a href="#register" class="btn btn-primary btn-sm">Register Parent</a>
            `;
        }
    },

    handleBrandClick(e) {
        if (e) e.preventDefault();
        const target = Auth.isAuthenticated() ? this.getDefaultDashboard() : '#login';
        if (window.location.hash !== target) {
            window.location.hash = target;
        } else {
            this.route();
        }
    },

    route() {
        this.renderHeader();
        const hash = window.location.hash;
        const content = document.getElementById('app-content');

        if (!content) return;

        const publicRoutes = ['#login', '#register', '#forgot-password', '#reset-password'];

        // If authenticated and attempting to view guest/auth forms, automatically redirect to role dashboard
        if (Auth.isAuthenticated()) {
            if (!hash || hash === '#' || hash === '#dashboard' || publicRoutes.some(r => hash.startsWith(r))) {
                const defaultDash = this.getDefaultDashboard();
                if (window.location.hash !== defaultDash) {
                    window.location.hash = defaultDash;
                    return;
                }
            }
        } else {
            // If NOT authenticated and attempting to view protected route, redirect to login
            if (!hash || hash === '#' || hash === '#dashboard' || !publicRoutes.some(r => hash.startsWith(r))) {
                if (window.location.hash !== '#login') {
                    window.location.hash = '#login';
                    return;
                }
            }
        }

        const currentHash = window.location.hash || (Auth.isAuthenticated() ? this.getDefaultDashboard() : '#login');

        if (currentHash === '#login') {
            this.renderLogin(content);
        } else if (currentHash === '#register') {
            this.renderRegister(content);
        } else if (currentHash === '#forgot-password') {
            this.renderForgotPassword(content);
        } else if (currentHash.startsWith('#reset-password')) {
            this.renderResetPassword(content);
        } else if (currentHash === '#profile') {
            this.renderProfile(content);
        } else if (currentHash === '#admin-dashboard') {
            this.renderAdminDashboard(content);
        } else if (currentHash === '#parent-dashboard') {
            this.renderParentDashboard(content);
        } else if (currentHash === '#learner-dashboard') {
            this.renderLearnerDashboard(content);
        } else if (currentHash === '#teacher-dashboard') {
            this.renderTeacherDashboard(content);
        } else if (currentHash === '#officer-dashboard') {
            this.renderOfficerDashboard(content);
        } else {
            this.renderGenericDashboard(content, currentHash);
        }
    },

    getDefaultDashboard() {
        const role = Auth.getRole();
        switch (role) {
            case 'learner': return '#learner-dashboard';
            case 'parent': return '#parent-dashboard';
            case 'teacher': return '#teacher-dashboard';
            case 'curriculum_officer': return '#officer-dashboard';
            case 'administrator': return '#admin-dashboard';
            default: return '#login';
        }
    },

    formatRoleBadge(roleCode) {
        const icons = {
            'administrator': '⚙️ Admin',
            'curriculum_officer': '🏛️ Officer',
            'teacher': '👩‍🏫 Teacher',
            'parent': '👨‍👩‍👧 Parent',
            'learner': '🎒 Learner'
        };
        const label = icons[roleCode] || (roleCode ? roleCode.replace('_', ' ') : 'User');
        return `<span class="role-tag role-${roleCode}">${this.escapeHtml(label)}</span>`;
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    // --- VIEW RENDERERS ---

    renderLogin(container) {
        container.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <h2>Sign In</h2>
                    <p>Technology-Mediated Homeschooling Information System</p>
                </div>
                <div id="login-alert"></div>
                <form id="login-form" onsubmit="App.handleLogin(event)">
                    <div class="form-group">
                        <label for="login-input">Email Address or Username</label>
                        <input type="text" id="login-input" class="form-control" placeholder="e.g. parent@example.com" required autofocus>
                    </div>
                    <div class="form-group">
                        <label for="password-input">Password</label>
                        <input type="password" id="password-input" class="form-control" placeholder="••••••••" required>
                    </div>
                    <div class="form-group" style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0;">
                            <input type="checkbox" id="remember-input"> Remember me
                        </label>
                        <a href="#forgot-password" style="font-size:0.85rem; color:var(--primary); text-decoration:none;">Forgot password?</a>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">Sign In</button>
                </form>
                <div style="text-align:center; margin-top:1.5rem; font-size:0.9rem; color:var(--text-muted);">
                    New parent? <a href="#register" style="color:var(--primary); font-weight:600;">Register here</a>
                </div>
            </div>
        `;
    },

    async handleLogin(e) {
        e.preventDefault();
        const alertBox = document.getElementById('login-alert');
        const submitBtn = document.getElementById('login-submit-btn');
        const login = document.getElementById('login-input').value;
        const password = document.getElementById('password-input').value;
        const remember = document.getElementById('remember-input').checked;

        submitBtn.disabled = true;
        submitBtn.innerText = 'Signing in...';
        alertBox.innerHTML = '';

        try {
            const data = await Auth.login(login, password, remember);
            window.location.hash = data.user.dashboard_url.replace('/', '');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In';
        }
    },

    renderRegister(container) {
        container.innerHTML = `
            <div class="auth-container" style="max-width:540px;">
                <div class="auth-header">
                    <h2>Parent Registration</h2>
                    <p>Create a parent account to homeschool and monitor your learners (P1–P7)</p>
                </div>
                <div id="reg-alert"></div>
                <form id="reg-form" onsubmit="App.handleRegister(event)">
                    <div class="form-group">
                        <label for="reg-name">Full Name *</label>
                        <input type="text" id="reg-name" class="form-control" placeholder="e.g. Sarah Namubiru" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="reg-email">Email Address *</label>
                            <input type="email" id="reg-email" class="form-control" placeholder="sarah@example.com" required>
                        </div>
                        <div class="form-group">
                            <label for="reg-phone">Phone Number *</label>
                            <input type="tel" id="reg-phone" class="form-control" placeholder="+256 700 000000" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="reg-district">District</label>
                            <input type="text" id="reg-district" class="form-control" placeholder="e.g. Kampala / Wakiso">
                        </div>
                        <div class="form-group">
                            <label for="reg-nid">National ID (NIN)</label>
                            <input type="text" id="reg-nid" class="form-control" placeholder="Optional">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="reg-address">Physical Address</label>
                        <input type="text" id="reg-address" class="form-control" placeholder="e.g. Ntinda, Kampala">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="reg-pwd">Password (min 8 chars) *</label>
                            <input type="password" id="reg-pwd" class="form-control" placeholder="••••••••" required minlength="8">
                        </div>
                        <div class="form-group">
                            <label for="reg-pwd-conf">Confirm Password *</label>
                            <input type="password" id="reg-pwd-conf" class="form-control" placeholder="••••••••" required minlength="8">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="reg-submit-btn">Create Parent Account</button>
                </form>
                <div style="text-align:center; margin-top:1.5rem; font-size:0.9rem; color:var(--text-muted);">
                    Already have an account? <a href="#login" style="color:var(--primary); font-weight:600;">Sign in</a>
                </div>
            </div>
        `;
    },

    async handleRegister(e) {
        e.preventDefault();
        const alertBox = document.getElementById('reg-alert');
        const submitBtn = document.getElementById('reg-submit-btn');

        const payload = {
            full_name: document.getElementById('reg-name').value,
            email: document.getElementById('reg-email').value,
            phone: document.getElementById('reg-phone').value,
            district: document.getElementById('reg-district').value,
            national_id: document.getElementById('reg-nid').value,
            physical_address: document.getElementById('reg-address').value,
            password: document.getElementById('reg-pwd').value,
            password_confirmation: document.getElementById('reg-pwd-conf').value
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating account...';
        alertBox.innerHTML = '';

        try {
            const res = await Auth.registerParent(payload);
            alertBox.innerHTML = `<div class="alert alert-success">${res.message || 'Account created! Redirecting to login...'}</div>`;
            setTimeout(() => {
                window.location.hash = '#login';
            }, 1800);
        } catch (err) {
            let errorMsg = err.message;
            if (err.data?.errors) {
                const flat = Object.values(err.data.errors).flat().join('<br>');
                errorMsg = flat || errorMsg;
            }
            alertBox.innerHTML = `<div class="alert alert-danger">${errorMsg}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Parent Account';
        }
    },

    renderForgotPassword(container) {
        container.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <h2>Reset Password</h2>
                    <p>Enter your registered email address to receive password reset instructions</p>
                </div>
                <div id="forgot-alert"></div>
                <form id="forgot-form" onsubmit="App.handleForgotPassword(event)">
                    <div class="form-group">
                        <label for="forgot-email">Email Address</label>
                        <input type="email" id="forgot-email" class="form-control" placeholder="e.g. parent@example.com" required autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="forgot-submit-btn">Send Reset Token</button>
                </form>
                <div style="text-align:center; margin-top:1.5rem; font-size:0.9rem; color:var(--text-muted);">
                    <a href="#login" style="color:var(--primary); font-weight:600;">Back to Login</a>
                </div>
            </div>
        `;
    },

    async handleForgotPassword(e) {
        e.preventDefault();
        const alertBox = document.getElementById('forgot-alert');
        const submitBtn = document.getElementById('forgot-submit-btn');
        const email = document.getElementById('forgot-email').value;

        submitBtn.disabled = true;
        submitBtn.innerText = 'Submitting...';
        alertBox.innerHTML = '';

        try {
            const res = await Auth.forgotPassword(email);
            if (res.data?.reset_token) {
                alertBox.innerHTML = `
                    <div class="alert alert-success">
                        Password reset token generated:<br>
                        <code style="word-break:break-all; font-weight:bold; background:#fff; padding:4px 8px; border-radius:4px; display:block; margin:6px 0;">${res.data.reset_token}</code>
                        <a href="#reset-password?token=${res.data.reset_token}" class="btn btn-sm btn-primary" style="margin-top:6px;">Click here to Reset Password</a>
                    </div>
                `;
            } else {
                alertBox.innerHTML = `<div class="alert alert-success">${res.message}</div>`;
            }
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Send Reset Token';
        }
    },

    renderResetPassword(container) {
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const token = urlParams.get('token') || '';

        container.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <h2>Create New Password</h2>
                    <p>Enter your reset token and new password</p>
                </div>
                <div id="reset-alert"></div>
                <form id="reset-form" onsubmit="App.handleResetPassword(event)">
                    <div class="form-group">
                        <label for="reset-token">Reset Token</label>
                        <input type="text" id="reset-token" class="form-control" value="${this.escapeHtml(token)}" placeholder="Enter token" required>
                    </div>
                    <div class="form-group">
                        <label for="reset-pwd">New Password (min 8 chars)</label>
                        <input type="password" id="reset-pwd" class="form-control" placeholder="••••••••" required minlength="8">
                    </div>
                    <div class="form-group">
                        <label for="reset-pwd-conf">Confirm New Password</label>
                        <input type="password" id="reset-pwd-conf" class="form-control" placeholder="••••••••" required minlength="8">
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="reset-submit-btn">Reset Password</button>
                </form>
                <div style="text-align:center; margin-top:1.5rem; font-size:0.9rem; color:var(--text-muted);">
                    <a href="#login" style="color:var(--primary); font-weight:600;">Back to Login</a>
                </div>
            </div>
        `;
    },

    async handleResetPassword(e) {
        e.preventDefault();
        const alertBox = document.getElementById('reset-alert');
        const submitBtn = document.getElementById('reset-submit-btn');

        const token = document.getElementById('reset-token').value;
        const pwd = document.getElementById('reset-pwd').value;
        const conf = document.getElementById('reset-pwd-conf').value;

        submitBtn.disabled = true;
        submitBtn.innerText = 'Updating password...';
        alertBox.innerHTML = '';

        try {
            const res = await Auth.resetPassword(token, pwd, conf);
            alertBox.innerHTML = `<div class="alert alert-success">${res.message || 'Password reset successfully! Redirecting...'}</div>`;
            setTimeout(() => {
                window.location.hash = '#login';
            }, 1800);
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Reset Password';
        }
    },

    renderProfile(container) {
        const user = Auth.getUser();
        if (!user) return;

        container.innerHTML = `
            <div style="max-width:800px; margin:0 auto;">
                <div class="card" style="margin-bottom:1.5rem;">
                    <h2>User Profile</h2>
                    <p style="margin-top:4px;">Account details and security preferences</p>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:1rem; font-size:0.95rem;">
                        <div><strong>Email:</strong> ${this.escapeHtml(user.email)}</div>
                        <div><strong>Role:</strong> ${this.formatRoleBadge(user.role_code)}</div>
                        <div><strong>Account Status:</strong> <span class="status-badge status-${user.account_status}">${user.account_status}</span></div>
                        <div><strong>Last Login:</strong> ${user.last_login_at || 'Never'}</div>
                    </div>
                </div>

                <div class="card">
                    <h3>Change Password</h3>
                    <div id="change-pwd-alert"></div>
                    <form onsubmit="App.handleChangePassword(event)" style="margin-top:1rem;">
                        <div class="form-group">
                            <label for="cur-pwd">Current Password</label>
                            <input type="password" id="cur-pwd" class="form-control" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="new-pwd">New Password</label>
                                <input type="password" id="new-pwd" class="form-control" required minlength="8">
                            </div>
                            <div class="form-group">
                                <label for="new-pwd-conf">Confirm New Password</label>
                                <input type="password" id="new-pwd-conf" class="form-control" required minlength="8">
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">Update Password</button>
                    </form>
                </div>
            </div>
        `;
    },

    async handleChangePassword(e) {
        e.preventDefault();
        const alertBox = document.getElementById('change-pwd-alert');
        const cur = document.getElementById('cur-pwd').value;
        const newP = document.getElementById('new-pwd').value;
        const conf = document.getElementById('new-pwd-conf').value;

        alertBox.innerHTML = '';
        try {
            const res = await Auth.changePassword(cur, newP, conf);
            alertBox.innerHTML = `<div class="alert alert-success">${res.message}</div>`;
            document.getElementById('cur-pwd').value = '';
            document.getElementById('new-pwd').value = '';
            document.getElementById('new-pwd-conf').value = '';
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        }
    },

    // --- ROLE DASHBOARDS ---

    renderParentDashboard(container) {
        const user = Auth.getUser();
        container.innerHTML = `
            <div>
                <h2>Welcome, ${this.escapeHtml(user.profile?.full_name || 'Parent')} 👋</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Home learning facilitator dashboard — Ugandan Syllabus (P1–P7)</p>

                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Learners <span>🎒</span></h3>
                        <p>Register and manage your home learners, class assignments, and subjects.</p>
                        <button class="btn btn-primary btn-sm" onclick="alert('Module 02: Learner registration & management')">Manage Learners</button>
                    </div>
                    <div class="card">
                        <h3>Parental Guides <span>📖</span></h3>
                        <p>View step-by-step teaching guides, weekly lesson plans, and teaching tips.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 05: Parental guides & scheduling')">View Guides</button>
                    </div>
                    <div class="card">
                        <h3>Assessments & Scores <span>📝</span></h3>
                        <p>Track online/offline assessment results, objective scoring, and teacher remarks.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 06: Assessments & scoring')">View Scores</button>
                    </div>
                    <div class="card">
                        <h3>Offline & Sync <span>🔄</span></h3>
                        <p>Inspect downloaded lessons and status of queued offline progress events.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 07: Offline PWA & Sync')">Sync Status</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderLearnerDashboard(container) {
        const user = Auth.getUser();
        container.innerHTML = `
            <div>
                <h2>Hello, ${this.escapeHtml(user.profile?.first_name || 'Learner')}! 🌟</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Your personalized learning pathway (P1–P7)</p>

                <div class="dashboard-grid">
                    <div class="card">
                        <h3>My Subjects <span>📚</span></h3>
                        <p>English, Mathematics, Science, Social Studies, and Local Language.</p>
                        <button class="btn btn-primary btn-sm" onclick="alert('Module 03: Curriculum')">Explore Subjects</button>
                    </div>
                    <div class="card">
                        <h3>Continue Lesson <span>▶️</span></h3>
                        <p>Pick up right where you left off in your latest lesson activity.</p>
                        <button class="btn btn-primary btn-sm" onclick="alert('Module 04: Learning materials')">Resume Learning</button>
                    </div>
                    <div class="card">
                        <h3>Take Assessment <span>✍️</span></h3>
                        <p>Test your knowledge online or offline and view instant scoring.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 06: Assessments')">My Quizzes</button>
                    </div>
                    <div class="card">
                        <h3>Offline Downloads <span>📥</span></h3>
                        <p>Access cached lessons, reading guides, and audios without internet.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 07: Offline cache')">Saved Lessons</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderTeacherDashboard(container) {
        const user = Auth.getUser();
        container.innerHTML = `
            <div>
                <h2>Teacher Dashboard 👩‍🏫</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Supporting teacher oversight, assessments marking, and learner feedback</p>
                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Assigned Learners <span>👥</span></h3>
                        <p>View home learners assigned to your subject specialty and class levels.</p>
                        <button class="btn btn-primary btn-sm" onclick="alert('Module 02: Learner tracking')">View Learners</button>
                    </div>
                    <div class="card">
                        <h3>Assessment Review <span>✅</span></h3>
                        <p>Review subjective assessment answers, submit manual scores and feedback.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 06: Manual scoring')">Review Submissions</button>
                    </div>
                    <div class="card">
                        <h3>Class Progress <span>📊</span></h3>
                        <p>Monitor completion statistics, average scores, and struggling learners.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 08: Dashboards')">Progress Summary</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderOfficerDashboard(container) {
        const user = Auth.getUser();
        container.innerHTML = `
            <div>
                <h2>Curriculum Officer Portal 🏛️</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Uganda National Curriculum Development Center (NCDC / MoES) Oversight</p>
                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Curriculum Management <span>📋</span></h3>
                        <p>Configure classes P1–P7, subjects, curriculum terms, and standard competencies.</p>
                        <button class="btn btn-primary btn-sm" onclick="alert('Module 03: Curriculum')">Curriculum Setup</button>
                    </div>
                    <div class="card">
                        <h3>Learning Materials Review <span>📁</span></h3>
                        <p>Approve, version, and publish educational notes, worksheets, and media.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 04: Materials approval')">Review Materials</button>
                    </div>
                    <div class="card">
                        <h3>National Compliance <span>📈</span></h3>
                        <p>Inspect national and district coverage compliance against expected thresholds.</p>
                        <button class="btn btn-secondary btn-sm" onclick="alert('Module 09: Compliance reporting')">Compliance Reports</button>
                    </div>
                </div>
            </div>
        `;
    },

    async renderAdminDashboard(container) {
        container.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                        <h2>Technical Administration</h2>
                        <p style="color:var(--text-muted);">System health, user accounts, and audit monitoring</p>
                    </div>
                    <button class="btn btn-primary" onclick="App.openCreateUserModal()">+ Create User Account</button>
                </div>

                <div id="admin-user-alert" style="margin-top:1.2rem;"></div>

                <div class="table-container">
                    <div style="padding:1rem; display:flex; justify-content:space-between; align-items:center; gap:12px; border-bottom:1px solid var(--border-color);">
                        <h3 style="font-size:1.1rem;">System Users</h3>
                        <div style="display:flex; gap:8px;">
                            <select id="user-role-filter" class="form-control" style="width:auto; padding:0.4rem 0.8rem;" onchange="App.loadAdminUsers()">
                                <option value="">All Roles</option>
                                <option value="learner">Learners</option>
                                <option value="parent">Parents</option>
                                <option value="teacher">Teachers</option>
                                <option value="curriculum_officer">Officers</option>
                                <option value="administrator">Admins</option>
                            </select>
                        </div>
                    </div>
                    <div id="admin-users-table-box">
                        <p style="padding:1.5rem; text-align:center; color:var(--text-muted);">Loading system users...</p>
                    </div>
                </div>
            </div>

            <!-- Create User Modal -->
            <div id="create-user-modal" class="modal-overlay">
                <div class="modal-box">
                    <div class="modal-header">
                        <h3>Create User Account</h3>
                        <button class="close-btn" onclick="App.closeCreateUserModal()">&times;</button>
                    </div>
                    <div id="create-user-alert"></div>
                    <form onsubmit="App.handleCreateUser(event)">
                        <div class="form-group">
                            <label>Account Role *</label>
                            <select id="new-user-role" class="form-control" required>
                                <option value="teacher">Teacher</option>
                                <option value="curriculum_officer">Curriculum Officer</option>
                                <option value="administrator">System Administrator</option>
                                <option value="parent">Parent</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Full Name *</label>
                            <input type="text" id="new-user-name" class="form-control" placeholder="e.g. John Mukasa" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Email Address *</label>
                                <input type="email" id="new-user-email" class="form-control" placeholder="mukasa@tmhis.org" required>
                            </div>
                            <div class="form-group">
                                <label>Phone *</label>
                                <input type="tel" id="new-user-phone" class="form-control" placeholder="+256 700 000000" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Initial Temporary Password *</label>
                            <input type="password" id="new-user-pwd" class="form-control" placeholder="••••••••" required minlength="8">
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:1.2rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeCreateUserModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-save-user">Create User</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.loadAdminUsers();
    },

    async loadAdminUsers() {
        const tableBox = document.getElementById('admin-users-table-box');
        if (!tableBox) return;

        const roleFilter = document.getElementById('user-role-filter')?.value || '';
        const url = roleFilter ? `/api/admin/users?role=${roleFilter}` : '/api/admin/users';

        try {
            const res = await API.get(url);
            const users = res.data.users || [];

            if (users.length === 0) {
                tableBox.innerHTML = `<p style="padding:1.5rem; text-align:center; color:var(--text-muted);">No users found.</p>`;
                return;
            }

            tableBox.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Email / Username</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td>#${u.user_id}</td>
                                <td>
                                    <strong>${this.escapeHtml(u.email)}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(u.username || '')}</div>
                                </td>
                                <td>${this.formatRoleBadge(u.role_code)}</td>
                                <td><span class="status-badge status-${u.account_status}">${u.account_status}</span></td>
                                <td>${u.last_login_at ? u.last_login_at : 'Never'}</td>
                                <td>
                                    ${u.role_code !== 'administrator' || u.user_id !== Auth.getUser()?.user_id ? `
                                        <select class="form-control" style="width:auto; padding:2px 6px; font-size:0.75rem;" onchange="App.changeUserStatus(${u.user_id}, this.value)">
                                            <option value="" disabled selected>Change Status</option>
                                            <option value="active" ${u.account_status === 'active' ? 'disabled' : ''}>Set Active</option>
                                            <option value="suspended" ${u.account_status === 'suspended' ? 'disabled' : ''}>Suspend</option>
                                            <option value="inactive" ${u.account_status === 'inactive' ? 'disabled' : ''}>Deactivate</option>
                                        </select>
                                    ` : '<span style="font-size:0.75rem; color:var(--text-muted);">Current User</span>'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            tableBox.innerHTML = `<div class="alert alert-danger" style="margin:1rem;">${this.escapeHtml(err.message)}</div>`;
        }
    },

    async changeUserStatus(userId, newStatus) {
        if (!confirm(`Are you sure you want to change user #${userId} status to ${newStatus}?`)) {
            this.loadAdminUsers();
            return;
        }

        try {
            await API.patch(`/api/admin/users/${userId}/status`, { status: newStatus });
            this.loadAdminUsers();
        } catch (err) {
            alert('Status update failed: ' + err.message);
            this.loadAdminUsers();
        }
    },

    openCreateUserModal() {
        document.getElementById('create-user-modal')?.classList.add('active');
    },

    closeCreateUserModal() {
        document.getElementById('create-user-modal')?.classList.remove('active');
    },

    async handleCreateUser(e) {
        e.preventDefault();
        const alertBox = document.getElementById('create-user-alert');
        const submitBtn = document.getElementById('btn-save-user');

        const payload = {
            role_code: document.getElementById('new-user-role').value,
            full_name: document.getElementById('new-user-name').value,
            email: document.getElementById('new-user-email').value,
            phone: document.getElementById('new-user-phone').value,
            password: document.getElementById('new-user-pwd').value
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating...';
        alertBox.innerHTML = '';

        try {
            await API.post('/api/admin/users', payload);
            this.closeCreateUserModal();
            this.loadAdminUsers();
            alert('User account created successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create User';
        }
    },

    renderGenericDashboard(container, hash) {
        container.innerHTML = `
            <div class="card">
                <h2>Dashboard Section</h2>
                <p>Path: <code>${this.escapeHtml(hash)}</code></p>
                <div class="alert alert-warning" style="margin-top:1rem;">
                    This module section will be populated in subsequent sprints per the Master Development Plan.
                </div>
            </div>
        `;
    }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
