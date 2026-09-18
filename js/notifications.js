/**
 * TMHIS Notifications, Alerts & MoES Circulars Module (Sprint 10)
 * Handles real-time alert polling, header bell badge, dropdown popover,
 * full-screen Notification Center, and Curriculum Officer statutory circular broadcasts.
 */

const NotificationsApp = {
    unreadCount: 0,
    notifications: [],
    currentFilter: 'all',
    pollInterval: null,
    isPopoverOpen: false,

    async init() {
        if (!Auth.isLoggedIn()) return;
        await this.refreshUnreadBadge();
        
        // Periodic check every 45 seconds when tab is active
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            if (Auth.isLoggedIn() && document.visibilityState === 'visible') {
                this.refreshUnreadBadge();
            }
        }, 45000);

        // Document click listener to close popover
        document.addEventListener('click', (e) => {
            const bell = document.getElementById('header-notif-bell');
            const popover = document.getElementById('notif-dropdown-popover');
            if (popover && bell && !bell.contains(e.target) && !popover.contains(e.target)) {
                this.closePopover();
            }
        });
    },

    async refreshUnreadBadge() {
        if (!Auth.isLoggedIn()) return;
        try {
            const res = await API.get('/api/notifications?status=unread&limit=5');
            if (res && res.success && res.data) {
                this.unreadCount = res.data.unread_count || 0;
                this.updateHeaderBadge();
            }
        } catch (e) {
            // Silently fail if offline
        }
    },

    updateHeaderBadge() {
        const badge = document.getElementById('header-notif-badge');
        if (!badge) return;
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    },

    async togglePopover(event) {
        if (event) event.stopPropagation();
        const popover = document.getElementById('notif-dropdown-popover');
        if (!popover) return;

        if (this.isPopoverOpen) {
            this.closePopover();
        } else {
            await this.openPopover();
        }
    },

    async openPopover() {
        const popover = document.getElementById('notif-dropdown-popover');
        if (!popover) return;
        this.isPopoverOpen = true;
        popover.style.display = 'block';
        popover.innerHTML = `
            <div style="padding:1.5rem; text-align:center; color:#64748b; font-size:0.85rem;">
                <div class="spinner" style="margin:0 auto 0.5rem auto; width:20px; height:20px; border:2px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                Loading notifications...
            </div>
        `;

        try {
            const res = await API.get('/api/notifications?limit=5');
            if (res && res.success && res.data) {
                this.unreadCount = res.data.unread_count || 0;
                this.updateHeaderBadge();
                this.renderPopoverContent(popover, res.data.notifications || []);
            }
        } catch (e) {
            popover.innerHTML = `
                <div style="padding:1rem; text-align:center; color:#ef4444; font-size:0.82rem;">
                    Failed to load notifications.
                </div>
            `;
        }
    },

    closePopover() {
        const popover = document.getElementById('notif-dropdown-popover');
        if (popover) {
            popover.style.display = 'none';
        }
        this.isPopoverOpen = false;
    },

    renderPopoverContent(popover, items) {
        if (!items || items.length === 0) {
            popover.innerHTML = `
                <div style="padding:1.25rem; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; color:#0f172a; font-size:0.9rem;">🔔 Notifications</span>
                </div>
                <div style="padding:2rem 1.5rem; text-align:center; color:#94a3b8; font-size:0.85rem;">
                    <div style="font-size:1.8rem; margin-bottom:0.4rem;">🎉</div>
                    You're all caught up! No new notifications.
                </div>
                <div style="padding:0.6rem; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center;">
                    <a href="#notifications" onclick="NotificationsApp.closePopover()" style="font-size:0.8rem; font-weight:700; color:#2563eb; text-decoration:none;">
                        Open Notification Center &rarr;
                    </a>
                </div>
            `;
            return;
        }

        popover.innerHTML = `
            <div style="padding:0.9rem 1.1rem; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-radius:12px 12px 0 0;">
                <div style="font-weight:800; color:#0f172a; font-size:0.9rem; display:flex; align-items:center; gap:0.4rem;">
                    <span>🔔 Notifications</span>
                    ${this.unreadCount > 0 ? `<span style="background:#ef4444; color:#fff; font-size:0.7rem; font-weight:800; padding:0.15rem 0.45rem; border-radius:10px;">${this.unreadCount} new</span>` : ''}
                </div>
                ${this.unreadCount > 0 ? `
                    <button class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.5rem;" onclick="NotificationsApp.markAllAsRead(event)">
                        ✓ Mark all read
                    </button>
                ` : ''}
            </div>
            <div style="max-height:340px; overflow-y:auto;">
                ${items.map(n => this.renderNotificationItemHtml(n, true)).join('')}
            </div>
            <div style="padding:0.75rem; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; border-radius:0 0 12px 12px;">
                <a href="#notifications" onclick="NotificationsApp.closePopover()" style="font-size:0.82rem; font-weight:700; color:#2563eb; text-decoration:none;">
                    View All in Notification Center &rarr;
                </a>
            </div>
        `;
    },

    renderNotificationItemHtml(n, isCompact = false) {
        const iconMap = {
            'reminder': '⏰',
            'alert': '⚠️',
            'circular': '🏛️',
            'announcement': '📢',
            'system': '⚙️'
        };
        const typeClass = n.notification_type || 'system';
        const icon = iconMap[typeClass] || '🔔';
        const isUnread = (n.status === 'unread');
        const timeAgo = this.formatTimeAgo(n.date_created);
        const isCircular = (n.notification_type === 'circular');
        const priorityClass = `priority-${n.priority || 'normal'}`;

        return `
            <div class="notif-card-item ${isUnread ? 'unread' : 'read'} ${priorityClass}" 
                 id="notif-row-${n.notification_id}"
                 onclick="NotificationsApp.handleNotificationClick(${n.notification_id}, '${n.action_url || ''}')">
                
                <div class="notif-avatar ${typeClass}">
                    ${icon}
                </div>

                <div class="notif-main-content">
                    ${isCircular ? `
                        <div class="notif-moes-seal">
                            <span>🇺🇬</span> MoES Official Statutory Directive
                        </div>
                    ` : ''}

                    <div class="notif-title-row">
                        <h4 class="notif-item-title">
                            ${App.escapeHtml(n.title)}
                        </h4>
                        <span class="notif-timestamp">
                            <span>🕒</span> ${timeAgo}
                        </span>
                    </div>

                    <p class="notif-body-text" style="${isCompact ? 'display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;' : ''}">
                        ${App.escapeHtml(n.message)}
                    </p>

                    <div class="notif-footer-row">
                        <div class="notif-tags-cluster">
                            <span class="notif-type-badge ${typeClass}">
                                ${App.escapeHtml(n.notification_type)}
                            </span>
                            ${n.priority && n.priority !== 'normal' ? `
                                <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; padding:0.18rem 0.5rem; border-radius:6px; ${this.getPriorityBadgeStyle(n.priority)}">
                                    ${App.escapeHtml(n.priority)}
                                </span>
                            ` : ''}
                            ${n.action_url ? `
                                <a href="${n.action_url.startsWith('#') ? n.action_url : '#' + n.action_url}" class="notif-action-btn-link" onclick="event.stopPropagation(); NotificationsApp.handleNotificationClick(${n.notification_id}, '${n.action_url}')">
                                    <span>Take Action</span>
                                    <span>&rarr;</span>
                                </a>
                            ` : ''}
                        </div>

                        <div class="notif-action-controls" onclick="event.stopPropagation();">
                            ${isUnread ? `
                                <button class="notif-btn-action read-action" onclick="NotificationsApp.markAsRead(${n.notification_id}, event)" title="Mark as read">
                                    ✓ Read
                                </button>
                            ` : ''}
                            <button class="notif-btn-action dismiss-action" onclick="NotificationsApp.dismissNotification(${n.notification_id}, event)" title="Dismiss notification">
                                ✕ Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    getPriorityBadgeStyle(priority) {
        if (priority === 'urgent') return 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;';
        if (priority === 'high') return 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;';
        if (priority === 'low') return 'background:#f1f5f9; color:#64748b;';
        return 'background:#eff6ff; color:#1d4ed8;';
    },

    formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr.replace(' ', 'T'));
        const now = new Date();
        const diffMs = now - d;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);

        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay === 1) return 'Yesterday';
        if (diffDay < 7) return `${diffDay}d ago`;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    },

    async handleNotificationClick(id, actionUrl) {
        await this.markAsRead(id);
        this.closePopover();
        if (actionUrl && actionUrl.trim() !== '') {
            window.location.hash = actionUrl.startsWith('#') ? actionUrl : '#' + actionUrl;
        }
    },

    async markAsRead(id, event) {
        if (event) event.stopPropagation();
        try {
            await API.post(`/api/notifications/${id}/read`);
            const row = document.getElementById(`notif-row-${id}`);
            if (row) {
                row.classList.remove('unread');
                row.classList.add('read');
                row.style.background = '#ffffff';
            }
            if (this.unreadCount > 0) {
                this.unreadCount--;
                this.updateHeaderBadge();
            }
        } catch (e) {
            // ignore
        }
    },

    async markAllAsRead(event) {
        if (event) event.stopPropagation();
        try {
            await API.post('/api/notifications/mark-all-read');
            this.unreadCount = 0;
            this.updateHeaderBadge();
            
            // Re-render current view if in notification center or popover
            if (window.location.hash.startsWith('#notifications')) {
                this.initNotificationCenter(document.getElementById('app-content'));
            } else if (this.isPopoverOpen) {
                this.openPopover();
            }
        } catch (e) {
            alert('Failed to mark all as read: ' + (e.message || 'Unknown error'));
        }
    },

    async dismissNotification(id, event) {
        if (event) event.stopPropagation();
        try {
            await API.post(`/api/notifications/${id}/dismiss`);
            const row = document.getElementById(`notif-row-${id}`);
            if (row) {
                row.style.opacity = '0';
                row.style.transform = 'translateX(20px)';
                setTimeout(() => row.remove(), 200);
            }
            if (this.unreadCount > 0) {
                this.refreshUnreadBadge();
            }
        } catch (e) {
            // ignore
        }
    },

    // ================= FULL NOTIFICATION CENTER (#notifications) =================
    async initNotificationCenter(container) {
        if (!Auth.isLoggedIn()) {
            window.location.hash = '#login';
            return;
        }

        container.innerHTML = `
            <div style="padding:3rem 1rem; text-align:center; color:#64748b;">
                <div class="spinner" style="margin:0 auto 1rem auto; width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                <h3>Loading Notification Center...</h3>
            </div>
        `;

        try {
            const user = Auth.getUser();
            const res = await API.get(`/api/notifications?limit=50`);
            const data = res.data || {};
            this.notifications = data.notifications || [];
            this.unreadCount = data.unread_count || 0;
            this.updateHeaderBadge();

            this.renderNotificationCenterView(container, user);
        } catch (e) {
            container.innerHTML = `
                <div class="card" style="padding:2rem; text-align:center; color:#ef4444; margin:2rem auto; max-width:600px;">
                    <h3>Failed to load notifications</h3>
                    <p>${App.escapeHtml(e.message || 'Network error')}</p>
                    <button class="btn btn-primary" onclick="NotificationsApp.initNotificationCenter(document.getElementById('app-content'))">
                        Retry
                    </button>
                </div>
            `;
        }
    },

    renderNotificationCenterView(container, user) {
        const role = (user && (user.role_code || user.role)) || (typeof Auth !== 'undefined' ? Auth.getRole() : null);
        const canBroadcast = (role === 'curriculum_officer' || role === 'administrator');
        const items = this.notifications || [];
        
        const countAll = items.length;
        const countUnread = this.unreadCount;
        const countCirculars = items.filter(n => n.notification_type === 'circular').length;
        const countReminders = items.filter(n => n.notification_type === 'reminder').length;
        const countAlerts = items.filter(n => n.notification_type === 'alert').length;
        const countSystem = items.filter(n => n.notification_type === 'system').length;

        container.innerHTML = `
            <div class="notif-center-wrapper">
                <!-- Clean Page Header -->
                <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
                    <div>
                        <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem 0; display:flex; align-items:center; gap:0.5rem;">
                            <span>🔔</span> Notification Center
                        </h1>
                        <p style="color:#64748b; font-size:0.85rem; margin:0;">
                            Official MoES Statutory Circulars, Lesson Pacing Reminders & Academic Alerts
                        </p>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        ${this.unreadCount > 0 ? `
                            <button class="btn btn-secondary btn-sm" style="font-weight:700;" onclick="NotificationsApp.markAllAsRead(event)">
                                ✓ Mark All Read (${this.unreadCount})
                            </button>
                        ` : ''}
                        ${canBroadcast ? `
                            <button class="btn btn-primary btn-sm" style="font-weight:700;" onclick="NotificationsApp.openBroadcastModal()">
                                📢 Publish MoES Circular
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Sleek Filter Pills Bar -->
                <div class="notif-tabs-bar">
                    <button class="notif-tab-btn active" id="tab-notif-all" onclick="NotificationsApp.filterCenter('all', this)">
                        <span>All</span>
                        <span class="notif-tab-count">${countAll}</span>
                    </button>
                    <button class="notif-tab-btn" id="tab-notif-unread" onclick="NotificationsApp.filterCenter('unread', this)">
                        <span>Unread</span>
                        <span class="notif-tab-count ${countUnread > 0 ? 'alert-count' : ''}">${countUnread}</span>
                    </button>
                    <button class="notif-tab-btn" id="tab-notif-circular" onclick="NotificationsApp.filterCenter('circular', this)">
                        <span>🏛️ MoES Circulars</span>
                        <span class="notif-tab-count">${countCirculars}</span>
                    </button>
                    <button class="notif-tab-btn" id="tab-notif-reminder" onclick="NotificationsApp.filterCenter('reminder', this)">
                        <span>⏰ Reminders</span>
                        <span class="notif-tab-count">${countReminders}</span>
                    </button>
                    <button class="notif-tab-btn" id="tab-notif-alert" onclick="NotificationsApp.filterCenter('alert', this)">
                        <span>⚠️ Alerts</span>
                        <span class="notif-tab-count">${countAlerts}</span>
                    </button>
                    <button class="notif-tab-btn" id="tab-notif-system" onclick="NotificationsApp.filterCenter('system', this)">
                        <span>⚙️ System</span>
                        <span class="notif-tab-count">${countSystem}</span>
                    </button>
                </div>

                <!-- Feed Container Card -->
                <div class="notif-feed-card">
                    <div id="notif-center-list">
                        ${this.renderCenterListHtml(items)}
                    </div>
                </div>
            </div>
        `;
    },

    filterCenter(type, btnElement) {
        document.querySelectorAll('.notif-tab-btn').forEach(b => b.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        let filtered = this.notifications;
        if (type === 'unread') {
            filtered = this.notifications.filter(n => n.status === 'unread');
        } else if (type !== 'all') {
            filtered = this.notifications.filter(n => n.notification_type === type);
        }

        const listContainer = document.getElementById('notif-center-list');
        if (listContainer) {
            listContainer.innerHTML = this.renderCenterListHtml(filtered);
        }
    },

    renderCenterListHtml(items) {
        if (!items || items.length === 0) {
            return `
                <div class="notif-empty-box">
                    <div class="notif-empty-illustration">🎉</div>
                    <h3 class="notif-empty-title">All Caught Up!</h3>
                    <p class="notif-empty-subtitle">
                        There are no notifications matching this category at the moment. Official updates and reminders will appear here automatically.
                    </p>
                </div>
            `;
        }
        return items.map(n => this.renderNotificationItemHtml(n, false)).join('');
    },

    // ================= CURRICULUM OFFICER BROADCAST MODAL =================
    openBroadcastModal() {
        let modal = document.getElementById('broadcast-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'broadcast-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                <div class="card" style="max-width:560px; width:100%; background:#fff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); padding:1.75rem; max-height:90vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                        <div>
                            <h3 style="margin:0 0 0.2rem 0; font-size:1.2rem; font-weight:800; color:#0f172a;">
                                📢 Publish Statutory Circular
                            </h3>
                            <p style="margin:0; font-size:0.82rem; color:#64748b;">
                                Dispatch official MoES guidelines, notices, and curriculum circulars
                            </p>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('broadcast-modal').remove()">✕</button>
                    </div>

                    <form id="broadcast-form" onsubmit="NotificationsApp.submitBroadcast(event)">
                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                Circular Title *
                            </label>
                            <input type="text" id="bc-title" class="form-control" required placeholder="e.g., MoES Term 1 Assessment Circular" 
                                style="width:100%; padding:0.6rem 0.8rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.88rem;">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                    Type
                                </label>
                                <select id="bc-type" class="form-control" style="width:100%; padding:0.55rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                                    <option value="circular">🏛️ MoES Statutory Circular</option>
                                    <option value="announcement">📢 General Announcement</option>
                                    <option value="alert">⚠️ Urgent Alert</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                    Priority
                                </label>
                                <select id="bc-priority" class="form-control" style="width:100%; padding:0.55rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                    Target Audience
                                </label>
                                <select id="bc-role" class="form-control" style="width:100%; padding:0.55rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                                    <option value="parent">👨‍👩‍👧 All Homeschool Parents</option>
                                    <option value="teacher">👩‍🏫 All Teachers</option>
                                    <option value="learner">🎒 All Learners</option>
                                    <option value="">🌐 Everyone (All Roles)</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                    Target Class / Grade
                                </label>
                                <select id="bc-class" class="form-control" style="width:100%; padding:0.55rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                                    <option value="">All Primary Classes (P1–P7)</option>
                                    <option value="1">Primary 1 (P1)</option>
                                    <option value="2">Primary 2 (P2)</option>
                                    <option value="3">Primary 3 (P3)</option>
                                    <option value="4">Primary 4 (P4)</option>
                                    <option value="5">Primary 5 (P5)</option>
                                    <option value="6">Primary 6 (P6)</option>
                                    <option value="7">Primary 7 (P7 Candidate)</option>
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                Message / Directive Content *
                            </label>
                            <textarea id="bc-message" rows="4" class="form-control" required placeholder="Enter the official circular message or directives..." 
                                style="width:100%; padding:0.6rem 0.8rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.88rem; font-family:inherit;"></textarea>
                        </div>

                        <div style="margin-bottom:1.25rem;">
                            <label style="display:block; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">
                                Action Route (Optional)
                            </label>
                            <input type="text" id="bc-url" class="form-control" placeholder="#schedule or #learner-reports" 
                                style="width:100%; padding:0.55rem 0.8rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('broadcast-modal').remove()">Cancel</button>
                            <button type="submit" id="bc-submit-btn" class="btn btn-primary" style="font-weight:700;">
                                🚀 Publish & Dispatch
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    async submitBroadcast(event) {
        event.preventDefault();
        const submitBtn = document.getElementById('bc-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Publishing...';
        }

        const title = document.getElementById('bc-title').value.trim();
        const message = document.getElementById('bc-message').value.trim();
        const broadcastType = document.getElementById('bc-type').value;
        const priority = document.getElementById('bc-priority').value;
        const targetRole = document.getElementById('bc-role').value;
        const targetClassId = document.getElementById('bc-class').value;
        const actionUrl = document.getElementById('bc-url').value.trim();

        try {
            const res = await API.post('/api/officer/notifications/broadcast', {
                title: title,
                message: message,
                broadcast_type: broadcastType,
                priority: priority,
                target_role: targetRole || null,
                target_class_id: targetClassId ? parseInt(targetClassId) : null,
                action_url: actionUrl || null
            });

            if (res && res.success) {
                alert(`✅ Statutory Circular Dispatched Successfully!\nRecipients reached: ${res.data.recipients_count}`);
                const modal = document.getElementById('broadcast-modal');
                if (modal) modal.remove();
                if (window.location.hash.startsWith('#notifications')) {
                    this.initNotificationCenter(document.getElementById('app-content'));
                }
            } else {
                alert('Broadcast failed: ' + (res.message || 'Unknown error'));
            }
        } catch (e) {
            alert('Broadcast failed: ' + (e.message || 'Unknown error'));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '🚀 Publish & Dispatch';
            }
        }
    }
};

window.NotificationsApp = NotificationsApp;
