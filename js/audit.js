/**
 * TMHIS Module 12: Administration, Security Audit Trail & System Health Engine
 * Frontend Controller for Immutable Audit Logging, State Diffing, CSV Exports, and System Health Telemetry
 */

const AuditApp = {
    currentFilters: {
        page: 1,
        limit: 25,
        action_type: '',
        user_id: '',
        search: '',
        date_from: '',
        date_to: ''
    },
    pagination: {},
    stats: {},
    healthData: {},

    // ================= 1. SECURITY & AUDIT TRAIL (#admin-audit) =================
    async initAuditCenter(container) {
        if (!Auth.isAuthenticated() || Auth.getRole() !== 'administrator') {
            container.innerHTML = `
                <div class="card p-4 text-center text-danger" style="max-width:500px; margin:3rem auto;">
                    <h3>⛔ Access Denied</h3>
                    <p>The Security Audit Trail is strictly restricted to system administrators.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="audit-center-wrapper" style="max-width:1200px; margin:0 auto; padding:0.5rem 0 2rem 0;">
                <div style="padding:3rem 1rem; text-align:center; color:#64748b;">
                    <div class="spinner" style="margin:0 auto 1rem auto; width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    <h3>Loading Security & Audit Trail...</h3>
                </div>
            </div>
        `;

        try {
            await this.loadStats();
            await this.loadAuditLogs(container);
        } catch (e) {
            container.innerHTML = `
                <div class="card p-4 text-center text-danger" style="max-width:600px; margin:2rem auto;">
                    <h3>Failed to load Audit Trail</h3>
                    <p>${App.escapeHtml(e.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="AuditApp.initAuditCenter(document.getElementById('app-content'))">
                        Retry
                    </button>
                </div>
            `;
        }
    },

    async loadStats() {
        try {
            const res = await API.get('/api/admin/audit/stats');
            if (res && res.success) {
                this.stats = res.data || {};
            }
        } catch (e) {
            this.stats = {};
        }
    },

    async loadAuditLogs(container) {
        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(this.currentFilters)) {
            if (v !== '' && v !== null && v !== undefined) {
                queryParams.append(k, v);
            }
        }

        const res = await API.get(`/api/admin/audit?${queryParams.toString()}`);
        const data = res.data || {};
        const logs = data.logs || [];
        this.pagination = data.pagination || { current_page: 1, total_pages: 1, total_records: 0 };

        this.renderAuditView(container, logs);
    },

    renderAuditView(container, logs) {
        const stats = this.stats || {};
        const events24h = stats.events_24h || 0;
        const failedLogins = stats.failed_logins_today || 0;
        const sensitive7d = stats.sensitive_actions_7d || 0;
        const topActor = (stats.top_actors && stats.top_actors.length > 0) ? stats.top_actors[0].actor_name : 'None';

        container.innerHTML = `
            <div class="audit-center-wrapper" style="max-width:1200px; margin:0 auto; padding:0.5rem 0 2rem 0;">
                <!-- Header -->
                <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
                    <div>
                        <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem 0; display:flex; align-items:center; gap:0.5rem;">
                            <span>🛡️</span> Security & Audit Trail
                        </h1>
                        <p style="color:#64748b; font-size:0.85rem; margin:0;">
                            Immutable regulatory access logs, administrative state changes & security telemetry
                        </p>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" style="font-weight:700;" onclick="AuditApp.exportCsv()">
                            📥 Export CSV
                        </button>
                        <a href="#admin-system-health" class="btn btn-primary btn-sm" style="font-weight:700;">
                            🩺 System Health & Telemetry &rarr;
                        </a>
                    </div>
                </div>

                <!-- KPI Overview Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                    <div class="card" style="padding:1rem 1.25rem; display:flex; align-items:center; gap:0.9rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="width:42px; height:42px; border-radius:10px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                            📋
                        </div>
                        <div>
                            <div style="font-size:1.4rem; font-weight:800; color:#0f172a; line-height:1.1;">${events24h}</div>
                            <div style="font-size:0.75rem; font-weight:600; color:#64748b;">Events Logged (24h)</div>
                        </div>
                    </div>

                    <div class="card" style="padding:1rem 1.25rem; display:flex; align-items:center; gap:0.9rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="width:42px; height:42px; border-radius:10px; background:${failedLogins > 0 ? '#fef2f2' : '#f0fdf4'}; color:${failedLogins > 0 ? '#ef4444' : '#16a34a'}; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                            ${failedLogins > 0 ? '⚠️' : '🛡️'}
                        </div>
                        <div>
                            <div style="font-size:1.4rem; font-weight:800; color:#0f172a; line-height:1.1;">${failedLogins}</div>
                            <div style="font-size:0.75rem; font-weight:600; color:#64748b;">Failed Logins Today</div>
                        </div>
                    </div>

                    <div class="card" style="padding:1rem 1.25rem; display:flex; align-items:center; gap:0.9rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="width:42px; height:42px; border-radius:10px; background:#faf5ff; color:#9333ea; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                            ⚙️
                        </div>
                        <div>
                            <div style="font-size:1.4rem; font-weight:800; color:#0f172a; line-height:1.1;">${sensitive7d}</div>
                            <div style="font-size:0.75rem; font-weight:600; color:#64748b;">Sensitive Changes (7d)</div>
                        </div>
                    </div>

                    <div class="card" style="padding:1rem 1.25rem; display:flex; align-items:center; gap:0.9rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="width:42px; height:42px; border-radius:10px; background:#f8fafc; color:#475569; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                            👤
                        </div>
                        <div style="min-width:0;">
                            <div style="font-size:1.1rem; font-weight:800; color:#0f172a; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(topActor)}</div>
                            <div style="font-size:0.75rem; font-weight:600; color:#64748b;">Most Active Actor</div>
                        </div>
                    </div>
                </div>

                <!-- Filters Bar -->
                <div class="card" style="padding:1rem 1.25rem; border-radius:12px; border:1px solid #e2e8f0; background:#ffffff; margin-bottom:1.25rem;">
                    <form id="audit-filter-form" onsubmit="AuditApp.handleFilterSubmit(event)" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; align-items:end;">
                        <div>
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#475569; margin-bottom:0.25rem;">Search / Keyword</label>
                            <input type="text" id="filter-search" class="form-control" placeholder="Actor, IP, or action text..." value="${App.escapeHtml(this.currentFilters.search)}" style="width:100%; padding:0.45rem 0.65rem; font-size:0.82rem; border:1px solid #cbd5e1; border-radius:6px;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#475569; margin-bottom:0.25rem;">Action Type</label>
                            <select id="filter-action" class="form-control" style="width:100%; padding:0.45rem 0.65rem; font-size:0.82rem; border:1px solid #cbd5e1; border-radius:6px;">
                                <option value="">All Action Types</option>
                                <option value="LOGIN" ${this.currentFilters.action_type === 'LOGIN' ? 'selected' : ''}>LOGIN</option>
                                <option value="LOGIN_FAILED" ${this.currentFilters.action_type === 'LOGIN_FAILED' ? 'selected' : ''}>LOGIN_FAILED</option>
                                <option value="USER_CREATED" ${this.currentFilters.action_type === 'USER_CREATED' ? 'selected' : ''}>USER_CREATED</option>
                                <option value="USER_UPDATED" ${this.currentFilters.action_type === 'USER_UPDATED' ? 'selected' : ''}>USER_UPDATED</option>
                                <option value="USER_ROLE_UPDATED" ${this.currentFilters.action_type === 'USER_ROLE_UPDATED' ? 'selected' : ''}>USER_ROLE_UPDATED</option>
                                <option value="SETTING_UPDATE" ${this.currentFilters.action_type === 'SETTING_UPDATE' ? 'selected' : ''}>SETTING_UPDATE</option>
                                <option value="BROADCAST_PUBLISHED" ${this.currentFilters.action_type === 'BROADCAST_PUBLISHED' ? 'selected' : ''}>BROADCAST_PUBLISHED</option>
                                <option value="EXAM_SET_PUBLISHED" ${this.currentFilters.action_type === 'EXAM_SET_PUBLISHED' ? 'selected' : ''}>EXAM_SET_PUBLISHED</option>
                                <option value="MATERIAL_APPROVE" ${this.currentFilters.action_type === 'MATERIAL_APPROVE' ? 'selected' : ''}>MATERIAL_APPROVE</option>
                                <option value="LESSON_CREATED" ${this.currentFilters.action_type === 'LESSON_CREATED' ? 'selected' : ''}>LESSON_CREATED</option>
                            </select>
                        </div>

                        <div>
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#475569; margin-bottom:0.25rem;">From Date</label>
                            <input type="date" id="filter-date-from" class="form-control" value="${this.currentFilters.date_from}" style="width:100%; padding:0.45rem 0.65rem; font-size:0.82rem; border:1px solid #cbd5e1; border-radius:6px;">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#475569; margin-bottom:0.25rem;">To Date</label>
                            <input type="date" id="filter-date-to" class="form-control" value="${this.currentFilters.date_to}" style="width:100%; padding:0.45rem 0.65rem; font-size:0.82rem; border:1px solid #cbd5e1; border-radius:6px;">
                        </div>

                        <div style="display:flex; gap:0.4rem;">
                            <button type="submit" class="btn btn-primary btn-sm" style="flex:1; font-weight:700; padding:0.5rem 0.75rem;">
                                🔍 Filter
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="AuditApp.resetFilters()" style="padding:0.5rem 0.75rem;">
                                Reset
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Audit Log Table Card -->
                <div class="card" style="padding:0; border-radius:12px; border:1px solid #e2e8f0; background:#fff; overflow:hidden;">
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-weight:700; font-size:0.78rem; text-transform:uppercase;">
                                    <th style="padding:0.75rem 1rem;">ID</th>
                                    <th style="padding:0.75rem 1rem;">Timestamp</th>
                                    <th style="padding:0.75rem 1rem;">Actor</th>
                                    <th style="padding:0.75rem 1rem;">Action</th>
                                    <th style="padding:0.75rem 1rem;">Target Entity</th>
                                    <th style="padding:0.75rem 1rem;">Description</th>
                                    <th style="padding:0.75rem 1rem;">IP Address</th>
                                    <th style="padding:0.75rem 1rem; text-align:right;">State Diff</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.renderAuditTableRows(logs)}
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination Footer -->
                    <div style="padding:0.75rem 1.25rem; border-top:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; flex-wrap:wrap; gap:0.5rem;">
                        <div style="font-size:0.8rem; color:#64748b;">
                            Showing <strong>${logs.length}</strong> of <strong>${this.pagination.total_records || 0}</strong> records (Page ${this.pagination.current_page} of ${this.pagination.total_pages || 1})
                        </div>
                        <div style="display:flex; gap:0.4rem;">
                            <button class="btn btn-secondary btn-sm" ${this.pagination.current_page <= 1 ? 'disabled' : ''} onclick="AuditApp.changePage(${this.pagination.current_page - 1})">
                                &larr; Prev
                            </button>
                            <button class="btn btn-secondary btn-sm" ${this.pagination.current_page >= this.pagination.total_pages ? 'disabled' : ''} onclick="AuditApp.changePage(${this.pagination.current_page + 1})">
                                Next &rarr;
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderAuditTableRows(logs) {
        if (!logs || logs.length === 0) {
            return `
                <tr>
                    <td colspan="8" style="padding:3rem 1rem; text-align:center; color:#94a3b8;">
                        <div style="font-size:2rem; margin-bottom:0.4rem;">🛡️</div>
                        <div style="font-weight:700; font-size:0.95rem; color:#475569;">No audit trail events found</div>
                        <div style="font-size:0.82rem;">Adjust the filters above to inspect historical security records.</div>
                    </td>
                </tr>
            `;
        }

        return logs.map(l => {
            const hasDiff = l.has_diff;
            const actorName = l.username || l.email || `User #${l.user_id}`;
            const roleBadge = l.role_code ? `<span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; padding:0.1rem 0.35rem; border-radius:4px; background:#eff6ff; color:#1d4ed8;">${App.escapeHtml(l.role_code)}</span>` : '';
            const actionBadgeStyle = this.getActionBadgeStyle(l.action_type);

            return `
                <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <td style="padding:0.75rem 1rem; font-family:monospace; font-size:0.78rem; color:#94a3b8;">#${l.audit_id}</td>
                    <td style="padding:0.75rem 1rem; white-space:nowrap; font-size:0.8rem; color:#475569;">
                        ${this.formatAuditTimestamp(l.timestamp)}
                    </td>
                    <td style="padding:0.75rem 1rem; white-space:nowrap;">
                        <div style="font-weight:700; color:#0f172a; font-size:0.82rem;">${App.escapeHtml(actorName)}</div>
                        <div style="margin-top:2px;">${roleBadge}</div>
                    </td>
                    <td style="padding:0.75rem 1rem; white-space:nowrap;">
                        <span style="font-size:0.72rem; font-weight:700; padding:0.18rem 0.5rem; border-radius:6px; ${actionBadgeStyle}">
                            ${App.escapeHtml(l.action_type)}
                        </span>
                    </td>
                    <td style="padding:0.75rem 1rem; white-space:nowrap; font-size:0.8rem; color:#64748b;">
                        ${l.table_affected ? `<code>${App.escapeHtml(l.table_affected)}</code>` : '<span style="color:#cbd5e1;">-</span>'}
                        ${l.record_id_affected ? `<span style="font-size:0.75rem; color:#94a3b8;">#${l.record_id_affected}</span>` : ''}
                    </td>
                    <td style="padding:0.75rem 1rem; font-size:0.82rem; color:#334155; max-width:320px; line-height:1.4;">
                        ${App.escapeHtml(l.action_description || '')}
                    </td>
                    <td style="padding:0.75rem 1rem; font-family:monospace; font-size:0.75rem; color:#64748b; white-space:nowrap;">
                        ${App.escapeHtml(l.ip_address || '127.0.0.1')}
                    </td>
                    <td style="padding:0.75rem 1rem; text-align:right; white-space:nowrap;">
                        ${hasDiff ? `
                            <button class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.5rem; font-weight:700;" onclick="AuditApp.openDiffModal(${l.audit_id})">
                                🔍 Diff
                            </button>
                        ` : `
                            <span style="font-size:0.75rem; color:#cbd5e1;">No diff</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    },

    getActionBadgeStyle(actionType) {
        if (!actionType) return 'background:#f1f5f9; color:#475569;';
        if (actionType.includes('FAIL') || actionType.includes('DELETE') || actionType.includes('SUSPEND')) {
            return 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;';
        }
        if (actionType.includes('ROLE') || actionType.includes('SETTING') || actionType.includes('BROADCAST')) {
            return 'background:#faf5ff; color:#7e22ce; border:1px solid #e9d5ff;';
        }
        if (actionType.includes('CREATE') || actionType.includes('APPROVE') || actionType.includes('PUBLISH')) {
            return 'background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;';
        }
        return 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;';
    },

    formatAuditTimestamp(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr.replace(' ', 'T'));
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    handleFilterSubmit(event) {
        event.preventDefault();
        this.currentFilters.search = document.getElementById('filter-search').value.trim();
        this.currentFilters.action_type = document.getElementById('filter-action').value;
        this.currentFilters.date_from = document.getElementById('filter-date-from').value;
        this.currentFilters.date_to = document.getElementById('filter-date-to').value;
        this.currentFilters.page = 1;

        this.initAuditCenter(document.getElementById('app-content'));
    },

    resetFilters() {
        this.currentFilters = {
            page: 1,
            limit: 25,
            action_type: '',
            user_id: '',
            search: '',
            date_from: '',
            date_to: ''
        };
        this.initAuditCenter(document.getElementById('app-content'));
    },

    changePage(newPage) {
        this.currentFilters.page = newPage;
        this.loadAuditLogs(document.getElementById('app-content'));
    },

    exportCsv() {
        const queryParams = new URLSearchParams();
        for (const [k, v] of Object.entries(this.currentFilters)) {
            if (v !== '' && v !== null && v !== undefined && k !== 'page' && k !== 'limit') {
                queryParams.append(k, v);
            }
        }
        const token = Auth.getToken();
        const exportUrl = `/api/admin/audit/export?${queryParams.toString()}`;
        
        // Open download stream
        window.open(exportUrl, '_blank');
    },

    // ================= 2. BEFORE / AFTER STATE DIFF INSPECTOR =================
    async openDiffModal(auditId) {
        let modal = document.getElementById('audit-diff-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'audit-diff-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                <div class="card" style="max-width:750px; width:100%; background:#fff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); padding:1.75rem; max-height:90vh; overflow-y:auto;">
                    <div style="text-align:center; padding:2rem; color:#64748b;">
                        <div class="spinner" style="margin:0 auto 0.5rem auto; width:24px; height:24px; border:2px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                        Loading state diff...
                    </div>
                </div>
            </div>
        `;

        try {
            const res = await API.get(`/api/admin/audit/${auditId}`);
            const record = res.data || {};
            const diffChanges = record.diff_changes || [];

            modal.innerHTML = `
                <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                    <div class="card" style="max-width:750px; width:100%; background:#fff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); padding:1.75rem; max-height:90vh; overflow-y:auto;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem;">
                            <div>
                                <h3 style="margin:0 0 0.2rem 0; font-size:1.2rem; font-weight:800; color:#0f172a;">
                                    🔍 Audit State Diff Inspector
                                </h3>
                                <p style="margin:0; font-size:0.82rem; color:#64748b;">
                                    Audit Record #${record.audit_id} &bull; ${App.escapeHtml(record.action_type)} &bull; ${record.timestamp}
                                </p>
                            </div>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('audit-diff-modal').remove()">✕</button>
                        </div>

                        <!-- Diff Attribute Table -->
                        <div style="margin-bottom:1.25rem;">
                            <h4 style="font-size:0.85rem; font-weight:800; color:#334155; margin:0 0 0.5rem 0; text-transform:uppercase;">
                                Changed Attributes (${diffChanges.length})
                            </h4>
                            ${diffChanges.length > 0 ? `
                                <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                                    <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                                        <thead>
                                            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569;">
                                                <th style="padding:0.55rem 0.75rem;">Attribute</th>
                                                <th style="padding:0.55rem 0.75rem;">Status</th>
                                                <th style="padding:0.55rem 0.75rem;">Before Value</th>
                                                <th style="padding:0.55rem 0.75rem;">After Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${diffChanges.map(d => `
                                                <tr style="border-bottom:1px solid #f1f5f9;">
                                                    <td style="padding:0.55rem 0.75rem; font-family:monospace; font-weight:700; color:#0f172a;">${App.escapeHtml(d.key)}</td>
                                                    <td style="padding:0.55rem 0.75rem;">
                                                        <span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; padding:0.1rem 0.35rem; border-radius:4px; ${d.status === 'added' ? 'background:#f0fdf4; color:#15803d;' : (d.status === 'removed' ? 'background:#fef2f2; color:#b91c1c;' : 'background:#eff6ff; color:#1d4ed8;')}">
                                                            ${d.status}
                                                        </span>
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; color:#b91c1c; font-family:monospace; background:#fef2f2;">
                                                        ${d.before !== null ? App.escapeHtml(JSON.stringify(d.before)) : '<span style="color:#94a3b8;">null</span>'}
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; color:#15803d; font-family:monospace; background:#f0fdf4;">
                                                        ${d.after !== null ? App.escapeHtml(JSON.stringify(d.after)) : '<span style="color:#94a3b8;">null</span>'}
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `
                                <div style="padding:1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center; color:#64748b; font-size:0.82rem;">
                                    No direct attribute key differences detected.
                                </div>
                            `}
                        </div>

                        <!-- Side-by-Side Raw JSON -->
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1.25rem;">
                            <div>
                                <label style="display:block; font-size:0.75rem; font-weight:700; color:#dc2626; margin-bottom:0.25rem;">Before Payload (JSON)</label>
                                <pre style="background:#1e293b; color:#f8fafc; padding:0.75rem; border-radius:8px; font-size:0.75rem; max-height:200px; overflow:auto; margin:0;">${App.escapeHtml(JSON.stringify(record.before_parsed || {}, null, 2))}</pre>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.75rem; font-weight:700; color:#16a34a; margin-bottom:0.25rem;">After Payload (JSON)</label>
                                <pre style="background:#1e293b; color:#f8fafc; padding:0.75rem; border-radius:8px; font-size:0.75rem; max-height:200px; overflow:auto; margin:0;">${App.escapeHtml(JSON.stringify(record.after_parsed || {}, null, 2))}</pre>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end;">
                            <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('audit-diff-modal').remove()">
                                Close Inspector
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            modal.innerHTML = `
                <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center;">
                    <div class="card p-4 text-center text-danger" style="max-width:400px; background:#fff; border-radius:12px;">
                        <h4>Failed to load diff</h4>
                        <p>${App.escapeHtml(e.message || 'Error')}</p>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('audit-diff-modal').remove()">Close</button>
                    </div>
                </div>
            `;
        }
    },

    // ================= 3. SYSTEM HEALTH TELEMETRY (#admin-system-health) =================
    async initSystemHealth(container) {
        if (!Auth.isAuthenticated() || Auth.getRole() !== 'administrator') {
            container.innerHTML = `
                <div class="card p-4 text-center text-danger" style="max-width:500px; margin:3rem auto;">
                    <h3>⛔ Access Denied</h3>
                    <p>System health telemetry is restricted to system administrators.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="health-center-wrapper" style="max-width:1200px; margin:0 auto; padding:0.5rem 0 2rem 0;">
                <div style="padding:3rem 1rem; text-align:center; color:#64748b;">
                    <div class="spinner" style="margin:0 auto 1rem auto; width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    <h3>Polling System Health & Diagnostics...</h3>
                </div>
            </div>
        `;

        try {
            const res = await API.get('/api/admin/system/health');
            const data = res.data || {};
            const settingsRes = await API.get('/api/admin/system/settings');
            const settings = settingsRes.data || [];

            this.renderSystemHealthView(container, data, settings);
        } catch (e) {
            container.innerHTML = `
                <div class="card p-4 text-center text-danger" style="max-width:600px; margin:2rem auto;">
                    <h3>Failed to load System Telemetry</h3>
                    <p>${App.escapeHtml(e.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="AuditApp.initSystemHealth(document.getElementById('app-content'))">
                        Retry Diagnostics
                    </button>
                </div>
            `;
        }
    },

    renderSystemHealthView(container, health, settings) {
        const db = health.database || {};
        const sync = health.sync_engine || {};
        const storage = health.storage || {};
        const runtime = health.runtime || {};

        container.innerHTML = `
            <div class="health-center-wrapper" style="max-width:1200px; margin:0 auto; padding:0.5rem 0 2rem 0;">
                <!-- Header -->
                <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
                    <div>
                        <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem 0; display:flex; align-items:center; gap:0.5rem;">
                            <span>🩺</span> System Health & Telemetry
                        </h1>
                        <p style="color:#64748b; font-size:0.85rem; margin:0;">
                            Real-time database performance, offline sync queue depth, storage telemetry & PHP runtime
                        </p>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" style="font-weight:700;" onclick="AuditApp.initSystemHealth(document.getElementById('app-content'))">
                            🔄 Refresh Diagnostics
                        </button>
                        <a href="#admin-audit" class="btn btn-primary btn-sm" style="font-weight:700;">
                            🛡️ Security & Audit Log &rarr;
                        </a>
                    </div>
                </div>

                <!-- Live Status Indicators Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                    <!-- Database Card -->
                    <div class="card" style="padding:1.25rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <div style="font-weight:800; color:#0f172a; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
                                <span>🗄️</span> MySQL Database
                            </div>
                            <span style="font-size:0.72rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:10px; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">
                                🟢 ${App.escapeHtml(db.status || 'healthy')}
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:#475569; line-height:1.6;">
                            <div><strong>Version:</strong> ${App.escapeHtml(db.version || 'MySQL 8.0')}</div>
                            <div><strong>Database Size:</strong> ${db.database_size_mb || 0} MB</div>
                            <div><strong>Active Records:</strong> ${Object.values(db.table_counts || {}).reduce((a, b) => a + b, 0)} core rows</div>
                        </div>
                    </div>

                    <!-- Sync Queue Card -->
                    <div class="card" style="padding:1.25rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <div style="font-weight:800; color:#0f172a; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
                                <span>🔄</span> Offline Sync Engine
                            </div>
                            <span style="font-size:0.72rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:10px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">
                                🟢 ${App.escapeHtml(sync.status || 'optimal')}
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:#475569; line-height:1.6;">
                            <div><strong>Registered Devices:</strong> ${sync.registered_devices || 0}</div>
                            <div><strong>Queue Depth:</strong> ${sync.total_queue_items || 0} transactions</div>
                            <div><strong>Failed / Dead-Letter:</strong> <span style="color:${sync.failed_dead_letter > 0 ? '#ef4444' : '#16a34a'}; font-weight:700;">${sync.failed_dead_letter || 0}</span></div>
                        </div>
                    </div>

                    <!-- Storage Card -->
                    <div class="card" style="padding:1.25rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <div style="font-weight:800; color:#0f172a; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
                                <span>📁</span> Disk Storage
                            </div>
                            <span style="font-size:0.72rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:10px; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">
                                🟢 ${App.escapeHtml(storage.status || 'healthy')}
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:#475569; line-height:1.6;">
                            <div><strong>Free Disk Space:</strong> ${storage.disk_free_gb || 0} GB / ${storage.disk_total_gb || 0} GB</div>
                            <div><strong>Learning Materials:</strong> ${storage.materials_size_mb || 0} MB</div>
                            <div><strong>Exam PDFs & Reports:</strong> ${roundNum((storage.exams_size_mb || 0) + (storage.reports_size_mb || 0))} MB</div>
                        </div>
                    </div>

                    <!-- PHP Runtime Card -->
                    <div class="card" style="padding:1.25rem; border-radius:12px; border:1px solid #e2e8f0; background:#fff;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <div style="font-weight:800; color:#0f172a; font-size:0.95rem; display:flex; align-items:center; gap:0.4rem;">
                                <span>⚡</span> Runtime & Latency
                            </div>
                            <span style="font-size:0.72rem; font-weight:700; padding:0.15rem 0.45rem; border-radius:10px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">
                                ${runtime.api_latency_ms || 0} ms
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:#475569; line-height:1.6;">
                            <div><strong>PHP Engine:</strong> v${App.escapeHtml(runtime.php_version || '8.2')}</div>
                            <div><strong>Memory Utilization:</strong> ${runtime.memory_current_mb || 0} MB (Peak: ${runtime.memory_peak_mb || 0} MB)</div>
                            <div><strong>Max Upload:</strong> ${App.escapeHtml(runtime.upload_max_filesize || '10M')}</div>
                        </div>
                    </div>
                </div>

                <!-- System Configuration Settings Section -->
                <div class="card" style="padding:0; border-radius:12px; border:1px solid #e2e8f0; background:#fff; overflow:hidden;">
                    <div style="padding:1rem 1.25rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-weight:800; color:#0f172a; font-size:0.95rem;">
                            ⚙️ System Configuration Parameters
                        </div>
                        <span style="font-size:0.78rem; color:#64748b;">
                            Changes generate immutable audit logs
                        </span>
                    </div>

                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-weight:700; font-size:0.78rem;">
                                    <th style="padding:0.75rem 1rem;">Setting Key</th>
                                    <th style="padding:0.75rem 1rem;">Description</th>
                                    <th style="padding:0.75rem 1rem;">Type</th>
                                    <th style="padding:0.75rem 1rem;">Active Value</th>
                                    <th style="padding:0.75rem 1rem; text-align:right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${settings.map(s => `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:0.75rem 1rem; font-family:monospace; font-weight:700; color:#0f172a;">
                                            ${App.escapeHtml(s.setting_key)}
                                        </td>
                                        <td style="padding:0.75rem 1rem; font-size:0.82rem; color:#64748b;">
                                            ${App.escapeHtml(s.description || '')}
                                        </td>
                                        <td style="padding:0.75rem 1rem;">
                                            <span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; padding:0.1rem 0.35rem; border-radius:4px; background:#f1f5f9; color:#475569;">
                                                ${App.escapeHtml(s.value_type)}
                                            </span>
                                        </td>
                                        <td style="padding:0.75rem 1rem; font-weight:700; color:#1e40af; font-family:monospace;">
                                            ${App.escapeHtml(s.setting_value)}
                                        </td>
                                        <td style="padding:0.75rem 1rem; text-align:right;">
                                            <button class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.5rem; font-weight:700;" onclick="AuditApp.openEditSettingModal('${App.escapeHtml(s.setting_key)}', '${App.escapeHtml(s.setting_value)}')">
                                                ✏️ Edit
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    openEditSettingModal(key, currentValue) {
        let modal = document.getElementById('edit-setting-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'edit-setting-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                <div class="card" style="max-width:480px; width:100%; background:#fff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); padding:1.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h3 style="margin:0; font-size:1.1rem; font-weight:800; color:#0f172a;">
                            ✏️ Edit System Setting
                        </h3>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('edit-setting-modal').remove()">✕</button>
                    </div>

                    <form onsubmit="AuditApp.submitEditSetting(event, '${App.escapeHtml(key)}')">
                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">
                                Parameter Key
                            </label>
                            <input type="text" class="form-control" value="${App.escapeHtml(key)}" disabled style="width:100%; padding:0.5rem; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-family:monospace; font-size:0.82rem;">
                        </div>

                        <div style="margin-bottom:1.25rem;">
                            <label style="display:block; font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:0.25rem;">
                                Value *
                            </label>
                            <input type="text" id="edit-setting-val" class="form-control" required value="${App.escapeHtml(currentValue)}" style="width:100%; padding:0.55rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;">
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('edit-setting-modal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary" style="font-weight:700;">Save & Log Audit</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    async submitEditSetting(event, key) {
        event.preventDefault();
        const newVal = document.getElementById('edit-setting-val').value.trim();

        try {
            const res = await API.patch('/api/admin/system/settings', {
                setting_key: key,
                setting_value: newVal
            });

            if (res && res.success) {
                alert(`✅ Setting '${key}' updated successfully!`);
                const modal = document.getElementById('edit-setting-modal');
                if (modal) modal.remove();
                this.initSystemHealth(document.getElementById('app-content'));
            } else {
                alert('Update failed: ' + (res.message || 'Unknown error'));
            }
        } catch (e) {
            alert('Update failed: ' + (e.message || 'Unknown error'));
        }
    }
};

function roundNum(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

window.AuditApp = AuditApp;
