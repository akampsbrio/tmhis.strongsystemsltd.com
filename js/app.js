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
        if (Auth.isAuthenticated()) {
            Auth.refreshProfile().then(() => this.renderHeader());
        }
        window.addEventListener('hashchange', () => this.route());
        window.addEventListener('click', (e) => {
            const menuWrapper = document.getElementById('user-menu-wrapper');
            if (menuWrapper && !menuWrapper.contains(e.target)) {
                menuWrapper.classList.remove('open');
            }
        });
        this.route();
    },

    renderHeader() {
        const headerActions = document.getElementById('header-actions');
        if (!headerActions) return;

        const user = Auth.getUser();
        if (user && Auth.isAuthenticated()) {
            const displayName = user.full_name || user.profile?.full_name || user.profile?.first_name || user.username || user.email;
            const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563eb&color=fff&rounded=true&bold=true`;
            const defaultDash = this.getDefaultDashboard();

            headerActions.innerHTML = `
                <div class="user-menu-wrapper" id="user-menu-wrapper">
                    <button class="user-menu-btn" onclick="App.toggleUserDropdown(event)" title="${this.escapeHtml(displayName)} (${user.role_code})" type="button">
                        <img src="${this.escapeHtml(avatarUrl)}" alt="Avatar" class="user-avatar-img" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563eb&color=fff&rounded=true'">
                        <span class="user-menu-chevron">▼</span>
                    </button>

                    <div class="user-dropdown-menu" id="user-dropdown-menu">
                        <div class="dropdown-header">
                            <div class="dropdown-user-name">${this.escapeHtml(displayName)}</div>
                            <div class="dropdown-user-email">${this.escapeHtml(user.email)}</div>
                            <div class="dropdown-user-role">${this.formatRoleBadge(user.role_code)}</div>
                        </div>
                        <div class="dropdown-body">
                            <a href="${defaultDash}" class="dropdown-item" onclick="App.closeUserDropdown()">
                                <span>📊</span> My Dashboard
                            </a>
                            <a href="#profile" class="dropdown-item" onclick="App.closeUserDropdown()">
                                <span>👤</span> Profile & Password
                            </a>
                            ${user.role_code === 'administrator' ? `
                                <a href="#admin-users" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>👥</span> User Accounts
                                </a>
                                <a href="#admin-audit" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>🛡️</span> Security & Audit Log
                                </a>
                                <a href="#admin-system-health" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>🩺</span> System Health
                                </a>
                            ` : ''}
                            ${user.role_code === 'parent' ? `
                                <a href="#parent-learners" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>🎒</span> My Learners
                                </a>
                                <a href="#parent-guides" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📖</span> Parental Guides
                                </a>
                                <a href="#parent-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📝</span> Quizzes & Scores
                                </a>
                                <a href="#parent-sync" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>🔄</span> Offline Sync Status
                                </a>
                            ` : ''}
                            ${user.role_code === 'learner' ? `
                                <a href="#learner-subjects" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📚</span> My Subjects
                                </a>
                                <a href="#learner-lessons" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>▶️</span> Continue Lessons
                                </a>
                                <a href="#learner-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>✍️</span> Assessments
                                </a>
                                <a href="#learner-downloads" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📥</span> Saved Offline Lessons
                                </a>
                            ` : ''}
                            ${user.role_code === 'teacher' ? `
                                <a href="#teacher-learners" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>👥</span> Assigned Learners
                                </a>
                                <a href="#teacher-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>✅</span> Review & Grading
                                </a>
                                <a href="#teacher-class-summary" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📈</span> Class Progress
                                </a>
                            ` : ''}
                            ${user.role_code === 'curriculum_officer' ? `
                                <a href="#officer-classes" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📋</span> Curriculum Setup
                                </a>
                                <a href="#officer-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Learning Materials
                                </a>
                                <a href="#officer-compliance" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📊</span> Compliance Reports
                                </a>
                            ` : ''}
                            <div class="dropdown-divider"></div>
                            <a href="/docs/" target="_blank" class="dropdown-item" onclick="App.closeUserDropdown()">
                                <span>📖</span> System Documentation
                            </a>
                            <div class="dropdown-divider"></div>
                            <a href="javascript:void(0)" class="dropdown-item text-danger" onclick="Auth.logout()">
                                <span>🚪</span> Sign Out
                            </a>
                        </div>
                    </div>
                </div>
            `;
        } else {
            headerActions.innerHTML = `
                <a href="#login" class="btn btn-secondary btn-sm">Login</a>
                <a href="#register" class="btn btn-primary btn-sm">Register Parent</a>
            `;
        }
    },

    toggleUserDropdown(e) {
        if (e) e.stopPropagation();
        const wrapper = document.getElementById('user-menu-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('open');
        }
    },

    closeUserDropdown() {
        const wrapper = document.getElementById('user-menu-wrapper');
        if (wrapper) {
            wrapper.classList.remove('open');
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
        } else if (currentHash === '#admin-users') {
            this.renderAdminUsers(content);
        } else if (currentHash === '#parent-dashboard') {
            this.renderParentDashboard(content);
        } else if (currentHash === '#parent-learners') {
            this.renderParentLearners(content);
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

        const displayName = user.full_name || user.profile?.full_name || user.profile?.first_name || user.username || user.email;
        const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563eb&color=fff&rounded=true&bold=true`;

        container.innerHTML = `
            <div style="max-width:800px; margin:0 auto;">
                <!-- Profile Header Card -->
                <div class="card" style="margin-bottom:1.5rem; display:flex; gap:1.5rem; align-items:center; flex-wrap:wrap;">
                    <div style="position:relative;">
                        <img id="profile-display-avatar" src="${this.escapeHtml(avatarUrl)}" alt="Profile Photo" style="width:85px; height:85px; border-radius:50%; border:3px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,0.15); object-fit:cover;">
                    </div>
                    <div style="flex:1;">
                        <h2>${this.escapeHtml(displayName)}</h2>
                        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
                            ${this.formatRoleBadge(user.role_code)}
                            <span class="status-badge status-${user.account_status || 'active'}">${user.account_status || 'active'}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; margin-top:0.8rem; font-size:0.9rem; color:var(--text-muted);">
                            <div><strong>Full Name:</strong> ${this.escapeHtml(displayName)}</div>
                            <div><strong>Email:</strong> ${this.escapeHtml(user.email)}</div>
                            <div><strong>Username:</strong> ${this.escapeHtml(user.username || '—')}</div>
                            ${user.profile?.phone ? `<div><strong>Phone:</strong> ${this.escapeHtml(user.profile.phone)}</div>` : ''}
                            ${user.profile?.district ? `<div><strong>District:</strong> ${this.escapeHtml(user.profile.district)}</div>` : ''}
                            <div><strong>Last Login:</strong> ${user.last_login_at || 'Never'}</div>
                        </div>
                    </div>
                </div>

                <!-- Edit Personal Details Card -->
                <div class="card" style="margin-bottom:1.5rem;">
                    <h3>Edit Personal Information</h3>
                    <p style="color:var(--text-muted); font-size:0.88rem; margin-top:4px;">Update your full name and contact information</p>
                    <div id="profile-update-alert" style="margin-top:1rem;"></div>

                    <form onsubmit="App.handleUpdateProfile(event)" style="margin-top:1rem;">
                        <div class="form-group">
                            <label for="profile-full-name">Full Name *</label>
                            <input type="text" id="profile-full-name" class="form-control" value="${this.escapeHtml(user.full_name || user.profile?.full_name || '')}" placeholder="Enter your real full name" required>
                        </div>
                        ${user.role_code === 'parent' ? `
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="profile-phone">Phone Number</label>
                                    <input type="tel" id="profile-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}" placeholder="+256 700 000000">
                                </div>
                                <div class="form-group">
                                    <label for="profile-district">District</label>
                                    <input type="text" id="profile-district" class="form-control" value="${this.escapeHtml(user.profile?.district || '')}" placeholder="e.g. Kampala">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="profile-address">Physical Address</label>
                                <input type="text" id="profile-address" class="form-control" value="${this.escapeHtml(user.profile?.physical_address || '')}" placeholder="e.g. Ntinda, Kampala">
                            </div>
                        ` : ''}
                        ${user.role_code === 'teacher' ? `
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="profile-phone">Phone Number</label>
                                    <input type="tel" id="profile-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}" placeholder="+256 700 000000">
                                </div>
                                <div class="form-group">
                                    <label for="profile-specialty">Subject Specialty</label>
                                    <input type="text" id="profile-specialty" class="form-control" value="${this.escapeHtml(user.profile?.subject_specialty || '')}" placeholder="e.g. Mathematics, Science">
                                </div>
                            </div>
                        ` : ''}
                        ${user.role_code === 'curriculum_officer' ? `
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="profile-phone">Phone Number</label>
                                    <input type="tel" id="profile-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}" placeholder="+256 700 000000">
                                </div>
                                <div class="form-group">
                                    <label for="profile-dept">Department</label>
                                    <input type="text" id="profile-dept" class="form-control" value="${this.escapeHtml(user.profile?.department || '')}" placeholder="e.g. Primary Education">
                                </div>
                            </div>
                        ` : ''}
                        <button type="submit" class="btn btn-primary" id="btn-save-profile">Save Personal Details</button>
                    </form>
                </div>

                <!-- Update Photo Card -->
                <div class="card" style="margin-bottom:1.5rem;">
                    <h3>Update Profile Photo</h3>
                    <p style="color:var(--text-muted); font-size:0.88rem; margin-top:4px;">Upload an image from your device or provide an image URL</p>
                    <div id="avatar-update-alert" style="margin-top:1rem;"></div>

                    <form onsubmit="App.handleUpdateAvatar(event)" style="margin-top:1rem;">
                        <div class="form-group">
                            <label for="avatar-file">Upload Image File (JPG, PNG, WEBP, GIF — Max 4MB)</label>
                            <input type="file" id="avatar-file" class="form-control" accept="image/*" onchange="App.previewAvatarFile(event)">
                        </div>

                        <div style="display:flex; align-items:center; margin:1rem 0; gap:12px;">
                            <div style="flex:1; height:1px; background:var(--border-color);"></div>
                            <span style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">OR ENTER URL</span>
                            <div style="flex:1; height:1px; background:var(--border-color);"></div>
                        </div>

                        <div class="form-group">
                            <label for="avatar-url-input">Image URL</label>
                            <input type="url" id="avatar-url-input" class="form-control" placeholder="https://example.com/my-photo.jpg" oninput="App.previewAvatarUrl(this.value)">
                        </div>

                        <button type="submit" class="btn btn-primary" id="btn-save-avatar">Save Profile Photo</button>
                    </form>
                </div>

                <!-- Change Password Card -->
                <div class="card">
                    <h3>Security & Change Password</h3>
                    <div id="change-pwd-alert"></div>
                    <form onsubmit="App.handleChangePassword(event)" style="margin-top:1rem;">
                        <div class="form-group">
                            <label for="cur-pwd">Current Password</label>
                            <input type="password" id="cur-pwd" class="form-control" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="new-pwd">New Password (min 8 chars)</label>
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

    previewAvatarFile(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.getElementById('profile-display-avatar');
                if (img) img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    previewAvatarUrl(url) {
        if (url && url.startsWith('http')) {
            const img = document.getElementById('profile-display-avatar');
            if (img) img.src = url;
        }
    },

    async handleUpdateProfile(e) {
        e.preventDefault();
        const alertBox = document.getElementById('profile-update-alert');
        const submitBtn = document.getElementById('btn-save-profile');
        
        const payload = {
            full_name: document.getElementById('profile-full-name').value.trim(),
            phone: document.getElementById('profile-phone')?.value.trim() || null,
            district: document.getElementById('profile-district')?.value.trim() || null,
            physical_address: document.getElementById('profile-address')?.value.trim() || null,
            subject_specialty: document.getElementById('profile-specialty')?.value.trim() || null,
            department: document.getElementById('profile-dept')?.value.trim() || null,
        };

        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';

        try {
            const res = await API.post('/api/auth/update-profile', payload);
            if (res.data?.user) {
                Auth.setUser(res.data.user);
            }
            App.renderHeader();
            alertBox.innerHTML = `<div class="alert alert-success">${res.message || 'Profile updated successfully!'}</div>`;
            setTimeout(() => {
                const content = document.getElementById('app-content');
                if (content && window.location.hash === '#profile') {
                    App.renderProfile(content);
                }
            }, 800);
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Personal Details';
        }
    },

    async handleUpdateAvatar(e) {
        e.preventDefault();
        const alertBox = document.getElementById('avatar-update-alert');
        const submitBtn = document.getElementById('btn-save-avatar');
        const fileInput = document.getElementById('avatar-file');
        const urlInput = document.getElementById('avatar-url-input');

        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving photo...';

        try {
            let res;
            if (fileInput.files.length > 0) {
                const formData = new FormData();
                formData.append('avatar_file', fileInput.files[0]);
                res = await API.upload('/api/auth/update-avatar', formData);
            } else if (urlInput.value.trim() !== '') {
                res = await API.post('/api/auth/update-avatar', {
                    avatar_url: urlInput.value.trim()
                });
            } else {
                throw new Error('Please select an image file or provide a valid image URL.');
            }

            // Update user in local storage
            const currentUser = Auth.getUser();
            if (currentUser && res.data?.avatar_url) {
                currentUser.avatar_url = res.data.avatar_url;
                Auth.setUser(currentUser);
            }

            // Re-render header immediately to show new avatar
            App.renderHeader();

            alertBox.innerHTML = `<div class="alert alert-success">${res.message || 'Profile photo updated successfully!'}</div>`;
            if (fileInput) fileInput.value = '';
            if (urlInput) urlInput.value = '';
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Profile Photo';
        }
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
        const displayName = user.full_name || user.profile?.full_name || 'Parent';
        container.innerHTML = `
            <div>
                <h2>Welcome, ${this.escapeHtml(displayName)} 👋</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Home learning facilitator dashboard — Ugandan Syllabus (P1–P7)</p>

                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Learners <span>🎒</span></h3>
                        <p>Register and manage your home learners, class assignments, and subjects.</p>
                        <a href="#parent-learners" class="btn btn-primary btn-sm">Manage Learners</a>
                    </div>
                    <div class="card">
                        <h3>Parental Guides <span>📖</span></h3>
                        <p>View step-by-step teaching guides, weekly lesson plans, and teaching tips.</p>
                        <a href="#parent-guides" class="btn btn-secondary btn-sm">View Guides</a>
                    </div>
                    <div class="card">
                        <h3>Assessments & Scores <span>📝</span></h3>
                        <p>Track online/offline assessment results, objective scoring, and teacher remarks.</p>
                        <a href="#parent-assessments" class="btn btn-secondary btn-sm">View Scores</a>
                    </div>
                    <div class="card">
                        <h3>Offline & Sync <span>🔄</span></h3>
                        <p>Inspect downloaded lessons and status of queued offline progress events.</p>
                        <a href="#parent-sync" class="btn btn-secondary btn-sm">Sync Status</a>
                    </div>
                </div>
            </div>
        `;
    },

    renderLearnerDashboard(container) {
        const user = Auth.getUser();
        const displayName = user.full_name || user.profile?.full_name || user.profile?.first_name || 'Learner';
        container.innerHTML = `
            <div>
                <h2>Hello, ${this.escapeHtml(displayName)}! 🌟</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Your personalized learning pathway (P1–P7)</p>

                <div class="dashboard-grid">
                    <div class="card">
                        <h3>My Subjects <span>📚</span></h3>
                        <p>English, Mathematics, Science, Social Studies, and Local Language.</p>
                        <a href="#learner-subjects" class="btn btn-primary btn-sm">Explore Subjects</a>
                    </div>
                    <div class="card">
                        <h3>Continue Lesson <span>▶️</span></h3>
                        <p>Pick up right where you left off in your latest lesson activity.</p>
                        <a href="#learner-lessons" class="btn btn-primary btn-sm">Resume Learning</a>
                    </div>
                    <div class="card">
                        <h3>Take Assessment <span>✍️</span></h3>
                        <p>Test your knowledge online or offline and view instant scoring.</p>
                        <a href="#learner-assessments" class="btn btn-secondary btn-sm">My Quizzes</a>
                    </div>
                    <div class="card">
                        <h3>Offline Downloads <span>📥</span></h3>
                        <p>Access cached lessons, reading guides, and audios without internet.</p>
                        <a href="#learner-downloads" class="btn btn-secondary btn-sm">Saved Lessons</a>
                    </div>
                </div>
            </div>
        `;
    },

    renderTeacherDashboard(container) {
        const user = Auth.getUser();
        const displayName = user.full_name || user.profile?.full_name || 'Teacher';
        container.innerHTML = `
            <div>
                <h2>Welcome, ${this.escapeHtml(displayName)} 👩‍🏫</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Supporting teacher oversight, assessments marking, and learner feedback</p>
                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Assigned Learners <span>👥</span></h3>
                        <p>View home learners assigned to your subject specialty and class levels.</p>
                        <a href="#teacher-learners" class="btn btn-primary btn-sm">View Learners</a>
                    </div>
                    <div class="card">
                        <h3>Assessment Review <span>✅</span></h3>
                        <p>Review subjective assessment answers, submit manual scores and feedback.</p>
                        <a href="#teacher-assessments" class="btn btn-secondary btn-sm">Review Submissions</a>
                    </div>
                    <div class="card">
                        <h3>Class Progress <span>📊</span></h3>
                        <p>Monitor completion statistics, average scores, and struggling learners.</p>
                        <a href="#teacher-class-summary" class="btn btn-secondary btn-sm">Progress Summary</a>
                    </div>
                </div>
            </div>
        `;
    },

    renderOfficerDashboard(container) {
        const user = Auth.getUser();
        const displayName = user.full_name || user.profile?.full_name || 'Curriculum Officer';
        container.innerHTML = `
            <div>
                <h2>Welcome, ${this.escapeHtml(displayName)} 🏛️</h2>
                <p style="color:var(--text-muted); margin-top:4px;">Uganda National Curriculum Development Center (NCDC / MoES) Oversight</p>
                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Curriculum Management <span>📋</span></h3>
                        <p>Configure classes P1–P7, subjects, curriculum terms, and standard competencies.</p>
                        <a href="#officer-classes" class="btn btn-primary btn-sm">Curriculum Setup</a>
                    </div>
                    <div class="card">
                        <h3>Learning Materials Review <span>📁</span></h3>
                        <p>Approve, version, and publish educational notes, worksheets, and media.</p>
                        <a href="#officer-materials" class="btn btn-secondary btn-sm">Review Materials</a>
                    </div>
                    <div class="card">
                        <h3>National Compliance <span>📈</span></h3>
                        <p>Inspect national and district coverage compliance against expected thresholds.</p>
                        <a href="#officer-compliance" class="btn btn-secondary btn-sm">Compliance Reports</a>
                    </div>
                </div>
            </div>
        `;
    },

    async renderAdminDashboard(container) {
        const user = Auth.getUser();
        const displayName = user.full_name || user.profile?.full_name || 'Administrator';
        container.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                        <h2>Technical Administration — ${this.escapeHtml(displayName)}</h2>
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

            <!-- Edit User Modal -->
            <div id="edit-user-modal" class="modal-overlay">
                <div class="modal-box" style="max-width:560px;">
                    <div class="modal-header">
                        <h3 id="edit-user-modal-title">Edit User Account</h3>
                        <button class="close-btn" onclick="App.closeEditUserModal()">&times;</button>
                    </div>
                    <div id="edit-user-alert"></div>
                    <form onsubmit="App.handleSaveEditUser(event)" id="edit-user-form">
                        <input type="hidden" id="edit-user-id">
                        <input type="hidden" id="edit-user-role-code">

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-user-fullname">Full Name *</label>
                                <input type="text" id="edit-user-fullname" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-user-status">Account Status</label>
                                <select id="edit-user-status" class="form-control">
                                    <option value="active">Active</option>
                                    <option value="suspended">Suspended</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-user-email">Email Address *</label>
                                <input type="email" id="edit-user-email" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-user-username">Username</label>
                                <input type="text" id="edit-user-username" class="form-control">
                            </div>
                        </div>

                        <div id="edit-user-role-fields"></div>

                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:1.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditUserModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-update-user">Save User Changes</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Reset User Password Modal -->
            <div id="reset-password-modal" class="modal-overlay">
                <div class="modal-box">
                    <div class="modal-header">
                        <h3>Reset User Password</h3>
                        <button class="close-btn" onclick="App.closeResetPasswordModal()">&times;</button>
                    </div>
                    <div id="admin-reset-pwd-alert"></div>
                    <form onsubmit="App.handleAdminResetPassword(event)">
                        <input type="hidden" id="admin-reset-user-id">

                        <p style="font-size:0.92rem; color:var(--text); margin-bottom:1rem;">
                            Set a new password for <strong id="admin-reset-user-name">—</strong> (<span id="admin-reset-user-email">—</span>).
                        </p>

                        <div class="form-group">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label for="admin-new-password" style="margin:0;">New Password (min 8 chars) *</label>
                                <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="App.generateRandomPassword()">🎲 Generate Random</button>
                            </div>
                            <input type="text" id="admin-new-password" class="form-control" placeholder="Enter new password" required minlength="8">
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:1.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeResetPasswordModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-submit-reset-pwd">Confirm Password Reset</button>
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
                            <th>Full Name / User Details</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th>Administrative Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => {
                            const uDisplayName = u.full_name || u.username || u.email;
                            const uAvatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(uDisplayName)}&background=2563eb&color=fff&rounded=true`;
                            const isLocked = u.locked_until && new Date(u.locked_until) > new Date();

                            return `
                            <tr>
                                <td>#${u.user_id}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <img src="${this.escapeHtml(uAvatar)}" alt="Avatar" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid #e2e8f0;">
                                        <div>
                                            <strong style="color:var(--text);">${this.escapeHtml(uDisplayName)}</strong>
                                            <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(u.email)} ${u.username ? `(${this.escapeHtml(u.username)})` : ''}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>${this.formatRoleBadge(u.role_code)}</td>
                                <td>
                                    <span class="status-badge status-${u.account_status}">${u.account_status}</span>
                                    ${isLocked ? `<div style="font-size:0.7rem; color:#dc2626; font-weight:bold; margin-top:2px;">🔒 Locked</div>` : ''}
                                </td>
                                <td>${u.last_login_at ? u.last_login_at : 'Never'}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                        <button class="btn btn-secondary btn-sm" style="padding:3px 7px; font-size:0.75rem;" onclick="App.openEditUserModal(${u.user_id})" title="Edit user details">
                                            ✏️ Edit
                                        </button>
                                        <button class="btn btn-secondary btn-sm" style="padding:3px 7px; font-size:0.75rem;" onclick="App.openResetPasswordModal(${u.user_id}, '${this.escapeHtml(u.email)}', '${this.escapeHtml(uDisplayName)}')" title="Reset user password">
                                            🔑 Password
                                        </button>
                                        ${isLocked ? `
                                            <button class="btn btn-warning btn-sm" style="padding:3px 7px; font-size:0.75rem; background:#f59e0b; color:#fff;" onclick="App.unlockUserAccount(${u.user_id})" title="Unlock account">
                                                🔓 Unlock
                                            </button>
                                        ` : ''}
                                        ${u.role_code !== 'administrator' || u.user_id !== Auth.getUser()?.user_id ? `
                                            <select class="form-control" style="width:auto; padding:2px 6px; font-size:0.75rem;" onchange="App.changeUserStatus(${u.user_id}, this.value)">
                                                <option value="" disabled selected>Status</option>
                                                <option value="active" ${u.account_status === 'active' ? 'disabled' : ''}>Active</option>
                                                <option value="suspended" ${u.account_status === 'suspended' ? 'disabled' : ''}>Suspend</option>
                                                <option value="inactive" ${u.account_status === 'inactive' ? 'disabled' : ''}>Deactivate</option>
                                            </select>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            tableBox.innerHTML = `<div class="alert alert-danger" style="margin:1rem;">${this.escapeHtml(err.message)}</div>`;
        }
    },

    async openEditUserModal(userId) {
        const modal = document.getElementById('edit-user-modal');
        const alertBox = document.getElementById('edit-user-alert');
        const roleFieldsBox = document.getElementById('edit-user-role-fields');
        if (!modal) return;

        alertBox.innerHTML = '';
        modal.classList.add('active');

        try {
            const res = await API.get(`/api/admin/users/${userId}`);
            const user = res.data;

            document.getElementById('edit-user-modal-title').innerText = `Edit User #${user.user_id} (${user.role_name || user.role_code})`;
            document.getElementById('edit-user-id').value = user.user_id;
            document.getElementById('edit-user-role-code').value = user.role_code;
            document.getElementById('edit-user-fullname').value = user.full_name || '';
            document.getElementById('edit-user-email').value = user.email || '';
            document.getElementById('edit-user-username').value = user.username || '';
            document.getElementById('edit-user-status').value = user.account_status || 'active';

            // Populate role profile fields
            let roleHtml = '';
            if (user.role_code === 'parent') {
                roleHtml = `
                    <div class="form-row">
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="edit-user-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label>District</label>
                            <input type="text" id="edit-user-district" class="form-control" value="${this.escapeHtml(user.profile?.district || '')}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Physical Address</label>
                        <input type="text" id="edit-user-address" class="form-control" value="${this.escapeHtml(user.profile?.physical_address || '')}">
                    </div>
                `;
            } else if (user.role_code === 'teacher') {
                roleHtml = `
                    <div class="form-row">
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="edit-user-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label>Subject Specialty</label>
                            <input type="text" id="edit-user-specialty" class="form-control" value="${this.escapeHtml(user.profile?.subject_specialty || '')}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Assigned School / Center</label>
                        <input type="text" id="edit-user-school" class="form-control" value="${this.escapeHtml(user.profile?.school || '')}">
                    </div>
                `;
            } else if (user.role_code === 'curriculum_officer') {
                roleHtml = `
                    <div class="form-row">
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="edit-user-phone" class="form-control" value="${this.escapeHtml(user.profile?.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label>Department</label>
                            <input type="text" id="edit-user-dept" class="form-control" value="${this.escapeHtml(user.profile?.department || '')}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Officer Role / Title</label>
                        <input type="text" id="edit-user-officer-role" class="form-control" value="${this.escapeHtml(user.profile?.officer_role || '')}">
                    </div>
                `;
            }
            roleFieldsBox.innerHTML = roleHtml;

        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        }
    },

    closeEditUserModal() {
        document.getElementById('edit-user-modal')?.classList.remove('active');
    },

    async handleSaveEditUser(e) {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const alertBox = document.getElementById('edit-user-alert');
        const submitBtn = document.getElementById('btn-update-user');

        const payload = {
            full_name: document.getElementById('edit-user-fullname').value.trim(),
            email: document.getElementById('edit-user-email').value.trim(),
            username: document.getElementById('edit-user-username')?.value.trim() || null,
            account_status: document.getElementById('edit-user-status')?.value || 'active',
            phone: document.getElementById('edit-user-phone')?.value.trim() || null,
            district: document.getElementById('edit-user-district')?.value.trim() || null,
            physical_address: document.getElementById('edit-user-address')?.value.trim() || null,
            subject_specialty: document.getElementById('edit-user-specialty')?.value.trim() || null,
            school: document.getElementById('edit-user-school')?.value.trim() || null,
            department: document.getElementById('edit-user-dept')?.value.trim() || null,
            officer_role: document.getElementById('edit-user-officer-role')?.value.trim() || null
        };

        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';

        try {
            const res = await API.put(`/api/admin/users/${userId}`, payload);
            this.closeEditUserModal();
            this.loadAdminUsers();
            alert(res.message || 'User updated successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save User Changes';
        }
    },

    openResetPasswordModal(userId, email, fullName) {
        const modal = document.getElementById('reset-password-modal');
        const alertBox = document.getElementById('admin-reset-pwd-alert');
        if (!modal) return;

        alertBox.innerHTML = '';
        document.getElementById('admin-reset-user-id').value = userId;
        document.getElementById('admin-reset-user-name').innerText = fullName;
        document.getElementById('admin-reset-user-email').innerText = email;
        document.getElementById('admin-new-password').value = '';

        modal.classList.add('active');
    },

    closeResetPasswordModal() {
        document.getElementById('reset-password-modal')?.classList.remove('active');
    },

    generateRandomPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
        let pwd = '';
        for (let i = 0; i < 12; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const input = document.getElementById('admin-new-password');
        if (input) input.value = pwd;
    },

    async handleAdminResetPassword(e) {
        e.preventDefault();
        const userId = document.getElementById('admin-reset-user-id').value;
        const newPassword = document.getElementById('admin-new-password').value;
        const alertBox = document.getElementById('admin-reset-pwd-alert');
        const submitBtn = document.getElementById('btn-submit-reset-pwd');

        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.innerText = 'Resetting...';

        try {
            const res = await API.post(`/api/admin/users/${userId}/reset-password`, {
                new_password: newPassword
            });
            this.closeResetPasswordModal();
            this.loadAdminUsers();
            alert(res.message || 'Password reset successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Confirm Password Reset';
        }
    },

    async unlockUserAccount(userId) {
        if (!confirm(`Are you sure you want to unlock account #${userId}?`)) return;

        try {
            const res = await API.post(`/api/admin/users/${userId}/unlock`, {});
            this.loadAdminUsers();
            alert(res.message || 'User account unlocked successfully.');
        } catch (err) {
            alert('Unlock failed: ' + err.message);
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

    // =========================================================================
    // MODULE 02: PARENT, FAMILY & LEARNER MANAGEMENT
    // =========================================================================

    cachedClasses: [],
    cachedLearners: [],

    async fetchClasses() {
        if (this.cachedClasses.length > 0) return this.cachedClasses;
        try {
            const res = await API.get('/api/parent/classes');
            this.cachedClasses = res.data || [];
            return this.cachedClasses;
        } catch (err) {
            console.error('Failed to fetch classes:', err);
            return [];
        }
    },

    renderParentLearners(container) {
        const user = Auth.getUser();
        container.innerHTML = `
            <div style="max-width:1150px; margin:0 auto;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:1.5rem;">
                    <div>
                        <h2>👨‍👩‍👧 My Home Learners</h2>
                        <p style="color:var(--text-muted); margin-top:4px;">Ugandan Primary Syllabus (P1–P7) • Child Registration, Class Allocation & Enrolled Subjects</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <a href="#parent-dashboard" class="btn btn-secondary btn-sm">← Back to Dashboard</a>
                        <button class="btn btn-primary" onclick="App.openRegisterLearnerModal()">➕ Register New Child</button>
                    </div>
                </div>

                <!-- Summary Stats Bar -->
                <div class="stats-summary-bar" id="learners-stats-bar">
                    <div class="summary-stat-box">
                        <div class="summary-stat-icon">🎒</div>
                        <div class="summary-stat-content">
                            <h4 id="stat-total-learners">0</h4>
                            <p>Enrolled Children</p>
                        </div>
                    </div>
                    <div class="summary-stat-box">
                        <div class="summary-stat-icon">📚</div>
                        <div class="summary-stat-content">
                            <h4 id="stat-active-classes">0</h4>
                            <p>Primary Levels</p>
                        </div>
                    </div>
                    <div class="summary-stat-box">
                        <div class="summary-stat-icon">⏱️</div>
                        <div class="summary-stat-content">
                            <h4 id="stat-total-subjects">0</h4>
                            <p>Active Subjects</p>
                        </div>
                    </div>
                    <div class="summary-stat-box">
                        <div class="summary-stat-icon">♿</div>
                        <div class="summary-stat-content">
                            <h4 id="stat-special-needs">0</h4>
                            <p>Accommodations</p>
                        </div>
                    </div>
                </div>

                <!-- Filters & Search Bar -->
                <div class="card" style="margin-bottom:1.5rem; padding:1rem 1.25rem;">
                    <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
                        <div style="flex:1; min-width:240px;">
                            <input type="text" id="learner-search-input" class="form-control" placeholder="🔍 Search child by name..." oninput="App.filterLearnersGrid()">
                        </div>
                        <div style="display:flex; gap:10px; flex-wrap:wrap;">
                            <select id="learner-class-filter" class="form-control" style="width:auto;" onchange="App.filterLearnersGrid()">
                                <option value="">All Classes (P1–P7)</option>
                                <option value="P1">Primary 1 (P1)</option>
                                <option value="P2">Primary 2 (P2)</option>
                                <option value="P3">Primary 3 (P3)</option>
                                <option value="P4">Primary 4 (P4)</option>
                                <option value="P5">Primary 5 (P5)</option>
                                <option value="P6">Primary 6 (P6)</option>
                                <option value="P7">Primary 7 (P7)</option>
                            </select>
                            <select id="learner-status-filter" class="form-control" style="width:auto;" onchange="App.filterLearnersGrid()">
                                <option value="active">Active Only</option>
                                <option value="all">All Statuses</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Learners Grid Container -->
                <div id="learners-grid-container">
                    <div class="card" style="text-align:center; padding:3rem 1rem;">
                        <p style="color:var(--text-muted); font-size:1.05rem;">Loading your registered learners...</p>
                    </div>
                </div>
            </div>

            <!-- 1. Register Child Modal -->
            <div id="register-learner-modal" class="modal-overlay">
                <div class="modal-box modal-box-lg">
                    <div class="modal-header">
                        <h3>🎒 Register New Child (P1–P7)</h3>
                        <button class="close-btn" onclick="App.closeRegisterLearnerModal()">&times;</button>
                    </div>
                    <div id="register-learner-alert"></div>
                    <form onsubmit="App.handleRegisterLearner(event)" id="register-learner-form">
                        <!-- Student Photo Picker & Preview -->
                        <div style="display:flex; align-items:center; gap:16px; margin-bottom:1.2rem; background:#f8fafc; padding:12px 16px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                            <div style="position:relative;">
                                <img id="reg-photo-preview" src="" alt="Child Preview" style="display:none; width:64px; height:64px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                                <div id="reg-photo-placeholder" class="learner-avatar-box" style="width:64px; height:64px; font-size:1.6rem;">
                                    👤
                                </div>
                            </div>
                            <div style="flex:1;">
                                <label style="font-weight:600; font-size:0.9rem; margin-bottom:4px; display:block;">Student Photo (Optional)</label>
                                <input type="file" id="reg-photo-file" accept="image/*" class="form-control" style="font-size:0.85rem; padding:0.35rem 0.6rem;" onchange="App.handleStudentPhotoPreview(this, 'reg')">
                                <small style="color:var(--text-muted); font-size:0.75rem;">JPG, PNG, WEBP, GIF (Max 4MB)</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex:2;">
                                <label for="reg-learner-name">Child Full Name *</label>
                                <input type="text" id="reg-learner-name" class="form-control" placeholder="e.g. Kato Brian Mukasa" required minlength="2">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label for="reg-learner-gender">Gender *</label>
                                <select id="reg-learner-gender" class="form-control" required>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="prefer_not_to_say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="reg-learner-dob">Date of Birth *</label>
                                <input type="date" id="reg-learner-dob" class="form-control" required onchange="App.onRegisterDobChange()">
                                <small id="reg-learner-age-calc" style="color:var(--primary); font-weight:600; display:block; margin-top:4px;"></small>
                            </div>
                            <div class="form-group">
                                <label for="reg-learner-class">Primary Class Level *</label>
                                <select id="reg-learner-class" class="form-control" required onchange="App.onRegisterDobChange()">
                                    <option value="">Select Primary Class...</option>
                                </select>
                            </div>
                        </div>

                        <div id="reg-age-advisory-box"></div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="reg-learner-re">Religious Education Track *</label>
                                <select id="reg-learner-re" class="form-control">
                                    <option value="cre">Christian Religious Education (CRE)</option>
                                    <option value="ire">Islamic Religious Education (IRE)</option>
                                    <option value="all">Include Both CRE & IRE</option>
                                </select>
                                <small style="color:var(--text-muted);">Syllabus subjects will be automatically allocated based on this selection.</small>
                            </div>
                        </div>

                        <!-- Special Learning Needs Section -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:1rem; margin-top:1rem;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
                                <input type="checkbox" id="reg-learner-special-needs" onchange="App.toggleSpecialNeedsDetails('reg')">
                                <span>Child requires Special Learning Needs Accommodations (e.g. extra time, high contrast, audio)</span>
                            </label>
                            <div id="reg-special-needs-container" style="display:none; margin-top:0.75rem;">
                                <label for="reg-learner-needs-desc">Accommodation Notes & Instructions</label>
                                <textarea id="reg-learner-needs-desc" class="form-control" rows="2" placeholder="Describe accommodations needed (e.g. 25% extra quiz time, audio guides, visual dyscalculia support)..."></textarea>
                            </div>
                        </div>

                        <!-- Optional Standalone Login Section -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:1rem; margin-top:1rem;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
                                <input type="checkbox" id="reg-create-login" onchange="App.toggleCreateLoginDetails('reg')">
                                <span>Create Standalone Student Login Account (Recommended for P4–P7 independent learners)</span>
                            </label>
                            <div id="reg-login-container" style="display:none; margin-top:0.75rem;">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="reg-student-username">Student Username *</label>
                                        <input type="text" id="reg-student-username" class="form-control" placeholder="e.g. brian_mukasa">
                                    </div>
                                    <div class="form-group">
                                        <label for="reg-student-password">Student Password *</label>
                                        <input type="password" id="reg-student-password" class="form-control" placeholder="••••••••" minlength="6">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:1.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeRegisterLearnerModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-save-learner">Register Child & Assign Subjects</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- 2. Edit Learner Modal -->
            <div id="edit-learner-modal" class="modal-overlay">
                <div class="modal-box modal-box-lg">
                    <div class="modal-header">
                        <h3 id="edit-learner-title">✏️ Edit Learner Profile</h3>
                        <button class="close-btn" onclick="App.closeEditLearnerModal()">&times;</button>
                    </div>
                    <div id="edit-learner-alert"></div>
                    <form onsubmit="App.handleSaveEditLearner(event)" id="edit-learner-form">
                        <input type="hidden" id="edit-learner-id">
                        
                        <!-- Student Photo Update & Preview -->
                        <div style="display:flex; align-items:center; gap:16px; margin-bottom:1.2rem; background:#f8fafc; padding:12px 16px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                            <div style="position:relative;">
                                <img id="edit-photo-preview" src="" alt="Child Preview" style="display:none; width:64px; height:64px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                                <div id="edit-photo-placeholder" class="learner-avatar-box" style="width:64px; height:64px; font-size:1.6rem;">
                                    👤
                                </div>
                            </div>
                            <div style="flex:1;">
                                <label style="font-weight:600; font-size:0.9rem; margin-bottom:4px; display:block;">Change Student Photo</label>
                                <input type="file" id="edit-photo-file" accept="image/*" class="form-control" style="font-size:0.85rem; padding:0.35rem 0.6rem;" onchange="App.handleStudentPhotoPreview(this, 'edit')">
                                <small style="color:var(--text-muted); font-size:0.75rem;">JPG, PNG, WEBP, GIF (Max 4MB)</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex:2;">
                                <label for="edit-learner-name">Child Full Name *</label>
                                <input type="text" id="edit-learner-name" class="form-control" required minlength="2">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label for="edit-learner-gender">Gender *</label>
                                <select id="edit-learner-gender" class="form-control" required>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="prefer_not_to_say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-learner-dob">Date of Birth *</label>
                                <input type="date" id="edit-learner-dob" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-learner-class">Primary Class Level *</label>
                                <select id="edit-learner-class" class="form-control" required>
                                    <!-- Populated dynamically -->
                                </select>
                                <small style="color:#b45309; font-weight:500; display:block; margin-top:3px;">
                                    ⚠️ Changing class level will automatically re-align active enrolled subjects to the new syllabus.
                                </small>
                            </div>
                        </div>

                        <!-- Special Learning Needs Section -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:1rem; margin-top:1rem;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
                                <input type="checkbox" id="edit-learner-special-needs" onchange="App.toggleSpecialNeedsDetails('edit')">
                                <span>Child requires Special Learning Needs Accommodations</span>
                            </label>
                            <div id="edit-special-needs-container" style="display:none; margin-top:0.75rem;">
                                <label for="edit-learner-needs-desc">Accommodation Notes & Instructions</label>
                                <textarea id="edit-learner-needs-desc" class="form-control" rows="2" placeholder="Describe accommodations needed..."></textarea>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:1.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditLearnerModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-update-learner">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- 3. Learner Profile & Subjects Detail Modal -->
            <div id="learner-detail-modal" class="modal-overlay">
                <div class="modal-box modal-box-lg">
                    <div class="modal-header">
                        <h3 id="detail-modal-title">Learner Profile & Curriculum</h3>
                        <button class="close-btn" onclick="App.closeLearnerDetailModal()">&times;</button>
                    </div>
                    <div id="learner-detail-body">
                        <p style="text-align:center; padding:2rem; color:var(--text-muted);">Loading learner details...</p>
                    </div>
                </div>
            </div>

            <!-- 4. Create Student Login Modal -->
            <div id="learner-login-modal" class="modal-overlay">
                <div class="modal-box">
                    <div class="modal-header">
                        <h3>🔑 Create Student Login</h3>
                        <button class="close-btn" onclick="App.closeCreateStudentLoginModal()">&times;</button>
                    </div>
                    <div id="learner-login-alert"></div>
                    <form onsubmit="App.handleCreateStudentLogin(event)">
                        <input type="hidden" id="student-login-learner-id">
                        <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem;">
                            Set up a standalone student account for <strong id="student-login-child-name">Child</strong> so they can log in independently to take quizzes and read lessons.
                        </p>
                        <div class="form-group">
                            <label for="student-login-username">Student Username *</label>
                            <input type="text" id="student-login-username" class="form-control" placeholder="e.g. brian_mukasa" required minlength="3">
                        </div>
                        <div class="form-group">
                            <label for="student-login-password">Student Password *</label>
                            <input type="password" id="student-login-password" class="form-control" placeholder="••••••••" required minlength="6">
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:1.2rem;">
                            <button type="button" class="btn btn-secondary" onclick="App.closeCreateStudentLoginModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-save-student-login">Create Student Account</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.loadParentLearners();
    },

    async loadParentLearners() {
        const gridBox = document.getElementById('learners-grid-container');
        if (!gridBox) return;

        try {
            const [learnersRes, classes] = await Promise.all([
                API.get('/api/parent/learners'),
                this.fetchClasses()
            ]);

            this.cachedLearners = learnersRes.data || [];
            this.updateLearnerStats(this.cachedLearners);
            this.renderLearnersGrid(this.cachedLearners);
        } catch (err) {
            gridBox.innerHTML = `
                <div class="alert alert-danger" style="margin-top:1rem;">
                    Failed to load learners: ${this.escapeHtml(err.message)}
                </div>
            `;
        }
    },

    updateLearnerStats(learners) {
        const totalLearners = learners.length;
        const activeClasses = new Set(learners.map(l => l.class_code)).size;
        const totalSubjects = learners.reduce((acc, l) => acc + (l.active_subjects_count || 0), 0);
        const specialNeeds = learners.filter(l => l.special_learning_needs).length;

        const statTotal = document.getElementById('stat-total-learners');
        const statClasses = document.getElementById('stat-active-classes');
        const statSubjects = document.getElementById('stat-total-subjects');
        const statNeeds = document.getElementById('stat-special-needs');

        if (statTotal) statTotal.innerText = totalLearners;
        if (statClasses) statClasses.innerText = activeClasses;
        if (statSubjects) statSubjects.innerText = totalSubjects;
        if (statNeeds) statNeeds.innerText = specialNeeds;
    },

    renderLearnersGrid(learners) {
        const gridBox = document.getElementById('learners-grid-container');
        if (!gridBox) return;

        if (learners.length === 0) {
            gridBox.innerHTML = `
                <div class="card empty-state-card" style="text-align:center; padding:3.5rem 1.5rem; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div style="font-size:3rem; margin-bottom:1rem; text-align:center;">🎒</div>
                    <h3 style="text-align:center; display:block; width:100%; justify-content:center; margin:0.5rem auto 0.75rem auto;">No Home Learners Registered Yet</h3>
                    <p style="color:var(--text-muted); max-width:480px; margin:0.5rem auto 1.5rem auto; text-align:center;">
                        Register your children in Primary 1 through Primary 7 to get automated syllabus subjects, parental teaching guides, and assessments.
                    </p>
                    <button class="btn btn-primary" onclick="App.openRegisterLearnerModal()">➕ Register Your First Child</button>
                </div>
            `;
            return;
        }

        const cardsHtml = learners.map(l => {
            const classCode = l.class_code || 'P1';
            const classClass = `class-${classCode.toLowerCase()}`;
            const isFemale = l.gender === 'female';
            const ageDisplay = l.age !== null ? `${l.age} years old` : '—';
            const dobFormatted = l.date_of_birth ? new Date(l.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const isInactive = l.status === 'inactive';
            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name || 'Learner')}&background=${isFemale ? 'ec4899' : '2563eb'}&color=fff&rounded=true&bold=true&size=128`;
            const photoUrl = l.avatar_url || fallbackAvatar;

            return `
                <div class="learner-card" style="${isInactive ? 'opacity:0.75; filter:grayscale(0.3);' : ''}">
                    <div>
                        <div class="learner-card-header">
                            <div class="learner-avatar-wrapper" onclick="App.triggerLearnerPhotoUpload(${l.learner_id})" title="Click to upload/change photo for ${this.escapeHtml(l.full_name)}">
                                <img src="${this.escapeHtml(photoUrl)}" 
                                     alt="${this.escapeHtml(l.full_name)}" 
                                     class="learner-avatar-img"
                                     onerror="this.src='${fallbackAvatar}';">
                                <div class="learner-photo-badge-btn" title="Change Photo">📷</div>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div class="learner-card-title">${this.escapeHtml(l.full_name)}</div>
                                <div class="learner-meta-row">
                                    <span class="class-badge ${classClass}">${this.escapeHtml(l.class_name || classCode)}</span>
                                    <span class="status-badge status-${l.status || 'active'}">${l.status || 'active'}</span>
                                    ${l.special_learning_needs ? `<span class="needs-badge" title="${this.escapeHtml(l.special_needs_description || 'Special Needs Accommodation')}">♿ Accommodated</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="learner-stats-strip">
                            <div class="learner-stat-item">
                                <strong>${ageDisplay}</strong>
                                <span>Born ${dobFormatted}</span>
                            </div>
                            <div class="learner-stat-item">
                                <strong>${l.active_subjects_count || 0} Subjects</strong>
                                <span>Active Curriculum</span>
                            </div>
                        </div>

                        <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.5rem;">
                            ${l.learner_username ? `
                                <span>🔑 Student Login: <strong style="color:var(--text-main);">@${this.escapeHtml(l.learner_username)}</strong></span>
                            ` : `
                                <span>🔒 Mode: <em>Parent-guided</em></span>
                            `}
                        </div>
                    </div>

                    <div class="learner-card-actions">
                        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="App.openLearnerDetailModal(${l.learner_id})">
                            👁️ Profile & Subjects
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="App.openEditLearnerModal(${l.learner_id})" title="Edit Learner">
                            ✏️ Edit
                        </button>
                        ${!l.learner_username ? `
                            <button class="btn btn-secondary btn-sm" onclick="App.openCreateStudentLoginModal(${l.learner_id}, '${this.escapeHtml(l.full_name)}')" title="Create Student Login">
                                🔑 Login
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="App.toggleLearnerStatus(${l.learner_id}, '${l.status}')" title="${isInactive ? 'Activate Learner' : 'Deactivate Learner'}">
                            ${isInactive ? '▶️' : '⏸️'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        gridBox.innerHTML = `
            <div class="learner-grid">
                ${cardsHtml}
            </div>
        `;
    },

    filterLearnersGrid() {
        const searchVal = (document.getElementById('learner-search-input')?.value || '').toLowerCase().trim();
        const classFilter = document.getElementById('learner-class-filter')?.value || '';
        const statusFilter = document.getElementById('learner-status-filter')?.value || 'active';

        const filtered = this.cachedLearners.filter(l => {
            const matchesSearch = !searchVal || (l.full_name || '').toLowerCase().includes(searchVal);
            const matchesClass = !classFilter || l.class_code === classFilter;
            const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? l.status === 'active' : l.status === 'inactive');
            return matchesSearch && matchesClass && matchesStatus;
        });

        this.renderLearnersGrid(filtered);
    },

    handleStudentPhotoPreview(input, prefix) {
        const preview = document.getElementById(`${prefix}-photo-preview`);
        const placeholder = document.getElementById(`${prefix}-photo-placeholder`);

        if (input.files && input.files[0]) {
            const file = input.files[0];
            if (file.size > 4 * 1024 * 1024) {
                alert('Photo size exceeds 4MB limit.');
                input.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                }
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
            };
            reader.readAsDataURL(file);
        }
    },

    async uploadStudentPhotoFile(learnerId, file) {
        const formData = new FormData();
        formData.append('avatar_file', file);

        const res = await API.upload(`/api/parent/learners/${learnerId}/avatar`, formData);
        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to upload student photo');
        }

        return res.data?.avatar_url;
    },

    showToast(message, type = 'info') {
        let container = document.getElementById('tmhis-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'tmhis-toast-container';
            container.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:99999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        const bg = type === 'success' ? '#10b981' : (type === 'danger' ? '#ef4444' : '#2563eb');
        toast.style.cssText = `background:${bg}; color:#ffffff; padding:12px 20px; border-radius:8px; font-weight:600; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.2); pointer-events:auto; transition:all 0.3s ease; opacity:0; transform:translateY(15px); display:flex; align-items:center; gap:8px;`;
        toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'danger' ? '⚠️' : 'ℹ️')}</span> <span>${this.escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    triggerLearnerPhotoUpload(learnerId) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            this.showToast('Uploading student photo...', 'info');
            try {
                await this.uploadStudentPhotoFile(learnerId, file);
                await this.loadParentLearners();
                this.showToast('Student photo updated successfully!', 'success');
            } catch (err) {
                alert('Failed to upload photo: ' + err.message);
            }
        };
        input.click();
    },

    async openRegisterLearnerModal() {
        const modal = document.getElementById('register-learner-modal');
        const alertBox = document.getElementById('register-learner-alert');
        const form = document.getElementById('register-learner-form');
        const classSelect = document.getElementById('reg-learner-class');

        if (!modal) return;
        form.reset();
        alertBox.innerHTML = '';
        document.getElementById('reg-learner-age-calc').innerText = '';
        document.getElementById('reg-age-advisory-box').innerHTML = '';
        document.getElementById('reg-special-needs-container').style.display = 'none';
        document.getElementById('reg-login-container').style.display = 'none';

        // Reset photo preview
        const photoPreview = document.getElementById('reg-photo-preview');
        const photoPlaceholder = document.getElementById('reg-photo-placeholder');
        if (photoPreview) {
            photoPreview.src = '';
            photoPreview.style.display = 'none';
        }
        if (photoPlaceholder) {
            photoPlaceholder.style.display = 'flex';
        }

        // Populate class options
        const classes = await this.fetchClasses();
        classSelect.innerHTML = '<option value="">Select Primary Class...</option>' + classes.map(c => `
            <option value="${c.class_id}" data-min="${c.min_age}" data-max="${c.max_age}" data-name="${c.class_name}">
                ${c.class_name} (${c.class_code}) — Ages ${c.min_age}–${c.max_age} (${c.total_subjects || 0} subjects)
            </option>
        `).join('');

        modal.classList.add('active');
    },

    closeRegisterLearnerModal() {
        const modal = document.getElementById('register-learner-modal');
        if (modal) modal.classList.remove('active');
    },

    onRegisterDobChange() {
        const dobInput = document.getElementById('reg-learner-dob');
        const ageLabel = document.getElementById('reg-learner-age-calc');
        const classSelect = document.getElementById('reg-learner-class');
        const advisoryBox = document.getElementById('reg-age-advisory-box');

        if (!dobInput || !dobInput.value) {
            if (ageLabel) ageLabel.innerText = '';
            if (advisoryBox) advisoryBox.innerHTML = '';
            return;
        }

        const dob = new Date(dobInput.value);
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const m = now.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
            age--;
        }

        if (ageLabel) {
            ageLabel.innerText = `Calculated Age: ${age} years old`;
        }

        const selectedOption = classSelect.options[classSelect.selectedIndex];
        if (selectedOption && selectedOption.value) {
            const minAge = parseInt(selectedOption.getAttribute('data-min'), 10);
            const maxAge = parseInt(selectedOption.getAttribute('data-max'), 10);
            const className = selectedOption.getAttribute('data-name');

            if (age < minAge || age > maxAge) {
                advisoryBox.innerHTML = `
                    <div class="alert alert-warning" style="padding:0.6rem 0.9rem; font-size:0.84rem; margin-top:0.5rem;">
                        ℹ️ <strong>Age Guideline:</strong> ${className} is typically recommended for children aged ${minAge}–${maxAge} years. (Your child is ${age} yrs). Registration will still proceed.
                    </div>
                `;
            } else {
                advisoryBox.innerHTML = '';
            }
        }
    },

    toggleSpecialNeedsDetails(prefix) {
        const chk = document.getElementById(`${prefix}-learner-special-needs`);
        const box = document.getElementById(`${prefix}-special-needs-container`);
        if (box) {
            box.style.display = chk.checked ? 'block' : 'none';
        }
    },

    toggleCreateLoginDetails(prefix) {
        const chk = document.getElementById(`${prefix}-create-login`);
        const box = document.getElementById(`${prefix}-login-container`);
        if (box) {
            box.style.display = chk.checked ? 'block' : 'none';
        }
    },

    async handleRegisterLearner(e) {
        e.preventDefault();
        const alertBox = document.getElementById('register-learner-alert');
        const submitBtn = document.getElementById('btn-save-learner');

        const payload = {
            full_name: document.getElementById('reg-learner-name').value.trim(),
            gender: document.getElementById('reg-learner-gender').value,
            date_of_birth: document.getElementById('reg-learner-dob').value,
            class_id: parseInt(document.getElementById('reg-learner-class').value, 10),
            religious_track: document.getElementById('reg-learner-re').value,
            special_learning_needs: document.getElementById('reg-learner-special-needs').checked ? 1 : 0,
            special_needs_description: document.getElementById('reg-learner-needs-desc').value.trim(),
            create_login: document.getElementById('reg-create-login').checked,
            username: document.getElementById('reg-student-username')?.value.trim(),
            password: document.getElementById('reg-student-password')?.value
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Registering & Assigning Subjects...';
        alertBox.innerHTML = '';

        try {
            const res = await API.post('/api/parent/learners', payload);
            const newLearnerId = res.data?.learner?.learner_id;

            // If a photo file was selected, upload it immediately
            const photoFile = document.getElementById('reg-photo-file')?.files[0];
            if (photoFile && newLearnerId) {
                try {
                    await this.uploadStudentPhotoFile(newLearnerId, photoFile);
                } catch (photoErr) {
                    console.warn('Student registered, but photo upload failed:', photoErr);
                }
            }

            this.closeRegisterLearnerModal();
            await this.loadParentLearners();
            alert(res.message || 'Child registered successfully!');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Register Child & Assign Subjects';
        }
    },

    async openLearnerDetailModal(learnerId) {
        const modal = document.getElementById('learner-detail-modal');
        const body = document.getElementById('learner-detail-body');
        const title = document.getElementById('detail-modal-title');

        if (!modal) return;
        modal.classList.add('active');
        body.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--text-muted);">Loading learner details...</p>';

        try {
            const res = await API.get(`/api/parent/learners/${learnerId}`);
            const l = res.data;
            title.innerHTML = `🎒 ${this.escapeHtml(l.full_name)} — ${this.escapeHtml(l.class_name)} (${l.class_code})`;

            const subjectsListHtml = (l.subjects || []).map(s => `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="color:var(--text-main); font-size:0.95rem;">${this.escapeHtml(s.subject_name)}</strong>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                            Code: <code>${this.escapeHtml(s.subject_code)}</code> &bull; Language: ${this.escapeHtml(s.language_of_instruction || 'English')}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-weight:700; color:var(--primary); font-size:0.9rem;">${s.weekly_hours} hrs/wk</span>
                        <span class="status-badge status-active" style="display:block; margin-top:4px; font-size:0.7rem;">${s.enrollment_status}</span>
                    </div>
                </div>
            `).join('');

            body.innerHTML = `
                <div>
                    <!-- Child Photo & Header Card -->
                    <div style="display:flex; align-items:center; gap:16px; margin-bottom:1.2rem; background:#f8fafc; padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                        <div class="learner-avatar-wrapper" style="width:72px; height:72px;" onclick="App.triggerLearnerPhotoUpload(${l.learner_id}); App.closeLearnerDetailModal();" title="Click to upload/change photo">
                            <img src="${this.escapeHtml(l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name || 'Learner')}&background=${l.gender === 'female' ? 'ec4899' : '2563eb'}&color=fff&rounded=true&bold=true&size=128`)}" 
                                 alt="${this.escapeHtml(l.full_name)}" 
                                 style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); box-shadow:0 3px 10px rgba(0,0,0,0.15);"
                                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name || 'Learner')}&background=${l.gender === 'female' ? 'ec4899' : '2563eb'}&color=fff&rounded=true&bold=true&size=128';">
                            <div class="learner-photo-badge-btn" style="width:24px; height:24px; font-size:12px; bottom:0; right:0;" title="Change Photo">📷</div>
                        </div>
                        <div style="flex:1;">
                            <h3 style="font-size:1.35rem; margin:0 0 4px 0;">${this.escapeHtml(l.full_name)}</h3>
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                <span class="class-badge class-${(l.class_code||'P1').toLowerCase()}">${this.escapeHtml(l.class_name)} (${l.class_code})</span>
                                <span class="status-badge status-${l.status || 'active'}">${l.status || 'active'}</span>
                                ${l.special_learning_needs ? `<span class="needs-badge">♿ Accommodated</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Demographics Card -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--radius-sm); padding:1rem; margin-bottom:1.5rem; font-size:0.88rem;">
                        <div><strong>Age:</strong> ${l.age} years old</div>
                        <div><strong>Date of Birth:</strong> ${l.date_of_birth}</div>
                        <div><strong>Gender:</strong> ${l.gender}</div>
                        <div><strong>Class Level:</strong> ${this.escapeHtml(l.class_name)} (Level ${l.class_level})</div>
                        <div><strong>Enrolment Date:</strong> ${l.enrolment_date}</div>
                        <div><strong>Parent/Guardian:</strong> ${this.escapeHtml(l.parent_name || '—')} (${this.escapeHtml(l.parent_district || 'Uganda')})</div>
                    </div>

                    ${l.special_learning_needs ? `
                        <div class="alert alert-warning" style="margin-bottom:1.5rem;">
                            <div>
                                <strong>♿ Special Learning Accommodations:</strong>
                                <p style="margin-top:4px; font-size:0.9rem;">${this.escapeHtml(l.special_needs_description || 'No specific notes provided.')}</p>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Enrolled Subjects Section -->
                    <div style="margin-bottom:1.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <h4 style="font-size:1.1rem;">📚 Active Enrolled Subjects (${(l.subjects || []).length})</h4>
                            <span style="font-size:0.85rem; font-weight:700; color:var(--primary);">
                                Total: ${l.total_weekly_hours || 0} Hours/Week
                            </span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:10px;">
                            ${subjectsListHtml}
                        </div>
                    </div>

                    <!-- Student Login Status -->
                    <div style="border-top:1px solid var(--border-color); padding-top:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <strong>Student Independent Login:</strong>
                            <span style="margin-left:6px; color:var(--text-muted); font-size:0.9rem;">
                                ${l.learner_username ? `Active (@${this.escapeHtml(l.learner_username)})` : 'Not configured (Parent-guided mode)'}
                            </span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary btn-sm" onclick="App.openEditLearnerModal(${l.learner_id}); App.closeLearnerDetailModal();">✏️ Edit Details & Photo</button>
                            <button class="btn btn-primary btn-sm" onclick="App.closeLearnerDetailModal()">Done</button>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            body.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        }
    },

    closeLearnerDetailModal() {
        const modal = document.getElementById('learner-detail-modal');
        if (modal) modal.classList.remove('active');
    },

    async openEditLearnerModal(learnerId) {
        const modal = document.getElementById('edit-learner-modal');
        const alertBox = document.getElementById('edit-learner-alert');
        const classSelect = document.getElementById('edit-learner-class');

        if (!modal) return;
        alertBox.innerHTML = '';
        document.getElementById('edit-photo-file').value = '';

        try {
            const [res, classes] = await Promise.all([
                API.get(`/api/parent/learners/${learnerId}`),
                this.fetchClasses()
            ]);

            const l = res.data;
            document.getElementById('edit-learner-id').value = l.learner_id;
            document.getElementById('edit-learner-name').value = l.full_name;
            document.getElementById('edit-learner-gender').value = l.gender;
            document.getElementById('edit-learner-dob').value = l.date_of_birth;

            // Photo preview in Edit Modal
            const editPreview = document.getElementById('edit-photo-preview');
            const editPlaceholder = document.getElementById('edit-photo-placeholder');
            if (l.avatar_url) {
                if (editPreview) {
                    editPreview.src = l.avatar_url;
                    editPreview.style.display = 'block';
                }
                if (editPlaceholder) {
                    editPlaceholder.style.display = 'none';
                }
            } else {
                if (editPreview) {
                    editPreview.src = '';
                    editPreview.style.display = 'none';
                }
                if (editPlaceholder) {
                    editPlaceholder.style.display = 'flex';
                }
            }

            classSelect.innerHTML = classes.map(c => `
                <option value="${c.class_id}" ${c.class_id == l.class_id ? 'selected' : ''}>
                    ${c.class_name} (${c.class_code}) — Ages ${c.min_age}–${c.max_age}
                </option>
            `).join('');

            const chkNeeds = document.getElementById('edit-learner-special-needs');
            chkNeeds.checked = !!l.special_learning_needs;
            this.toggleSpecialNeedsDetails('edit');
            document.getElementById('edit-learner-needs-desc').value = l.special_needs_description || '';

            modal.classList.add('active');
        } catch (err) {
            alert('Failed to load learner details: ' + err.message);
        }
    },

    closeEditLearnerModal() {
        const modal = document.getElementById('edit-learner-modal');
        if (modal) modal.classList.remove('active');
    },

    async handleSaveEditLearner(e) {
        e.preventDefault();
        const alertBox = document.getElementById('edit-learner-alert');
        const submitBtn = document.getElementById('btn-update-learner');
        const id = document.getElementById('edit-learner-id').value;

        const payload = {
            full_name: document.getElementById('edit-learner-name').value.trim(),
            gender: document.getElementById('edit-learner-gender').value,
            date_of_birth: document.getElementById('edit-learner-dob').value,
            class_id: parseInt(document.getElementById('edit-learner-class').value, 10),
            special_learning_needs: document.getElementById('edit-learner-special-needs').checked ? 1 : 0,
            special_needs_description: document.getElementById('edit-learner-needs-desc').value.trim()
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving Changes...';
        alertBox.innerHTML = '';

        try {
            // 1. If a new photo file was selected, upload it first
            const photoFile = document.getElementById('edit-photo-file')?.files[0];
            let newAvatarUrl = null;
            if (photoFile) {
                newAvatarUrl = await this.uploadStudentPhotoFile(id, photoFile);
            }

            const payload = {
                full_name: document.getElementById('edit-learner-name').value.trim(),
                gender: document.getElementById('edit-learner-gender').value,
                date_of_birth: document.getElementById('edit-learner-dob').value,
                class_id: parseInt(document.getElementById('edit-learner-class').value, 10),
                special_learning_needs: document.getElementById('edit-learner-special-needs').checked ? 1 : 0,
                special_needs_description: document.getElementById('edit-learner-needs-desc').value.trim()
            };

            if (newAvatarUrl) {
                payload.avatar_url = newAvatarUrl;
            }

            await API.put(`/api/parent/learners/${id}`, payload);

            this.closeEditLearnerModal();
            await this.loadParentLearners();
            this.showToast('Learner profile and photo updated successfully!', 'success');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Changes';
        }
    },

    async toggleLearnerStatus(learnerId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const actionLabel = newStatus === 'inactive' ? 'deactivate' : 'activate';

        if (!confirm(`Are you sure you want to ${actionLabel} this learner? Historical learning records will be safely preserved.`)) {
            return;
        }

        try {
            await API.patch(`/api/parent/learners/${learnerId}/status`, { status: newStatus });
            await this.loadParentLearners();
        } catch (err) {
            alert('Failed to change status: ' + err.message);
        }
    },

    openCreateStudentLoginModal(learnerId, learnerName) {
        const modal = document.getElementById('learner-login-modal');
        const alertBox = document.getElementById('learner-login-alert');
        if (!modal) return;

        alertBox.innerHTML = '';
        document.getElementById('student-login-learner-id').value = learnerId;
        document.getElementById('student-login-child-name').innerText = learnerName;
        document.getElementById('student-login-username').value = learnerName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        document.getElementById('student-login-password').value = '';

        modal.classList.add('active');
    },

    closeCreateStudentLoginModal() {
        const modal = document.getElementById('learner-login-modal');
        if (modal) modal.classList.remove('active');
    },

    async handleCreateStudentLogin(e) {
        e.preventDefault();
        const alertBox = document.getElementById('learner-login-alert');
        const submitBtn = document.getElementById('btn-save-student-login');
        const id = document.getElementById('student-login-learner-id').value;

        const payload = {
            username: document.getElementById('student-login-username').value.trim(),
            password: document.getElementById('student-login-password').value
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating account...';
        alertBox.innerHTML = '';

        try {
            await API.post(`/api/parent/learners/${id}/create-login`, payload);
            this.closeCreateStudentLoginModal();
            await this.loadParentLearners();
            alert('Student account created successfully! The learner can now log in.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Student Account';
        }
    },

    renderGenericDashboard(container, hash) {
        const cleanHash = (hash || '').replace('#', '');
        const defaultDash = this.getDefaultDashboard();
        
        const moduleMap = {
            'parent-learners': { title: 'Learner Management', sprint: 'Sprint 2 (Module 02)', desc: 'Register home learners, enroll in P1–P7 classes, and manage active subjects.' },
            'parent-guides': { title: 'Parental Guides', sprint: 'Sprint 5 (Module 05)', desc: 'Step-by-step teaching guides and suggested weekly homeschooling schedules.' },
            'parent-assessments': { title: 'Assessments & Quizzes', sprint: 'Sprint 6 (Module 06)', desc: 'Track formative and summative assessment attempts, auto-scores, and remarks.' },
            'parent-sync': { title: 'Offline & Sync Status', sprint: 'Sprint 7 (Module 07)', desc: 'Inspect local IndexedDB synchronization queue and device connection status.' },
            'learner-subjects': { title: 'Curriculum Subjects', sprint: 'Sprint 3 (Module 03)', desc: 'Primary One through Seven (P1–P7) Ugandan Syllabus curriculum units.' },
            'learner-lessons': { title: 'Interactive Lessons', sprint: 'Sprint 4 (Module 04)', desc: 'Curriculum-aligned lesson content, worksheets, notes, and audios.' },
            'learner-assessments': { title: 'Learner Assessments', sprint: 'Sprint 6 (Module 06)', desc: 'Online and offline multiple-choice quizzes and subjective exercises.' },
            'learner-downloads': { title: 'Saved Offline Lessons', sprint: 'Sprint 7 (Module 07)', desc: 'Locally cached lessons and guides available without internet connection.' },
            'teacher-learners': { title: 'Assigned Learners', sprint: 'Sprint 2 (Module 02)', desc: 'Cohort list of homeschooling learners assigned for teacher oversight.' },
            'teacher-assessments': { title: 'Assessment Grading', sprint: 'Sprint 6 (Module 06)', desc: 'Review subjective answers, assign marks, and submit qualitative feedback.' },
            'teacher-class-summary': { title: 'Class Performance Summary', sprint: 'Sprint 8 (Module 08)', desc: 'Class-wide completion rates, subject averages, and struggling learner alerts.' },
            'officer-classes': { title: 'Curriculum & Classes Setup', sprint: 'Sprint 3 (Module 03)', desc: 'Configure classes P1–P7, subject allocations, terms, and competence goals.' },
            'officer-materials': { title: 'Learning Materials Review', sprint: 'Sprint 4 (Module 04)', desc: 'Review, approve, version, and publish digital syllabus resources.' },
            'officer-compliance': { title: 'National Compliance Analytics', sprint: 'Sprint 9 (Module 09)', desc: 'Monitor national and district curriculum coverage against MoES benchmarks.' },
            'admin-users': { title: 'User Account Management', sprint: 'Sprint 1 (Module 01)', desc: 'Administrative user provisioning, role allocation, and status management.' },
            'admin-audit': { title: 'Security & Audit Trail', sprint: 'Sprint 12 (Module 12)', desc: 'Immutable audit logs with before/after JSON diffs for system actions.' },
            'admin-system-health': { title: 'System & Sync Diagnostics', sprint: 'Sprint 10 (Module 10)', desc: 'Server health diagnostics, sync queue metrics, and error rates.' }
        };

        const info = moduleMap[cleanHash] || {
            title: cleanHash.replace('-', ' ').toUpperCase(),
            sprint: 'Specification Roadmap',
            desc: 'Module capability defined in the Master Development Plan.'
        };

        container.innerHTML = `
            <div style="max-width:850px; margin:0 auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.2rem;">
                    <a href="${defaultDash}" class="btn btn-secondary btn-sm">← Back to Dashboard</a>
                    <a href="/docs/" target="_blank" class="btn btn-secondary btn-sm">📖 View Module Docs</a>
                </div>

                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                        <div>
                            <h2>${this.escapeHtml(info.title)}</h2>
                            <p style="margin-top:4px; color:var(--text-muted);">${this.escapeHtml(info.desc)}</p>
                        </div>
                        <span class="badge badge-pending" style="font-size:0.8rem; padding:4px 10px;">${this.escapeHtml(info.sprint)}</span>
                    </div>

                    <div class="alert alert-warning" style="margin-top:1.5rem;">
                        <strong>Development Sequence:</strong> This module is configured according to the master specification. We are progressing sequentially through the sprints (Next: Sprint 2 / Module 02).
                    </div>

                    <div style="margin-top:1.5rem; display:flex; gap:10px;">
                        <a href="${defaultDash}" class="btn btn-primary">Return to Main Dashboard</a>
                        <a href="/docs/#mod-roadmap" target="_blank" class="btn btn-secondary">Explore Master Roadmap</a>
                    </div>
                </div>
            </div>
        `;
    }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

