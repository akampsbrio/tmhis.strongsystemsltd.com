/**
 * TMHIS Module 05: Parental Guides & Pedagogical Instruction Library
 */

const GuidesApp = {
    currentFilters: {
        class_id: '',
        term_id: '',
        education_level_target: '',
        status: '',
        search: ''
    },
    terms: [],
    classes: [],
    learners: [],
    selectedLearnerId: null,
    guides: [],
    currentGuide: null,

    async init(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Parental Guides & Curriculum Terms...</p>
            </div>
        `;

        try {
            // Load Terms, Classes, and Registered Learners
            const [termsRes, classesRes, learnersRes] = await Promise.all([
                API.get('/api/parent/terms'),
                API.get('/api/parent/classes'),
                API.get('/api/parent/learners').catch(() => ({ data: [] }))
            ]);

            this.terms = Array.isArray(termsRes.data) ? termsRes.data : [];
            this.classes = Array.isArray(classesRes.data) ? classesRes.data : [];
            this.learners = Array.isArray(learnersRes.data) ? learnersRes.data : (learnersRes.data?.learners || []);

            // Default to current active term if any
            const activeTerm = this.terms.find(t => t.is_current);
            if (activeTerm && !this.currentFilters.term_id) {
                this.currentFilters.term_id = activeTerm.term_id;
            }

            await this.loadGuides();
            this.renderView(container);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load Parental Guides</h4>
                    <p>${App.escapeHtml(err.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="GuidesApp.init(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    async loadGuides() {
        const params = new URLSearchParams();
        if (this.currentFilters.class_id) params.append('class_id', this.currentFilters.class_id);
        if (this.currentFilters.term_id) params.append('term_id', this.currentFilters.term_id);
        if (this.currentFilters.education_level_target) params.append('education_level_target', this.currentFilters.education_level_target);
        if (this.currentFilters.status) params.append('status', this.currentFilters.status);
        if (this.currentFilters.search) params.append('search', this.currentFilters.search);
        params.append('limit', '50');

        try {
            const res = await API.get('/api/parent/guides?' + params.toString()).catch(() => ({ data: { guides: [] } }));
            let guides = res.data?.guides || (Array.isArray(res.data) ? res.data : []);
            if (guides.length === 0 && typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getGuides) {
                guides = await TMHIS_DB.getGuides();
            }
            this.guides = guides;
        } catch (e) {
            console.error('[GuidesApp] loadGuides error:', e);
            if (typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getGuides) {
                this.guides = await TMHIS_DB.getGuides();
            } else {
                this.guides = [];
            }
        }
    },

    renderView(container) {
        const user = Auth.getUser();
        const role = user?.role_code || '';
        const isOfficerOrAdmin = ['administrator', 'curriculum_officer'].includes(role);

        container.innerHTML = `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:700; color:#0f172a; margin:0 0 0.25rem 0; letter-spacing:-0.015em;">
                        Parent Guides & Timetables ${isOfficerOrAdmin ? '<span class="badge" style="background:#2563eb; color:#fff; font-size:0.75rem; vertical-align:middle; margin-left:6px;">Officer Portal</span>' : ''}
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        ${isOfficerOrAdmin ? 'Author, edit, publish, and manage official NCDC parental home teaching guides and assessment rubrics.' : 'Step-by-step pedagogical instructions, flexible schedules, weekly, monthly, and 12-week planners.'}
                    </p>
                </div>
                <div style="display:flex; gap:0.45rem; align-items:center; flex-wrap:wrap;">
                    <a href="#parent-termly-planner" class="btn btn-secondary btn-sm" style="padding:0.4rem 0.8rem; font-size:0.82rem; font-weight:600; border-color:#e2e8f0; color:#475569;">
                        Termly Roadmap
                    </a>
                    <a href="#parent-monthly-planner" class="btn btn-secondary btn-sm" style="padding:0.4rem 0.8rem; font-size:0.82rem; font-weight:600; border-color:#e2e8f0; color:#475569;">
                        Monthly Calendar
                    </a>
                    <a href="#parent-schedule" class="btn btn-secondary btn-sm" style="padding:0.4rem 0.8rem; font-size:0.82rem; font-weight:600; border-color:#e2e8f0; color:#475569;">
                        Weekly Timetable
                    </a>
                    ${isOfficerOrAdmin ? `
                        <button class="btn btn-primary btn-sm" style="padding:0.4rem 0.95rem; font-size:0.82rem; font-weight:700; display:flex; align-items:center; gap:5px;" onclick="GuidesApp.openAuthoringModal()">
                            <span>✍️</span> + Author New Guide
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- Pre-Planning Prompt Callout Banner (Clean SaaS Design) -->
            <div style="margin-bottom:1.25rem; padding:1rem 1.25rem; background:#fff; border:1px solid #e2e8f0; border-left:3px solid #2563eb; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                <div>
                    <h4 style="font-size:0.92rem; font-weight:700; margin:0 0 0.15rem 0; color:#0f172a;">
                        ${isOfficerOrAdmin ? 'Curriculum Alignment & Parental Guidance' : 'Pre-Plan Your Academic Schedule'}
                    </h4>
                    <p style="font-size:0.82rem; color:#64748b; margin:0;">
                        ${isOfficerOrAdmin ? 'Ensure all primary syllabus units (P1–P7) have matching step-by-step home teaching instructions and assessment checklists.' : 'Auto-distribute the 12-week NCDC syllabus or structure customized daily slots on the calendar.'}
                    </p>
                </div>
                <div style="display:flex; gap:0.45rem;">
                    ${isOfficerOrAdmin ? `
                        <button class="btn btn-primary btn-sm" style="font-weight:600; padding:0.35rem 0.85rem; font-size:0.8rem; border-radius:6px;" onclick="GuidesApp.openAuthoringModal()">
                            + Create Guide Draft
                        </button>
                        <a href="#curriculum-explorer" class="btn btn-secondary btn-sm" style="border-color:#e2e8f0; color:#475569; font-weight:600; padding:0.35rem 0.8rem; font-size:0.8rem; border-radius:6px;">
                            Curriculum Syllabus
                        </a>
                    ` : `
                        <a href="#parent-termly-planner" class="btn btn-primary btn-sm" style="font-weight:600; padding:0.35rem 0.85rem; font-size:0.8rem; border-radius:6px;">
                            Open Termly Planner
                        </a>
                        <a href="#parent-monthly-planner" class="btn btn-secondary btn-sm" style="border-color:#e2e8f0; color:#475569; font-weight:600; padding:0.35rem 0.8rem; font-size:0.8rem; border-radius:6px;">
                            Monthly Calendar
                        </a>
                    `}
                </div>
            </div>

            <!-- Student / Child Selector Bar (for Parents) -->
            ${this.learners.length > 0 ? `
                <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:1rem; overflow-x:auto; padding-bottom:4px;">
                    <span style="font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; margin-right:0.25rem; white-space:nowrap;">
                        Learner View
                    </span>
                    <button class="btn ${this.selectedLearnerId === null ? 'btn-primary' : 'btn-secondary'} btn-sm" 
                        onclick="GuidesApp.selectChild(null)" 
                        style="border-radius:20px; font-size:0.8rem; padding:0.25rem 0.75rem; font-weight:600; white-space:nowrap;">
                        All Classes
                    </button>
                    ${this.learners.map(l => {
                        const isSelected = this.selectedLearnerId == l.learner_id;
                        const avatar = l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name)}&background=2563eb&color=fff&rounded=true`;
                        return `
                            <button class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm" 
                                onclick="GuidesApp.selectChild(${l.learner_id}, ${l.class_id})" 
                                style="display:flex; align-items:center; gap:0.4rem; border-radius:20px; font-size:0.8rem; padding:0.25rem 0.8rem; font-weight:600; white-space:nowrap;">
                                <img src="${App.escapeHtml(avatar)}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;">
                                <span>${App.escapeHtml(l.full_name)}</span>
                                <span style="font-size:0.7rem; background:rgba(255,255,255,0.25); padding:0.05rem 0.35rem; border-radius:8px;">${l.class_code || 'P' + l.class_id}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            <!-- Compact & Narrow Filter Toolbar -->
            <div class="card" style="margin-bottom:1.25rem; padding:0.75rem 1rem; background:var(--card-bg); border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid var(--border-color, #e5e7eb);">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.6rem; align-items:end;">
                    
                    <!-- Term Selector -->
                    <div>
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.2rem;">
                            🗓️ Academic Term
                        </label>
                        <select id="guide-filter-term" class="form-control" onchange="GuidesApp.filterChange('term_id', this.value)" style="width:100%; height:34px; font-size:0.82rem; padding:0.25rem 0.5rem; border-radius:6px;">
                            <option value="">All Terms</option>
                            ${this.terms.map(t => `
                                <option value="${t.term_id}" ${this.currentFilters.term_id == t.term_id ? 'selected' : ''}>
                                    ${t.term_name} (${t.academic_year}) ${t.is_current ? '⭐' : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Class Level Filter -->
                    <div>
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.2rem;">
                            🎒 Primary Class
                        </label>
                        <select id="guide-filter-class" class="form-control" onchange="GuidesApp.filterChange('class_id', this.value)" style="width:100%; height:34px; font-size:0.82rem; padding:0.25rem 0.5rem; border-radius:6px;">
                            <option value="">All Classes (P1–P7)</option>
                            ${this.classes.map(c => `
                                <option value="${c.class_id}" ${this.currentFilters.class_id == c.class_id ? 'selected' : ''}>
                                    ${c.class_code} (${c.class_name})
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Target Education Level -->
                    <div>
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.2rem;">
                            🎯 Parent Guide Level
                        </label>
                        <select id="guide-filter-level" class="form-control" onchange="GuidesApp.filterChange('education_level_target', this.value)" style="width:100%; height:34px; font-size:0.82rem; padding:0.25rem 0.5rem; border-radius:6px;">
                            <option value="">All Levels</option>
                            <option value="basic" ${this.currentFilters.education_level_target === 'basic' ? 'selected' : ''}>Basic (Everyday props)</option>
                            <option value="intermediate" ${this.currentFilters.education_level_target === 'intermediate' ? 'selected' : ''}>Intermediate (Standard)</option>
                            <option value="advanced" ${this.currentFilters.education_level_target === 'advanced' ? 'selected' : ''}>Advanced (Analytical/PLE)</option>
                        </select>
                    </div>

                    ${isOfficerOrAdmin ? `
                    <!-- Status Filter for Officers/Admins -->
                    <div>
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.2rem;">
                            📊 Publication Status
                        </label>
                        <select id="guide-filter-status" class="form-control" onchange="GuidesApp.filterChange('status', this.value)" style="width:100%; height:34px; font-size:0.82rem; padding:0.25rem 0.5rem; border-radius:6px;">
                            <option value="">All Statuses</option>
                            <option value="published" ${this.currentFilters.status === 'published' ? 'selected' : ''}>Published Only</option>
                            <option value="draft" ${this.currentFilters.status === 'draft' ? 'selected' : ''}>Drafts Only</option>
                            <option value="under_review" ${this.currentFilters.status === 'under_review' ? 'selected' : ''}>Under Review</option>
                            <option value="archived" ${this.currentFilters.status === 'archived' ? 'selected' : ''}>Archived</option>
                        </select>
                    </div>
                    ` : ''}

                    <!-- Search Input -->
                    <div>
                        <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:0.2rem;">
                            🔍 Search Guides
                        </label>
                        <input type="text" class="form-control" placeholder="Search topic or keywords..." 
                            value="${App.escapeHtml(this.currentFilters.search)}" 
                            oninput="GuidesApp.debounceSearch(this.value)" style="width:100%; height:34px; font-size:0.82rem; padding:0.25rem 0.5rem; border-radius:6px;">
                    </div>
                </div>
            </div>

            <!-- Guides Grid -->
            <div id="guides-grid-container">
                ${this.renderGuidesGrid()}
            </div>

            <!-- Guide Reader / Detail Modal Container -->
            <div id="guide-modal-container"></div>
        `;
    },

    selectChild(learnerId, classId = null) {
        this.selectedLearnerId = learnerId;
        this.currentFilters.class_id = classId ? String(classId) : '';
        this.loadGuides().then(() => {
            this.renderView(document.getElementById('app-content'));
        });
    },

    renderGuidesGrid() {
        const user = Auth.getUser();
        const role = user?.role_code || '';
        const isOfficerOrAdmin = ['administrator', 'curriculum_officer'].includes(role);

        if (this.guides.length === 0) {
            return `
                <div class="card" style="text-align:center; padding:3rem 1.5rem; background:var(--card-bg); border-radius:12px;">
                    <div style="font-size:3rem; margin-bottom:0.75rem;">📚</div>
                    <h3 style="font-size:1.2rem; margin-bottom:0.5rem;">No Parental Guides Found</h3>
                    <p style="color:var(--text-muted); max-width:450px; margin:0 auto 1.25rem;">
                        No guides match the selected class, term, status, or search filter.
                    </p>
                    <div style="display:flex; justify-content:center; gap:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="GuidesApp.clearFilters()">Clear All Filters</button>
                        ${isOfficerOrAdmin ? `
                            <button class="btn btn-primary btn-sm" onclick="GuidesApp.openAuthoringModal()">+ Author First Guide</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:1.25rem;">
                ${this.guides.map(g => {
                    const levelColors = {
                        basic: { bg: '#ecfdf5', text: '#065f46', label: 'Basic' },
                        intermediate: { bg: '#eff6ff', text: '#1e40af', label: 'Intermediate' },
                        advanced: { bg: '#fef3c7', text: '#92400e', label: 'Advanced' }
                    };
                    const lvl = levelColors[g.education_level_target] || levelColors.intermediate;

                    const statusBadges = {
                        published: { bg: '#dcfce7', text: '#166534', label: '✅ Published' },
                        draft: { bg: '#fef3c7', text: '#92400e', label: '📝 Draft' },
                        under_review: { bg: '#e0e7ff', text: '#3730a3', label: '⏳ Under Review' },
                        archived: { bg: '#f1f5f9', text: '#475569', label: '📦 Archived' }
                    };
                    const st = statusBadges[g.status] || statusBadges.published;

                    return `
                        <div class="card guide-card" style="padding:1.15rem; background:var(--card-bg); border-radius:12px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid var(--border-color, #e5e7eb); transition:transform 0.15s ease, box-shadow 0.15s ease;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; flex-wrap:wrap; gap:0.25rem;">
                                    <div style="display:flex; gap:0.35rem; align-items:center;">
                                        <span style="font-size:0.75rem; font-weight:700; background:var(--primary, #2563eb); color:#fff; padding:0.15rem 0.5rem; border-radius:6px;">
                                            ${App.escapeHtml(g.class_code || 'P' + g.class_level)} • ${App.escapeHtml(g.subject_name)}
                                        </span>
                                        <span style="font-size:0.72rem; font-weight:600; background:${lvl.bg}; color:${lvl.text}; padding:0.15rem 0.45rem; border-radius:6px;">
                                            🎯 ${lvl.label}
                                        </span>
                                    </div>
                                    ${isOfficerOrAdmin && g.status ? `
                                        <span style="font-size:0.72rem; font-weight:700; background:${st.bg}; color:${st.text}; padding:0.15rem 0.45rem; border-radius:6px;">
                                            ${st.label}
                                        </span>
                                    ` : ''}
                                </div>

                                <h3 style="font-size:1rem; font-weight:700; margin-bottom:0.4rem; line-height:1.4; color:var(--text-main);">
                                    ${App.escapeHtml(g.title)}
                                </h3>

                                ${g.lesson_title ? `
                                    <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.6rem;">
                                        📌 <strong>Lesson:</strong> ${App.escapeHtml(g.lesson_title)}
                                    </p>
                                ` : ''}

                                <div style="display:flex; align-items:center; gap:0.6rem; font-size:0.78rem; color:var(--text-muted); margin-bottom:0.75rem; flex-wrap:wrap;">
                                    <span>⏱️ ${g.expected_duration_minutes} Mins</span>
                                    <span>🗓️ ${App.escapeHtml(g.term_name || 'Term 1')}</span>
                                    ${g.version_count > 1 ? `<span>📝 v${g.version_count}</span>` : ''}
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:0.4rem; padding-top:0.6rem; border-top:1px solid var(--border-color, #e5e7eb);">
                                <div style="display:flex; gap:0.4rem;">
                                    <button class="btn btn-primary btn-sm" style="flex:1;" onclick="GuidesApp.openGuideModal(${g.guide_id})">
                                        📖 Open Guide
                                    </button>
                                    <button class="btn btn-secondary btn-sm" title="Printable Format" onclick="GuidesApp.openPrintableModal(${g.guide_id})">
                                        🖨️ Print
                                    </button>
                                </div>
                                ${isOfficerOrAdmin ? `
                                    <div style="display:flex; gap:0.4rem;">
                                        <button class="btn btn-secondary btn-sm" style="flex:1; font-size:0.78rem; padding:0.25rem 0.5rem;" onclick="GuidesApp.openEditModal(${g.guide_id})">
                                            ✏️ Edit
                                        </button>
                                        ${g.status !== 'published' ? `
                                            <button class="btn btn-primary btn-sm" style="flex:1; font-size:0.78rem; padding:0.25rem 0.5rem; background:#16a34a; border-color:#16a34a;" onclick="GuidesApp.publishGuide(${g.guide_id})">
                                                🚀 Publish
                                            </button>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    searchTimer: null,
    debounceSearch(val) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(async () => {
            this.currentFilters.search = val.trim();
            await this.loadGuides();
            const grid = document.getElementById('guides-grid-container');
            if (grid) grid.innerHTML = this.renderGuidesGrid();
        }, 300);
    },

    async filterChange(key, val) {
        this.currentFilters[key] = val;
        await this.loadGuides();
        const grid = document.getElementById('guides-grid-container');
        if (grid) grid.innerHTML = this.renderGuidesGrid();
    },

    async clearFilters() {
        this.selectedLearnerId = null;
        this.currentFilters = { class_id: '', term_id: '', education_level_target: '', search: '' };
        await this.loadGuides();
        this.renderView(document.getElementById('app-content'));
    },

    async openGuideModal(guideId) {
        const container = document.getElementById('guide-modal-container');
        if (!container) return;

        container.innerHTML = `
            <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1rem;">
                <div class="modal-card" style="background:var(--card-bg, #fff); width:100%; max-width:800px; max-height:90vh; overflow-y:auto; border-radius:12px; padding:2rem; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                    <div style="text-align:center; padding:2rem;"><div class="spinner"></div><p>Loading guide details...</p></div>
                </div>
            </div>
        `;

        try {
            const res = await API.get(`/api/guides/${guideId}`);
            const guide = res.data;
            this.currentGuide = guide;

            // Parse checklist items
            const checklistLines = (guide.assessment_checklist || '')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .map(l => l.replace(/^(\[ \]|\[x\]|-|\*)\s*/i, ''));

            container.innerHTML = `
                <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1rem;">
                    <div class="modal-card" style="background:var(--card-bg, #fff); width:100%; max-width:850px; max-height:90vh; overflow-y:auto; border-radius:12px; padding:2rem; box-shadow:0 10px 25px rgba(0,0,0,0.2); position:relative;">
                        
                        <!-- Header Banner -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem; border-bottom:1px solid #e5e7eb; padding-bottom:1rem;">
                            <div>
                                <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap;">
                                    <span class="badge" style="background:var(--primary, #2563eb); color:#fff; font-weight:700; padding:0.25rem 0.6rem; border-radius:6px; font-size:0.8rem;">
                                        ${App.escapeHtml(guide.class_code || 'P' + guide.class_level)} • ${App.escapeHtml(guide.subject_name)}
                                    </span>
                                    <span class="badge" style="background:#f3f4f6; color:#374151; font-size:0.8rem; font-weight:600; padding:0.25rem 0.6rem; border-radius:6px;">
                                        🗓️ ${App.escapeHtml(guide.term_name || 'Term 1')}
                                    </span>
                                    <span class="badge" style="background:#ecfdf5; color:#065f46; font-size:0.8rem; font-weight:600; padding:0.25rem 0.6rem; border-radius:6px;">
                                        🎯 Target: ${App.escapeHtml(guide.education_level_target ? guide.education_level_target.toUpperCase() : 'INTERMEDIATE')}
                                    </span>
                                </div>
                                <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">
                                    ${App.escapeHtml(guide.title)}
                                </h2>
                            </div>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('guide-modal-container').innerHTML=''" style="font-size:1.2rem; line-height:1; padding:0.3rem 0.6rem;">&times;</button>
                        </div>

                        <!-- Metadata Row -->
                        <div style="display:flex; gap:1.5rem; background:#f9fafb; padding:0.75rem 1rem; border-radius:8px; margin-bottom:1.5rem; font-size:0.85rem; color:#4b5563; flex-wrap:wrap;">
                            <div>⏱️ <strong>Duration:</strong> ${guide.expected_duration_minutes || 40} Minutes</div>
                            <div>✍️ <strong>Author:</strong> ${App.escapeHtml(guide.author_name || 'NCDC Specialist')}</div>
                            <div>📝 <strong>Edition:</strong> v${guide.current_version || 1}</div>
                        </div>

                        <!-- 1. Objectives -->
                        <div style="margin-bottom:1.5rem; background:#eff6ff; padding:1.25rem; border-radius:8px; border-left:4px solid #2563eb;">
                            <h4 style="color:#1e40af; font-size:1rem; font-weight:700; margin-top:0; margin-bottom:0.5rem;">
                                🎯 Learning Objectives for this Lesson
                            </h4>
                            <div style="font-size:0.9rem; line-height:1.6; color:#1e3a8a; white-space:pre-line;">
                                ${App.escapeHtml(guide.learning_objectives || 'Objectives defined in lesson plan.')}
                            </div>
                        </div>

                        <!-- 2. Materials Needed -->
                        <div style="margin-bottom:1.5rem; background:#fefce8; padding:1.25rem; border-radius:8px; border-left:4px solid #ca8a04;">
                            <h4 style="color:#854d0e; font-size:1rem; font-weight:700; margin-top:0; margin-bottom:0.5rem;">
                                📦 Required Household & Learning Items
                            </h4>
                            <div style="font-size:0.9rem; line-height:1.6; color:#713f12; white-space:pre-line;">
                                ${App.escapeHtml(guide.materials_needed || 'Standard exercise book, pencil, and ruler.')}
                            </div>
                        </div>

                        <!-- 3. Suggested Teaching Steps -->
                        <div style="margin-bottom:1.5rem;">
                            <h4 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin-bottom:0.75rem;">
                                📋 Step-by-Step Home Teaching Guide
                            </h4>
                            <div style="font-size:0.92rem; line-height:1.7; color:var(--text-main); background:#fff; border:1px solid #e5e7eb; padding:1.25rem; border-radius:8px; white-space:pre-line;">
                                ${App.escapeHtml(guide.suggested_steps || guide.guide_body)}
                            </div>
                        </div>

                        <!-- 4. Common Mistakes & Pitfalls -->
                        <div style="margin-bottom:1.5rem; background:#fef2f2; padding:1.25rem; border-radius:8px; border-left:4px solid #ef4444;">
                            <h4 style="color:#991b1b; font-size:1rem; font-weight:700; margin-top:0; margin-bottom:0.5rem;">
                                ⚠️ Common Mistakes to Watch Out For
                            </h4>
                            <div style="font-size:0.9rem; line-height:1.6; color:#7f1d1d; white-space:pre-line;">
                                ${App.escapeHtml(guide.common_mistakes || 'Ensure the child takes enough time before answering.')}
                            </div>
                        </div>

                        <!-- 5. Interactive Assessment Checklist -->
                        <div style="margin-bottom:1.5rem; background:#f0fdf4; padding:1.25rem; border-radius:8px; border-left:4px solid #16a34a;">
                            <h4 style="color:#166534; font-size:1rem; font-weight:700; margin-top:0; margin-bottom:0.5rem;">
                                ✅ Parent Assessment Checklist
                            </h4>
                            <p style="font-size:0.85rem; color:#14532d; margin-bottom:0.75rem;">
                                Check off each milestone as your child demonstrates understanding:
                            </p>
                            <div style="display:flex; flex-direction:column; gap:0.5rem;">
                                ${checklistLines.map((item, idx) => `
                                    <label style="display:flex; align-items:flex-start; gap:0.6rem; font-size:0.9rem; color:#14532d; cursor:pointer;">
                                        <input type="checkbox" id="check-${idx}" style="margin-top:0.25rem;" onchange="GuidesApp.toggleCheckItem(this)">
                                        <span>${App.escapeHtml(item)}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Related Materials if any -->
                        ${guide.related_materials && guide.related_materials.length > 0 ? `
                            <div style="margin-bottom:1.5rem; background:#faf5ff; padding:1.25rem; border-radius:8px; border-left:4px solid #a855f7;">
                                <h4 style="color:#6b21a8; font-size:1rem; font-weight:700; margin-top:0; margin-bottom:0.5rem;">
                                    📁 Attached Lesson Learning Materials
                                </h4>
                                <div style="display:flex; flex-direction:column; gap:0.5rem;">
                                    ${guide.related_materials.map(m => `
                                        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:0.5rem 0.75rem; border-radius:6px; border:1px solid #e9d5ff;">
                                            <span style="font-size:0.88rem; font-weight:600; color:#4c1d95;">${App.escapeHtml(m.title)} (${m.material_type})</span>
                                            <a href="/api/materials/${m.material_id}/download" class="btn btn-secondary btn-sm" target="_blank" style="font-size:0.75rem; padding:0.2rem 0.5rem;">
                                                📥 Download / Open
                                            </a>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Footer Actions -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2rem; padding-top:1rem; border-top:1px solid #e5e7eb; flex-wrap:wrap; gap:0.5rem;">
                            <button class="btn btn-secondary" onclick="GuidesApp.openPrintableModal(${guide.guide_id})">
                                🖨️ Print / Download PDF
                            </button>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-secondary" onclick="document.getElementById('guide-modal-container').innerHTML=''">Close</button>
                                <button class="btn btn-primary" onclick="GuidesApp.scheduleThisGuide(${guide.guide_id}, ${guide.subject_id || 'null'}, ${guide.lesson_id || 'null'})">
                                    📅 Pre-Plan on Schedule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `
                <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1rem;">
                    <div class="modal-card" style="background:#fff; border-radius:12px; padding:2rem; max-width:450px;">
                        <p style="color:#b91c1c;">Failed to load guide details: ${App.escapeHtml(err.message)}</p>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('guide-modal-container').innerHTML=''">Close</button>
                    </div>
                </div>
            `;
        }
    },

    scheduleThisGuide(guideId, subjectId, lessonId) {
        document.getElementById('guide-modal-container').innerHTML = '';
        window.location.hash = '#parent-schedule';
        setTimeout(() => {
            if (window.ScheduleApp) {
                ScheduleApp.openScheduleModal(null, {
                    subjectId: subjectId,
                    lessonId: lessonId,
                    lockSubject: Boolean(subjectId),
                    notes: this.currentGuide ? `Parent Guide: ${this.currentGuide.title}` : ''
                });
            }
        }, 300);
    },

    toggleCheckItem(cb) {
        const textSpan = cb.nextElementSibling;
        if (textSpan) {
            textSpan.style.textDecoration = cb.checked ? 'line-through' : 'none';
            textSpan.style.opacity = cb.checked ? '0.7' : '1';
        }
    },

    async openPrintableModal(guideId) {
        try {
            const res = await API.get(`/api/guides/${guideId}/export`);
            const p = res.data;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Please allow popups to open the printable guide.');
                return;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${App.escapeHtml(p.title)} — TMHIS Parental Guide</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; max-width: 800px; margin: 0 auto; }
                        .header { border-bottom: 3px double #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
                        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 14px; background: #f3f4f6; padding: 12px; border-radius: 6px; }
                        h1 { color: #1e3a8a; font-size: 22px; margin: 0 0 10px 0; }
                        h2 { color: #1e40af; font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-top: 20px; }
                        .box { padding: 12px; margin-bottom: 15px; border-radius: 6px; font-size: 14px; }
                        .objectives { background: #eff6ff; border-left: 4px solid #2563eb; }
                        .materials { background: #fefce8; border-left: 4px solid #ca8a04; }
                        .pitfalls { background: #fef2f2; border-left: 4px solid #ef4444; }
                        .checklist { background: #f0fdf4; border-left: 4px solid #16a34a; }
                        .checklist-item { margin: 6px 0; }
                        @media print {
                            body { padding: 0; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div style="text-align:right; margin-bottom:15px;">
                        <button onclick="window.print()" style="padding:8px 16px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">🖨️ Print Document</button>
                    </div>
                    <div class="header">
                        <div style="font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Ministry of Education & Sports • NCDC Homeschooling Curriculum</div>
                        <h1>${App.escapeHtml(p.title)}</h1>
                        <div style="font-size:14px; color:#4b5563;"><strong>Class & Subject:</strong> ${App.escapeHtml(p.class_name)} &bull; ${App.escapeHtml(p.subject_name)} &bull; ${App.escapeHtml(p.term)}</div>
                    </div>

                    <div class="meta-grid">
                        <div><strong>Target Parent Level:</strong> ${App.escapeHtml(p.target_level)}</div>
                        <div><strong>Estimated Duration:</strong> ${App.escapeHtml(p.expected_duration)}</div>
                        ${p.lesson_title ? `<div><strong>Lesson Milestone:</strong> ${App.escapeHtml(p.lesson_title)}</div>` : ''}
                        <div><strong>Publication Status:</strong> Verified NCDC Guide</div>
                    </div>

                    <div class="box objectives">
                        <strong>🎯 Learning Objectives:</strong><br>
                        <div style="white-space:pre-line; margin-top:6px;">${App.escapeHtml(p.learning_objectives || 'None specified')}</div>
                    </div>

                    <div class="box materials">
                        <strong>📦 Required Materials:</strong><br>
                        <div style="white-space:pre-line; margin-top:6px;">${App.escapeHtml(p.materials_needed || 'Standard writing materials')}</div>
                    </div>

                    <h2>📋 Step-by-Step Home Teaching Instructions</h2>
                    <div style="white-space:pre-line; font-size:14px;">${App.escapeHtml(p.suggested_steps || p.guide_body)}</div>

                    <div class="box pitfalls" style="margin-top:20px;">
                        <strong>⚠️ Common Pitfalls & Mistakes:</strong><br>
                        <div style="white-space:pre-line; margin-top:6px;">${App.escapeHtml(p.common_mistakes || 'None noted')}</div>
                    </div>

                    <div class="box checklist">
                        <strong>✅ Assessment Checklist for Parent:</strong><br>
                        <div style="white-space:pre-line; margin-top:6px;">${App.escapeHtml(p.assessment_checklist || '[] Verified comprehension')}</div>
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (err) {
            alert('Failed to generate printable guide: ' + err.message);
        }
    },

    async openAuthoringModal(guideData = null) {
        let container = document.getElementById('guide-modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'guide-modal-container';
            document.body.appendChild(container);
        }

        // Ensure terms and classes are loaded
        if (!this.classes.length || !this.terms.length) {
            try {
                const [termsRes, classesRes] = await Promise.all([
                    API.get('/api/parent/terms'),
                    API.get('/api/parent/classes')
                ]);
                this.terms = Array.isArray(termsRes.data) ? termsRes.data : [];
                this.classes = Array.isArray(classesRes.data) ? classesRes.data : [];
            } catch (e) {
                console.error('[GuidesApp] Error loading terms/classes for authoring modal:', e);
            }
        }

        const isEdit = Boolean(guideData && guideData.guide_id);
        const modalTitle = isEdit ? `✏️ Edit Parental Guide #${guideData.guide_id}` : '✍️ Author New Parental Guide Draft';
        const submitLabel = isEdit ? 'Save Changes' : 'Save Guide Draft';
        const onSubmitFn = isEdit ? `GuidesApp.submitEditGuide(event, ${guideData.guide_id})` : 'GuidesApp.submitAuthorGuide(event)';

        const selectedClassId = guideData ? guideData.class_id : (this.classes[0]?.class_id || '');
        const selectedTermId = guideData ? guideData.term_id : (this.terms.find(t => t.is_current)?.term_id || this.terms[0]?.term_id || '');
        const selectedLevel = guideData?.education_level_target || 'intermediate';
        const durationVal = guideData?.expected_duration_minutes || 40;
        const titleVal = guideData?.title || '';
        const objectivesVal = guideData?.learning_objectives || '';
        const materialsVal = guideData?.materials_needed || '';
        const stepsVal = guideData?.suggested_steps || guideData?.guide_body || '';
        const pitfallsVal = guideData?.common_mistakes || '';
        const checklistVal = guideData?.assessment_checklist || '';

        container.innerHTML = `
            <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1rem; backdrop-filter:blur(3px);">
                <div class="modal-card" style="background:#fff; width:100%; max-width:820px; max-height:92vh; overflow-y:auto; border-radius:14px; padding:2rem; box-shadow:0 20px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; padding-bottom:0.75rem; border-bottom:1px solid #e2e8f0;">
                        <div>
                            <h2 style="font-size:1.35rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem 0;">${modalTitle}</h2>
                            <p style="font-size:0.83rem; color:#64748b; margin:0;">National Curriculum Development Centre (NCDC) Home Pedagogical Format</p>
                        </div>
                        <button class="btn btn-secondary btn-sm" style="font-size:1.2rem; line-height:1; padding:0.3rem 0.6rem;" onclick="document.getElementById('guide-modal-container').innerHTML=''">&times;</button>
                    </div>

                    <form id="author-guide-form" onsubmit="${onSubmitFn}">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Primary Class Level *</label>
                                <select id="author-class" class="form-control" required onchange="GuidesApp.updateAuthorSubjects(this.value)">
                                    <option value="">Select Class</option>
                                    ${this.classes.map(c => `<option value="${c.class_id}" ${c.class_id == selectedClassId ? 'selected' : ''}>${c.class_code} (${c.class_name})</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Academic Term *</label>
                                <select id="author-term" class="form-control" required>
                                    ${this.terms.map(t => `<option value="${t.term_id}" ${t.term_id == selectedTermId ? 'selected' : ''}>${t.term_name} (${t.academic_year}) ${t.is_current ? '⭐ Active' : ''}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Curriculum Subject *</label>
                            <select id="author-subject" class="form-control" required>
                                <option value="">Loading subjects...</option>
                            </select>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Guide Title *</label>
                            <input type="text" id="author-title" class="form-control" value="${App.escapeHtml(titleVal)}" placeholder="e.g. Parent Guide: Teaching Place Value with Abacus and Bundle Sticks" required>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Target Parent Education Level</label>
                                <select id="author-level" class="form-control">
                                    <option value="basic" ${selectedLevel === 'basic' ? 'selected' : ''}>Basic (Everyday household analogies)</option>
                                    <option value="intermediate" ${selectedLevel === 'intermediate' ? 'selected' : ''}>Intermediate (Structured textbook steps)</option>
                                    <option value="advanced" ${selectedLevel === 'advanced' ? 'selected' : ''}>Advanced (Analytical rigor / PLE depth)</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">Expected Duration (Minutes)</label>
                                <input type="number" id="author-duration" class="form-control" value="${durationVal}" min="10" max="180">
                            </div>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">🎯 Learning Objectives</label>
                            <textarea id="author-objectives" class="form-control" rows="3" placeholder="- Identify units, tens, and hundreds&#10;- Relate concrete objects to written numerals">${App.escapeHtml(objectivesVal)}</textarea>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">📦 Required Household & Learning Items</label>
                            <textarea id="author-materials" class="form-control" rows="2" placeholder="Bottle tops, sticks, rubber bands, standard primary exercise book">${App.escapeHtml(materialsVal)}</textarea>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">📋 Step-by-Step Home Teaching Instructions *</label>
                            <textarea id="author-steps" class="form-control" rows="6" placeholder="Step 1: Introduction & Real-World Warmup&#10;Step 2: Guided hands-on demonstration&#10;Step 3: Independent practice with positive reinforcement" required>${App.escapeHtml(stepsVal)}</textarea>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">⚠️ Common Mistakes to Watch Out For</label>
                            <textarea id="author-pitfalls" class="form-control" rows="2" placeholder="- Confusing digits order (e.g. reading 41 as 14)&#10;- Forgetting regrouping">${App.escapeHtml(pitfallsVal)}</textarea>
                        </div>

                        <div style="margin-bottom:1.5rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:0.3rem;">✅ Assessment Checklist for Parents (1 criteria per line)</label>
                            <textarea id="author-checklist" class="form-control" rows="3" placeholder="[x] Child can group objects in bundles of ten&#10;[x] Child writes the correct 2-digit number&#10;[x] Child explains their answer">${App.escapeHtml(checklistVal)}</textarea>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                            <div>
                                ${isEdit && guideData.status !== 'published' ? `
                                    <button type="button" class="btn btn-primary" style="background:#16a34a; border-color:#16a34a;" onclick="GuidesApp.publishGuide(${guideData.guide_id})">
                                        🚀 Publish Immediately
                                    </button>
                                ` : ''}
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button type="button" class="btn btn-secondary" onclick="document.getElementById('guide-modal-container').innerHTML=''">Cancel</button>
                                <button type="submit" class="btn btn-primary">${submitLabel}</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;

        if (selectedClassId) {
            await this.updateAuthorSubjects(selectedClassId, guideData?.subject_id);
        }
    },

    async updateAuthorSubjects(classId, selectedSubjectId = null) {
        const select = document.getElementById('author-subject');
        if (!select || !classId) return;

        select.innerHTML = '<option value="">Loading subjects...</option>';
        try {
            const res = await API.get(`/api/curriculum/classes/${classId}/subjects`);
            const subjects = Array.isArray(res.data) ? res.data : (res.data?.subjects || []);
            select.innerHTML = subjects.map(s => `
                <option value="${s.subject_id}" ${selectedSubjectId && selectedSubjectId == s.subject_id ? 'selected' : ''}>
                    ${App.escapeHtml(s.subject_name)} (${s.subject_code})
                </option>
            `).join('');
            if (subjects.length === 0) {
                select.innerHTML = '<option value="">No subjects found for this class</option>';
            }
        } catch (err) {
            select.innerHTML = '<option value="">Failed to load subjects</option>';
        }
    },

    async openEditModal(guideId) {
        try {
            const res = await API.get(`/api/guides/${guideId}`);
            const guide = res.data;
            await this.openAuthoringModal(guide);
        } catch (err) {
            alert('Failed to load guide details: ' + (err.message || 'Unknown error'));
        }
    },

    async submitAuthorGuide(e) {
        e.preventDefault();
        const payload = {
            class_id: document.getElementById('author-class').value,
            term_id: document.getElementById('author-term').value,
            subject_id: document.getElementById('author-subject').value,
            title: document.getElementById('author-title').value.trim(),
            education_level_target: document.getElementById('author-level').value,
            expected_duration_minutes: document.getElementById('author-duration').value,
            learning_objectives: document.getElementById('author-objectives').value.trim(),
            materials_needed: document.getElementById('author-materials').value.trim(),
            suggested_steps: document.getElementById('author-steps').value.trim(),
            guide_body: document.getElementById('author-steps').value.trim(),
            common_mistakes: document.getElementById('author-pitfalls').value.trim(),
            assessment_checklist: document.getElementById('author-checklist').value.trim()
        };

        try {
            await API.post('/api/officer/guides', payload);
            alert('Parental guide draft saved successfully!');
            const container = document.getElementById('guide-modal-container');
            if (container) container.innerHTML = '';
            
            // If on guides page, refresh, otherwise redirect
            if (window.location.hash.startsWith('#officer-guides') || window.location.hash.startsWith('#parent-guides')) {
                await this.loadGuides();
                this.renderView(document.getElementById('app-content'));
            } else {
                window.location.hash = '#officer-guides';
            }
        } catch (err) {
            alert('Failed to save guide: ' + (err.message || 'Unknown error'));
        }
    },

    async submitEditGuide(e, guideId) {
        e.preventDefault();
        const payload = {
            class_id: document.getElementById('author-class').value,
            term_id: document.getElementById('author-term').value,
            subject_id: document.getElementById('author-subject').value,
            title: document.getElementById('author-title').value.trim(),
            education_level_target: document.getElementById('author-level').value,
            expected_duration_minutes: document.getElementById('author-duration').value,
            learning_objectives: document.getElementById('author-objectives').value.trim(),
            materials_needed: document.getElementById('author-materials').value.trim(),
            suggested_steps: document.getElementById('author-steps').value.trim(),
            guide_body: document.getElementById('author-steps').value.trim(),
            common_mistakes: document.getElementById('author-pitfalls').value.trim(),
            assessment_checklist: document.getElementById('author-checklist').value.trim(),
            change_notes: 'Updated via officer portal'
        };

        try {
            await API.put(`/api/officer/guides/${guideId}`, payload);
            alert('Parental guide updated successfully!');
            const container = document.getElementById('guide-modal-container');
            if (container) container.innerHTML = '';
            
            await this.loadGuides();
            const grid = document.getElementById('guides-grid-container');
            if (grid) grid.innerHTML = this.renderGuidesGrid();
            else this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to update guide: ' + (err.message || 'Unknown error'));
        }
    },

    async publishGuide(guideId) {
        if (!confirm('Are you sure you want to publish this parental guide? It will become immediately accessible to all homeschooling parents and learners.')) return;
        try {
            await API.post(`/api/officer/guides/${guideId}/publish`, {});
            alert('Parental guide published successfully!');
            const container = document.getElementById('guide-modal-container');
            if (container) container.innerHTML = '';
            
            await this.loadGuides();
            const grid = document.getElementById('guides-grid-container');
            if (grid) grid.innerHTML = this.renderGuidesGrid();
            else this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to publish guide: ' + (err.message || 'Unknown error'));
        }
    }
};

window.GuidesApp = GuidesApp;
