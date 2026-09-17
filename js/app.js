/**
 * TMHIS Application Router & UI Controller
 */

// Initialize PWA Service Worker (Proactive Update & Network-First)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('[TMHIS PWA] Service Worker active with scope:', reg.scope);
                // Proactively check server for SW updates on every page visit
                reg.update();
            })
            .catch(err => console.error('[TMHIS PWA] Service Worker registration failed:', err));
    });

    // When a new Service Worker takes over, let the page know
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[TMHIS PWA] Updated Service Worker controller activated.');
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
                <a href="javascript:void(0)" id="tmhis-connectivity-badge" class="connectivity-pill online" onclick="App.openOfflineCenterModal()" style="margin-right:8px;">
                    <span>🟢</span> <span>Online</span>
                </a>
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
                            <a href="#offline-center" class="dropdown-item" onclick="App.closeUserDropdown()">
                                <span>🔄</span> Offline Sync & Downloads
                            </a>
                            ${user.role_code === 'administrator' ? `
                                <a href="#admin-users" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>👥</span> User Accounts
                                </a>
                                <a href="#curriculum-explorer" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📚</span> Curriculum Explorer
                                </a>
                                <a href="#officer-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Learning Materials
                                </a>
                                <a href="#officer-exams" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📄</span> Exam Sets & UNEB Grading
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
                                <a href="#curriculum-explorer" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📚</span> Curriculum Syllabus
                                </a>
                                <a href="#learner-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Digital Materials
                                </a>
                                <a href="#parent-guides" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📖</span> Parent Guides and Timetables
                                </a>
                                <a href="#parent-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📝</span> Quizzes & Scores
                                </a>
                                <a href="#parent-exams" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📄</span> Termly Exam Sets & UNEB Grading
                                </a>
                                <a href="#offline-center" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>🔄</span> Offline Sync Status
                                </a>
                            ` : ''}
                            ${user.role_code === 'learner' ? `
                                <a href="#curriculum-explorer" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📚</span> My Subjects & Syllabus
                                </a>
                                <a href="#learner-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Learning Materials
                                </a>
                                <a href="#learner-lessons" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>▶️</span> Continue Lessons
                                </a>
                                <a href="#learner-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>✍️</span> Assessments
                                </a>
                                <a href="#learner-exams" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📄</span> Termly Exam Sets
                                </a>
                                <a href="#offline-center" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📥</span> Saved Offline Lessons
                                </a>
                            ` : ''}
                            ${user.role_code === 'teacher' ? `
                                <a href="#teacher-learners" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>👥</span> Assigned Learners
                                </a>
                                <a href="#curriculum-explorer" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📚</span> Curriculum Syllabus
                                </a>
                                <a href="#officer-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Learning Materials
                                </a>
                                <a href="#teacher-assessments" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>✅</span> Review & Grading
                                </a>
                                <a href="#officer-exams" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📄</span> Exam Sets & Mark Entry
                                </a>
                                <a href="#teacher-class-summary" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📈</span> Class Progress
                                </a>
                            ` : ''}
                            ${user.role_code === 'curriculum_officer' ? `
                                <a href="#curriculum-explorer" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📋</span> Curriculum & Lessons
                                </a>
                                <a href="#officer-materials" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📁</span> Learning Materials
                                </a>
                                <a href="#officer-exams" class="dropdown-item" onclick="App.closeUserDropdown()">
                                    <span>📄</span> Exam Sets & PDF Releases
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
            if (typeof TMHIS_Sync !== 'undefined' && TMHIS_Sync.updateOnlineBadge) {
                TMHIS_Sync.updateOnlineBadge();
            }
        } else {
            headerActions.innerHTML = `
                <a href="javascript:void(0)" id="tmhis-connectivity-badge" class="connectivity-pill online" onclick="App.openOfflineCenterModal()" style="margin-right:8px;">
                    <span>🟢</span> <span>Online</span>
                </a>
                <a href="#login" class="btn btn-secondary btn-sm">Login</a>
                <a href="#register" class="btn btn-primary btn-sm">Register Parent</a>
            `;
            if (typeof TMHIS_Sync !== 'undefined' && TMHIS_Sync.updateOnlineBadge) {
                TMHIS_Sync.updateOnlineBadge();
            }
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
        } else if (currentHash === '#curriculum-explorer' || currentHash === '#officer-classes' || currentHash === '#learner-subjects') {
            this.renderCurriculumExplorer(content);
        } else if (currentHash === '#officer-materials' || currentHash === '#learner-materials' || currentHash === '#learning-materials' || currentHash === '#materials-library') {
            this.renderMaterials(content);
        } else if (currentHash === '#parent-guides' || currentHash === '#guides' || currentHash === '#officer-guides' || currentHash === '#parental-guides') {
            GuidesApp.init(content);
        } else if (currentHash === '#parent-monthly-planner' || currentHash === '#monthly-planner' || currentHash === '#monthly-calendar') {
            ScheduleApp.init(content, 'month');
        } else if (currentHash === '#parent-termly-planner' || currentHash === '#termly-planner' || currentHash === '#term-roadmap' || currentHash === '#term-planner') {
            ScheduleApp.init(content, 'term');
        } else if (currentHash === '#parent-schedule' || currentHash === '#schedule' || currentHash === '#weekly-schedule' || currentHash === '#timetable') {
            ScheduleApp.init(content, 'week');
        } else if (currentHash === '#parent-assessments' || currentHash === '#teacher-assessments' || currentHash === '#assessment-results' || currentHash === '#gradebook') {
            AssessmentsApp.renderPerformanceView(content);
        } else if (currentHash === '#learner-assessments' || currentHash === '#assessments' || currentHash === '#quizzes' || currentHash === '#take-assessment') {
            AssessmentsApp.init(content);
        } else if (currentHash === '#parent-exams' || currentHash === '#officer-exams' || currentHash === '#learner-exams' || currentHash === '#exams' || currentHash === '#exam-sets' || currentHash === '#grading') {
            ExamsApp.init(content);
        } else if (currentHash === '#offline-center' || currentHash === '#parent-sync' || currentHash === '#offline-manager' || currentHash === '#learner-downloads' || currentHash === '#sync-status') {
            this.renderOfflineCenter(content);
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
                        <h3>Weekly Timetable <span>📅</span></h3>
                        <p>Flexible weekly scheduling, lesson pacing, and explainable next-lesson signals.</p>
                        <a href="#parent-schedule" class="btn btn-primary btn-sm">Open Timetable</a>
                    </div>
                    <div class="card">
                        <h3>Parent Guides & Timetables <span>📖</span></h3>
                        <p>View step-by-step teaching guides, flexible schedules, weekly, monthly, and 12-week planners.</p>
                        <a href="#parent-guides" class="btn btn-primary btn-sm">Open Guides & Timetables</a>
                    </div>
                    <div class="card">
                        <h3>Digital Materials <span>📁</span></h3>
                        <p>Explore multimedia textbooks, videos, audio pronunciations, and worksheets.</p>
                        <a href="#learner-materials" class="btn btn-secondary btn-sm">Browse Materials</a>
                    </div>
                    <div class="card">
                        <h3>Assessments & Scores <span>📝</span></h3>
                        <p>Track online/offline assessment results, objective scoring, and teacher remarks.</p>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:auto;">
                            <a href="#parent-assessments" class="btn btn-secondary btn-sm">View Scores</a>
                            <a href="#parent-exams" class="btn btn-primary btn-sm"><span>📋</span> Termly Exams & Slips</a>
                        </div>
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
                <p style="color:var(--text-muted); margin-top:4px;">Supporting teacher oversight, exam set authoring, assessments marking, and learner feedback</p>
                <div class="dashboard-grid">
                    <div class="card">
                        <h3>Assigned Learners <span>👥</span></h3>
                        <p>View home learners assigned to your subject specialty and class levels.</p>
                        <a href="#teacher-learners" class="btn btn-primary btn-sm">View Learners</a>
                    </div>
                    <div class="card">
                        <h3>Exam Sets & UNEB Grading <span>📄</span></h3>
                        <p>Create termly exam sets, upload papers, and supervise UNEB standard auto-grading.</p>
                        <a href="#officer-exams" class="btn btn-primary btn-sm">Exam Sets & Papers</a>
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
                        <h3>Exam Sets & PDF Releases <span>📄</span></h3>
                        <p>Release official printable exam sets, upload marking guides, and oversee grading.</p>
                        <a href="#officer-exams" class="btn btn-primary btn-sm">Manage Exam Sets</a>
                    </div>
                    <div class="card">
                        <h3>Curriculum Management <span>📋</span></h3>
                        <p>Configure classes P1–P7, subjects, curriculum terms, and standard competencies.</p>
                        <a href="#officer-classes" class="btn btn-secondary btn-sm">Curriculum Setup</a>
                    </div>
                    <div class="card">
                        <h3>Learning Materials Review <span>📁</span></h3>
                        <p>Approve, version, and publish educational notes, worksheets, and media.</p>
                        <a href="#officer-materials" class="btn btn-secondary btn-sm">Review Materials</a>
                    </div>
                    <div class="card">
                        <h3>Assessments & Item Banks <span>✍️</span></h3>
                        <p>Author questions, establish passing criteria, and publish primary quizzes.</p>
                        <a href="#learner-assessments" class="btn btn-secondary btn-sm">Manage Assessments</a>
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
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:1rem;">
                    <div>
                        <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.01em;">👨‍👩‍👧 My Home Learners</h2>
                        <p style="color:var(--text-muted); margin:0.15rem 0 0 0; font-size:0.82rem;">Ugandan Primary Syllabus (P1–P7) • Child Registration, Class Allocation & Enrolled Subjects</p>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;">← Dashboard</a>
                        <button class="btn btn-primary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="App.openRegisterLearnerModal()">➕ Register New Child</button>
                    </div>
                </div>

                <!-- Ultra-Thin & Compact Search & Filter Bar -->
                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.4rem 0.65rem; margin-bottom:1rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between;">
                        <div style="flex:1; min-width:200px;">
                            <input type="text" id="learner-search-input" class="form-control" placeholder="🔍 Search child by name..." oninput="App.filterLearnersGrid()" style="height:32px; font-size:0.84rem; padding:0.25rem 0.6rem; border-radius:6px; border:1px solid #cbd5e1;">
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <select id="learner-class-filter" class="form-control" style="width:auto; height:32px; font-size:0.84rem; padding:0.2rem 0.55rem; border-radius:6px; border:1px solid #cbd5e1;" onchange="App.filterLearnersGrid()">
                                <option value="">All Classes (P1–P7)</option>
                                <option value="P1">Primary 1 (P1)</option>
                                <option value="P2">Primary 2 (P2)</option>
                                <option value="P3">Primary 3 (P3)</option>
                                <option value="P4">Primary 4 (P4)</option>
                                <option value="P5">Primary 5 (P5)</option>
                                <option value="P6">Primary 6 (P6)</option>
                                <option value="P7">Primary 7 (P7)</option>
                            </select>
                            <select id="learner-status-filter" class="form-control" style="width:auto; height:32px; font-size:0.84rem; padding:0.2rem 0.55rem; border-radius:6px; border:1px solid #cbd5e1;" onchange="App.filterLearnersGrid()">
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
                API.get('/api/parent/learners').catch(() => ({ data: [] })),
                this.fetchClasses().catch(() => [])
            ]);

            let learners = Array.isArray(learnersRes.data) ? learnersRes.data : (learnersRes.data?.learners || []);
            
            // If empty and offline or error, try direct IndexedDB lookup
            if (learners.length === 0 && typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getLearners) {
                const dbLearners = await TMHIS_DB.getLearners();
                if (dbLearners && dbLearners.length > 0) {
                    learners = dbLearners;
                }
            }

            this.cachedLearners = learners;
            this.updateLearnerStats(this.cachedLearners);
            this.renderLearnersGrid(this.cachedLearners, !navigator.onLine || learnersRes.offline);
        } catch (err) {
            // Last resort: check TMHIS_DB
            try {
                if (typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getLearners) {
                    const dbLearners = await TMHIS_DB.getLearners();
                    if (dbLearners && dbLearners.length > 0) {
                        this.cachedLearners = dbLearners;
                        this.updateLearnerStats(this.cachedLearners);
                        this.renderLearnersGrid(this.cachedLearners, true);
                        return;
                    }
                }
            } catch (e) {}

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

    renderLearnersGrid(learners, isOffline = false) {
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

        const offlineHeader = isOffline ? `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.2rem; padding:0.6rem 1rem; background:#f8fafc; border-radius:8px; border-left:4px solid #f59e0b; font-size:0.85rem; color:#475569;">
                <span>📡 <strong>Offline Mode:</strong> Displaying ${learners.length} home learner${learners.length > 1 ? 's' : ''} saved in local storage.</span>
                <span class="badge" style="background:#fef3c7; color:#b45309; font-weight:600;">Offline Cache</span>
            </div>
        ` : '';

        const cardsHtml = learners.map(l => {
            const classCode = l.class_code || 'P1';
            const classClass = `class-${classCode.toLowerCase()}`;
            const isFemale = l.gender === 'female';
            const ageDisplay = l.age !== null ? `${l.age} years old` : '—';
            const dobFormatted = l.date_of_birth ? new Date(l.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const isInactive = l.status === 'inactive';
            const isTemp = String(l.learner_id).startsWith('temp_') || l.is_offline_draft;
            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name || 'Learner')}&background=${isFemale ? 'ec4899' : '2563eb'}&color=fff&rounded=true&bold=true&size=128`;
            const photoUrl = l.avatar_url || fallbackAvatar;

            return `
                <div class="learner-card" style="${isInactive ? 'opacity:0.75; filter:grayscale(0.3);' : ''}">
                    <div>
                        <div class="learner-card-header">
                            <div class="learner-avatar-wrapper" onclick="App.triggerLearnerPhotoUpload('${l.learner_id}')" title="Click to upload/change photo for ${this.escapeHtml(l.full_name)}">
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
                                    ${isTemp ? `<span class="badge" style="background:#fed7aa; color:#9a3412; font-size:0.75rem; font-weight:600;">⏳ Pending Sync</span>` : ''}
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

                        <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.6rem;">
                            ${l.learner_username ? `
                                <span>🔑 Student Login: <strong style="color:var(--text-main);">@${this.escapeHtml(l.learner_username)}</strong></span>
                            ` : `
                                <span>🔒 Mode: <em>Parent-guided</em></span>
                            `}
                        </div>

                        <!-- Direct Child Hub Links: Timetable, Exams, Tests, Materials -->
                        <div style="background:var(--surface-color, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:0.6rem 0.75rem; margin-bottom:0.85rem;">
                            <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted); margin-bottom:0.45rem; display:flex; justify-content:space-between; align-items:center;">
                                <span>🚀 Direct Child Hub</span>
                                <span style="font-size:0.7rem; font-weight:700; color:var(--primary);">${this.escapeHtml(l.class_code || 'P1')}</span>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem;">
                                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.35rem 0.45rem; display:inline-flex; align-items:center; gap:0.35rem; justify-content:center; text-align:center; font-weight:600;" onclick="App.viewChildSchedule(${l.learner_id})" title="Open Weekly Timetable & Lesson Pacing for ${this.escapeHtml(l.full_name)}">
                                    <span>📅</span> Timetable
                                </button>
                                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.35rem 0.45rem; display:inline-flex; align-items:center; gap:0.35rem; justify-content:center; text-align:center; font-weight:600;" onclick="App.viewChildExams(${l.learner_id})" title="Open Termly Examination Sets & UNEB Grading for ${this.escapeHtml(l.full_name)}">
                                    <span>📋</span> Exams
                                </button>
                                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.35rem 0.45rem; display:inline-flex; align-items:center; gap:0.35rem; justify-content:center; text-align:center; font-weight:600;" onclick="App.viewChildAssessments(${l.learner_id})" title="Open Quizzes, Tests & Assessment Results for ${this.escapeHtml(l.full_name)}">
                                    <span>✍️</span> Tests & Scores
                                </button>
                                <button class="btn btn-outline btn-sm" style="font-size:0.78rem; padding:0.35rem 0.45rem; display:inline-flex; align-items:center; gap:0.35rem; justify-content:center; text-align:center; font-weight:600;" onclick="App.viewChildMaterials(${l.learner_id})" title="Browse Digital Materials for ${this.escapeHtml(l.full_name)}">
                                    <span>📁</span> Materials
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="learner-card-actions" style="margin-top:auto;">
                        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="App.openLearnerDetailModal(${l.learner_id})">
                            👁️ Profile
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="App.openEditLearnerModal(${l.learner_id})" title="Edit Learner Details">
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

        let gridModifier = 'learner-grid-multi';
        const count = learners.length;
        if (count === 1) {
            gridModifier = 'learner-grid-1';
        } else if (count === 2) {
            gridModifier = 'learner-grid-2';
        } else if (count === 3) {
            gridModifier = 'learner-grid-3';
        } else if (count === 4) {
            gridModifier = 'learner-grid-4';
        } else if (count === 5) {
            gridModifier = 'learner-grid-5';
        } else if (count === 6) {
            gridModifier = 'learner-grid-6';
        }

        gridBox.innerHTML = `
            <div class="learner-grid ${gridModifier}">
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
            const res = await TMHIS_Sync.registerLearner(payload);
            const newLearnerId = res.data?.learner?.learner_id || res.data?.learner_id;

            // If a photo file was selected and online, upload it immediately
            const photoFile = document.getElementById('reg-photo-file')?.files[0];
            if (photoFile && newLearnerId && !String(newLearnerId).startsWith('temp_')) {
                try {
                    await this.uploadStudentPhotoFile(newLearnerId, photoFile);
                } catch (photoErr) {
                    console.warn('Student registered, but photo upload failed:', photoErr);
                }
            }

            this.closeRegisterLearnerModal();
            await this.loadParentLearners();
            this.showToast(res.message || 'Child registered successfully!', 'success');
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
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--radius-sm); padding:1rem; margin-bottom:1.25rem; font-size:0.88rem;">
                        <div><strong>Age:</strong> ${l.age} years old</div>
                        <div><strong>Date of Birth:</strong> ${l.date_of_birth}</div>
                        <div><strong>Gender:</strong> ${l.gender}</div>
                        <div><strong>Class Level:</strong> ${this.escapeHtml(l.class_name)} (Level ${l.class_level})</div>
                        <div><strong>Enrolment Date:</strong> ${l.enrolment_date}</div>
                        <div><strong>Parent/Guardian:</strong> ${this.escapeHtml(l.parent_name || '—')} (${this.escapeHtml(l.parent_district || 'Uganda')})</div>
                    </div>

                    <!-- Direct Child Hub Links in Profile Modal -->
                    <div style="background:#fff; border:1px solid #bfdbfe; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-bottom:1.5rem;">
                        <div style="font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--primary); margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;">
                            <span>🚀 Direct Learning & Evaluation Hub</span>
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${this.escapeHtml(l.class_code || 'Primary')}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.5rem;">
                            <button class="btn btn-outline btn-sm" style="font-size:0.82rem; padding:0.45rem 0.6rem; display:inline-flex; align-items:center; gap:0.4rem; justify-content:center; font-weight:600;" onclick="App.viewChildSchedule(${l.learner_id})">
                                <span>📅</span> Timetable
                            </button>
                            <button class="btn btn-outline btn-sm" style="font-size:0.82rem; padding:0.45rem 0.6rem; display:inline-flex; align-items:center; gap:0.4rem; justify-content:center; font-weight:600;" onclick="App.viewChildExams(${l.learner_id})">
                                <span>📋</span> Termly Exams
                            </button>
                            <button class="btn btn-outline btn-sm" style="font-size:0.82rem; padding:0.45rem 0.6rem; display:inline-flex; align-items:center; gap:0.4rem; justify-content:center; font-weight:600;" onclick="App.viewChildAssessments(${l.learner_id})">
                                <span>✍️</span> Tests & Scores
                            </button>
                            <button class="btn btn-outline btn-sm" style="font-size:0.82rem; padding:0.45rem 0.6rem; display:inline-flex; align-items:center; gap:0.4rem; justify-content:center; font-weight:600;" onclick="App.viewChildMaterials(${l.learner_id})">
                                <span>📁</span> Digital Materials
                            </button>
                        </div>
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

    // =========================================================================
    // MODULE 03: CURRICULUM MANAGEMENT (P1–P7) & LESSON EXPLORER
    // =========================================================================

    curriculumState: {
        classes: [],
        subjects: [],
        lessons: [],
        activeClassId: null,
        activeSubjectId: null,
        searchTerm: '',
        statusFilter: 'active'
    },

    async renderCurriculumExplorer(container) {
        const user = Auth.getUser();
        const role = Auth.getRole();
        const isStaff = ['curriculum_officer', 'administrator'].includes(role);
        const defaultDash = this.getDefaultDashboard();

        container.innerHTML = `
            <div style="max-width:1250px; margin:0 auto;">
                <div class="curriculum-header-bar">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <h2 style="margin:0;">🇺🇬 NCDC Curriculum Explorer (P1–P7)</h2>
                            <span class="badge badge-success" style="font-size:0.75rem;">Syllabus v2026.1</span>
                            <span class="badge badge-primary" style="font-size:0.75rem;">NCDC / MoES Standard</span>
                        </div>
                        <p style="color:var(--text-muted); margin-top:4px;">
                            Uganda National Curriculum Development Centre • Competency-Based Primary Education Framework
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <a href="${defaultDash}" class="btn btn-secondary btn-sm">← Back to Dashboard</a>
                        ${isStaff ? `
                            <button class="btn btn-primary btn-sm" onclick="App.openCreateSubjectModal()">➕ Add Subject</button>
                            <button class="btn btn-primary btn-sm" onclick="App.openCreateLessonModal()">➕ Add Lesson</button>
                        ` : ''}
                    </div>
                </div>

                <div id="curriculum-alert" style="margin-bottom:1rem;"></div>

                <!-- Class Tabs (P1 to P7) -->
                <div id="curriculum-class-tabs" class="curriculum-class-tabs">
                    <div style="padding:0.75rem; color:var(--text-muted);">Loading primary classes...</div>
                </div>

                <!-- Main Curriculum Grid: Subjects (Left) + Sequenced Lessons (Right) -->
                <div style="display:grid; grid-template-columns: 340px 1fr; gap: 1.5rem; align-items:start;" id="curriculum-split-layout">
                    
                    <!-- Subjects Panel -->
                    <div class="card" style="padding:1.25rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.6rem;">
                            <h3 style="font-size:1.05rem; margin:0;">Class Subjects</h3>
                            <span id="curriculum-subject-count-badge" class="badge badge-pending" style="font-size:0.75rem;">0 Subjects</span>
                        </div>
                        <div id="curriculum-subjects-container" style="display:flex; flex-direction:column; gap:8px;">
                            <div style="color:var(--text-muted); font-size:0.9rem;">Select a class level above.</div>
                        </div>
                    </div>

                    <!-- Lessons Timeline Panel -->
                    <div class="lesson-timeline-container">
                        <div class="lesson-timeline-header">
                            <div>
                                <h3 id="curriculum-active-subject-title" style="font-size:1.15rem; margin:0;">Select a Subject</h3>
                                <p id="curriculum-active-subject-subtitle" style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">
                                    Sequenced lesson pathway and learning objectives
                                </p>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                <input type="text" id="curriculum-lesson-search" class="form-control" placeholder="🔍 Search lesson topic or objective..." style="width:240px; padding:0.4rem 0.8rem; font-size:0.85rem;" oninput="App.handleCurriculumSearch(this.value)">
                                ${isStaff ? `
                                    <select id="curriculum-lesson-status-filter" class="form-control" style="width:auto; padding:0.4rem 0.8rem; font-size:0.85rem;" onchange="App.handleCurriculumStatusChange(this.value)">
                                        <option value="active">Active Only</option>
                                        <option value="all">All (Inc. Retired)</option>
                                    </select>
                                ` : ''}
                            </div>
                        </div>

                        <div id="curriculum-lessons-container" class="lesson-timeline-list">
                            <div style="text-align:center; padding:2rem; color:var(--text-muted);">
                                Loading lessons...
                            </div>
                        </div>
                    </div>

                </div>

                <!-- Officer Authoring Modals -->
                ${isStaff ? this.renderCurriculumModalsHtml() : ''}
            </div>
        `;

        await this.loadCurriculumClasses();
    },

    async loadCurriculumClasses() {
        const tabsContainer = document.getElementById('curriculum-class-tabs');
        if (!tabsContainer) return;

        try {
            const res = await API.get('/api/curriculum/classes');
            this.curriculumState.classes = res.data || [];

            if (this.curriculumState.classes.length === 0) {
                tabsContainer.innerHTML = '<div style="padding:1rem; color:var(--text-muted);">No primary classes found.</div>';
                return;
            }

            tabsContainer.innerHTML = this.curriculumState.classes.map(cls => `
                <button class="curriculum-class-tab ${this.curriculumState.activeClassId === cls.class_id ? 'active' : ''}" 
                        id="class-tab-${cls.class_id}" 
                        onclick="App.selectCurriculumClass(${cls.class_id})">
                    <span>${this.escapeHtml(cls.class_code)}</span>
                    <span class="tab-badge">${cls.total_subjects} Subj • ${cls.total_lessons} Lessons</span>
                </button>
            `).join('');

            // If no active class selected, select the first class (or P1)
            const targetClassId = this.curriculumState.activeClassId || this.curriculumState.classes[0].class_id;
            await this.selectCurriculumClass(targetClassId);
        } catch (err) {
            tabsContainer.innerHTML = `<div class="alert alert-danger" style="margin:0.5rem 0;">${this.escapeHtml(err.message)}</div>`;
        }
    },

    async selectCurriculumClass(classId) {
        this.curriculumState.activeClassId = classId;

        // Update active tab class
        document.querySelectorAll('.curriculum-class-tab').forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`class-tab-${classId}`);
        if (activeTab) activeTab.classList.add('active');

        const subjectsContainer = document.getElementById('curriculum-subjects-container');
        const countBadge = document.getElementById('curriculum-subject-count-badge');
        if (!subjectsContainer) return;

        subjectsContainer.innerHTML = '<div style="color:var(--text-muted); padding:0.5rem 0;">Loading subjects...</div>';

        try {
            const res = await API.get(`/api/curriculum/classes/${classId}/subjects`);
            const data = res.data || {};
            this.curriculumState.subjects = data.subjects || [];

            if (countBadge) {
                countBadge.innerText = `${this.curriculumState.subjects.length} Subjects`;
            }

            if (this.curriculumState.subjects.length === 0) {
                subjectsContainer.innerHTML = '<div style="color:var(--text-muted); padding:0.5rem 0;">No subjects registered for this class.</div>';
                document.getElementById('curriculum-lessons-container').innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">No lessons available.</div>';
                return;
            }

            const role = Auth.getRole();
            const isStaff = ['curriculum_officer', 'administrator'].includes(role);

            subjectsContainer.innerHTML = this.curriculumState.subjects.map(subj => `
                <div class="subject-select-card ${this.curriculumState.activeSubjectId === subj.subject_id ? 'active' : ''}" 
                     id="subject-card-${subj.subject_id}" 
                     onclick="App.selectCurriculumSubject(${subj.subject_id})">
                    <div class="subject-card-head">
                        <span class="subject-card-code">${this.escapeHtml(subj.subject_code)}</span>
                        ${isStaff ? `
                            <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.75rem;" onclick="event.stopPropagation(); App.openEditSubjectModal(${subj.subject_id})">✏️ Edit</button>
                        ` : ''}
                    </div>
                    <div class="subject-card-title">${this.escapeHtml(subj.subject_name)}</div>
                    <div class="subject-card-meta">
                        <span>⏱ ${subj.weekly_hours} hrs/wk</span>
                        <span>•</span>
                        <span>📖 ${subj.active_lessons_count} Active Lessons</span>
                    </div>
                </div>
            `).join('');

            // Automatically select first subject or currently active if exists in list
            const hasActive = this.curriculumState.subjects.some(s => s.subject_id === this.curriculumState.activeSubjectId);
            const targetSubjectId = hasActive ? this.curriculumState.activeSubjectId : this.curriculumState.subjects[0].subject_id;
            await this.selectCurriculumSubject(targetSubjectId);
        } catch (err) {
            subjectsContainer.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        }
    },

    async selectCurriculumSubject(subjectId) {
        this.curriculumState.activeSubjectId = subjectId;

        // Highlight active subject card
        document.querySelectorAll('.subject-select-card').forEach(card => card.classList.remove('active'));
        const activeCard = document.getElementById(`subject-card-${subjectId}`);
        if (activeCard) activeCard.classList.add('active');

        await this.loadCurriculumLessons();
    },

    async loadCurriculumLessons() {
        const subjectId = this.curriculumState.activeSubjectId;
        const lessonsContainer = document.getElementById('curriculum-lessons-container');
        const titleElem = document.getElementById('curriculum-active-subject-title');
        const subtitleElem = document.getElementById('curriculum-active-subject-subtitle');

        if (!subjectId || !lessonsContainer) return;

        const currentSubject = this.curriculumState.subjects.find(s => s.subject_id === subjectId);
        if (currentSubject) {
            if (titleElem) titleElem.innerText = `${currentSubject.subject_name} (${currentSubject.subject_code})`;
            if (subtitleElem) subtitleElem.innerText = `${currentSubject.class_name} • ${currentSubject.weekly_hours} hrs/week • Language: ${currentSubject.language_of_instruction || 'English'}`;
        }

        lessonsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Loading sequenced lessons...</div>';

        try {
            const status = this.curriculumState.statusFilter || 'active';
            const search = this.curriculumState.searchTerm || '';
            let res = await API.get(`/api/curriculum/subjects/${subjectId}/lessons?status=${status}&search=${encodeURIComponent(search)}`).catch(() => ({ data: { lessons: [] } }));
            let data = res.data || {};
            let lessons = data.lessons || [];

            // If empty and offline, try direct IndexedDB lookup
            if (lessons.length === 0 && typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getLessons) {
                const dbLessons = await TMHIS_DB.getLessons(subjectId);
                if (dbLessons && dbLessons.length > 0) {
                    lessons = dbLessons;
                }
            }

            this.curriculumState.lessons = lessons;

            if (this.curriculumState.lessons.length === 0) {
                lessonsContainer.innerHTML = `
                    <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                        <div style="font-size:2rem; margin-bottom:8px;">📖</div>
                        <p style="font-weight:600;">No lessons found for this subject.</p>
                        <p style="font-size:0.85rem; margin-top:4px;">${search ? 'Try adjusting your search criteria.' : 'Curriculum lessons will appear here once authored.'}</p>
                    </div>
                `;
                return;
            }

            const role = Auth.getRole();
            const isStaff = ['curriculum_officer', 'administrator'].includes(role);
            const total = this.curriculumState.lessons.length;
            const isOffline = !navigator.onLine || res.offline;

            const offlineBanner = isOffline ? `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; padding:0.5rem 0.9rem; background:#f8fafc; border-radius:6px; border-left:4px solid #3b82f6; font-size:0.82rem; color:#475569;">
                    <span>📡 <strong>Offline Mode:</strong> Showing ${total} sequenced lessons loaded from local cache.</span>
                    <span class="badge" style="background:#dbeafe; color:#1d4ed8; font-weight:600;">Offline Cache</span>
                </div>
            ` : '';

            const listHtml = this.curriculumState.lessons.map((lesson, idx) => `
                <div class="lesson-item-card ${lesson.status === 'retired' ? 'retired' : ''}" id="lesson-card-${lesson.lesson_id}">
                    <div class="lesson-seq-indicator">#${lesson.sequence_number}</div>
                    <div class="lesson-body">
                        <div class="lesson-top-row">
                            <h4 class="lesson-main-title">${this.escapeHtml(lesson.lesson_title)}</h4>
                            <div class="lesson-badge-group">
                                <span class="badge-duration">⏱ ${lesson.duration_minutes} mins</span>
                                <span class="badge-version">🏷 ${this.escapeHtml(lesson.curriculum_version || 'NCDC-2026.1')}</span>
                                ${lesson.status === 'retired' ? '<span class="badge badge-inactive">Retired</span>' : '<span class="badge badge-active">Active</span>'}
                            </div>
                        </div>
                        <div class="lesson-objectives-box">
                            <strong>🎯 Learning Objectives & Competencies:</strong>
                            <p style="margin-top:4px; white-space:pre-line;">${this.escapeHtml(lesson.lesson_objectives || 'Standard NCDC primary competencies and lesson milestones.')}</p>
                        </div>
                        ${isStaff ? `
                            <div class="lesson-actions-bar">
                                <div class="reorder-btn-group">
                                    <button class="reorder-btn" title="Move Up" ${idx === 0 ? 'disabled' : ''} onclick="App.handleReorderLesson(${lesson.subject_id}, ${lesson.lesson_id}, 'up')">▲ Up</button>
                                    <button class="reorder-btn" title="Move Down" ${idx === total - 1 ? 'disabled' : ''} onclick="App.handleReorderLesson(${lesson.subject_id}, ${lesson.lesson_id}, 'down')">▼ Down</button>
                                </div>
                                <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.75rem;" onclick="App.openEditLessonModal(${lesson.lesson_id})">✏️ Edit</button>
                                <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.75rem; color:${lesson.status === 'active' ? 'var(--danger)' : 'var(--success)'};" onclick="App.handleRetireLesson(${lesson.lesson_id}, '${lesson.status}')">
                                    ${lesson.status === 'active' ? '🚫 Retire' : '✅ Reactivate'}
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');

            lessonsContainer.innerHTML = offlineBanner + listHtml;
        } catch (err) {
            lessonsContainer.innerHTML = `
                <div class="alert alert-danger" style="margin-top:1rem;">
                    Failed to load lessons: ${this.escapeHtml(err.message)}
                </div>
            `;
        }
    },

    handleCurriculumSearch(query) {
        this.curriculumState.searchTerm = (query || '').trim();
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => {
            this.loadCurriculumLessons();
        }, 250);
    },

    handleCurriculumStatusChange(status) {
        this.curriculumState.statusFilter = status;
        this.loadCurriculumLessons();
    },

    // -------------------------------------------------------------------------
    // Officer Authoring Modals & Actions
    // -------------------------------------------------------------------------

    renderCurriculumModalsHtml() {
        return `
            <!-- Create Subject Modal -->
            <div id="create-subject-modal" class="modal-overlay">
                <div class="modal-card">
                    <div class="modal-header">
                        <h3>➕ Add New Curriculum Subject</h3>
                        <button class="modal-close" onclick="App.closeCreateSubjectModal()">×</button>
                    </div>
                    <form onsubmit="App.handleCreateSubject(event)">
                        <div id="create-subject-alert"></div>
                        <div class="form-group">
                            <label>Primary Class Level *</label>
                            <select id="new-subj-class-id" class="form-control" required>
                                ${this.curriculumState.classes.map(c => `
                                    <option value="${c.class_id}" ${c.class_id === this.curriculumState.activeClassId ? 'selected' : ''}>${this.escapeHtml(c.class_name)} (${c.class_code})</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subject Name *</label>
                            <input type="text" id="new-subj-name" class="form-control" placeholder="e.g. Mathematics" required>
                        </div>
                        <div class="form-group">
                            <label>Subject Code *</label>
                            <input type="text" id="new-subj-code" class="form-control" placeholder="e.g. P1-MTC" required>
                        </div>
                        <div class="form-group">
                            <label>Weekly Allocated Hours</label>
                            <input type="number" step="0.5" id="new-subj-hours" class="form-control" value="5.0" required>
                        </div>
                        <div class="form-group">
                            <label>Language of Instruction</label>
                            <input type="text" id="new-subj-lang" class="form-control" value="English" required>
                        </div>
                        <div class="form-group">
                            <label>Description & Scope</label>
                            <textarea id="new-subj-desc" class="form-control" rows="2" placeholder="Uganda NCDC Primary Curriculum standard unit."></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="App.closeCreateSubjectModal()">Cancel</button>
                            <button type="submit" id="btn-save-subject" class="btn btn-primary">Create Subject</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Edit Subject Modal -->
            <div id="edit-subject-modal" class="modal-overlay">
                <div class="modal-card">
                    <div class="modal-header">
                        <h3>✏️ Edit Curriculum Subject</h3>
                        <button class="modal-close" onclick="App.closeEditSubjectModal()">×</button>
                    </div>
                    <form onsubmit="App.handleEditSubject(event)">
                        <input type="hidden" id="edit-subj-id">
                        <div id="edit-subject-alert"></div>
                        <div class="form-group">
                            <label>Subject Name *</label>
                            <input type="text" id="edit-subj-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Weekly Allocated Hours</label>
                            <input type="number" step="0.5" id="edit-subj-hours" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Language of Instruction</label>
                            <input type="text" id="edit-subj-lang" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="edit-subj-desc" class="form-control" rows="2"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditSubjectModal()">Cancel</button>
                            <button type="submit" id="btn-update-subject" class="btn btn-primary">Update Subject</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Create Lesson Modal -->
            <div id="create-lesson-modal" class="modal-overlay">
                <div class="modal-card">
                    <div class="modal-header">
                        <h3>➕ Add New Sequenced Lesson</h3>
                        <button class="modal-close" onclick="App.closeCreateLessonModal()">×</button>
                    </div>
                    <form onsubmit="App.handleCreateLesson(event)">
                        <div id="create-lesson-alert"></div>
                        <div class="form-group">
                            <label>Target Subject *</label>
                            <select id="new-lesson-subject-id" class="form-control" required onchange="App.handleNewLessonSubjectChange(this.value)">
                                ${this.curriculumState.subjects.map(s => `
                                    <option value="${s.subject_id}" data-class-id="${s.class_id}" ${s.subject_id === this.curriculumState.activeSubjectId ? 'selected' : ''}>
                                        ${this.escapeHtml(s.subject_name)} (${s.subject_code})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Lesson Title *</label>
                            <input type="text" id="new-lesson-title" class="form-control" placeholder="e.g. Introduction to Place Values" required>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <div class="form-group">
                                <label>Duration (Minutes) *</label>
                                <input type="number" id="new-lesson-duration" class="form-control" value="40" min="10" max="180" required>
                            </div>
                            <div class="form-group">
                                <label>Curriculum Version *</label>
                                <input type="text" id="new-lesson-version" class="form-control" value="NCDC-2026.1" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Learning Objectives & Competencies *</label>
                            <textarea id="new-lesson-objectives" class="form-control" rows="3" placeholder="Define learner competencies and practical exercises..." required></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="App.closeCreateLessonModal()">Cancel</button>
                            <button type="submit" id="btn-save-lesson" class="btn btn-primary">Save Lesson</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Edit Lesson Modal -->
            <div id="edit-lesson-modal" class="modal-overlay">
                <div class="modal-card">
                    <div class="modal-header">
                        <h3>✏️ Edit Curriculum Lesson</h3>
                        <button class="modal-close" onclick="App.closeEditLessonModal()">×</button>
                    </div>
                    <form onsubmit="App.handleEditLesson(event)">
                        <input type="hidden" id="edit-lesson-id">
                        <div id="edit-lesson-alert"></div>
                        <div class="form-group">
                            <label>Lesson Title *</label>
                            <input type="text" id="edit-lesson-title" class="form-control" required>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <div class="form-group">
                                <label>Duration (Minutes) *</label>
                                <input type="number" id="edit-lesson-duration" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Curriculum Version *</label>
                                <input type="text" id="edit-lesson-version" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Learning Objectives & Competencies *</label>
                            <textarea id="edit-lesson-objectives" class="form-control" rows="3" required></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditLessonModal()">Cancel</button>
                            <button type="submit" id="btn-update-lesson" class="btn btn-primary">Update Lesson</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    openCreateSubjectModal() {
        const modal = document.getElementById('create-subject-modal');
        if (modal) {
            document.getElementById('create-subject-alert').innerHTML = '';
            document.getElementById('new-subj-name').value = '';
            document.getElementById('new-subj-code').value = '';
            document.getElementById('new-subj-desc').value = '';
            modal.classList.add('active');
        }
    },

    closeCreateSubjectModal() {
        document.getElementById('create-subject-modal')?.classList.remove('active');
    },

    async handleCreateSubject(e) {
        e.preventDefault();
        const alertBox = document.getElementById('create-subject-alert');
        const submitBtn = document.getElementById('btn-save-subject');

        const payload = {
            class_id: parseInt(document.getElementById('new-subj-class-id').value, 10),
            subject_name: document.getElementById('new-subj-name').value.trim(),
            subject_code: document.getElementById('new-subj-code').value.trim(),
            weekly_hours: parseFloat(document.getElementById('new-subj-hours').value) || 5.0,
            language_of_instruction: document.getElementById('new-subj-lang').value.trim() || 'English',
            description: document.getElementById('new-subj-desc').value.trim()
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating...';
        alertBox.innerHTML = '';

        try {
            await API.post('/api/officer/subjects', payload);
            this.closeCreateSubjectModal();
            await this.loadCurriculumClasses();
            alert('Curriculum Subject created successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Subject';
        }
    },

    async openEditSubjectModal(subjectId) {
        const modal = document.getElementById('edit-subject-modal');
        const alertBox = document.getElementById('edit-subject-alert');
        if (!modal) return;

        alertBox.innerHTML = '';
        try {
            const res = await API.get(`/api/curriculum/subjects/${subjectId}`);
            const subj = res.data;
            document.getElementById('edit-subj-id').value = subj.subject_id;
            document.getElementById('edit-subj-name').value = subj.subject_name;
            document.getElementById('edit-subj-hours').value = subj.weekly_hours;
            document.getElementById('edit-subj-lang').value = subj.language_of_instruction || 'English';
            document.getElementById('edit-subj-desc').value = subj.description || '';
            modal.classList.add('active');
        } catch (err) {
            alert('Failed to load subject details: ' + err.message);
        }
    },

    closeEditSubjectModal() {
        document.getElementById('edit-subject-modal')?.classList.remove('active');
    },

    async handleEditSubject(e) {
        e.preventDefault();
        const alertBox = document.getElementById('edit-subject-alert');
        const submitBtn = document.getElementById('btn-update-subject');
        const subjectId = document.getElementById('edit-subj-id').value;

        const payload = {
            subject_name: document.getElementById('edit-subj-name').value.trim(),
            weekly_hours: parseFloat(document.getElementById('edit-subj-hours').value) || 5.0,
            language_of_instruction: document.getElementById('edit-subj-lang').value.trim() || 'English',
            description: document.getElementById('edit-subj-desc').value.trim()
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Updating...';
        alertBox.innerHTML = '';

        try {
            await API.put(`/api/officer/subjects/${subjectId}`, payload);
            this.closeEditSubjectModal();
            await this.selectCurriculumClass(this.curriculumState.activeClassId);
            alert('Subject updated successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Update Subject';
        }
    },

    openCreateLessonModal() {
        const modal = document.getElementById('create-lesson-modal');
        if (!modal) return;

        document.getElementById('create-lesson-alert').innerHTML = '';
        document.getElementById('new-lesson-title').value = '';
        document.getElementById('new-lesson-objectives').value = '';
        document.getElementById('new-lesson-duration').value = '40';
        document.getElementById('new-lesson-version').value = 'NCDC-2026.1';

        // Ensure subject selector is populated
        const subjSelect = document.getElementById('new-lesson-subject-id');
        if (subjSelect && this.curriculumState.subjects.length > 0) {
            subjSelect.innerHTML = this.curriculumState.subjects.map(s => `
                <option value="${s.subject_id}" data-class-id="${s.class_id}" ${s.subject_id === this.curriculumState.activeSubjectId ? 'selected' : ''}>
                    ${this.escapeHtml(s.subject_name)} (${s.subject_code})
                </option>
            `).join('');
        }

        modal.classList.add('active');
    },

    closeCreateLessonModal() {
        document.getElementById('create-lesson-modal')?.classList.remove('active');
    },

    handleNewLessonSubjectChange(subjectId) {
        // Keeps state synchronized
    },

    async handleCreateLesson(e) {
        e.preventDefault();
        const alertBox = document.getElementById('create-lesson-alert');
        const submitBtn = document.getElementById('btn-save-lesson');

        const subjSelect = document.getElementById('new-lesson-subject-id');
        const selectedOption = subjSelect.options[subjSelect.selectedIndex];
        const subjectId = parseInt(subjSelect.value, 10);
        const classId = parseInt(selectedOption.getAttribute('data-class-id') || this.curriculumState.activeClassId, 10);

        const payload = {
            subject_id: subjectId,
            class_id: classId,
            lesson_title: document.getElementById('new-lesson-title').value.trim(),
            lesson_objectives: document.getElementById('new-lesson-objectives').value.trim(),
            duration_minutes: parseInt(document.getElementById('new-lesson-duration').value, 10) || 40,
            curriculum_version: document.getElementById('new-lesson-version').value.trim() || 'NCDC-2026.1',
            status: 'active'
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
        alertBox.innerHTML = '';

        try {
            await API.post('/api/officer/lessons', payload);
            this.closeCreateLessonModal();
            await this.loadCurriculumLessons();
            alert('Curriculum Lesson added successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Lesson';
        }
    },

    async openEditLessonModal(lessonId) {
        const modal = document.getElementById('edit-lesson-modal');
        const alertBox = document.getElementById('edit-lesson-alert');
        if (!modal) return;

        alertBox.innerHTML = '';
        try {
            const res = await API.get(`/api/curriculum/lessons/${lessonId}`);
            const lesson = res.data;
            document.getElementById('edit-lesson-id').value = lesson.lesson_id;
            document.getElementById('edit-lesson-title').value = lesson.lesson_title;
            document.getElementById('edit-lesson-duration').value = lesson.duration_minutes;
            document.getElementById('edit-lesson-version').value = lesson.curriculum_version || 'NCDC-2026.1';
            document.getElementById('edit-lesson-objectives').value = lesson.lesson_objectives || '';
            modal.classList.add('active');
        } catch (err) {
            alert('Failed to load lesson details: ' + err.message);
        }
    },

    closeEditLessonModal() {
        document.getElementById('edit-lesson-modal')?.classList.remove('active');
    },

    async handleEditLesson(e) {
        e.preventDefault();
        const alertBox = document.getElementById('edit-lesson-alert');
        const submitBtn = document.getElementById('btn-update-lesson');
        const lessonId = document.getElementById('edit-lesson-id').value;

        const payload = {
            lesson_title: document.getElementById('edit-lesson-title').value.trim(),
            duration_minutes: parseInt(document.getElementById('edit-lesson-duration').value, 10) || 40,
            curriculum_version: document.getElementById('edit-lesson-version').value.trim() || 'NCDC-2026.1',
            lesson_objectives: document.getElementById('edit-lesson-objectives').value.trim()
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'Updating...';
        alertBox.innerHTML = '';

        try {
            await API.put(`/api/officer/lessons/${lessonId}`, payload);
            this.closeEditLessonModal();
            await this.loadCurriculumLessons();
            alert('Curriculum Lesson updated successfully.');
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Update Lesson';
        }
    },

    async handleRetireLesson(lessonId, currentStatus) {
        const nextStatus = currentStatus === 'active' ? 'retired' : 'active';
        const actionLabel = currentStatus === 'active' ? 'retire' : 'reactivate';

        if (!confirm(`Are you sure you want to ${actionLabel} this lesson?`)) {
            return;
        }

        try {
            await API.post(`/api/officer/lessons/${lessonId}/retire`, { status: nextStatus });
            await this.loadCurriculumLessons();
        } catch (err) {
            alert('Failed to update lesson status: ' + err.message);
        }
    },

    async handleReorderLesson(subjectId, lessonId, direction) {
        const lessons = this.curriculumState.lessons;
        const currIdx = lessons.findIndex(l => l.lesson_id === lessonId);
        if (currIdx === -1) return;

        const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
        if (targetIdx < 0 || targetIdx >= lessons.length) return;

        // Clone array and swap
        const newLessonList = [...lessons];
        const temp = newLessonList[currIdx];
        newLessonList[currIdx] = newLessonList[targetIdx];
        newLessonList[targetIdx] = temp;

        const orderedIds = newLessonList.map(l => l.lesson_id);

        try {
            await API.post('/api/officer/lessons/reorder', {
                subject_id: subjectId,
                lesson_ids: orderedIds
            });
            await this.loadCurriculumLessons();
        } catch (err) {
            alert('Failed to reorder lessons: ' + err.message);
        }
    },

    // =========================================================================
    // MODULE 04: LEARNING MATERIALS & DIGITAL CONTENT DELIVERY (UP TO 300MB)
    // =========================================================================

    materialsState: {
        materials: [],
        pagination: { total: 0, page: 1, limit: 12, pages: 1 },
        classes: [],
        allSubjects: [],
        subjects: [],
        lessons: [],
        filterClassId: '',
        filterSubjectId: '',
        filterLessonId: '',
        filterType: '',
        filterStatus: '',
        activeTab: 'all',
        searchTerm: '',
        activePreviewMaterial: null,
        selectedLearnerId: '',
        selectedLearner: null,
        maxClassLevel: null,
        parentLearners: []
    },

    async renderMaterials(container) {
        const user = Auth.getUser();
        const role = Auth.getRole();
        const isStaff = ['curriculum_officer', 'administrator'].includes(role);
        const defaultDash = this.getDefaultDashboard();

        // Load parent learners if user is parent
        let parentLearners = [];
        if (role === 'parent') {
            try {
                const lRes = await API.get('/api/parent/learners');
                parentLearners = Array.isArray(lRes.data) ? lRes.data : (lRes.data?.learners || []);
                this.materialsState.parentLearners = parentLearners;
                
                // If a learner was previously selected or queued, resolve it
                if (this.materialsState.selectedLearnerId) {
                    const matchedChild = parentLearners.find(l => String(l.learner_id) === String(this.materialsState.selectedLearnerId));
                    if (matchedChild) {
                        this.materialsState.selectedLearner = matchedChild;
                        this.materialsState.maxClassLevel = parseInt(matchedChild.class_level || matchedChild.level || 7, 10);
                    }
                }
            } catch (err) {
                console.warn('Could not load parent learners:', err);
            }
        }

        container.innerHTML = `
            <div style="max-width:1300px; margin:0 auto; padding-bottom: 2rem;">
                <div class="curriculum-header-bar" style="margin-bottom:1.5rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <h2 style="margin:0;">📁 Learning Materials & Digital Content</h2>
                            <span class="badge badge-success" style="font-size:0.75rem;">300 MB Limit</span>
                            <span class="badge badge-primary" style="font-size:0.75rem;">SHA-256 Checksums</span>
                            <span class="badge badge-secondary" style="font-size:0.75rem;">Multi-Format Engine</span>
                        </div>
                        <p style="color:var(--text-muted); margin-top:4px;">
                            Uganda Primary Curriculum Digital Assets • PDF, DOCX, MP4, WebM, MP3, WAV, PNG, SVG & Interactive Media
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <a href="${defaultDash}" class="btn btn-secondary btn-sm">← Back to Dashboard</a>
                        ${isStaff ? `
                            <button class="btn btn-primary btn-sm" onclick="App.openUploadMaterialModal()">
                                ➕ Upload Material (300MB Max)
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div id="materials-alert" style="margin-bottom:1rem;"></div>

                <!-- Status & Child Scope Switchers Bar -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:0.75rem;">
                    <!-- Status Pipeline Tabs (Resources Switcher) -->
                    <div class="materials-pipeline-tabs" style="margin:0;">
                        <button class="pipeline-tab active" id="tab-mat-all" onclick="App.setMaterialsTab('all')">
                            <span>📁</span> All Resources
                        </button>
                        <button class="pipeline-tab" id="tab-mat-approved" onclick="App.setMaterialsTab('approved')">
                            <span>✅</span> Approved & Active
                        </button>
                        <button class="pipeline-tab" id="tab-mat-submitted" onclick="App.setMaterialsTab('submitted')">
                            <span>⏳</span> In Review
                        </button>
                        ${isStaff ? `
                            <button class="pipeline-tab" id="tab-mat-draft" onclick="App.setMaterialsTab('draft')">
                                <span>📝</span> Drafts
                            </button>
                            <button class="pipeline-tab" id="tab-mat-retired" onclick="App.setMaterialsTab('retired')">
                                <span>🚫</span> Retired
                            </button>
                        ` : ''}
                    </div>

                    ${role === 'parent' && parentLearners.length > 0 ? `
                        <!-- Quick Switch Child Pills Placed Next to Resources Switcher -->
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Child Scope:</span>
                            <div class="quick-child-pills-container">
                                <button type="button" 
                                        id="pill-child-all"
                                        class="quick-child-pill ${!this.materialsState.selectedLearnerId ? 'active-all' : ''}" 
                                        onclick="App.handleParentChildSelect('')"
                                        title="Browse all materials across P1–P7">
                                    <span class="child-pill-icon">🌟</span>
                                    <span>All Materials</span>
                                </button>
                                ${parentLearners.map(l => {
                                    const isSelected = String(this.materialsState.selectedLearnerId) === String(l.learner_id);
                                    const classTag = l.class_code || ('P' + (l.class_level || l.level || ''));
                                    const firstName = this.escapeHtml((l.full_name || '').split(' ')[0]);
                                    const isFemale = l.gender === 'female';
                                    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name || 'Learner')}&background=${isFemale ? 'ec4899' : '2563eb'}&color=fff&rounded=true&bold=true&size=64`;
                                    const photoUrl = l.avatar_url || fallbackAvatar;
                                    return `
                                        <button type="button" 
                                                id="pill-child-${l.learner_id}"
                                                data-learner-id="${l.learner_id}"
                                                class="quick-child-pill ${isSelected ? 'active-child' : ''}" 
                                                onclick="App.handleParentChildSelect(${l.learner_id})"
                                                title="Scope materials for ${this.escapeHtml(l.full_name)} (P1 to ${classTag})">
                                            <img src="${this.escapeHtml(photoUrl)}" 
                                                 alt="${this.escapeHtml(l.full_name)}" 
                                                 class="child-pill-avatar"
                                                 onerror="this.src='${fallbackAvatar}';">
                                            <span>${firstName}</span>
                                            <span class="child-pill-badge">${classTag}</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Filter Controls Toolbar -->
                <div class="card" style="padding:0.5rem 0.85rem; margin-bottom:0.85rem; background:#fff; border:1px solid var(--border-color); border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px; align-items:flex-end;">
                        <div>
                            <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.3px;">Class Level</label>
                            <select id="mat-filter-class" class="form-control" style="height:32px; font-size:0.82rem; padding:0.2rem 0.55rem; border-radius:6px; border:1px solid #cbd5e1;" onchange="App.handleMaterialClassFilter(this.value)">
                                <option value="">All Classes (P1–P7)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.3px;">Subject</label>
                            <select id="mat-filter-subject" class="form-control" style="height:32px; font-size:0.82rem; padding:0.2rem 0.55rem; border-radius:6px; border:1px solid #cbd5e1;" onchange="App.handleMaterialSubjectFilter(this.value)">
                                <option value="">All Subjects</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.3px;">Content Format</label>
                            <select id="mat-filter-type" class="form-control" style="height:32px; font-size:0.82rem; padding:0.2rem 0.55rem; border-radius:6px; border:1px solid #cbd5e1;" onchange="App.handleMaterialTypeFilter(this.value)">
                                <option value="">All Formats</option>
                                <option value="text">📄 Text & Documents (PDF, DOCX, EPUB)</option>
                                <option value="video">🎬 Video (MP4, WebM)</option>
                                <option value="audio">🎧 Audio (MP3, WAV)</option>
                                <option value="image">🖼️ Visual & Infographics (PNG, JPG, SVG)</option>
                                <option value="interactive">🧩 Interactive (HTML5, ZIP)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.3px;">Search Keywords</label>
                            <input type="text" id="mat-filter-search" class="form-control" placeholder="Search title, description..." style="height:32px; font-size:0.82rem; padding:0.25rem 0.6rem; border-radius:6px; border:1px solid #cbd5e1;" oninput="App.handleMaterialSearch(this.value)">
                        </div>
                    </div>
                </div>

                <!-- Summary Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <div id="materials-count-summary" style="font-size:0.82rem; font-weight:600; color:var(--text-muted);">
                        Loading resources...
                    </div>
                </div>

                <!-- Materials Cards Grid Container -->
                <div id="materials-grid-container" class="materials-grid">
                    <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); grid-column:1/-1;">
                        <div style="font-size:2rem; margin-bottom:8px;">⏳</div>
                        <p>Loading digital learning materials...</p>
                    </div>
                </div>

                <!-- Modals Container -->
                <div id="materials-modals-mount"></div>
            </div>
        `;

        await this.loadMaterialsFilterOptions();
        await this.loadMaterials();
    },

    async loadMaterialsFilterOptions() {
        try {
            const [classRes, subjRes] = await Promise.allSettled([
                API.get('/api/curriculum/classes'),
                API.get('/api/curriculum/subjects')
            ]);
            
            if (classRes.status === 'fulfilled') {
                const rawClasses = Array.isArray(classRes.value.data) ? classRes.value.data : (classRes.value.data?.classes || []);
                this.materialsState.classes = rawClasses;
            }

            if (subjRes.status === 'fulfilled') {
                const rawSubjects = Array.isArray(subjRes.value.data) ? subjRes.value.data : (subjRes.value.data?.subjects || []);
                this.materialsState.allSubjects = rawSubjects;
                this.materialsState.subjects = rawSubjects;
            }

            this.updateMaterialClassAndSubjectDropdowns();
        } catch (err) {
            console.error('Failed to load filter options for materials:', err);
        }
    },

    updateMaterialClassAndSubjectDropdowns() {
        const classSelect = document.getElementById('mat-filter-class');
        const subjectSelect = document.getElementById('mat-filter-subject');
        const allClasses = this.materialsState.classes || [];
        const maxLvl = this.materialsState.maxClassLevel;

        let availableClasses = allClasses;
        if (maxLvl !== null && maxLvl !== undefined && maxLvl > 0) {
            availableClasses = allClasses.filter(c => parseInt(c.level || 0, 10) <= maxLvl);
        }

        if (classSelect) {
            let defaultLabel = 'All Classes (P1–P7)';
            if (this.materialsState.selectedLearner && maxLvl) {
                defaultLabel = `All Foundational Classes (P1 to P${maxLvl})`;
            }
            classSelect.innerHTML = `<option value="">${defaultLabel}</option>` +
                availableClasses.map(c => `
                    <option value="${c.class_id}" ${String(this.materialsState.filterClassId) === String(c.class_id) ? 'selected' : ''}>
                        ${this.escapeHtml(c.class_name)} (${c.class_code})
                    </option>
                `).join('');
        }

        if (subjectSelect) {
            let availableSubjects = this.materialsState.allSubjects || [];
            if (this.materialsState.filterClassId) {
                availableSubjects = availableSubjects.filter(s => String(s.class_id) === String(this.materialsState.filterClassId));
            } else if (maxLvl !== null && maxLvl !== undefined && maxLvl > 0) {
                const allowedClassIds = new Set(availableClasses.map(c => String(c.class_id)));
                availableSubjects = availableSubjects.filter(s => allowedClassIds.has(String(s.class_id)));
            }

            let defaultSubjLabel = 'All Subjects';
            if (this.materialsState.selectedLearner && maxLvl && !this.materialsState.filterClassId) {
                defaultSubjLabel = `All Subjects (P1–P${maxLvl})`;
            }

            subjectSelect.innerHTML = `<option value="">${defaultSubjLabel}</option>` +
                availableSubjects.map(s => `
                    <option value="${s.subject_id}" ${String(this.materialsState.filterSubjectId) === String(s.subject_id) ? 'selected' : ''}>
                        ${this.escapeHtml(s.class_code ? s.class_code + ' • ' : '')}${this.escapeHtml(s.subject_name)} (${s.subject_code || ''})
                    </option>
                `).join('');
        }
    },

    async handleParentChildSelect(learnerId) {
        this.materialsState.selectedLearnerId = learnerId ? String(learnerId) : '';
        this.materialsState.filterClassId = '';
        this.materialsState.filterSubjectId = '';
        this.materialsState.filterLessonId = '';

        // Dynamically toggle active styling on quick-child-pills
        const allPill = document.getElementById('pill-child-all');
        if (allPill) {
            if (!this.materialsState.selectedLearnerId) {
                allPill.classList.add('active-all');
            } else {
                allPill.classList.remove('active-all');
            }
        }

        document.querySelectorAll('.quick-child-pill[id^="pill-child-"]').forEach(pill => {
            if (pill.id === 'pill-child-all') return;
            const pid = pill.getAttribute('data-learner-id');
            if (pid && String(pid) === String(this.materialsState.selectedLearnerId)) {
                pill.classList.add('active-child');
            } else {
                pill.classList.remove('active-child');
            }
        });

        if (learnerId) {
            const child = (this.materialsState.parentLearners || []).find(l => String(l.learner_id) === String(learnerId));
            this.materialsState.selectedLearner = child || null;
            this.materialsState.maxClassLevel = child ? parseInt(child.class_level || child.level || 7, 10) : null;
        } else {
            this.materialsState.selectedLearner = null;
            this.materialsState.maxClassLevel = null;
        }

        this.updateMaterialClassAndSubjectDropdowns();
        await this.loadMaterials();
    },

    viewChildSchedule(learnerId) {
        if (typeof ScheduleApp !== 'undefined') {
            ScheduleApp.selectedLearnerId = parseInt(learnerId, 10);
        }
        this.closeLearnerDetailModal();
        window.location.hash = '#parent-schedule';
    },

    viewChildExams(learnerId) {
        if (typeof ExamsApp !== 'undefined') {
            ExamsApp.selectedLearnerId = parseInt(learnerId, 10);
        }
        this.closeLearnerDetailModal();
        window.location.hash = '#parent-exams';
    },

    viewChildAssessments(learnerId) {
        if (typeof AssessmentsApp !== 'undefined') {
            AssessmentsApp.selectedLearnerId = parseInt(learnerId, 10);
        }
        this.closeLearnerDetailModal();
        window.location.hash = '#parent-assessments';
    },

    viewChildMaterials(learnerId) {
        this.materialsState.selectedLearnerId = String(learnerId);
        this.closeLearnerDetailModal();
        window.location.hash = '#learner-materials';
    },

    async handleMaterialClassFilter(classId) {
        this.materialsState.filterClassId = classId;
        this.materialsState.filterSubjectId = '';
        this.materialsState.filterLessonId = '';

        const subjectSelect = document.getElementById('mat-filter-subject');
        if (subjectSelect) {
            if (!classId) {
                this.updateMaterialClassAndSubjectDropdowns();
            } else {
                subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
                try {
                    const res = await API.get(`/api/curriculum/classes/${classId}/subjects`);
                    const rawSubjects = res.data?.subjects || (Array.isArray(res.data) ? res.data : []);
                    this.materialsState.subjects = rawSubjects;
                    subjectSelect.innerHTML = '<option value="">All Subjects in Class</option>' +
                        rawSubjects.map(s => `
                            <option value="${s.subject_id}">${this.escapeHtml(s.subject_name)} (${s.subject_code || ''})</option>
                        `).join('');
                } catch (err) {
                    subjectSelect.innerHTML = '<option value="">All Subjects</option>';
                }
            }
        }

        await this.loadMaterials();
    },

    async handleMaterialSubjectFilter(subjectId) {
        this.materialsState.filterSubjectId = subjectId;
        await this.loadMaterials();
    },

    async handleMaterialTypeFilter(type) {
        this.materialsState.filterType = type;
        await this.loadMaterials();
    },

    setMaterialsTab(tab) {
        this.materialsState.activeTab = tab;
        document.querySelectorAll('.pipeline-tab[id^="tab-mat-"], .class-tab-btn[id^="tab-mat-"]').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`tab-mat-${tab}`);
        if (activeBtn) activeBtn.classList.add('active');

        if (tab === 'all') {
            this.materialsState.filterStatus = '';
        } else {
            this.materialsState.filterStatus = tab;
        }

        this.loadMaterials();
    },

    handleMaterialSearch(query) {
        this.materialsState.searchTerm = (query || '').trim();
        clearTimeout(this._matSearchDebounce);
        this._matSearchDebounce = setTimeout(() => {
            this.loadMaterials();
        }, 300);
    },

    async loadMaterials() {
        const grid = document.getElementById('materials-grid-container');
        const countSummary = document.getElementById('materials-count-summary');
        if (!grid) return;

        grid.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted); grid-column:1/-1;">
                <div style="font-size:2rem; margin-bottom:8px;">⏳</div>
                <p>Loading digital learning materials...</p>
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (this.materialsState.filterClassId) {
                params.append('class_id', this.materialsState.filterClassId);
            }
            if (this.materialsState.selectedLearnerId) {
                params.append('learner_id', this.materialsState.selectedLearnerId);
            } else if (this.materialsState.maxClassLevel) {
                params.append('max_class_level', this.materialsState.maxClassLevel);
            }
            if (this.materialsState.filterSubjectId) params.append('subject_id', this.materialsState.filterSubjectId);
            if (this.materialsState.filterType) params.append('type', this.materialsState.filterType);
            if (this.materialsState.filterStatus) params.append('status', this.materialsState.filterStatus);
            if (this.materialsState.searchTerm) params.append('search', this.materialsState.searchTerm);
            params.append('limit', '50');

            const res = await API.get(`/api/materials?${params.toString()}`);
            const rawData = res.data;
            const materialsList = Array.isArray(rawData) ? rawData : (rawData?.materials || []);
            this.materialsState.materials = materialsList;
            this.materialsState.pagination = rawData?.pagination || { total: materialsList.length };

            if (countSummary) {
                let scopeNote = '';
                if (this.materialsState.selectedLearner) {
                    scopeNote = ` (Scoped for ${this.materialsState.selectedLearner.full_name}: P1 to ${this.materialsState.selectedLearner.class_code || 'P' + this.materialsState.selectedLearner.class_level})`;
                }
                countSummary.innerText = `Showing ${this.materialsState.materials.length} of ${this.materialsState.pagination.total || this.materialsState.materials.length} digital resources${scopeNote}`;
            }

            if (this.materialsState.materials.length === 0) {
                grid.innerHTML = `
                    <div style="text-align:center; padding:4rem 1rem; color:var(--text-muted); grid-column:1/-1; background:var(--bg-card); border-radius:var(--radius-md); border:1px dashed var(--border-color);">
                        <div style="font-size:2.5rem; margin-bottom:12px;">📁</div>
                        <h3 style="font-size:1.1rem; color:var(--text-main); margin-bottom:6px;">No learning materials match your filter</h3>
                        <p style="font-size:0.88rem;">Adjust child, class, subject, format filter or search keywords to view resources.</p>
                    </div>
                `;
                return;
            }

            const role = Auth.getRole();
            const isStaff = ['curriculum_officer', 'administrator'].includes(role);

            grid.innerHTML = this.materialsState.materials.map(m => {
                const formatClass = `format-${m.material_type || 'text'}`;
                const formatIcon = this.getFormatIcon(m.material_type);
                const sizeFormatted = this.formatBytes(m.file_size_bytes || (m.file_size_kb ? m.file_size_kb * 1024 : 0));
                const statusBadge = this.renderMaterialStatusBadge(m.status);

                return `
                    <div class="material-card ${m.status === 'retired' ? 'retired' : ''}" id="mat-card-${m.material_id}">
                        <div>
                            <div class="material-card-header">
                                <div style="display:flex; gap:10px; align-items:flex-start;">
                                    <div class="material-format-icon ${formatClass}">
                                        ${formatIcon}
                                    </div>
                                    <div>
                                        <h4 class="material-title">${this.escapeHtml(m.title)}</h4>
                                        <div class="material-meta-row">
                                            <span class="material-hierarchy-badge">
                                                🏫 ${this.escapeHtml(m.class_name || 'Primary')} • ${this.escapeHtml(m.subject_name || 'General')}
                                            </span>
                                            ${m.lesson_title ? `
                                                <span class="material-hierarchy-badge" title="${this.escapeHtml(m.lesson_title)}">
                                                    📖 ${this.escapeHtml(m.lesson_title.length > 22 ? m.lesson_title.substring(0,22) + '...' : m.lesson_title)}
                                                </span>
                                            ` : ''}
                                            <span class="material-version-tag">v${m.current_version || 1}</span>
                                        </div>
                                    </div>
                                </div>
                                <div>${statusBadge}</div>
                            </div>

                            <p class="material-desc">
                                ${this.escapeHtml(m.description || 'Syllabus-aligned digital learning asset approved for primary homeschool instruction.')}
                            </p>

                            <div class="material-file-info">
                                <span>📦 <strong>${sizeFormatted}</strong> (Max 300 MB)</span>
                                <span>🏷️ ${this.escapeHtml((m.mime_type || 'file').split('/')[1] || m.material_type).toUpperCase()}</span>
                            </div>
                        </div>

                        <div class="material-actions-bar">
                            <button class="btn btn-primary btn-sm" onclick="App.openMediaPreviewModal(${m.material_id})">
                                👁️ Preview / Play
                            </button>
                            <a href="/api/materials/${m.material_id}/download" target="_blank" class="btn btn-secondary btn-sm" title="Download Resource">
                                📥 Download
                            </a>

                            ${isStaff ? `
                                <button class="btn btn-secondary btn-sm" onclick="App.openUploadVersionModal(${m.material_id})" title="Upload new version with SHA-256">
                                    🆙 New Version
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="App.openEditMaterialModal(${m.material_id})" title="Edit Metadata">
                                    ✏️ Edit
                                </button>
                                ${m.status === 'draft' ? `
                                    <button class="btn btn-secondary btn-sm" style="color:var(--warning);" onclick="App.handleSubmitMaterial(${m.material_id})">
                                        🚀 Submit
                                    </button>
                                ` : ''}
                                ${['draft', 'submitted'].includes(m.status) ? `
                                    <button class="btn btn-secondary btn-sm" style="color:var(--success);" onclick="App.handleApproveMaterial(${m.material_id})">
                                        ✅ Approve
                                    </button>
                                ` : ''}
                                <button class="btn btn-secondary btn-sm" style="color:${['approved', 'active'].includes(m.status) ? 'var(--danger)' : 'var(--success)'};" onclick="App.handleRetireMaterial(${m.material_id}, '${m.status}')">
                                    ${['approved', 'active'].includes(m.status) ? '🚫 Deactivate' : '✅ Activate'}
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

        } catch (err) {
            grid.innerHTML = `<div class="alert alert-danger" style="grid-column:1/-1;">${this.escapeHtml(err.message)}</div>`;
        }
    },

    renderMaterialStatusBadge(status) {
        switch (status) {
            case 'approved':
            case 'active':
                return '<span class="badge badge-success" style="font-size:0.75rem;">Approved</span>';
            case 'submitted':
                return '<span class="badge badge-warning" style="font-size:0.75rem;">In Review</span>';
            case 'draft':
                return '<span class="badge badge-pending" style="font-size:0.75rem;">Draft</span>';
            case 'retired':
                return '<span class="badge badge-inactive" style="font-size:0.75rem;">Retired</span>';
            default:
                return `<span class="badge badge-pending" style="font-size:0.75rem;">${this.escapeHtml(status)}</span>`;
        }
    },

    getFormatIcon(type) {
        switch (type) {
            case 'video': return '🎬';
            case 'audio': return '🎧';
            case 'image': return '🖼️';
            case 'interactive': return '🧩';
            case 'text':
            default:
                return '📄';
        }
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    // =========================================================================
    // MODAL: UPLOAD NEW MATERIAL (300 MB MAX)
    // =========================================================================

    async openUploadMaterialModal(presetSubjectId = null, presetLessonId = null) {
        if (!this.materialsState.classes || this.materialsState.classes.length === 0) {
            await this.loadMaterialsFilterOptions();
        }

        const mount = document.getElementById('materials-modals-mount');
        if (!mount) return;

        mount.innerHTML = `
            <div class="modal-backdrop" id="upload-material-modal" style="display:flex;">
                <div class="modal-card modal-card-xl" style="max-width:960px; width:95%; max-height:92vh;">
                    <div class="modal-header">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.3rem;">📁</span>
                            <div>
                                <h3 style="margin:0; font-size:1.15rem;">Add New Digital Learning Resource</h3>
                                <p style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">Upload syllabus-aligned digital assets with cryptographic SHA-256 verification</p>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge badge-success" style="font-size:0.75rem;">Max 300 MB</span>
                            <span class="badge badge-primary" style="font-size:0.75rem;">NCDC Primary</span>
                            <button class="modal-close-btn" onclick="App.closeUploadMaterialModal()">&times;</button>
                        </div>
                    </div>
                    <form id="upload-material-form" onsubmit="App.handleUploadMaterial(event)">
                        <div class="modal-body" style="padding:1.5rem;">
                            <div id="upload-mat-alert"></div>

                            <div style="display:grid; grid-template-columns: 1.15fr 0.85fr; gap:1.5rem; align-items:start;" id="upload-mat-grid">
                                
                                <!-- Left Column: Metadata & Syllabus Mapping -->
                                <div>
                                    <div class="form-group" style="margin-bottom:1rem;">
                                        <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Material Title *</label>
                                        <input type="text" id="upload-mat-title" class="form-control" placeholder="e.g. Primary 4 Fractions Animated Video Guide" required>
                                    </div>

                                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:1rem;">
                                        <div class="form-group">
                                            <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Class Level *</label>
                                            <select id="upload-mat-class" class="form-control" required onchange="App.handleUploadClassChange(this.value)">
                                                <option value="">Select Primary Class</option>
                                                ${this.materialsState.classes.map(c => `
                                                    <option value="${c.class_id}">${this.escapeHtml(c.class_name)} (${c.class_code})</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Subject *</label>
                                            <select id="upload-mat-subject" class="form-control" required onchange="App.handleUploadSubjectChange(this.value)">
                                                <option value="">Select Class First</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:1rem;">
                                        <div class="form-group">
                                            <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Lesson Association</label>
                                            <select id="upload-mat-lesson" class="form-control">
                                                <option value="">General Subject Resource (No Lesson)</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Material Format *</label>
                                            <select id="upload-mat-type" class="form-control" required>
                                                <option value="text">📄 Text / Document (PDF, DOCX, EPUB)</option>
                                                <option value="video">🎬 Video (MP4, WebM)</option>
                                                <option value="audio">🎧 Audio (MP3, WAV)</option>
                                                <option value="image">🖼️ Visual & Diagrams (PNG, JPG, SVG)</option>
                                                <option value="interactive">🧩 Interactive Module (HTML5, ZIP)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div class="form-group" style="margin-bottom:0.5rem;">
                                        <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Pedagogical Description & Context</label>
                                        <textarea id="upload-mat-desc" class="form-control" rows="3" placeholder="Explain the competency, learning objective, or lesson guide this resource supports..."></textarea>
                                    </div>
                                </div>

                                <!-- Right Column: Digital Asset Upload & Live Dropzone -->
                                <div>
                                    <label class="form-label" style="font-weight:600; display:block; margin-bottom:4px;">Digital File Upload (Up to 300 MB) *</label>
                                    
                                    <div class="dropzone-container" id="mat-dropzone" style="padding:2.2rem 1.5rem; text-align:center;" onclick="document.getElementById('upload-mat-file').click()">
                                        <div style="font-size:2.8rem; margin-bottom:8px;">☁️</div>
                                        <p style="font-weight:700; font-size:0.95rem; margin-bottom:4px; color:var(--text-main);" id="dropzone-label">Click or drag & drop file here</p>
                                        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">
                                            High-capacity server limit: <strong>300 MB</strong>
                                        </p>
                                        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4px;">
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">PDF</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">DOCX</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">MP4</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">WebM</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">MP3</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">PNG/JPG</span>
                                            <span style="font-size:0.7rem; padding:2px 6px; background:#e2e8f0; border-radius:4px; color:#475569;">ZIP</span>
                                        </div>
                                    </div>
                                    <input type="file" id="upload-mat-file" style="display:none;" onchange="App.handleFileSelected(this)">

                                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:10px 12px; margin-top:12px; font-size:0.8rem; color:var(--text-muted);">
                                        <strong>🛡️ Integrity Check:</strong> An immutable SHA-256 hash will be computed upon receipt and stored in the version history.
                                    </div>
                                </div>

                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="App.closeUploadMaterialModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-submit-upload-mat" style="padding:0.6rem 1.4rem;">
                                🚀 Upload & Verify SHA-256
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        if (presetSubjectId) {
            // Pre-select if provided
        }
    },

    closeUploadMaterialModal() {
        const modal = document.getElementById('upload-material-modal');
        if (modal) modal.remove();
    },

    async handleUploadClassChange(classId) {
        const subjectSelect = document.getElementById('upload-mat-subject');
        const lessonSelect = document.getElementById('upload-mat-lesson');
        if (!subjectSelect) return;

        if (!classId) {
            subjectSelect.innerHTML = '<option value="">Select Class First</option>';
            if (lessonSelect) lessonSelect.innerHTML = '<option value="">General Subject Resource (No Lesson)</option>';
            return;
        }

        subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
        try {
            const res = await API.get(`/api/curriculum/classes/${classId}/subjects`);
            const rawSubjects = res.data?.subjects || (Array.isArray(res.data) ? res.data : []);
            this.materialsState.subjects = rawSubjects;
            if (rawSubjects.length === 0) {
                subjectSelect.innerHTML = '<option value="">No subjects found in this class</option>';
            } else {
                subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
                    rawSubjects.map(s => `<option value="${s.subject_id}">${this.escapeHtml(s.subject_name)} (${s.subject_code || ''})</option>`).join('');
            }
            if (lessonSelect) lessonSelect.innerHTML = '<option value="">General Subject Resource (No Lesson)</option>';
        } catch (err) {
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        }
    },

    async handleUploadSubjectChange(subjectId) {
        const lessonSelect = document.getElementById('upload-mat-lesson');
        if (!lessonSelect) return;

        if (!subjectId) {
            lessonSelect.innerHTML = '<option value="">General Subject Resource (No Lesson)</option>';
            return;
        }

        lessonSelect.innerHTML = '<option value="">Loading sequenced lessons...</option>';
        try {
            const res = await API.get(`/api/curriculum/subjects/${subjectId}/lessons?status=active`);
            const rawLessons = res.data?.lessons || (Array.isArray(res.data) ? res.data : []);
            this.materialsState.lessons = rawLessons;
            if (rawLessons.length === 0) {
                lessonSelect.innerHTML = '<option value="">General Subject Resource (No lessons registered)</option>';
            } else {
                lessonSelect.innerHTML = '<option value="">General Subject Resource (No Lesson)</option>' +
                    rawLessons.map(l => `<option value="${l.lesson_id}">#${l.sequence_number}: ${this.escapeHtml(l.lesson_title)}</option>`).join('');
            }
        } catch (err) {
            lessonSelect.innerHTML = '<option value="">General Subject Resource (No Lesson)</option>';
        }
    },

    handleFileSelected(input) {
        const file = input.files?.[0];
        const label = document.getElementById('dropzone-label');
        if (file && label) {
            const size = this.formatBytes(file.size);
            label.innerHTML = `Selected: <strong>${this.escapeHtml(file.name)}</strong> (${size})`;
            if (file.size > 300 * 1024 * 1024) {
                alert('Warning: File exceeds 300 MB limit. Please select a file under 300 MB.');
            }
        }
    },

    async handleUploadMaterial(e) {
        e.preventDefault();
        const alertBox = document.getElementById('upload-mat-alert');
        const submitBtn = document.getElementById('btn-submit-upload-mat');
        const fileInput = document.getElementById('upload-mat-file');

        const file = fileInput?.files?.[0];
        if (!file) {
            if (alertBox) alertBox.innerHTML = '<div class="alert alert-danger">Please select a file to upload.</div>';
            return;
        }

        if (file.size > 300 * 1024 * 1024) {
            if (alertBox) alertBox.innerHTML = '<div class="alert alert-danger">File size exceeds maximum limit of 300 MB.</div>';
            return;
        }

        const formData = new FormData();
        formData.append('title', document.getElementById('upload-mat-title').value.trim());
        formData.append('class_id', document.getElementById('upload-mat-class').value);
        formData.append('subject_id', document.getElementById('upload-mat-subject').value);
        const lessonId = document.getElementById('upload-mat-lesson').value;
        if (lessonId) formData.append('lesson_id', lessonId);
        formData.append('material_type', document.getElementById('upload-mat-type').value);
        formData.append('description', document.getElementById('upload-mat-desc').value.trim());
        formData.append('file', file);

        submitBtn.disabled = true;
        submitBtn.innerText = 'Uploading & computing SHA-256...';
        if (alertBox) alertBox.innerHTML = '';

        try {
            const res = await API.post('/api/officer/materials', formData);
            this.closeUploadMaterialModal();
            await this.loadMaterials();
            alert('Learning material uploaded successfully with SHA-256 integrity verification!');
        } catch (err) {
            if (alertBox) alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = '🚀 Upload & Verify SHA-256';
        }
    },

    // =========================================================================
    // MODAL: UPLOAD NEW VERSION (NON-DESTRUCTIVE SHA-256 VERSIONING)
    // =========================================================================

    async openUploadVersionModal(materialId) {
        const mat = this.materialsState.materials.find(m => m.material_id === materialId);
        if (!mat) return;

        const mount = document.getElementById('materials-modals-mount');
        if (!mount) return;

        mount.innerHTML = `
            <div class="modal-backdrop" id="version-material-modal" style="display:flex;">
                <div class="modal-card" style="max-width:550px; width:95%;">
                    <div class="modal-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <h3 style="margin:0;">🆙 Upload New Version</h3>
                            <span class="badge badge-primary">Current: v${mat.current_version || 1}</span>
                        </div>
                        <button class="modal-close-btn" onclick="App.closeUploadVersionModal()">&times;</button>
                    </div>
                    <form id="version-material-form" onsubmit="App.handleUploadVersion(event, ${materialId})">
                        <div class="modal-body">
                            <div id="version-mat-alert"></div>

                            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1rem;">
                                Uploading a new version will preserve previous revisions for historical integrity and increment the active version to <strong>v${(mat.current_version || 1) + 1}</strong>.
                            </p>

                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Resource Title</label>
                                <input type="text" class="form-control" value="${this.escapeHtml(mat.title)}" disabled>
                            </div>

                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Version Changelog / Revision Notes</label>
                                <textarea id="version-mat-notes" class="form-control" rows="2" placeholder="e.g. Updated diagrams for 2026 syllabus compliance..."></textarea>
                            </div>

                            <!-- 300MB Dropzone -->
                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Select New Version File (Up to 300 MB) *</label>
                                <div class="dropzone-container" id="version-dropzone" onclick="document.getElementById('version-mat-file').click()">
                                    <div style="font-size:2.2rem; margin-bottom:6px;">☁️</div>
                                    <p style="font-weight:600; margin-bottom:4px;" id="version-dropzone-label">Click or drag & drop new revision file</p>
                                    <p style="font-size:0.8rem; color:var(--text-muted);">Max file size: 300 MB</p>
                                </div>
                                <input type="file" id="version-mat-file" style="display:none;" onchange="App.handleVersionFileSelected(this)">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="App.closeUploadVersionModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-submit-version-mat">🚀 Publish Version ${(mat.current_version || 1) + 1}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    closeUploadVersionModal() {
        const modal = document.getElementById('version-material-modal');
        if (modal) modal.remove();
    },

    handleVersionFileSelected(input) {
        const file = input.files?.[0];
        const label = document.getElementById('version-dropzone-label');
        if (file && label) {
            const size = this.formatBytes(file.size);
            label.innerHTML = `Selected: <strong>${this.escapeHtml(file.name)}</strong> (${size})`;
        }
    },

    async handleUploadVersion(e, materialId) {
        e.preventDefault();
        const alertBox = document.getElementById('version-mat-alert');
        const submitBtn = document.getElementById('btn-submit-version-mat');
        const fileInput = document.getElementById('version-mat-file');

        const file = fileInput?.files?.[0];
        if (!file) {
            if (alertBox) alertBox.innerHTML = '<div class="alert alert-danger">Please select a replacement file.</div>';
            return;
        }

        const formData = new FormData();
        formData.append('version_notes', document.getElementById('version-mat-notes').value.trim());
        formData.append('file', file);

        submitBtn.disabled = true;
        submitBtn.innerText = 'Uploading new revision...';
        if (alertBox) alertBox.innerHTML = '';

        try {
            await API.post(`/api/officer/materials/${materialId}/new-version`, formData);
            this.closeUploadVersionModal();
            await this.loadMaterials();
            alert('New version published successfully with cryptographic SHA-256 verification!');
        } catch (err) {
            if (alertBox) alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = '🚀 Publish Version';
        }
    },

    // =========================================================================
    // MODAL: EDIT MATERIAL METADATA
    // =========================================================================

    async openEditMaterialModal(materialId) {
        const mat = this.materialsState.materials.find(m => m.material_id === materialId);
        if (!mat) return;

        const mount = document.getElementById('materials-modals-mount');
        if (!mount) return;

        mount.innerHTML = `
            <div class="modal-backdrop" id="edit-material-modal" style="display:flex;">
                <div class="modal-card" style="max-width:580px; width:95%;">
                    <div class="modal-header">
                        <h3 style="margin:0;">✏️ Edit Material Metadata</h3>
                        <button class="modal-close-btn" onclick="App.closeEditMaterialModal()">&times;</button>
                    </div>
                    <form id="edit-material-form" onsubmit="App.handleUpdateMaterial(event, ${materialId})">
                        <div class="modal-body">
                            <div id="edit-mat-alert"></div>

                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Title *</label>
                                <input type="text" id="edit-mat-title" class="form-control" value="${this.escapeHtml(mat.title)}" required>
                            </div>

                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Material Type *</label>
                                <select id="edit-mat-type" class="form-control" required>
                                    <option value="text" ${mat.material_type === 'text' ? 'selected' : ''}>📄 Text / Document</option>
                                    <option value="video" ${mat.material_type === 'video' ? 'selected' : ''}>🎬 Video</option>
                                    <option value="audio" ${mat.material_type === 'audio' ? 'selected' : ''}>🎧 Audio</option>
                                    <option value="image" ${mat.material_type === 'image' ? 'selected' : ''}>🖼️ Image / Infographic</option>
                                    <option value="interactive" ${mat.material_type === 'interactive' ? 'selected' : ''}>🧩 Interactive</option>
                                </select>
                            </div>

                            <div class="form-group" style="margin-bottom:1rem;">
                                <label class="form-label" style="font-weight:600;">Description</label>
                                <textarea id="edit-mat-desc" class="form-control" rows="3">${this.escapeHtml(mat.description || '')}</textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="App.closeEditMaterialModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-submit-edit-mat">Update Metadata</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    closeEditMaterialModal() {
        const modal = document.getElementById('edit-material-modal');
        if (modal) modal.remove();
    },

    async handleUpdateMaterial(e, materialId) {
        e.preventDefault();
        const alertBox = document.getElementById('edit-mat-alert');
        const submitBtn = document.getElementById('btn-submit-edit-mat');

        const payload = {
            title: document.getElementById('edit-mat-title').value.trim(),
            material_type: document.getElementById('edit-mat-type').value,
            description: document.getElementById('edit-mat-desc').value.trim()
        };

        submitBtn.disabled = true;
        if (alertBox) alertBox.innerHTML = '';

        try {
            await API.put(`/api/officer/materials/${materialId}`, payload);
            this.closeEditMaterialModal();
            await this.loadMaterials();
            alert('Material metadata updated successfully.');
        } catch (err) {
            if (alertBox) alertBox.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
        }
    },

    // =========================================================================
    // WORKFLOW TRANSITIONS: SUBMIT, APPROVE, RETIRE
    // =========================================================================

    async handleSubmitMaterial(materialId) {
        if (!confirm('Submit this material for formal curriculum review and approval?')) return;
        try {
            await API.post(`/api/officer/materials/${materialId}/submit`, {});
            await this.loadMaterials();
            alert('Material submitted for review.');
        } catch (err) {
            alert('Failed to submit material: ' + err.message);
        }
    },

    async handleApproveMaterial(materialId) {
        if (!confirm('Approve and publish this material for national homeschool distribution?')) return;
        try {
            await API.post(`/api/officer/materials/${materialId}/approve`, {});
            await this.loadMaterials();
            alert('Material approved and published.');
        } catch (err) {
            alert('Failed to approve material: ' + err.message);
        }
    },

    async handleRetireMaterial(materialId, currentStatus) {
        const isCurrentlyActive = ['approved', 'active'].includes(currentStatus);
        const nextStatus = isCurrentlyActive ? 'retired' : 'approved';
        const actionVerb = isCurrentlyActive ? 'deactivate / retire' : 'activate / publish';
        if (!confirm(`Are you sure you want to ${actionVerb} this learning material?`)) return;

        try {
            await API.post(`/api/officer/materials/${materialId}/retire`, { status: nextStatus });
            await this.loadMaterials();
            alert(`Material ${isCurrentlyActive ? 'deactivated' : 'activated'} successfully.`);
        } catch (err) {
            alert('Failed to update material status: ' + err.message);
        }
    },

    // =========================================================================
    // MODAL: MULTIMEDIA LIGHTBOX & REVISION VIEWER
    // =========================================================================

    async openMediaPreviewModal(materialId) {
        const mount = document.getElementById('materials-modals-mount');
        if (!mount) return;

        mount.innerHTML = `
            <div class="modal-backdrop" id="media-preview-modal" style="display:flex;">
                <div class="modal-card" style="max-width:850px; width:95%;">
                    <div class="modal-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <h3 style="margin:0;" id="preview-modal-title">Loading Preview...</h3>
                        </div>
                        <button class="modal-close-btn" onclick="App.closeMediaPreviewModal()">&times;</button>
                    </div>
                    <div class="modal-body" id="preview-modal-body" style="padding:1.5rem;">
                        <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                            <div style="font-size:2rem; margin-bottom:8px;">⏳</div>
                            <p>Loading digital resource stream...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const res = await API.get(`/api/materials/${materialId}`);
            const mat = res.data?.material || {};
            const versions = mat.versions || [];
            const titleElem = document.getElementById('preview-modal-title');
            const bodyElem = document.getElementById('preview-modal-body');

            if (titleElem) {
                titleElem.innerHTML = `${this.escapeHtml(mat.title)} <span class="badge badge-primary" style="font-size:0.75rem;">v${mat.current_version || 1}</span>`;
            }

            if (!bodyElem) return;

            let playerHtml = '';
            const downloadUrl = `/api/materials/${materialId}/download`;

            if (mat.material_type === 'video') {
                playerHtml = `
                    <div class="media-preview-container">
                        <video controls autoplay style="width:100%; max-height:55vh;">
                            <source src="${downloadUrl}" type="${mat.mime_type || 'video/mp4'}">
                            Your browser does not support the video tag.
                        </video>
                    </div>
                `;
            } else if (mat.material_type === 'audio') {
                playerHtml = `
                    <div style="background:#0f172a; padding:2rem; border-radius:var(--radius-md); text-align:center; color:#fff;">
                        <div style="font-size:3.5rem; margin-bottom:1rem;">🎧</div>
                        <h4 style="margin-bottom:1rem;">${this.escapeHtml(mat.title)}</h4>
                        <audio controls style="width:100%; max-width:500px;">
                            <source src="${downloadUrl}" type="${mat.mime_type || 'audio/mpeg'}">
                            Your browser does not support audio playback.
                        </audio>
                    </div>
                `;
            } else if (mat.material_type === 'image') {
                playerHtml = `
                    <div class="media-preview-container">
                        <img src="${downloadUrl}" alt="${this.escapeHtml(mat.title)}" style="max-width:100%; max-height:60vh; object-fit:contain;">
                    </div>
                `;
            } else {
                playerHtml = `
                    <div style="text-align:center; padding:2.5rem; background:#f8fafc; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                        <div style="font-size:3.5rem; margin-bottom:12px;">📄</div>
                        <h4 style="margin-bottom:8px;">${this.escapeHtml(mat.title)}</h4>
                        <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:1.5rem;">
                            Document Format: <strong>${this.escapeHtml(mat.mime_type || 'application/pdf')}</strong> • Size: <strong>${this.formatBytes(mat.file_size_bytes)}</strong>
                        </p>
                        <a href="${downloadUrl}" target="_blank" class="btn btn-primary">
                            📥 Open / Download Full Document
                        </a>
                    </div>
                `;
            }

            bodyElem.innerHTML = `
                ${playerHtml}

                <div style="margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--border-color);">
                    <h4 style="font-size:0.95rem; margin-bottom:0.75rem;">📜 Cryptographic Version History & Audit Log</h4>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${versions.map(v => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.82rem; border:1px solid #f1f5f9;">
                                <div>
                                    <strong>v${v.version_number}</strong> • ${this.formatBytes(v.file_size_bytes)} • <span style="color:var(--text-muted);">${this.escapeHtml(v.created_at)}</span>
                                    <div style="font-family:monospace; font-size:0.72rem; color:#64748b; margin-top:2px;">
                                        SHA-256: ${this.escapeHtml(v.checksum_sha256 || 'N/A')}
                                    </div>
                                    ${v.version_notes ? `<div style="color:var(--text-main); margin-top:2px;"><em>"${this.escapeHtml(v.version_notes)}"</em></div>` : ''}
                                </div>
                                <span class="badge ${v.version_number === mat.current_version ? 'badge-success' : 'badge-secondary'}">
                                    ${v.version_number === mat.current_version ? 'Current' : 'Archive'}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } catch (err) {
            const bodyElem = document.getElementById('preview-modal-body');
            if (bodyElem) bodyElem.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(err.message)}</div>`;
        }
    },

    closeMediaPreviewModal() {
        const modal = document.getElementById('media-preview-modal');
        if (modal) modal.remove();
    },

    renderGenericDashboard(container, hash) {
        const cleanHash = (hash || '').replace('#', '');
        const defaultDash = this.getDefaultDashboard();
        
        const moduleMap = {
            'parent-learners': { title: 'Learner Management', sprint: 'Sprint 2 (Module 02)', desc: 'Register home learners, enroll in P1–P7 classes, and manage active subjects.' },
            'curriculum-explorer': { title: 'Curriculum & Lessons Explorer', sprint: 'Sprint 3 (Module 03)', desc: 'Uganda NCDC Primary Syllabus (P1–P7) subjects, competency frameworks, and sequenced lessons.' },
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
    },

    async renderOfflineCenter(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Offline Center & Sync Status...</p>
            </div>
        `;

        try {
            // Fetch local IndexedDB storage stats
            const storageStats = (typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getStorageStats) ? await TMHIS_DB.getStorageStats() : null;
            const pendingItems = (typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getAll) ? await TMHIS_DB.getAll('sync_queue') : [];

            // Fetch server sync status if online
            let serverStatus = null;
            if (navigator.onLine && API.getToken()) {
                try {
                    const res = await API.get('/api/sync/status');
                    serverStatus = res.data;
                } catch (e) {}
            }

            // Fetch learners list for download selector
            let learners = [];
            if (Auth.getRole() === 'parent') {
                try {
                    if (navigator.onLine) {
                        const lRes = await API.get('/api/parent/learners');
                        learners = lRes.data || [];
                    } else if (typeof TMHIS_DB !== 'undefined') {
                        learners = await TMHIS_DB.getAll('learners') || [];
                    }
                } catch (e) {}
            }

            const isOnline = TMHIS_Sync ? TMHIS_Sync.isOnlineState : navigator.onLine;
            const deviceUuid = TMHIS_Sync ? TMHIS_Sync.getOrCreateDeviceUuid() : 'Browser Storage';

            container.innerHTML = `
                <div class="fade-in" style="max-width:1100px; margin:0 auto; padding-bottom:3rem;">
                    <!-- Header Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:1.5rem;">
                        <div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <h2 style="margin:0;">📡 Offline Mode & Synchronisation Center</h2>
                                <span class="connectivity-pill ${isOnline ? 'online' : 'offline'}">
                                    <span>${isOnline ? '🟢 Online' : '🟠 Offline'}</span>
                                </span>
                            </div>
                            <p style="color:var(--text-muted); margin-top:4px; font-size:0.88rem;">
                                Continue homeschooling seamlessly without internet. Data is cached locally and safely synchronised upon reconnection.
                            </p>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-primary btn-sm" onclick="App.handleSyncNow()" ${!isOnline ? 'disabled title="Connect to internet to sync"' : ''}>
                                🔄 Sync Now
                            </button>
                            <a href="${this.getDefaultDashboard()}" class="btn btn-secondary btn-sm">← Back to Dashboard</a>
                        </div>
                    </div>

                    <div id="offline-center-alert"></div>

                    <!-- Top Statistics Cards -->
                    <div class="offline-center-grid">
                        <div class="offline-stat-card">
                            <div style="color:var(--text-muted); font-size:0.8rem; font-weight:700; text-transform:uppercase;">Network Connectivity</div>
                            <div class="offline-stat-val" style="color:${isOnline ? '#059669' : '#ea580c'}; font-size:1.4rem;">
                                ${isOnline ? '🟢 Connected' : '🟠 Offline Mode'}
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">
                                Device UUID: <code style="font-size:0.72rem;">${deviceUuid.substring(0, 18)}...</code>
                            </div>
                        </div>

                        <div class="offline-stat-card">
                            <div style="color:var(--text-muted); font-size:0.8rem; font-weight:700; text-transform:uppercase;">Local Pending Queue</div>
                            <div class="offline-stat-val" style="color:#2563eb;">
                                ${pendingItems.filter(i => i.status === 'pending' || i.status === 'failed').length}
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">
                                ${pendingItems.filter(i => i.status === 'synced').length} items synced locally
                            </div>
                        </div>

                        <div class="offline-stat-card">
                            <div style="color:var(--text-muted); font-size:0.8rem; font-weight:700; text-transform:uppercase;">Cached Lessons & Guides</div>
                            <div class="offline-stat-val" style="color:#7c3aed;">
                                ${storageStats ? (storageStats.counts.lessons + storageStats.counts.guides) : 0}
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">
                                ${storageStats ? storageStats.counts.assessments : 0} Assessments • ${storageStats?.storage?.usageMB || '0.00'} MB Used
                            </div>
                        </div>
                    </div>

                    <!-- Offline Package Downloader Panel -->
                    <div class="card" style="margin-bottom:1.5rem; padding:1.25rem;">
                        <h3 style="margin-top:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
                            <span>📥</span> Download Curriculum Package for Offline Study
                        </h3>
                        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">
                            Download complete syllabus lessons, parent guides, quizzes, and assessments for your learners into local storage.
                        </p>

                        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                            ${learners.length > 0 ? `
                                <div style="flex:1; min-width:200px;">
                                    <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Select Child / Class</label>
                                    <select id="download-learner-select" class="form-control" style="height:34px; font-size:0.84rem;">
                                        ${learners.map(l => `<option value="${l.learner_id}">🎒 ${this.escapeHtml(l.full_name)} (${l.class_code || 'P' + l.class_level})</option>`).join('')}
                                    </select>
                                </div>
                            ` : `
                                <div style="flex:1; min-width:200px;">
                                    <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Select Primary Class</label>
                                    <select id="download-class-select" class="form-control" style="height:34px; font-size:0.84rem;">
                                        <option value="1">Primary 1 (P1)</option>
                                        <option value="2">Primary 2 (P2)</option>
                                        <option value="3">Primary 3 (P3)</option>
                                        <option value="4">Primary 4 (P4)</option>
                                        <option value="5">Primary 5 (P5)</option>
                                        <option value="6">Primary 6 (P6)</option>
                                        <option value="7">Primary 7 (P7)</option>
                                    </select>
                                </div>
                            `}

                            <button type="button" class="btn btn-primary" onclick="App.handleDownloadPackage()" ${!isOnline ? 'disabled title="Requires internet connection"' : ''}>
                                ⬇️ Download Offline Package
                            </button>

                            <button type="button" class="btn btn-secondary" onclick="App.handleClearOfflineData()">
                                🗑️ Clear Local Cache
                            </button>
                        </div>
                    </div>

                    <!-- Client Sync Queue Table -->
                    <div class="card" style="margin-bottom:1.5rem; padding:1.25rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
                                <span>📋</span> Local Sync Transactions (${pendingItems.length})
                            </h3>
                            ${pendingItems.some(i => i.status === 'failed') ? `
                                <button class="btn btn-danger btn-sm" onclick="App.handleRetryFailedSync()">Retry Failed Items</button>
                            ` : ''}
                        </div>

                        ${pendingItems.length === 0 ? `
                            <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
                                <span>✅</span> All offline activities are up to date with the TMHIS cloud.
                            </div>
                        ` : `
                            <div style="overflow-x:auto;">
                                <table class="sync-table">
                                    <thead>
                                        <tr>
                                            <th>Transaction UUID</th>
                                            <th>Entity / Action</th>
                                            <th>Created At</th>
                                            <th>Status</th>
                                            <th>Retries</th>
                                            <th>Details / Error</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${pendingItems.map(item => `
                                            <tr>
                                                <td><code style="font-size:0.75rem;">${item.client_transaction_uuid.substring(0, 13)}...</code></td>
                                                <td><strong>${this.escapeHtml(item.entity_type)}</strong> (${this.escapeHtml(item.operation)})</td>
                                                <td style="color:var(--text-muted); font-size:0.75rem;">${new Date(item.created_at).toLocaleString()}</td>
                                                <td><span class="sync-status-badge ${item.status}">${item.status}</span></td>
                                                <td>${item.retry_count || 0}</td>
                                                <td style="max-width:250px; font-size:0.75rem; color:${item.last_error ? '#b91c1c' : 'var(--text-muted)'};">
                                                    ${this.escapeHtml(item.last_error || 'Ready to sync')}
                                                </td>
                                                <td>
                                                    ${item.status === 'failed' || item.status === 'dead_letter' ? `
                                                        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:0.7rem;" onclick="App.handleRetryFailedSync('${item.client_transaction_uuid}')">Retry</button>
                                                    ` : `
                                                        <span style="color:var(--text-muted); font-size:0.75rem;">-</span>
                                                    `}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>

                    <!-- Server Sync History Logs -->
                    ${serverStatus && Array.isArray(serverStatus.recent_logs) && serverStatus.recent_logs.length > 0 ? `
                        <div class="card" style="padding:1.25rem;">
                            <h3 style="margin-top:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
                                <span>📜</span> Cloud Synchronisation Audit Log
                            </h3>
                            <div style="overflow-x:auto;">
                                <table class="sync-table">
                                    <thead>
                                        <tr>
                                            <th>Synced At</th>
                                            <th>Sync Type</th>
                                            <th>Direction</th>
                                            <th>Status</th>
                                            <th>Device</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${serverStatus.recent_logs.map(log => `
                                            <tr>
                                                <td style="font-size:0.75rem;">${new Date(log.synced_at).toLocaleString()}</td>
                                                <td><span class="badge badge-secondary" style="font-size:0.72rem;">${this.escapeHtml(log.sync_type)}</span></td>
                                                <td style="text-transform:uppercase; font-size:0.75rem; font-weight:600;">${this.escapeHtml(log.direction)}</td>
                                                <td><span class="sync-status-badge ${log.sync_status}">${this.escapeHtml(log.sync_status)}</span></td>
                                                <td style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(log.device_name || 'Web Browser')}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load Offline Center</h4>
                    <p>${this.escapeHtml(err.message)}</p>
                </div>
            `;
        }
    },

    openOfflineCenterModal() {
        this.showModal('📡 TMHIS Offline Mode & Sync Manager', '<div id="offline-modal-inner"></div>');
        const inner = document.getElementById('offline-modal-inner');
        if (inner) {
            this.renderOfflineCenter(inner);
        }
    },

    async handleDownloadPackage() {
        const learnerSelect = document.getElementById('download-learner-select');
        const classSelect = document.getElementById('download-class-select');
        const learnerId = learnerSelect ? learnerSelect.value : null;
        const classId = classSelect ? classSelect.value : null;

        const alertContainer = document.getElementById('offline-center-alert');
        if (alertContainer) {
            alertContainer.innerHTML = `
                <div class="alert alert-info">
                    <span>⏳ Downloading curriculum lessons, parental guides, and assessments for offline study... Please wait.</span>
                </div>
            `;
        }

        try {
            const pkg = await TMHIS_Sync.downloadClassPackage(learnerId, classId);
            if (alertContainer) {
                alertContainer.innerHTML = `
                    <div class="alert alert-success">
                        <strong>🎉 Offline Package Downloaded!</strong><br>
                        Stored ${pkg.counts?.lessons || 0} Lessons, ${pkg.counts?.guides || 0} Parental Guides, and ${pkg.counts?.assessments || 0} Assessments locally.
                    </div>
                `;
            }
            // Refresh view
            const content = document.getElementById('app-content');
            const modalInner = document.getElementById('offline-modal-inner');
            if (modalInner) this.renderOfflineCenter(modalInner);
            else if (content && window.location.hash.includes('offline')) this.renderOfflineCenter(content);
        } catch (err) {
            if (alertContainer) {
                alertContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <strong>Download Failed:</strong> ${this.escapeHtml(err.message)}
                    </div>
                `;
            }
        }
    },

    async handleSyncNow() {
        const alertContainer = document.getElementById('offline-center-alert');
        if (alertContainer) {
            alertContainer.innerHTML = `<div class="alert alert-info"><span>🔄 Synchronising offline queue with server...</span></div>`;
        }

        try {
            await TMHIS_Sync.syncPendingQueue(true);
            if (alertContainer) {
                alertContainer.innerHTML = `<div class="alert alert-success"><span>✅ Synchronisation completed successfully!</span></div>`;
            }
            const content = document.getElementById('app-content');
            const modalInner = document.getElementById('offline-modal-inner');
            if (modalInner) this.renderOfflineCenter(modalInner);
            else if (content && window.location.hash.includes('offline')) this.renderOfflineCenter(content);
        } catch (err) {
            if (alertContainer) {
                alertContainer.innerHTML = `<div class="alert alert-danger"><span>✖ Synchronisation error: ${this.escapeHtml(err.message)}</span></div>`;
            }
        }
    },

    async handleRetryFailedSync(uuid = null) {
        try {
            await API.post('/api/sync/retry-failed', { uuid });
            await TMHIS_Sync.syncPendingQueue(true);
            const content = document.getElementById('app-content');
            const modalInner = document.getElementById('offline-modal-inner');
            if (modalInner) this.renderOfflineCenter(modalInner);
            else if (content && window.location.hash.includes('offline')) this.renderOfflineCenter(content);
        } catch (err) {
            alert('Retry failed: ' + err.message);
        }
    },

    async handleClearOfflineData() {
        if (!confirm('Are you sure you want to clear all cached lessons and guides from your device? (Your pending sync submissions will be preserved).')) {
            return;
        }

        try {
            await TMHIS_DB.clear('lessons');
            await TMHIS_DB.clear('guides');
            await TMHIS_DB.clear('assessments');
            await TMHIS_DB.clear('assessment_questions');
            await TMHIS_DB.clear('assessment_options');
            await TMHIS_DB.clear('subjects');

            const content = document.getElementById('app-content');
            const modalInner = document.getElementById('offline-modal-inner');
            if (modalInner) this.renderOfflineCenter(modalInner);
            else if (content && window.location.hash.includes('offline')) this.renderOfflineCenter(content);
        } catch (err) {
            alert('Failed to clear cache: ' + err.message);
        }
    },

    showModal(title, contentHtml) {
        let overlay = document.getElementById('global-dynamic-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-dynamic-modal';
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem; opacity:0; transition:opacity 0.2s ease;';
            document.body.appendChild(overlay);
        }

        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';

        overlay.innerHTML = `
            <div class="card" style="width:100%; max-width:850px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; border-radius:12px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1px solid #e2e8f0; animation:modalPop 0.2s ease-out;">
                <div style="padding:1.1rem 1.5rem; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; background:#f8fafc;">
                    <h3 style="margin:0; font-size:1.25rem; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:0.5rem;">${this.escapeHtml(title)}</h3>
                    <button type="button" class="close-btn" onclick="App.hideModal()" style="background:none; border:none; font-size:1.6rem; color:#64748b; cursor:pointer; line-height:1; padding:0.2rem 0.5rem; border-radius:6px; transition:color 0.15s;" onmouseover="this.style.color='#0f172a'" onmouseout="this.style.color='#64748b'">&times;</button>
                </div>
                <div style="padding:1.5rem; overflow-y:auto; flex:1; background:#ffffff;">
                    ${contentHtml}
                </div>
            </div>
        `;

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                this.hideModal();
            }
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.hideModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },

    hideModal() {
        const overlay = document.getElementById('global-dynamic-modal');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            setTimeout(() => {
                overlay.innerHTML = '';
            }, 180);
        }
    }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
