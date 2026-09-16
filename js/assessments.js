/**
 * TMHIS Module 06: Online & Offline Assessments, Server-Side Scoring & Gradebook
 */

const AssessmentsApp = {
    currentFilters: {
        class_id: '',
        subject_id: '',
        assessment_type: '',
        search: ''
    },
    classes: [],
    subjects: [],
    learners: [],
    selectedLearnerId: null,
    assessments: [],

    // Active test-taking state
    activeAssessment: null,
    activeAttempt: null,
    questions: [],
    currentQuestionIndex: 0,
    answers: {}, // question_id -> { option_id, answer_text }
    timerInterval: null,
    timeRemainingSeconds: 0,
    totalTimeSeconds: 0,

    /**
     * Entry point for Assessment Catalog / Explorer
     */
    async init(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Assessments & Ugandan Primary Curriculum Quizzes...</p>
            </div>
        `;

        try {
            const role = Auth.getRole();
            const [classesRes, subjectsRes] = await Promise.all([
                API.get('/api/parent/classes').catch(() => ({ data: [] })),
                API.get('/api/curriculum/subjects').catch(() => ({ data: [] }))
            ]);

            this.classes = Array.isArray(classesRes.data) ? classesRes.data : (classesRes.data?.classes || []);
            this.subjects = Array.isArray(subjectsRes.data) ? subjectsRes.data : (subjectsRes.data?.subjects || []);

            // If parent or learner, load registered learners
            if (role === 'parent' || role === 'learner') {
                try {
                    const lRes = await API.get('/api/parent/learners');
                    this.learners = Array.isArray(lRes.data) ? lRes.data : (lRes.data?.learners || []);
                    if (this.learners.length > 0 && !this.selectedLearnerId) {
                        this.selectedLearnerId = this.learners[0].learner_id;
                    }
                } catch (e) {
                    this.learners = [];
                }
            }

            await this.loadAssessments();
            this.renderCatalogView(container);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load assessments</h4>
                    <p>${App.escapeHtml(err.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="AssessmentsApp.init(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    /**
     * Fetch assessments list with active filters
     */
    async loadAssessments() {
        const params = new URLSearchParams();
        if (this.selectedLearnerId) params.append('learner_id', this.selectedLearnerId);
        if (this.currentFilters.class_id) params.append('class_id', this.currentFilters.class_id);
        if (this.currentFilters.subject_id) params.append('subject_id', this.currentFilters.subject_id);
        if (this.currentFilters.assessment_type) params.append('assessment_type', this.currentFilters.assessment_type);
        if (this.currentFilters.search) params.append('search', this.currentFilters.search);

        const res = await API.get('/api/assessments?' + params.toString());
        this.assessments = Array.isArray(res.data) ? res.data : (res.data?.assessments || []);
    },

    /**
     * Render Assessment Catalog & Explorer
     */
    renderCatalogView(container) {
        const role = Auth.getRole();
        const isStaff = ['curriculum_officer', 'administrator', 'teacher'].includes(role);
        const isParent = role === 'parent';
        const activeLearner = this.learners.find(l => l.learner_id == this.selectedLearnerId);

        const maxLevel = activeLearner ? parseInt(activeLearner.class_level || activeLearner.class_code?.replace(/\D/g, '') || 7, 10) : 7;
        const availableClasses = (isParent && activeLearner) 
            ? this.classes.filter(c => (c.level || parseInt(c.class_code?.replace(/\D/g, ''), 10)) <= maxLevel)
            : this.classes;

        let childSelectorHtml = '';
        if (isParent && this.learners.length > 0) {
            childSelectorHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.45rem 0.75rem; margin-bottom:1rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display:flex; align-items:center; gap:0.35rem; overflow-x:auto; padding-bottom:1px;">
                        <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; margin-right:0.25rem; white-space:nowrap;">
                            Child
                        </span>
                        <button class="btn btn-sm" 
                            onclick="AssessmentsApp.selectLearner(null)" 
                            style="border-radius:16px; font-size:0.78rem; padding:0.2rem 0.65rem; font-weight:600; white-space:nowrap; border:1px solid ${this.selectedLearnerId === null ? '#2563eb' : '#e2e8f0'}; background:${this.selectedLearnerId === null ? '#eff6ff' : '#fff'}; color:${this.selectedLearnerId === null ? '#1d4ed8' : '#475569'};">
                            👨‍👩‍👧‍👦 All Classes
                        </button>
                        ${this.learners.map(l => {
                            const isSelected = this.selectedLearnerId == l.learner_id;
                            const avatar = l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name)}&background=f1f5f9&color=334155&rounded=true&bold=true`;
                            return `
                                <button class="btn btn-sm" 
                                    onclick="AssessmentsApp.selectLearner(${l.learner_id})" 
                                    style="display:flex; align-items:center; gap:0.35rem; border-radius:16px; padding:0.2rem 0.65rem; font-size:0.78rem; font-weight:600; white-space:nowrap; transition:all 0.15s ease; border:1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}; background:${isSelected ? '#eff6ff' : '#fff'}; color:${isSelected ? '#1d4ed8' : '#475569'};">
                                    <img src="${App.escapeHtml(avatar)}" style="width:18px; height:18px; border-radius:50%; object-fit:cover;">
                                    <span>${App.escapeHtml(l.full_name)}</span>
                                    <span style="font-size:0.68rem; color:${isSelected ? '#2563eb' : '#94a3b8'}; font-weight:700;">${App.escapeHtml(l.class_code || 'P1')}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div>
                        <a href="#parent-assessments" class="btn btn-secondary btn-sm" style="font-size:0.78rem; padding:0.25rem 0.65rem;" onclick="AssessmentsApp.renderPerformanceView(document.getElementById('app-content'))">
                            📊 Gradebook & Progress
                        </a>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="fade-in" style="max-width:1050px; margin:0 auto; padding:1rem 0.5rem;">
                <!-- Compact Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
                    <div>
                        <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.01em;">
                            ✍️ Primary Curriculum Assessments & Quizzes
                        </h2>
                        <p style="color:var(--text-muted); margin:0.15rem 0 0 0; font-size:0.82rem;">
                            ${activeLearner ? `Filtered to <strong>${App.escapeHtml(activeLearner.full_name)}</strong> (${App.escapeHtml(activeLearner.class_code || 'P1')}) & foundational primary classes below` : 'Uganda National Curriculum Assessments (P1–P7) with automated server scoring and feedback'}
                        </p>
                    </div>
                    <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                        ${isStaff ? `
                            <button class="btn btn-primary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="AssessmentsApp.openAuthorModal()">
                                ➕ Author Assessment
                            </button>
                        ` : ''}
                        ${role === 'parent' || role === 'teacher' ? `
                            <button class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="AssessmentsApp.renderPerformanceView(document.getElementById('app-content'))">
                                📊 Gradebook & Progress
                            </button>
                        ` : ''}
                    </div>
                </div>

                ${childSelectorHtml}

                <!-- Ultra-Compact Filters Bar -->
                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.45rem 0.75rem; margin-bottom:1rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem; align-items:center;">
                        <div>
                            <label style="display:block; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.15rem;">Class</label>
                            <select id="filter-class" class="form-control" style="font-size:0.8rem; padding:0.25rem 0.5rem; height:32px; border-radius:6px; border:1px solid #cbd5e1;" onchange="AssessmentsApp.handleFilterChange()">
                                <option value="">${activeLearner ? `All Allowed (${activeLearner.class_code || 'P1'} & below)` : 'All Classes (P1–P7)'}</option>
                                ${availableClasses.map(c => `
                                    <option value="${c.class_id}" ${this.currentFilters.class_id == c.class_id ? 'selected' : ''}>
                                        ${App.escapeHtml(c.class_name)} (${App.escapeHtml(c.class_code)})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.15rem;">Subject</label>
                            <select id="filter-subject" class="form-control" style="font-size:0.8rem; padding:0.25rem 0.5rem; height:32px; border-radius:6px; border:1px solid #cbd5e1;" onchange="AssessmentsApp.handleFilterChange()">
                                <option value="">All Subjects</option>
                                ${this.subjects.map(s => `
                                    <option value="${s.subject_id}" ${this.currentFilters.subject_id == s.subject_id ? 'selected' : ''}>
                                        ${App.escapeHtml(s.subject_name)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.15rem;">Format</label>
                            <select id="filter-type" class="form-control" style="font-size:0.8rem; padding:0.25rem 0.5rem; height:32px; border-radius:6px; border:1px solid #cbd5e1;" onchange="AssessmentsApp.handleFilterChange()">
                                <option value="">All Formats</option>
                                <option value="multiple_choice" ${this.currentFilters.assessment_type === 'multiple_choice' ? 'selected' : ''}>Multiple Choice (MCQ)</option>
                                <option value="true_false" ${this.currentFilters.assessment_type === 'true_false' ? 'selected' : ''}>True / False</option>
                                <option value="mixed" ${this.currentFilters.assessment_type === 'mixed' ? 'selected' : ''}>Mixed (MCQ + Essay)</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.15rem;">Search</label>
                            <input type="text" id="filter-search" class="form-control" style="font-size:0.8rem; padding:0.25rem 0.5rem; height:32px; border-radius:6px; border:1px solid #cbd5e1;" placeholder="Search topic or title..." value="${App.escapeHtml(this.currentFilters.search)}" oninput="AssessmentsApp.handleSearchInput(event)">
                        </div>
                    </div>
                </div>

                <!-- Assessments Grid -->
                ${this.assessments.length === 0 ? `
                    <div class="card" style="text-align:center; padding:2.5rem 1.5rem; color:var(--text-muted); border:1px solid #e2e8f0; border-radius:8px;">
                        <div style="font-size:2.5rem; margin-bottom:0.5rem;">📝</div>
                        <h3 style="color:var(--text-main); margin-bottom:0.35rem; font-size:1.15rem;">No assessments found</h3>
                        <p style="max-width:450px; margin:0 auto 1rem auto; font-size:0.85rem;">
                            No published assessments match the current class and subject filters. Try resetting the filters or check back soon.
                        </p>
                        <button class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:0.25rem 0.75rem;" onclick="AssessmentsApp.resetFilters()">Reset Filters</button>
                    </div>
                ` : `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:1rem;">
                        ${this.assessments.map(a => this.renderAssessmentCard(a, isStaff, role)).join('')}
                    </div>
                `}
            </div>
        `;
    },

    /**
     * Render Single Assessment Card
     */
    renderAssessmentCard(a, isStaff, role) {
        const typeLabels = {
            'multiple_choice': '🔘 Multiple Choice',
            'true_false': '⚖️ True / False',
            'short_answer': '✍️ Short Answer',
            'essay': '📄 Structured Essay',
            'mixed': '📑 Comprehensive Mixed'
        };
        const typeBadge = typeLabels[a.assessment_type] || a.assessment_type;
        const passPercent = a.total_marks > 0 ? Math.round((a.passing_marks / a.total_marks) * 100) : 50;

        return `
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:4px solid var(--primary); transition:transform 0.2s, box-shadow 0.2s;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; gap:0.5rem;">
                        <span class="badge" style="background:var(--bg-tag); color:var(--primary); font-weight:700;">
                            ${App.escapeHtml(a.class_code || 'P1')} &bull; ${App.escapeHtml(a.subject_name)}
                        </span>
                        <span style="font-size:0.75rem; color:var(--text-muted); background:rgba(0,0,0,0.05); padding:2px 8px; border-radius:10px; font-weight:600;">
                            ${typeBadge}
                        </span>
                    </div>

                    <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin-bottom:0.5rem; line-height:1.35;">
                        ${App.escapeHtml(a.title)}
                    </h3>

                    <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                        ${App.escapeHtml(a.instructions || 'Answer all questions to test knowledge on this topic.')}
                    </p>

                    <!-- Key stats -->
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.5rem; background:rgba(0,0,0,0.02); border-radius:var(--radius-sm); padding:0.6rem; text-align:center; margin-bottom:1.25rem;">
                        <div>
                            <span style="display:block; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Questions</span>
                            <span style="font-weight:700; color:var(--text-main); font-size:0.95rem;">${a.question_count || 0}</span>
                        </div>
                        <div>
                            <span style="display:block; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Time Limit</span>
                            <span style="font-weight:700; color:var(--text-main); font-size:0.95rem;">⏱️ ${a.time_limit_minutes}m</span>
                        </div>
                        <div>
                            <span style="display:block; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Pass Mark</span>
                            <span style="font-weight:700; color:var(--primary); font-size:0.95rem;">${a.passing_marks}/${a.total_marks} (${passPercent}%)</span>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:0.5rem; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:0.85rem; margin-top:0.5rem;">
                    <button class="btn btn-primary btn-sm" style="flex:1;" onclick="AssessmentsApp.startTaking(${a.assessment_id})">
                        🚀 Start Test Now
                    </button>
                    ${isStaff ? `
                        <button class="btn btn-outline btn-sm" onclick="AssessmentsApp.openEditModal(${a.assessment_id})" title="Edit Assessment">
                            ✏️ Edit
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    async selectLearner(learnerId) {
        this.selectedLearnerId = learnerId;
        this.currentFilters.class_id = '';
        await this.loadAssessments();
        const container = document.getElementById('app-content');
        if (container) this.renderCatalogView(container);
    },

    handleFilterChange() {
        this.currentFilters.class_id = document.getElementById('filter-class').value;
        this.currentFilters.subject_id = document.getElementById('filter-subject').value;
        this.currentFilters.assessment_type = document.getElementById('filter-type').value;
        this.loadAssessments().then(() => {
            const container = document.getElementById('app-content');
            if (container) this.renderCatalogView(container);
        });
    },

    handleSearchInput(e) {
        this.currentFilters.search = e.target.value;
        clearTimeout(this._searchDebounce);
        this._searchDebounce = setTimeout(() => {
            this.loadAssessments().then(() => {
                const container = document.getElementById('app-content');
                if (container) this.renderCatalogView(container);
            });
        }, 300);
    },

    resetFilters() {
        this.currentFilters = { class_id: '', subject_id: '', assessment_type: '', search: '' };
        this.loadAssessments().then(() => {
            const container = document.getElementById('app-content');
            if (container) this.renderCatalogView(container);
        });
    },

    /**
     * Start Test-Taking Experience
     */
    async startTaking(assessmentId) {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div style="text-align:center; padding:4rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem; font-weight:600;">Setting up secure assessment session...</p>
            </div>
        `;

        try {
            // 1. Fetch details with questions sanitized (for_attempt=true)
            const detailsRes = await API.get(`/api/assessments/${assessmentId}?for_attempt=true`);
            this.activeAssessment = detailsRes.data.assessment;
            this.questions = detailsRes.data.questions || [];

            if (this.questions.length === 0) {
                alert('This assessment does not contain any published questions.');
                this.init(container);
                return;
            }

            // 2. Resolve Learner ID for attempt
            let learnerId = this.selectedLearnerId;
            if (!learnerId && this.learners.length > 0) {
                learnerId = this.learners[0].learner_id;
            }

            // 3. Generate client attempt UUID for offline/online idempotency
            const attemptKey = `tmhis_attempt_${assessmentId}_${learnerId}`;
            let clientUuid = localStorage.getItem(attemptKey);
            if (!clientUuid) {
                clientUuid = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                localStorage.setItem(attemptKey, clientUuid);
            }

            // 4. Start attempt on backend
            const startRes = await API.post(`/api/assessments/${assessmentId}/attempts`, {
                learner_id: learnerId,
                client_attempt_uuid: clientUuid,
                attempt_mode: navigator.onLine ? 'online' : 'offline'
            });

            this.activeAttempt = startRes.data.attempt;
            this.currentQuestionIndex = 0;
            this.answers = {};

            // Initialize timer
            const limitMins = parseInt(this.activeAssessment.time_limit_minutes || 20, 10);
            this.totalTimeSeconds = limitMins * 60;
            this.timeRemainingSeconds = this.totalTimeSeconds;

            this.renderTakingView(container);
            this.startTimer();
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:3rem auto; max-width:600px; text-align:center;">
                    <h4>Cannot Start Assessment</h4>
                    <p>${App.escapeHtml(err.message || 'An error occurred.')}</p>
                    <button class="btn btn-secondary btn-sm" onclick="AssessmentsApp.init(document.getElementById('app-content'))">Return to Catalog</button>
                </div>
            `;
        }
    },

    /**
     * Live Countdown Timer
     */
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            if (this.timeRemainingSeconds <= 0) {
                clearInterval(this.timerInterval);
                this.autoSubmitTimeOut();
                return;
            }
            this.timeRemainingSeconds--;
            this.updateTimerDisplay();
        }, 1000);
    },

    updateTimerDisplay() {
        const timerEl = document.getElementById('test-timer-display');
        if (!timerEl) return;

        const minutes = Math.floor(this.timeRemainingSeconds / 60);
        const seconds = this.timeRemainingSeconds % 60;
        const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        timerEl.textContent = `⏱️ ${timeFormatted}`;

        // Visual warning
        if (this.timeRemainingSeconds <= 120) {
            timerEl.style.background = '#fef2f2';
            timerEl.style.color = '#dc2626';
            timerEl.style.borderColor = '#fca5a5';
        } else if (this.timeRemainingSeconds <= 300) {
            timerEl.style.background = '#fffbeb';
            timerEl.style.color = '#d97706';
            timerEl.style.borderColor = '#fcd34d';
        }
    },

    /**
     * Render Clean, Focused Test-Taking Interface
     */
    renderTakingView(container) {
        const a = this.activeAssessment;
        const q = this.questions[this.currentQuestionIndex];
        const totalQ = this.questions.length;
        const progressPct = Math.round(((this.currentQuestionIndex + 1) / totalQ) * 100);

        container.innerHTML = `
            <div class="fade-in" style="max-width:850px; margin:0 auto; padding:1.5rem 1rem;">
                <!-- Test Header Bar -->
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem 1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; box-shadow:var(--shadow-sm);">
                    <div>
                        <span class="badge" style="background:var(--bg-tag); color:var(--primary); font-weight:700;">
                            ${App.escapeHtml(a.class_code || 'P1')} &bull; ${App.escapeHtml(a.subject_name)}
                        </span>
                        <h2 style="font-size:1.25rem; font-weight:800; color:var(--text-main); margin:0.35rem 0 0 0;">
                            ${App.escapeHtml(a.title)}
                        </h2>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div id="test-timer-display" style="font-family:monospace; font-size:1.15rem; font-weight:800; padding:0.4rem 0.85rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);">
                            ⏱️ --:--
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="AssessmentsApp.confirmSubmit()">
                            Finish & Submit
                        </button>
                    </div>
                </div>

                <!-- Progress & Navigator Pills -->
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem 1.25rem; margin-bottom:1.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; font-weight:700; color:var(--text-muted); margin-bottom:0.5rem;">
                        <span>Question ${this.currentQuestionIndex + 1} of ${totalQ}</span>
                        <span>${progressPct}% Completed</span>
                    </div>
                    <!-- Progress Bar -->
                    <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden; margin-bottom:1rem;">
                        <div style="width:${progressPct}%; height:100%; background:var(--primary); transition:width 0.3s ease;"></div>
                    </div>
                    <!-- Question Navigator Pills -->
                    <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                        ${this.questions.map((item, idx) => {
                            const isAnswered = this.answers[item.question_id] !== undefined;
                            const isCurrent = idx === this.currentQuestionIndex;
                            let btnStyle = 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;';
                            if (isCurrent) {
                                btnStyle = 'background:var(--primary); color:#ffffff; border:1px solid var(--primary); font-weight:800;';
                            } else if (isAnswered) {
                                btnStyle = 'background:#dcfce7; color:#166534; border:1px solid #86efac; font-weight:700;';
                            }
                            return `
                                <button type="button" style="width:36px; height:36px; border-radius:var(--radius-sm); display:flex; align-items:center; justify-content:center; font-size:0.85rem; cursor:pointer; ${btnStyle}" onclick="AssessmentsApp.goToQuestion(${idx})">
                                    ${idx + 1}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Active Question Card -->
                <div class="card" style="padding:1.75rem; margin-bottom:1.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
                            Question ${this.currentQuestionIndex + 1} (${q.marks} ${q.marks == 1 ? 'Mark' : 'Marks'})
                        </span>
                        <span style="font-size:0.75rem; background:var(--bg-tag); color:var(--primary); padding:2px 8px; border-radius:8px; font-weight:600;">
                            ${q.question_type.replace('_', ' ').toUpperCase()}
                        </span>
                    </div>

                    <!-- Question Prompt -->
                    <div style="font-size:1.15rem; font-weight:700; color:var(--text-main); line-height:1.5; margin-bottom:1.5rem;">
                        ${App.escapeHtml(q.question_text)}
                    </div>

                    <!-- Options / Input field based on question type -->
                    <div id="question-input-container">
                        ${this.renderQuestionInput(q)}
                    </div>
                </div>

                <!-- Navigation Controls -->
                <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                    <button class="btn btn-outline" ${this.currentQuestionIndex === 0 ? 'disabled' : ''} onclick="AssessmentsApp.prevQuestion()">
                        ⬅️ Previous Question
                    </button>
                    <div style="display:flex; gap:0.75rem;">
                        ${this.currentQuestionIndex < totalQ - 1 ? `
                            <button class="btn btn-primary" onclick="AssessmentsApp.nextQuestion()">
                                Next Question ➡️
                            </button>
                        ` : `
                            <button class="btn btn-success" onclick="AssessmentsApp.confirmSubmit()">
                                ✅ Submit Assessment
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        this.updateTimerDisplay();
    },

    /**
     * Render Question Input controls (Radio options for MCQ/TF, Textarea for Essay, Input for Short Answer)
     */
    renderQuestionInput(q) {
        const savedAns = this.answers[q.question_id] || {};

        if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
            const options = q.options || [];
            return `
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    ${options.map(opt => {
                        const isSelected = savedAns.option_id == opt.option_id;
                        return `
                            <label style="display:flex; align-items:center; gap:0.85rem; padding:1rem; border:2px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}; background:${isSelected ? 'rgba(30, 64, 175, 0.05)' : 'var(--bg-main)'}; border-radius:var(--radius-md); cursor:pointer; transition:all 0.15s ease;">
                                <input type="radio" name="q_${q.question_id}" value="${opt.option_id}" ${isSelected ? 'checked' : ''} onchange="AssessmentsApp.recordOptionAnswer(${q.question_id}, ${opt.option_id})" style="width:20px; height:20px; accent-color:var(--primary);">
                                <span style="font-weight:700; color:var(--primary); font-size:1rem; min-width:24px;">${App.escapeHtml(opt.option_label)}.</span>
                                <span style="font-size:1rem; color:var(--text-main); font-weight:${isSelected ? '600' : '400'};">${App.escapeHtml(opt.option_text)}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
            `;
        }

        if (q.question_type === 'short_answer') {
            const val = savedAns.answer_text || '';
            return `
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--text-muted); margin-bottom:0.5rem;">Your Answer:</label>
                    <input type="text" class="form-control" style="font-size:1.05rem; padding:0.75rem 1rem;" placeholder="Type your answer here..." value="${App.escapeHtml(val)}" oninput="AssessmentsApp.recordTextAnswer(${q.question_id}, this.value)">
                </div>
            `;
        }

        if (q.question_type === 'essay' || q.question_type === 'matching') {
            const val = savedAns.answer_text || '';
            return `
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--text-muted); margin-bottom:0.5rem;">Your Written Response (Steps & Explanation):</label>
                    <textarea class="form-control" rows="6" style="font-size:1rem; line-height:1.5; padding:0.75rem 1rem;" placeholder="Write out your working, steps, and explanation..." oninput="AssessmentsApp.recordTextAnswer(${q.question_id}, this.value)">${App.escapeHtml(val)}</textarea>
                </div>
            `;
        }

        return `<p style="color:var(--text-muted);">Unsupported question type.</p>`;
    },

    recordOptionAnswer(questionId, optionId) {
        this.answers[questionId] = {
            question_id: questionId,
            option_id: optionId,
            answer_text: null
        };
        // Re-render taking view to update navigator pills and option selection style
        this.renderTakingView(document.getElementById('app-content'));
    },

    recordTextAnswer(questionId, text) {
        if (text.trim() === '') {
            delete this.answers[questionId];
        } else {
            this.answers[questionId] = {
                question_id: questionId,
                option_id: null,
                answer_text: text.trim()
            };
        }
    },

    goToQuestion(idx) {
        if (idx >= 0 && idx < this.questions.length) {
            this.currentQuestionIndex = idx;
            this.renderTakingView(document.getElementById('app-content'));
        }
    },

    nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            this.renderTakingView(document.getElementById('app-content'));
        }
    },

    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.renderTakingView(document.getElementById('app-content'));
        }
    },

    confirmSubmit() {
        const totalQ = this.questions.length;
        const answeredQ = Object.keys(this.answers).length;
        const unansweredQ = totalQ - answeredQ;

        let msg = `Are you ready to submit your assessment?`;
        if (unansweredQ > 0) {
            msg += `\n\nNotice: You still have ${unansweredQ} unanswered question(s).`;
        }

        if (confirm(msg)) {
            this.submitAssessment();
        }
    },

    autoSubmitTimeOut() {
        alert('⏱️ Time has expired! Your assessment answers will now be automatically submitted for server-side scoring.');
        this.submitAssessment();
    },

    /**
     * Submit Assessment for Server-Side Scoring
     */
    async submitAssessment() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div style="text-align:center; padding:4rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <h3 style="margin-top:1.25rem; color:var(--text-main);">Evaluating Answers on Server...</h3>
                <p>Computing objective question scores and generating your detailed scorecard.</p>
            </div>
        `;

        try {
            const attemptId = this.activeAttempt.attempt_id;
            const answersArray = Object.values(this.answers);

            const submitRes = await API.post(`/api/attempts/${attemptId}/submit`, {
                answers: answersArray,
                taken_offline: !navigator.onLine
            });

            // Clear stored local storage attempt key on successful submission
            const learnerId = this.activeAttempt.learner_id;
            const assessmentId = this.activeAssessment.assessment_id;
            localStorage.removeItem(`tmhis_attempt_${assessmentId}_${learnerId}`);

            await this.renderScorecard(attemptId);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:3rem auto; max-width:600px;">
                    <h4>Submission Error</h4>
                    <p>${App.escapeHtml(err.message || 'Failed to submit assessment answers.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="AssessmentsApp.submitAssessment()">Retry Submission</button>
                </div>
            `;
        }
    },

    /**
     * Render Complete Scorecard & Question-by-Question Review
     */
    async renderScorecard(attemptId) {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div style="text-align:center; padding:4rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Scorecard & Feedback...</p>
            </div>
        `;

        try {
            const res = await API.get(`/api/attempts/${attemptId}/result`);
            const result = res.data.result;
            const answers = res.data.answers || [];

            const isPassed = (result.score >= result.passing_marks);
            const pct = parseFloat(result.percentage || 0);

            let scoreColor = isPassed ? '#166534' : '#b91c1c';
            let scoreBg = isPassed ? '#dcfce7' : '#fee2e2';
            let statusBanner = isPassed ? '🎉 Passed! Well Done!' : '📚 Needs Practice';

            container.innerHTML = `
                <div class="fade-in" style="max-width:900px; margin:0 auto; padding:1.5rem 1rem;">
                    <!-- Scorecard Hero Banner -->
                    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:2rem; margin-bottom:2rem; text-align:center; box-shadow:var(--shadow-md);">
                        <span class="badge" style="background:var(--bg-tag); color:var(--primary); font-weight:700; margin-bottom:0.75rem;">
                            ${App.escapeHtml(result.class_code || 'P1')} &bull; ${App.escapeHtml(result.subject_name)}
                        </span>
                        
                        <h2 style="font-size:1.85rem; font-weight:800; color:var(--text-main); margin:0.35rem 0 1.25rem 0;">
                            ${App.escapeHtml(result.assessment_title)}
                        </h2>

                        <div style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; width:140px; height:140px; border-radius:50%; background:${scoreBg}; border:4px solid ${scoreColor}; margin-bottom:1rem;">
                            <span style="font-size:2.25rem; font-weight:900; color:${scoreColor}; line-height:1;">
                                ${pct}%
                            </span>
                            <span style="font-size:0.85rem; font-weight:700; color:${scoreColor}; margin-top:4px;">
                                ${result.score} / ${result.total_marks} Marks
                            </span>
                        </div>

                        <div style="font-size:1.25rem; font-weight:800; color:${scoreColor}; margin-bottom:0.5rem;">
                            ${statusBanner}
                        </div>

                        <p style="font-size:0.95rem; color:var(--text-muted); max-width:600px; margin:0 auto 1.5rem auto; line-height:1.5;">
                            ${App.escapeHtml(result.feedback || 'Assessment completed successfully.')}
                        </p>

                        <!-- Key Details -->
                        <div style="display:flex; justify-content:center; gap:2rem; flex-wrap:wrap; border-top:1px solid var(--border-color); padding-top:1.25rem; font-size:0.85rem; color:var(--text-muted);">
                            <div><strong>Learner:</strong> ${App.escapeHtml(result.learner_name)}</div>
                            <div><strong>Passing Mark:</strong> ${result.passing_marks} / ${result.total_marks}</div>
                            <div><strong>Scoring Engine:</strong> ${result.scoring_mode === 'automatic' ? '🤖 Automated Server Scoring' : '👨‍🏫 Teacher/Parent Reviewed'}</div>
                            <div><strong>Date:</strong> ${result.date_taken ? result.date_taken.substring(0, 16) : 'Just now'}</div>
                        </div>
                    </div>

                    <!-- Action Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                        <h3 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">
                            📝 Question-by-Question Review
                        </h3>
                        <div style="display:flex; gap:0.75rem;">
                            <button class="btn btn-outline btn-sm" onclick="window.print()">
                                🖨️ Print Scorecard
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="AssessmentsApp.init(document.getElementById('app-content'))">
                                🏠 Back to Assessments
                            </button>
                        </div>
                    </div>

                    <!-- Questions Breakdown -->
                    <div style="display:flex; flex-direction:column; gap:1.25rem; margin-bottom:2rem;">
                        ${answers.map((a, idx) => this.renderAnswerReviewCard(a, idx + 1)).join('')}
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:3rem auto; max-width:600px;">
                    <h4>Failed to Load Scorecard</h4>
                    <p>${App.escapeHtml(err.message || 'Result could not be retrieved.')}</p>
                    <button class="btn btn-secondary btn-sm" onclick="AssessmentsApp.init(document.getElementById('app-content'))">Return to Assessments</button>
                </div>
            `;
        }
    },

    /**
     * Render Individual Question Review Card with Answers & Explanation
     */
    renderAnswerReviewCard(a, qNum) {
        const isCorrect = a.is_correct === 1;
        const isPending = a.is_correct === null;
        
        let borderCol = isCorrect ? '#22c55e' : (isPending ? '#eab308' : '#ef4444');
        let badgeBg = isCorrect ? '#dcfce7' : (isPending ? '#fef9c3' : '#fee2e2');
        let badgeText = isCorrect ? '#166534' : (isPending ? '#854d0e' : '#991b1b');
        let badgeLabel = isCorrect ? '✔ Correct' : (isPending ? '⏳ Pending Teacher Review' : '✖ Incorrect');

        let answerContent = '';
        if (a.question_type === 'multiple_choice' || a.question_type === 'true_false') {
            const selectedText = a.selected_option_text ? `${a.selected_option_label}. ${a.selected_option_text}` : 'No option selected';
            const options = a.options || [];
            const correctOpt = options.find(o => o.is_correct == 1);

            answerContent = `
                <div style="margin-bottom:0.75rem;">
                    <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Your Selected Answer:</span>
                    <div style="font-size:0.95rem; font-weight:600; color:${isCorrect ? '#166534' : '#b91c1c'}; margin-top:0.25rem;">
                        ${App.escapeHtml(selectedText)}
                    </div>
                </div>
                ${!isCorrect && correctOpt ? `
                    <div style="margin-bottom:0.75rem;">
                        <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Correct Answer:</span>
                        <div style="font-size:0.95rem; font-weight:600; color:#166534; margin-top:0.25rem;">
                            ✔ ${App.escapeHtml(correctOpt.option_label)}. ${App.escapeHtml(correctOpt.option_text)}
                        </div>
                    </div>
                ` : ''}
            `;
        } else {
            answerContent = `
                <div style="margin-bottom:0.75rem;">
                    <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Your Response:</span>
                    <div style="font-size:0.95rem; background:rgba(0,0,0,0.03); padding:0.6rem 0.85rem; border-radius:var(--radius-sm); margin-top:0.25rem; white-space:pre-wrap;">
                        ${App.escapeHtml(a.answer_text || 'No answer submitted')}
                    </div>
                </div>
                ${a.correct_text ? `
                    <div style="margin-bottom:0.75rem;">
                        <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Expected Answer / Key Terms:</span>
                        <div style="font-size:0.95rem; font-weight:600; color:#166534; margin-top:0.25rem;">
                            ✔ ${App.escapeHtml(a.correct_text)}
                        </div>
                    </div>
                ` : ''}
            `;
        }

        return `
            <div class="card" style="border-left:4px solid ${borderCol}; padding:1.25rem 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                    <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">
                        Question ${qNum} (${a.marks_awarded || 0} / ${a.max_marks} Marks)
                    </span>
                    <span style="background:${badgeBg}; color:${badgeText}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                        ${badgeLabel}
                    </span>
                </div>

                <div style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin-bottom:1rem; line-height:1.4;">
                    ${App.escapeHtml(a.question_text)}
                </div>

                ${answerContent}

                ${a.explanation ? `
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-sm); padding:0.75rem 1rem; margin-top:0.75rem; font-size:0.875rem; color:#166534;">
                        <strong>💡 Pedagogical Explanation:</strong> ${App.escapeHtml(a.explanation)}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Switch selected child for assessment performance dashboard
     */
    selectPerformanceChild(learnerId) {
        this.selectedLearnerId = learnerId;
        const container = document.getElementById('app-content');
        if (container) {
            this.renderPerformanceView(container);
        }
    },

    /**
     * Render Parent & Teacher Performance & Grading Dashboard
     */
    async renderPerformanceView(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:0.75rem; font-size:0.85rem;">Loading Assessment Analytics & Gradebook...</p>
            </div>
        `;

        try {
            const role = Auth.getRole();
            const isParent = role === 'parent';

            // Ensure learners list is loaded for parent
            if (isParent && (!this.learners || this.learners.length === 0)) {
                try {
                    const lRes = await API.get('/api/parent/learners');
                    this.learners = Array.isArray(lRes.data) ? lRes.data : (lRes.data?.learners || []);
                    if (this.learners.length > 0 && !this.selectedLearnerId) {
                        this.selectedLearnerId = this.learners[0].learner_id;
                    }
                } catch (e) {
                    this.learners = [];
                }
            }

            const params = new URLSearchParams();
            if (this.selectedLearnerId) params.append('learner_id', this.selectedLearnerId);

            const res = await API.get('/api/parent/assessments/results?' + params.toString());
            const results = res.data.results || [];
            const metrics = res.data.metrics || {};

            const activeLearner = this.learners.find(l => l.learner_id == this.selectedLearnerId);

            container.innerHTML = `
                <div class="fade-in" style="max-width:980px; margin:0 auto; padding:1rem 0.5rem;">
                    <!-- Compact Top Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
                        <div>
                            <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0; letter-spacing:-0.01em;">
                                📊 Assessment Gradebook & Progress
                            </h2>
                            <p style="color:var(--text-muted); margin:0.15rem 0 0 0; font-size:0.82rem;">
                                ${activeLearner ? `Tracking performance and quiz results for <strong>${App.escapeHtml(activeLearner.full_name)}</strong> (${App.escapeHtml(activeLearner.class_code || 'P1')})` : 'Comprehensive overview of quiz attempts, auto-scoring, and teacher reviews'}
                            </p>
                        </div>
                        <div style="display:flex; gap:0.45rem;">
                            <button class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="AssessmentsApp.init(document.getElementById('app-content'))">
                                ✍️ Browse Assessments
                            </button>
                            <a href="#parent-guides" class="btn btn-outline btn-sm" style="font-size:0.8rem; padding:0.35rem 0.75rem;">
                                📖 Guides & Timetables
                            </a>
                        </div>
                    </div>

                    <!-- Child Selector Bar with Avatars (Compact & Narrow) -->
                    ${isParent && this.learners.length > 0 ? `
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.45rem 0.75rem; margin-bottom:1rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                            <div style="display:flex; align-items:center; gap:0.35rem; overflow-x:auto; padding-bottom:1px;">
                                <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; margin-right:0.25rem; white-space:nowrap;">
                                    Child
                                </span>
                                <button class="btn btn-sm" 
                                    onclick="AssessmentsApp.selectPerformanceChild(null)" 
                                    style="border-radius:16px; font-size:0.78rem; padding:0.2rem 0.65rem; font-weight:600; white-space:nowrap; border:1px solid ${this.selectedLearnerId === null ? '#2563eb' : '#e2e8f0'}; background:${this.selectedLearnerId === null ? '#eff6ff' : '#fff'}; color:${this.selectedLearnerId === null ? '#1d4ed8' : '#475569'};">
                                    👨‍👩‍👧‍👦 All Children
                                </button>
                                ${this.learners.map(l => {
                                    const isSelected = this.selectedLearnerId == l.learner_id;
                                    const avatar = l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name)}&background=f1f5f9&color=334155&rounded=true&bold=true`;
                                    return `
                                        <button class="btn btn-sm" 
                                            onclick="AssessmentsApp.selectPerformanceChild(${l.learner_id})" 
                                            style="display:flex; align-items:center; gap:0.35rem; border-radius:16px; padding:0.2rem 0.65rem; font-size:0.78rem; font-weight:600; white-space:nowrap; transition:all 0.15s ease; border:1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}; background:${isSelected ? '#eff6ff' : '#fff'}; color:${isSelected ? '#1d4ed8' : '#475569'};">
                                            <img src="${App.escapeHtml(avatar)}" style="width:18px; height:18px; border-radius:50%; object-fit:cover;">
                                            <span>${App.escapeHtml(l.full_name)}</span>
                                            <span style="font-size:0.68rem; color:${isSelected ? '#2563eb' : '#94a3b8'}; font-weight:700;">${App.escapeHtml(l.class_code || 'P1')}</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; font-weight:600;">
                                ${activeLearner ? `${App.escapeHtml(activeLearner.full_name)} &bull; ${App.escapeHtml(activeLearner.class_name || 'Primary')}` : 'All Registered Learners'}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Compact Metrics Strip -->
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.6rem; margin-bottom:1rem;">
                        <div class="card" style="padding:0.65rem 0.75rem; text-align:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
                            <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Attempts</span>
                            <div style="font-size:1.35rem; font-weight:800; color:#0f172a; margin-top:0.15rem; line-height:1.2;">
                                ${metrics.total_attempts || 0}
                            </div>
                        </div>
                        <div class="card" style="padding:0.65rem 0.75rem; text-align:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
                            <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Average</span>
                            <div style="font-size:1.35rem; font-weight:800; color:#2563eb; margin-top:0.15rem; line-height:1.2;">
                                ${metrics.average_percentage || 0}%
                            </div>
                        </div>
                        <div class="card" style="padding:0.65rem 0.75rem; text-align:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
                            <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Pass Rate</span>
                            <div style="font-size:1.35rem; font-weight:800; color:#16a34a; margin-top:0.15rem; line-height:1.2;">
                                ${metrics.pass_rate || 0}%
                            </div>
                        </div>
                        <div class="card" style="padding:0.65rem 0.75rem; text-align:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px;">
                            <span style="font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase;">Passed</span>
                            <div style="font-size:1.35rem; font-weight:800; color:#16a34a; margin-top:0.15rem; line-height:1.2;">
                                ${metrics.passed_count || 0} / ${metrics.total_attempts || 0}
                            </div>
                        </div>
                    </div>

                    <!-- Results Table (Narrow, Space-Saving) -->
                    <div class="card" style="padding:0; overflow:hidden; border:1px solid #e2e8f0; border-radius:8px; background:#fff;">
                        <div style="padding:0.65rem 0.85rem; border-bottom:1px solid #e2e8f0; font-size:0.85rem; font-weight:700; color:#0f172a; display:flex; justify-content:space-between; align-items:center;">
                            <span>Recent Assessment Results</span>
                            <span style="font-size:0.75rem; font-weight:600; color:#64748b;">${results.length} record${results.length === 1 ? '' : 's'}</span>
                        </div>
                        ${results.length === 0 ? `
                            <div style="text-align:center; padding:2.5rem 1rem; color:#64748b;">
                                <div style="font-size:2rem; margin-bottom:0.4rem;">📝</div>
                                <p style="margin:0 0 0.75rem 0; font-size:0.88rem;">No completed assessments for this child yet.</p>
                                <button class="btn btn-primary btn-sm" style="font-size:0.8rem; padding:0.35rem 0.85rem;" onclick="AssessmentsApp.init(document.getElementById('app-content'))">
                                    Start an Assessment
                                </button>
                            </div>
                        ` : `
                            <div style="overflow-x:auto;">
                                <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.82rem;">
                                    <thead>
                                        <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#64748b;">
                                            <th style="padding:0.55rem 0.75rem;">Learner</th>
                                            <th style="padding:0.55rem 0.75rem;">Assessment Title</th>
                                            <th style="padding:0.55rem 0.75rem;">Subject</th>
                                            <th style="padding:0.55rem 0.75rem;">Score</th>
                                            <th style="padding:0.55rem 0.75rem;">Result</th>
                                            <th style="padding:0.55rem 0.75rem;">Status</th>
                                            <th style="padding:0.55rem 0.75rem;">Date</th>
                                            <th style="padding:0.55rem 0.75rem; text-align:right;">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${results.map(r => {
                                            const isPassed = (r.score >= r.passing_marks);
                                            return `
                                                <tr style="border-bottom:1px solid #f1f5f9;">
                                                    <td style="padding:0.55rem 0.75rem; font-weight:600; color:#0f172a; white-space:nowrap;">
                                                        ${App.escapeHtml(r.learner_name)}
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; font-weight:600; color:#1e293b;">
                                                        ${App.escapeHtml(r.assessment_title)}
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; white-space:nowrap;">
                                                        <span style="background:#eff6ff; color:#1d4ed8; font-size:0.72rem; font-weight:700; padding:2px 6px; border-radius:4px;">
                                                            ${App.escapeHtml(r.subject_name)}
                                                        </span>
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; font-weight:700; color:#0f172a; white-space:nowrap;">
                                                        ${r.score} / ${r.total_marks}
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; font-weight:700; color:${isPassed ? '#16a34a' : '#dc2626'}; white-space:nowrap;">
                                                        ${r.percentage}%
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; white-space:nowrap;">
                                                        <span style="background:${isPassed ? '#dcfce7' : '#fee2e2'}; color:${isPassed ? '#166534' : '#991b1b'}; font-size:0.72rem; font-weight:700; padding:2px 6px; border-radius:4px;">
                                                            ${isPassed ? 'Passed' : 'Needs Work'}
                                                        </span>
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; color:#64748b; font-size:0.75rem; white-space:nowrap;">
                                                        ${r.date_taken ? r.date_taken.substring(0, 10) : ''}
                                                    </td>
                                                    <td style="padding:0.55rem 0.75rem; text-align:right; white-space:nowrap;">
                                                        <button class="btn btn-outline btn-sm" style="font-size:0.75rem; padding:0.2rem 0.55rem;" onclick="AssessmentsApp.renderScorecard(${r.attempt_id})">
                                                            Scorecard
                                                        </button>
                                                        ${role === 'teacher' || role === 'parent' ? `
                                                            <button class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:0.2rem 0.55rem; margin-left:0.25rem;" onclick="AssessmentsApp.openManualGradingModal(${r.result_id}, ${r.attempt_id})">
                                                                Grade
                                                            </button>
                                                        ` : ''}
                                                    </td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load performance analytics</h4>
                    <p>${App.escapeHtml(err.message || 'Error occurred')}</p>
                </div>
            `;
        }
    },

    /**
     * Manual Essay Grading Modal
     */
    async openManualGradingModal(resultId, attemptId) {
        try {
            const res = await API.get(`/api/attempts/${attemptId}/result`);
            const result = res.data.result;
            const answers = res.data.answers || [];

            const modalHtml = `
                <div id="grading-modal-backdrop" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                    <div class="card" style="background:var(--bg-card); max-width:700px; width:100%; max-height:90vh; overflow-y:auto; padding:1.75rem; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                            <h3 style="margin:0; font-size:1.35rem; color:var(--text-main);">📝 Teacher / Parent Essay Grading</h3>
                            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('grading-modal-backdrop').remove()">✕ Close</button>
                        </div>

                        <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1.25rem;">
                            Grading submission for <strong>${App.escapeHtml(result.learner_name)}</strong> on <em>${App.escapeHtml(result.assessment_title)}</em>
                        </p>

                        <form id="manual-grading-form" onsubmit="AssessmentsApp.submitManualGrade(event, ${resultId})">
                            <div style="display:flex; flex-direction:column; gap:1.25rem; margin-bottom:1.5rem;">
                                ${answers.map(ans => `
                                    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:1rem;">
                                        <div style="font-weight:700; color:var(--text-main); font-size:0.95rem; margin-bottom:0.5rem;">
                                            ${App.escapeHtml(ans.question_text)}
                                        </div>
                                        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.75rem; white-space:pre-wrap; background:rgba(0,0,0,0.03); padding:0.5rem 0.75rem; border-radius:4px;">
                                            ${App.escapeHtml(ans.answer_text || ans.selected_option_text || 'No response')}
                                        </div>
                                        <div style="display:flex; align-items:center; gap:0.75rem;">
                                            <label style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Marks Awarded (Max ${ans.max_marks}):</label>
                                            <input type="number" step="0.5" min="0" max="${ans.max_marks}" name="marks_${ans.answer_id}" data-answer-id="${ans.answer_id}" value="${ans.marks_awarded || 0}" class="form-control" style="width:100px; font-weight:700;">
                                        </div>
                                    </div>
                                `).join('')}
                            </div>

                            <div style="margin-bottom:1.5rem;">
                                <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Qualitative Feedback / Remarks:</label>
                                <textarea id="grading-feedback" class="form-control" rows="3" placeholder="Provide encouraging pedagogical feedback for the learner...">${App.escapeHtml(result.feedback || '')}</textarea>
                            </div>

                            <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
                                <button type="button" class="btn btn-outline" onclick="document.getElementById('grading-modal-backdrop').remove()">Cancel</button>
                                <button type="submit" class="btn btn-primary">💾 Save Grades & Recalculate</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        } catch (e) {
            alert('Failed to load grading details: ' + e.message);
        }
    },

    async submitManualGrade(event, resultId) {
        event.preventDefault();
        const form = document.getElementById('manual-grading-form');
        const inputs = form.querySelectorAll('input[data-answer-id]');
        const gradedAnswers = [];

        inputs.forEach(input => {
            gradedAnswers.push({
                answer_id: parseInt(input.dataset.answerId, 10),
                marks_awarded: parseFloat(input.value || 0)
            });
        });

        const feedback = document.getElementById('grading-feedback').value;

        try {
            await API.post(`/api/results/${resultId}/manual-score`, {
                answers: gradedAnswers,
                feedback: feedback
            });

            document.getElementById('grading-modal-backdrop')?.remove();
            alert('Grades and feedback saved successfully.');
            this.renderPerformanceView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to save manual grades: ' + err.message);
        }
    },

    /**
     * Authoring Modal for Curriculum Officers
     */
    openAuthorModal() {
        const modalHtml = `
            <div id="author-modal-backdrop" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem;">
                <div class="card" style="background:var(--bg-card); max-width:800px; width:100%; max-height:90vh; overflow-y:auto; padding:1.75rem; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                        <h3 style="margin:0; font-size:1.35rem; color:var(--text-main);">➕ Author Curriculum Assessment</h3>
                        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('author-modal-backdrop').remove()">✕ Close</button>
                    </div>

                    <form id="author-assessment-form" onsubmit="AssessmentsApp.submitAuthorAssessment(event)">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Primary Class *</label>
                                <select id="author-class" class="form-control" required>
                                    ${this.classes.map(c => `<option value="${c.class_id}">${App.escapeHtml(c.class_name)} (${App.escapeHtml(c.class_code)})</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Subject *</label>
                                <select id="author-subject" class="form-control" required>
                                    ${this.subjects.map(s => `<option value="${s.subject_id}">${App.escapeHtml(s.subject_name)}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Assessment Title *</label>
                            <input type="text" id="author-title" class="form-control" required placeholder="e.g. Primary 6 Science: Skeletal System Checkpoint Quiz">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Format</label>
                                <select id="author-type" class="form-control">
                                    <option value="multiple_choice">Multiple Choice</option>
                                    <option value="true_false">True / False</option>
                                    <option value="short_answer">Short Answer</option>
                                    <option value="essay">Essay</option>
                                    <option value="mixed" selected>Mixed</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Total Marks *</label>
                                <input type="number" id="author-total" class="form-control" value="20" required min="1">
                            </div>
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Pass Mark *</label>
                                <input type="number" id="author-pass" class="form-control" value="10" required min="1">
                            </div>
                            <div>
                                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Time Limit (mins) *</label>
                                <input type="number" id="author-limit" class="form-control" value="20" required min="1">
                            </div>
                        </div>

                        <div style="margin-bottom:1.5rem;">
                            <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.35rem;">Instructions</label>
                            <textarea id="author-instructions" class="form-control" rows="2" placeholder="Instructions for the learner..."></textarea>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
                            <button type="button" class="btn btn-outline" onclick="document.getElementById('author-modal-backdrop').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary">💾 Create Assessment Draft</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    async submitAuthorAssessment(e) {
        e.preventDefault();
        try {
            const payload = {
                class_id: parseInt(document.getElementById('author-class').value, 10),
                subject_id: parseInt(document.getElementById('author-subject').value, 10),
                title: document.getElementById('author-title').value.trim(),
                assessment_type: document.getElementById('author-type').value,
                total_marks: parseFloat(document.getElementById('author-total').value),
                passing_marks: parseFloat(document.getElementById('author-pass').value),
                time_limit_minutes: parseInt(document.getElementById('author-limit').value, 10),
                instructions: document.getElementById('author-instructions').value.trim()
            };

            const res = await API.post('/api/officer/assessments', payload);
            document.getElementById('author-modal-backdrop')?.remove();
            alert('Assessment draft created successfully.');
            this.init(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to create assessment: ' + err.message);
        }
    }
};

window.AssessmentsApp = AssessmentsApp;
