/**
 * TMHIS Module 05: Academic Schedule & Syllabus Pacing Planner
 * Human-crafted, clean, SaaS-grade UI for Ugandan Primary Curriculum
 */

const ScheduleApp = {
    learners: [],
    selectedLearnerId: null,
    terms: [],
    selectedTermId: null,
    currentViewMode: 'term', // 'term' | 'month' | 'week'
    
    // Weekly state
    currentWeekOffset: 0,
    
    // Monthly state
    currentMonth: new Date().getMonth(), // 0-11
    currentYear: new Date().getFullYear(),
    
    // Term Roadmap state
    termRoadmap: null,
    
    // Data cache
    schedules: [],
    termSummary: null,
    suggestions: [],
    isLoading: false,

    async init(container, initialMode = null) {
        if (initialMode) {
            this.currentViewMode = initialMode;
        }

        container.innerHTML = `
            <div style="text-align:center; padding:4rem 1rem; color:var(--text-muted, #64748b);">
                <div class="spinner"></div>
                <p style="margin-top:1rem; font-size:0.9rem; font-weight:500;">Loading academic planner...</p>
            </div>
        `;

        try {
            const [learnersRes, termsRes] = await Promise.all([
                API.get('/api/parent/learners'),
                API.get('/api/parent/terms')
            ]);

            this.learners = Array.isArray(learnersRes.data) ? learnersRes.data : (learnersRes.data?.learners || []);
            this.terms = Array.isArray(termsRes.data) ? termsRes.data : [];

            if (this.learners.length > 0 && !this.selectedLearnerId) {
                this.selectedLearnerId = this.learners[0].learner_id;
            }

            const activeTerm = this.terms.find(t => t.is_current) || this.terms[0];
            if (activeTerm && !this.selectedTermId) {
                this.selectedTermId = activeTerm.term_id;
            }

            await this.refreshData();
            this.renderView(container);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:550px; border-radius:10px;">
                    <h4 style="font-size:1rem; margin-bottom:0.35rem;">Unable to load schedule data</h4>
                    <p style="font-size:0.85rem; margin-bottom:0.75rem;">${App.escapeHtml(err.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ScheduleApp.init(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    getWeekDates(offsetWeeks = 0) {
        const today = new Date();
        const currentDay = today.getDay(); // 0 = Sun, 1 = Mon ...
        const distanceToMon = currentDay === 0 ? -6 : 1 - currentDay;

        const monday = new Date(today);
        monday.setDate(today.getDate() + distanceToMon + (offsetWeeks * 7));

        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            weekDays.push({
                date: dateStr,
                dayName: dayNames[i],
                displayDate: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                isToday: dateStr === today.toISOString().split('T')[0]
            });
        }
        return weekDays;
    },

    async refreshData() {
        if (!this.selectedLearnerId) return;
        this.isLoading = true;

        try {
            if (this.currentViewMode === 'week') {
                const week = this.getWeekDates(this.currentWeekOffset);
                const startDate = week[0].date;
                const endDate = week[6].date;

                const [schedRes, summaryRes, suggestRes] = await Promise.all([
                    API.get(`/api/parent/schedule?learner_id=${this.selectedLearnerId}&start_date=${startDate}&end_date=${endDate}`),
                    API.get(`/api/parent/schedule/term-summary?learner_id=${this.selectedLearnerId}&term_id=${this.selectedTermId || ''}`),
                    API.get(`/api/parent/schedule/suggested-next?learner_id=${this.selectedLearnerId}`)
                ]);

                this.schedules = Array.isArray(schedRes.data) ? schedRes.data : [];
                this.termSummary = summaryRes.data || null;
                this.suggestions = suggestRes.data?.suggestions || [];
            } else if (this.currentViewMode === 'month') {
                const firstDay = new Date(this.currentYear, this.currentMonth, 1);
                const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
                const startDate = firstDay.toISOString().split('T')[0];
                const endDate = lastDay.toISOString().split('T')[0];

                const [schedRes, summaryRes] = await Promise.all([
                    API.get(`/api/parent/schedule?learner_id=${this.selectedLearnerId}&start_date=${startDate}&end_date=${endDate}`),
                    API.get(`/api/parent/schedule/term-summary?learner_id=${this.selectedLearnerId}&term_id=${this.selectedTermId || ''}`)
                ]);

                this.schedules = Array.isArray(schedRes.data) ? schedRes.data : [];
                this.termSummary = summaryRes.data || null;
            } else if (this.currentViewMode === 'term') {
                const [roadmapRes, summaryRes] = await Promise.all([
                    API.get(`/api/parent/schedule/term-roadmap?learner_id=${this.selectedLearnerId}&term_id=${this.selectedTermId || ''}`),
                    API.get(`/api/parent/schedule/term-summary?learner_id=${this.selectedLearnerId}&term_id=${this.selectedTermId || ''}`)
                ]);

                this.termRoadmap = roadmapRes.data || null;
                this.termSummary = summaryRes.data || null;
            }
        } catch (e) {
            console.error('[ScheduleApp] refreshData error:', e);
        } finally {
            this.isLoading = false;
        }
    },

    async switchViewMode(mode) {
        this.currentViewMode = mode;
        const container = document.getElementById('app-content');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--text-muted, #64748b);">
                    <div class="spinner"></div>
                    <p style="margin-top:0.75rem; font-size:0.85rem;">Updating planner...</p>
                </div>
            `;
        }
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    renderView(container) {
        if (!container) return;

        if (this.learners.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align:center; padding:3.5rem 1.5rem; background:#fff; border:1px solid #e2e8f0; border-radius:14px; margin:2rem auto; max-width:520px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                    <div style="width:48px; height:48px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; margin:0 auto 1rem; color:#64748b; font-size:1.4rem;">
                        👤
                    </div>
                    <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:0.4rem; color:#0f172a;">No Learners Registered</h3>
                    <p style="color:#64748b; font-size:0.88rem; margin-bottom:1.5rem; line-height:1.5;">
                        Register your child in the learners portal to customize academic roadmaps and timetable schedules.
                    </p>
                    <a href="#parent-learners" class="btn btn-primary" style="padding:0.45rem 1.25rem; font-size:0.88rem;">Register Child</a>
                </div>
            `;
            return;
        }

        const currentLearner = this.learners.find(l => l.learner_id == this.selectedLearnerId) || this.learners[0];

        container.innerHTML = `
            <!-- Top App Header -->
            <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:700; color:#0f172a; margin:0 0 0.25rem 0; letter-spacing:-0.015em;">
                        Academic Schedule & Syllabus Pacing
                    </h1>
                    <p style="color:#64748b; margin:0; font-size:0.88rem;">
                        Plan and monitor daily home learning sessions against the Ugandan NCDC curriculum.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <a href="#parent-guides" class="btn btn-secondary btn-sm" style="font-weight:600; font-size:0.82rem; padding:0.4rem 0.85rem; border-color:#e2e8f0; color:#475569;">
                        Parental Guides
                    </a>
                    <button class="btn btn-primary btn-sm" style="font-weight:600; font-size:0.82rem; padding:0.4rem 0.95rem; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onclick="ScheduleApp.openScheduleModal()">
                        + Add Session
                    </button>
                </div>
            </div>

            <!-- Controls Toolbar: Learner Switcher + Segmented View Mode -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; background:#fff; padding:0.6rem 0.85rem; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                
                <!-- Learner Selector Chips -->
                <div style="display:flex; gap:0.35rem; overflow-x:auto; padding-bottom:1px; align-items:center;">
                    <span style="font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; margin-right:0.35rem;">Learner</span>
                    ${this.learners.map(l => {
                        const isSelected = l.learner_id == this.selectedLearnerId;
                        const avatar = l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name)}&background=f1f5f9&color=334155&rounded=true&bold=true`;
                        return `
                            <button class="btn btn-sm" 
                                onclick="ScheduleApp.selectLearner(${l.learner_id})" 
                                style="display:flex; align-items:center; gap:0.4rem; border-radius:20px; padding:0.25rem 0.75rem; font-size:0.82rem; font-weight:600; transition:all 0.15s ease; border:1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}; background:${isSelected ? '#eff6ff' : '#fff'}; color:${isSelected ? '#1d4ed8' : '#475569'};">
                                <img src="${App.escapeHtml(avatar)}" style="width:18px; height:18px; border-radius:50%; object-fit:cover;">
                                <span>${App.escapeHtml(l.full_name)}</span>
                                <span style="font-size:0.7rem; color:${isSelected ? '#2563eb' : '#94a3b8'}; font-weight:700;">${l.class_code || 'P' + l.class_id}</span>
                            </button>
                        `;
                    }).join('')}
                </div>

                <!-- Segmented Tabs (Termly, Monthly, Weekly) -->
                <div style="display:inline-flex; background:#f1f5f9; padding:3px; border-radius:8px; border:1px solid #e2e8f0;">
                    <button class="btn btn-sm" 
                        onclick="ScheduleApp.switchViewMode('term')" 
                        style="padding:0.3rem 0.75rem; font-size:0.8rem; font-weight:600; border-radius:6px; border:none; transition:all 0.15s ease; background:${this.currentViewMode === 'term' ? '#fff' : 'transparent'}; color:${this.currentViewMode === 'term' ? '#0f172a' : '#64748b'}; box-shadow:${this.currentViewMode === 'term' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        Termly Roadmap
                    </button>
                    <button class="btn btn-sm" 
                        onclick="ScheduleApp.switchViewMode('month')" 
                        style="padding:0.3rem 0.75rem; font-size:0.8rem; font-weight:600; border-radius:6px; border:none; transition:all 0.15s ease; background:${this.currentViewMode === 'month' ? '#fff' : 'transparent'}; color:${this.currentViewMode === 'month' ? '#0f172a' : '#64748b'}; box-shadow:${this.currentViewMode === 'month' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        Monthly Calendar
                    </button>
                    <button class="btn btn-sm" 
                        onclick="ScheduleApp.switchViewMode('week')" 
                        style="padding:0.3rem 0.75rem; font-size:0.8rem; font-weight:600; border-radius:6px; border:none; transition:all 0.15s ease; background:${this.currentViewMode === 'week' ? '#fff' : 'transparent'}; color:${this.currentViewMode === 'week' ? '#0f172a' : '#64748b'}; box-shadow:${this.currentViewMode === 'week' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        Weekly Timetable
                    </button>
                </div>
            </div>

            <!-- Active View Render Target -->
            ${this.currentViewMode === 'term' ? this.renderTermlyView() : ''}
            ${this.currentViewMode === 'month' ? this.renderMonthlyView() : ''}
            ${this.currentViewMode === 'week' ? this.renderWeeklyView() : ''}

            <!-- Schedule Modal Container -->
            <div id="schedule-modal-container"></div>
            <!-- Auto Preplan Modal Container -->
            <div id="auto-preplan-modal-container"></div>
        `;
    },

    // =========================================================================
    // 1. TERMLY SYLLABUS ROADMAP (Sleek SaaS Card & KPI Design)
    // =========================================================================
    renderTermlyView() {
        if (!this.termRoadmap) {
            return `
                <div class="card" style="text-align:center; padding:3.5rem 1.5rem; background:#fff; border:1px solid #e2e8f0; border-radius:12px;">
                    <div class="spinner"></div>
                    <p style="margin-top:0.75rem; font-size:0.85rem; color:#64748b;">Loading syllabus roadmap...</p>
                </div>
            `;
        }

        const { term, metrics, subjects, learner } = this.termRoadmap;
        const totalMilestones = metrics?.total_milestones || 0;
        const totalScheduled = metrics?.total_scheduled || 0;
        const totalCompleted = metrics?.total_completed || 0;
        const completionRate = metrics?.completion_rate || metrics?.completion_rate_percent || 0;

        return `
            <!-- Refined Term Header & Key Metrics -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:1.25rem 1.5rem; margin-bottom:1.5rem; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem; border-bottom:1px solid #f1f5f9; padding-bottom:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                            <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#4338ca; background:#eef2ff; border:1px solid #c7d2fe; padding:2px 8px; border-radius:4px;">
                                12-Week Syllabus Roadmap
                            </span>
                            <span style="font-size:0.8rem; color:#64748b; font-weight:500;">
                                • ${App.escapeHtml(learner?.full_name || '')} (${App.escapeHtml(learner?.class_code || 'P' + learner?.class_id)})
                            </span>
                        </div>
                        <h2 style="font-size:1.35rem; font-weight:700; color:#0f172a; margin:0; letter-spacing:-0.01em;">
                            ${App.escapeHtml(term?.term_name || 'Term 3')} (${App.escapeHtml(term?.academic_year || '2026')})
                        </h2>
                        <div style="font-size:0.82rem; color:#64748b; margin-top:0.2rem;">
                            Term Period: ${term?.start_date ? new Date(term.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Sep 14'} — ${term?.end_date ? new Date(term.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Dec 04, 2026'}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm" onclick="ScheduleApp.openAutoPreplanModal()" style="font-weight:600; font-size:0.82rem; padding:0.45rem 0.95rem; border-radius:6px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 1px 2px rgba(0,0,0,0.06);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            <span>Auto-Preplan Term</span>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="window.print()" style="font-weight:600; font-size:0.82rem; padding:0.45rem 0.85rem; border-radius:6px; border-color:#e2e8f0; color:#475569; display:inline-flex; align-items:center; gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                            <span>Print Roadmap</span>
                        </button>
                    </div>
                </div>

                <!-- 4 KPI Metrics Tiles -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.85rem;">
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem 1rem;">
                        <div style="font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; margin-bottom:0.25rem;">
                            Total Milestones
                        </div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a; line-height:1.2;">
                            ${totalMilestones}
                        </div>
                        <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.2rem;">Across all subjects</div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem 1rem;">
                        <div style="font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#1d4ed8; margin-bottom:0.25rem;">
                            Planned on Timetable
                        </div>
                        <div style="font-size:1.5rem; font-weight:700; color:#1e40af; line-height:1.2;">
                            ${totalScheduled}
                        </div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:0.2rem;">Scheduled sessions</div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem 1rem;">
                        <div style="font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#047857; margin-bottom:0.25rem;">
                            Completed Lessons
                        </div>
                        <div style="font-size:1.5rem; font-weight:700; color:#065f46; line-height:1.2;">
                            ${totalCompleted}
                        </div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:0.2rem;">Assessed & logged</div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem 1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                            <span style="font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#64748b;">
                                Term Pacing
                            </span>
                            <span style="font-size:0.75rem; font-weight:700; color:#0f172a;">${completionRate}%</span>
                        </div>
                        <div style="font-size:1.5rem; font-weight:700; color:#0f172a; line-height:1.2; margin-bottom:0.35rem;">
                            ${completionRate}%
                        </div>
                        <div style="background:#e2e8f0; border-radius:4px; height:4px; width:100%; overflow:hidden;">
                            <div style="background:#2563eb; height:100%; width:${Math.min(100, completionRate)}%; transition:width 0.4s ease;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subject-by-Subject Syllabus Roadmaps -->
            <div style="display:flex; flex-direction:column; gap:1.25rem; margin-bottom:2.5rem;">
                ${subjects.map((subj, sIdx) => this.renderSubjectRoadmapCard(subj, sIdx)).join('')}
            </div>
        `;
    },

    renderSubjectRoadmapCard(subj, sIdx) {
        const milestones = subj.milestones || subj.lessons || [];
        const completedCount = milestones.filter(m => (m.schedule && m.schedule.status === 'completed') || m.schedule_status === 'completed').length;
        const scheduledCount = milestones.filter(m => (m.schedule && ['planned', 'completed'].includes(m.schedule.status)) || ['planned', 'completed'].includes(m.schedule_status)).length;
        const totalCount = milestones.length;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:1.15rem; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                <!-- Subject Card Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.85rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <h3 style="font-size:1.05rem; font-weight:700; color:#0f172a; margin:0;">
                                ${App.escapeHtml(subj.subject_name)}
                            </h3>
                            <span style="font-size:0.72rem; font-weight:600; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:4px;">
                                ${subj.subject_code || ''} • ${totalCount} Lessons
                            </span>
                        </div>
                    </div>

                    <!-- Progress Badge -->
                    <div style="font-size:0.8rem; color:#475569; display:flex; align-items:center; gap:0.75rem;">
                        <span><strong>${completedCount}</strong> of ${totalCount} Completed</span>
                        <span style="font-weight:700; color:${pct > 0 ? '#16a34a' : '#64748b'}; background:${pct > 0 ? '#ecfdf5' : '#f8fafc'}; padding:2px 6px; border-radius:4px; font-size:0.75rem;">
                            ${pct}%
                        </span>
                    </div>
                </div>

                <!-- Subtle Subject Progress Bar -->
                <div style="background:#f1f5f9; border-radius:3px; height:4px; width:100%; margin-bottom:1rem; overflow:hidden;">
                    <div style="background:#16a34a; height:100%; width:${pct}%; transition:width 0.3s ease;"></div>
                </div>

                <!-- Milestones Grid -->
                ${milestones.length === 0 ? `
                    <div style="text-align:center; color:#94a3b8; padding:1.5rem; font-size:0.85rem;">
                        No syllabus milestones defined for this subject.
                    </div>
                ` : `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:0.65rem;">
                        ${milestones.map(m => this.renderMilestoneCard(subj, m)).join('')}
                    </div>
                `}
            </div>
        `;
    },

    renderMilestoneCard(subj, m) {
        const scheduleObj = m.schedule || null;
        const status = (scheduleObj && scheduleObj.status) || m.schedule_status || 'unscheduled';
        const isCompleted = status === 'completed';
        const isPlanned = status === 'planned';
        const isUnscheduled = !isCompleted && !isPlanned;

        const schedDate = (scheduleObj && scheduleObj.scheduled_date) || m.scheduled_date;
        const formattedDate = schedDate ? new Date(schedDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

        let badgeStyle = 'background:#f8fafc; color:#64748b; border:1px solid #e2e8f0;';
        let badgeLabel = 'Unscheduled';

        if (isCompleted) {
            badgeStyle = 'background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;';
            badgeLabel = `Completed ${formattedDate ? '• ' + formattedDate : ''}`;
        } else if (isPlanned) {
            badgeStyle = 'background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;';
            badgeLabel = `Planned • ${formattedDate}`;
        }

        const guideId = (m.guide && m.guide.guide_id) || m.guide_id;

        return `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.15s ease;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; gap:0.5rem;">
                        <span style="font-size:0.72rem; font-weight:700; color:#475569; background:#f1f5f9; padding:1px 6px; border-radius:4px;">
                            #${m.sequence_number || 1}
                        </span>
                        <span style="font-size:0.7rem; font-weight:600; padding:1px 6px; border-radius:4px; ${badgeStyle}">
                            ${badgeLabel}
                        </span>
                    </div>

                    <h4 style="font-size:0.85rem; font-weight:600; margin:0 0 0.25rem 0; color:#0f172a; line-height:1.35;">
                        ${App.escapeHtml(m.lesson_title)}
                    </h4>

                    ${m.duration_minutes ? `
                        <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:0.35rem;">
                            Est. ${m.duration_minutes} mins
                        </div>
                    ` : ''}
                </div>

                <div style="display:flex; gap:0.35rem; padding-top:0.5rem; border-top:1px solid #f8fafc; margin-top:0.35rem; align-items:center;">
                    ${guideId ? `
                        <button class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.5rem; border-color:#e2e8f0; color:#475569;" onclick="GuidesApp.openGuideModal(${guideId})">
                            Guide
                        </button>
                    ` : ''}

                    ${isUnscheduled ? `
                        <button class="btn btn-primary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.6rem; flex:1;" onclick="ScheduleApp.openPreplanMilestoneModal(${subj.subject_id}, ${m.lesson_id}, '${App.escapeHtml(m.lesson_title)}')">
                            + Plan Slot
                        </button>
                    ` : `
                        <button class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:0.2rem 0.5rem; color:#475569;" onclick="ScheduleApp.openEditScheduleModal(${(scheduleObj && scheduleObj.schedule_id) || m.schedule_id})">
                            Reschedule
                        </button>
                    `}
                </div>
            </div>
        `;
    },

    openPreplanMilestoneModal(subjectId, lessonId, lessonTitle) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);
        const dateStr = nextDate.toISOString().split('T')[0];

        this.openScheduleModal(dateStr, {
            subjectId: subjectId,
            lessonId: lessonId,
            lockSubject: true,
            notes: `Milestone: ${lessonTitle}`
        });
    },

    // =========================================================================
    // 2. MONTHLY PLANNER VIEW (Clean Calendar Grid)
    // =========================================================================
    renderMonthlyView() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthTitle = `${monthNames[this.currentMonth]} ${this.currentYear}`;

        const firstDayObj = new Date(this.currentYear, this.currentMonth, 1);
        const lastDayObj = new Date(this.currentYear, this.currentMonth + 1, 0);
        const numDays = lastDayObj.getDate();

        let startDayIndex = firstDayObj.getDay() - 1;
        if (startDayIndex === -1) startDayIndex = 6;

        const todayStr = new Date().toISOString().split('T')[0];

        const schedByDate = {};
        for (const s of this.schedules) {
            if (!schedByDate[s.scheduled_date]) schedByDate[s.scheduled_date] = [];
            schedByDate[s.scheduled_date].push(s);
        }

        const totalMonthSessions = this.schedules.length;
        const completedMonthSessions = this.schedules.filter(s => s.status === 'completed').length;

        let cellsHtml = '';

        for (let i = 0; i < startDayIndex; i++) {
            cellsHtml += `
                <div style="background:#f8fafc; border:1px solid #f1f5f9; min-height:100px; border-radius:6px; opacity:0.3;"></div>
            `;
        }

        for (let d = 1; d <= numDays; d++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const daySessions = schedByDate[dateStr] || [];

            cellsHtml += `
                <div style="background:#fff; border:${isToday ? '2px solid #2563eb' : '1px solid #e2e8f0'}; border-radius:8px; min-height:110px; padding:0.4rem; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.15s ease;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                            <span style="font-size:0.82rem; font-weight:${isToday ? '800' : '600'}; color:${isToday ? '#2563eb' : '#334155'};">
                                ${d} ${isToday ? '<span style="font-size:0.65rem; background:#eff6ff; color:#2563eb; padding:1px 4px; border-radius:3px; margin-left:2px;">Today</span>' : ''}
                            </span>
                            <button onclick="ScheduleApp.openScheduleModal('${dateStr}')" style="background:none; border:none; color:#2563eb; font-weight:700; font-size:0.75rem; cursor:pointer; padding:0 0.2rem;" title="Add lesson on ${dateStr}">
                                +
                            </button>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                            ${daySessions.slice(0, 3).map(s => {
                                const isDone = s.status === 'completed';
                                return `
                                    <div onclick="ScheduleApp.openEditScheduleModal(${s.schedule_id})" style="cursor:pointer; background:${isDone ? '#ecfdf5' : '#eff6ff'}; border-left:3px solid ${isDone ? '#16a34a' : '#2563eb'}; padding:0.2rem 0.35rem; border-radius:3px; font-size:0.7rem; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${App.escapeHtml(s.subject_name || '')}: ${App.escapeHtml(s.lesson_title || s.notes || '')}">
                                        <strong>${s.start_time ? s.start_time.substring(0, 5) : ''}</strong> ${App.escapeHtml(s.subject_name || 'Lesson')}
                                    </div>
                                `;
                            }).join('')}
                            ${daySessions.length > 3 ? `
                                <div style="font-size:0.68rem; color:#64748b; font-weight:600; text-align:center;">
                                    +${daySessions.length - 3} more
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${daySessions.length === 0 ? `
                        <div style="text-align:center; padding:0.2rem 0;">
                            <span style="font-size:0.68rem; color:#cbd5e1;">—</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        return `
            <!-- Month Navigator & Stats -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:0.75rem 1rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; gap:0.4rem;">
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.changeMonth(-1)" style="font-size:0.8rem; padding:0.3rem 0.65rem;">◀ Previous</button>
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.resetToCurrentMonth()" style="font-size:0.8rem; padding:0.3rem 0.65rem;">Current Month</button>
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.changeMonth(1)" style="font-size:0.8rem; padding:0.3rem 0.65rem;">Next ▶</button>
                </div>

                <div style="font-weight:700; font-size:1.05rem; color:#0f172a;">
                    ${monthTitle}
                </div>

                <div style="display:flex; gap:0.85rem; font-size:0.82rem; color:#64748b;">
                    <span><strong>${totalMonthSessions}</strong> Planned</span>
                    <span><strong>${completedMonthSessions}</strong> Completed</span>
                </div>
            </div>

            <!-- Month Calendar Header (Mon - Sun) -->
            <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:0.4rem; margin-bottom:0.4rem; text-align:center;">
                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `
                    <div style="font-weight:600; font-size:0.75rem; text-transform:uppercase; color:#94a3b8; padding:0.25rem 0;">
                        ${day}
                    </div>
                `).join('')}
            </div>

            <!-- Month Calendar Grid -->
            <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:0.4rem; margin-bottom:2rem;">
                ${cellsHtml}
            </div>
        `;
    },

    async changeMonth(delta) {
        this.currentMonth += delta;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    async resetToCurrentMonth() {
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    // =========================================================================
    // 3. WEEKLY TIMETABLE VIEW (7-Day Column Grid)
    // =========================================================================
    renderWeeklyView() {
        const weekDates = this.getWeekDates(this.currentWeekOffset);

        return `
            <!-- Suggestions Section -->
            ${this.renderSuggestionsSection()}

            <!-- Week Navigator Toolbar -->
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:0.75rem 1rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; gap:0.4rem;">
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.changeWeek(-1)" style="font-size:0.8rem; padding:0.3rem 0.65rem;">◀ Previous Week</button>
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.resetToCurrentWeek()" style="font-size:0.8rem; padding:0.3rem 0.65rem;">Current Week</button>
                    <button class="btn btn-secondary btn-sm" onclick="ScheduleApp.changeWeek(1)" style="font-size:0.8rem; padding:0.3rem 0.65rem;">Next Week ▶</button>
                </div>
                <div style="font-weight:700; font-size:0.92rem; color:#0f172a;">
                    ${weekDates[0].displayDate} — ${weekDates[6].displayDate}, 2026
                </div>
            </div>

            <!-- 7-Day Timetable Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:0.65rem; margin-bottom:2rem;">
                ${weekDates.map(day => this.renderDayColumn(day)).join('')}
            </div>
        `;
    },

    renderSuggestionsSection() {
        if (this.suggestions.length === 0) return '';

        return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:3px solid #2563eb; border-radius:10px; padding:1rem 1.25rem; margin-bottom:1.25rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
                    <h3 style="font-size:0.92rem; font-weight:700; margin:0; color:#0f172a;">
                        Suggested Next Lessons (Curriculum Pacing)
                    </h3>
                    <span style="font-size:0.72rem; color:#64748b; font-weight:500;">Based on sequence order</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:0.75rem;">
                    ${this.suggestions.map(s => {
                        return `
                            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem; display:flex; flex-direction:column; justify-content:space-between;">
                                <div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                                        <span style="font-size:0.72rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:1px 6px; border-radius:4px;">
                                            ${App.escapeHtml(s.subject_name)}
                                        </span>
                                    </div>
                                    <h4 style="font-size:0.88rem; font-weight:600; margin:0 0 0.25rem 0; color:#0f172a;">
                                        ${App.escapeHtml(s.lesson_title)}
                                    </h4>
                                    <p style="font-size:0.75rem; color:#64748b; margin:0 0 0.65rem 0;">
                                        ${App.escapeHtml(s.reason)}
                                    </p>
                                </div>
                                <div style="display:flex; gap:0.4rem; padding-top:0.45rem; border-top:1px solid #f1f5f9;">
                                    <button class="btn btn-primary btn-sm" style="flex:1; font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="ScheduleApp.quickScheduleSuggestion(${s.subject_id}, ${s.lesson_id})">
                                        + Schedule
                                    </button>
                                    ${s.guide ? `
                                        <button class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="GuidesApp.openGuideModal(${s.guide.guide_id})">
                                            Guide
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    renderDayColumn(day) {
        const daySchedules = this.schedules.filter(s => s.scheduled_date === day.date);

        return `
            <div style="background:#fff; border-radius:8px; border:${day.isToday ? '2px solid #2563eb' : '1px solid #e2e8f0'}; display:flex; flex-direction:column; min-height:260px;">
                <div style="padding:0.5rem 0.65rem; background:${day.isToday ? '#2563eb' : '#f8fafc'}; color:${day.isToday ? '#fff' : '#0f172a'}; border-top-left-radius:6px; border-top-right-radius:6px; text-align:center; border-bottom:1px solid #e2e8f0;">
                    <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; opacity:${day.isToday ? '0.9' : '0.6'};">${day.dayName}</div>
                    <div style="font-size:0.88rem; font-weight:700;">${day.displayDate}</div>
                </div>

                <div style="padding:0.5rem; flex:1; display:flex; flex-direction:column; gap:0.45rem;">
                    ${daySchedules.length === 0 ? `
                        <div style="text-align:center; color:#94a3b8; font-size:0.78rem; margin:auto 0; padding:1rem 0;">
                            No lessons
                        </div>
                    ` : daySchedules.map(item => this.renderScheduleCard(item)).join('')}
                </div>

                <div style="padding:0.35rem 0.5rem; border-top:1px solid #f1f5f9; text-align:center;">
                    <button class="btn btn-secondary btn-sm" style="width:100%; font-size:0.72rem; padding:0.2rem 0.35rem; color:#475569; border-color:#e2e8f0;" onclick="ScheduleApp.openScheduleModal('${day.date}')">
                        + Add Slot
                    </button>
                </div>
            </div>
        `;
    },

    renderScheduleCard(item) {
        const statusColors = {
            planned: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', badge: 'Planned' },
            completed: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', badge: 'Completed' },
            skipped: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', badge: 'Skipped' },
            cancelled: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', badge: 'Cancelled' }
        };
        const st = statusColors[item.status] || statusColors.planned;
        const timeDisplay = item.start_time 
            ? `${item.start_time.substring(0, 5)}${item.end_time ? ' – ' + item.end_time.substring(0, 5) : ''}`
            : 'Anytime';

        return `
            <div style="background:${st.bg}; border:1px solid ${st.border}; border-radius:6px; padding:0.5rem; font-size:0.78rem; transition:all 0.15s ease;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <span style="font-weight:600; color:${st.text}; font-size:0.72rem;">
                        ${timeDisplay}
                    </span>
                    <span style="font-size:0.68rem; font-weight:600; color:${st.text};">
                        ${st.badge}
                    </span>
                </div>

                <div style="font-weight:600; color:#0f172a; line-height:1.25; margin-bottom:0.2rem; font-size:0.8rem;">
                    ${App.escapeHtml(item.subject_name || 'General Study')}
                </div>

                ${item.lesson_title ? `
                    <div style="color:#475569; font-size:0.72rem; margin-bottom:0.35rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${App.escapeHtml(item.lesson_title)}">
                        ${App.escapeHtml(item.lesson_title)}
                    </div>
                ` : ''}

                <div style="display:flex; gap:0.25rem; margin-top:0.35rem; border-top:1px solid rgba(0,0,0,0.05); padding-top:0.3rem; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:0.2rem;">
                        ${item.guide_id ? `
                            <button class="btn btn-secondary btn-sm" style="font-size:0.68rem; padding:0.1rem 0.35rem;" onclick="GuidesApp.openGuideModal(${item.guide_id})">
                                Guide
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" style="font-size:0.68rem; padding:0.1rem 0.35rem;" onclick="ScheduleApp.openEditScheduleModal(${item.schedule_id})">
                            Edit
                        </button>
                    </div>
                    
                    <div style="display:flex; gap:0.2rem;">
                        ${item.status === 'planned' ? `
                            <button class="btn btn-primary btn-sm" style="font-size:0.68rem; padding:0.1rem 0.3rem; background:#16a34a; border-color:#16a34a;" title="Mark Completed" onclick="ScheduleApp.updateStatus(${item.schedule_id}, 'completed')">
                                ✔
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" style="font-size:0.68rem; padding:0.1rem 0.3rem; color:#dc2626;" title="Remove" onclick="ScheduleApp.deleteSession(${item.schedule_id})">
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // =========================================================================
    // 4. AUTO-PREPLAN MODAL & INTERACTIONS
    // =========================================================================
    openAutoPreplanModal() {
        const container = document.getElementById('auto-preplan-modal-container');
        if (!container) return;

        const currentLearner = this.learners.find(l => l.learner_id == this.selectedLearnerId);
        const todayStr = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1.25rem; backdrop-filter:blur(3px);">
                <div class="modal-card" style="background:#fff; width:100%; max-width:540px; border-radius:12px; padding:1.75rem; box-shadow:0 20px 40px rgba(0,0,0,0.15); max-height:92vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid #f1f5f9; padding-bottom:0.75rem;">
                        <div>
                            <h3 style="font-size:1.15rem; font-weight:700; margin:0; color:#0f172a;">
                                Auto-Preplan Term Milestones
                            </h3>
                            <p style="margin:0.2rem 0 0 0; font-size:0.82rem; color:#64748b;">
                                Schedule all unscheduled syllabus milestones sequentially across weekdays.
                            </p>
                        </div>
                        <button class="btn btn-secondary btn-sm" style="font-size:1.1rem; line-height:1; padding:0.2rem 0.5rem; border-radius:6px;" onclick="document.getElementById('auto-preplan-modal-container').innerHTML=''">&times;</button>
                    </div>

                    <form onsubmit="ScheduleApp.submitAutoDistribute(event)">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem; margin-bottom:1rem; font-size:0.82rem; color:#334155; line-height:1.45;">
                            Unscheduled milestones for <strong>${App.escapeHtml(currentLearner?.full_name || 'Learner')}</strong> will be distributed across the selected term weekdays without overlapping existing sessions.
                        </div>

                        <div style="margin-bottom:0.85rem;">
                            <label style="display:block; font-size:0.78rem; font-weight:600; color:#334155; margin-bottom:0.3rem;">
                                Start Date *
                            </label>
                            <input type="date" id="auto-start-date" class="form-control" value="${todayStr}" required style="padding:0.4rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.85rem;">
                            <div>
                                <label style="display:block; font-size:0.78rem; font-weight:600; color:#334155; margin-bottom:0.3rem;">
                                    Daily Time Slot
                                </label>
                                <input type="time" id="auto-start-time" class="form-control" value="09:00" required style="padding:0.4rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                            </div>
                            <div>
                                <label style="display:block; font-size:0.78rem; font-weight:600; color:#334155; margin-bottom:0.3rem;">
                                    Lessons Per Day
                                </label>
                                <select id="auto-lessons-per-day" class="form-control" style="padding:0.4rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                                    <option value="1">1 Lesson / Day</option>
                                    <option value="2" selected>2 Lessons / Day</option>
                                    <option value="3">3 Lessons / Day</option>
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:1.25rem;">
                            <label style="display:block; font-size:0.78rem; font-weight:600; color:#334155; margin-bottom:0.35rem;">
                                Study Days
                            </label>
                            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `
                                    <label style="display:flex; align-items:center; gap:0.35rem; background:#f8fafc; border:1px solid #cbd5e1; padding:0.25rem 0.55rem; border-radius:6px; font-size:0.78rem; cursor:pointer;">
                                        <input type="checkbox" name="auto-days" value="${d}" ${d !== 'Sat' ? 'checked' : ''}>
                                        <span>${d}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid #f1f5f9; padding-top:0.85rem;">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('auto-preplan-modal-container').innerHTML=''">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-sm" style="font-weight:600; padding:0.4rem 1.25rem;">
                                Generate Plan
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    async submitAutoDistribute(e) {
        e.preventDefault();
        const startDate = document.getElementById('auto-start-date')?.value;
        const startTime = document.getElementById('auto-start-time')?.value || '09:00';
        const lessonsPerDay = parseInt(document.getElementById('auto-lessons-per-day')?.value || '2');

        const checkedDays = Array.from(document.querySelectorAll('input[name="auto-days"]:checked')).map(cb => cb.value);

        const payload = {
            learner_id: parseInt(this.selectedLearnerId),
            term_id: parseInt(this.selectedTermId),
            start_date: startDate,
            start_time: startTime.length === 5 ? startTime + ':00' : startTime,
            lessons_per_day: lessonsPerDay,
            active_days: checkedDays
        };

        try {
            const res = await API.post('/api/parent/schedule/auto-distribute', payload);
            alert(`Auto-scheduled ${res.data?.scheduled_count || 'all'} milestones across the term.`);
            document.getElementById('auto-preplan-modal-container').innerHTML = '';
            await this.refreshData();
            this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to auto-distribute schedule: ' + (err.message || 'Unknown error'));
        }
    },

    // =========================================================================
    // 5. SCHEDULE MODAL & CRUD
    // =========================================================================
    async selectLearner(learnerId) {
        this.selectedLearnerId = learnerId;
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    async changeWeek(delta) {
        this.currentWeekOffset += delta;
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    async resetToCurrentWeek() {
        this.currentWeekOffset = 0;
        await this.refreshData();
        this.renderView(document.getElementById('app-content'));
    },

    async updateStatus(scheduleId, newStatus) {
        try {
            await API.patch(`/api/parent/schedule/${scheduleId}/status`, { status: newStatus });
            await this.refreshData();
            this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to update status: ' + err.message);
        }
    },

    async deleteSession(scheduleId) {
        if (!confirm('Remove this scheduled session?')) return;
        try {
            await API.delete(`/api/parent/schedule/${scheduleId}`);
            await this.refreshData();
            this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to delete session: ' + err.message);
        }
    },

    quickScheduleSuggestion(subjectId, lessonId) {
        const suggestion = this.suggestions.find(s => s.lesson_id == lessonId && s.subject_id == subjectId);
        const title = suggestion ? suggestion.lesson_title : '';
        this.openScheduleModal(null, {
            subjectId: subjectId,
            lessonId: lessonId,
            lockSubject: true,
            notes: title ? 'Milestone: ' + title : ''
        });
    },

    openEditScheduleModal(scheduleId) {
        const item = this.schedules.find(s => s.schedule_id == scheduleId);
        if (!item) return;

        this.openScheduleModal(item.scheduled_date, {
            scheduleId: item.schedule_id,
            subjectId: item.subject_id,
            lessonId: item.lesson_id,
            startTime: item.start_time ? item.start_time.substring(0, 5) : '',
            endTime: item.end_time ? item.end_time.substring(0, 5) : '',
            notes: item.notes || ''
        });
    },

    getNextAvailableTimeSlot(targetDate) {
        const daySchedules = this.schedules.filter(s => s.scheduled_date === targetDate && s.start_time);
        
        const standardSlots = [
            { start: '08:30', end: '09:15' },
            { start: '09:30', end: '10:15' },
            { start: '10:45', end: '11:30' },
            { start: '11:45', end: '12:30' },
            { start: '14:00', end: '14:45' },
            { start: '15:15', end: '16:00' },
            { start: '16:30', end: '17:15' }
        ];

        for (const slot of standardSlots) {
            const hasConflict = daySchedules.some(s => {
                const sStart = s.start_time.substring(0, 5);
                const sEnd = s.end_time ? s.end_time.substring(0, 5) : sStart;
                return (slot.start >= sStart && slot.start < sEnd) || (slot.end > sStart && slot.end <= sEnd);
            });
            if (!hasConflict) {
                return slot;
            }
        }

        return { start: '09:00', end: '09:45' };
    },

    setPresetTime(start, end) {
        const startInput = document.getElementById('sched-start');
        const endInput = document.getElementById('sched-end');
        if (startInput && endInput) {
            startInput.value = start;
            endInput.value = end;
        }

        document.querySelectorAll('.time-preset-btn').forEach(btn => {
            if (btn.getAttribute('data-start') === start && btn.getAttribute('data-end') === end) {
                btn.style.background = '#2563eb';
                btn.style.color = '#fff';
                btn.style.borderColor = '#2563eb';
            } else {
                btn.style.background = '#f8fafc';
                btn.style.color = '#334155';
                btn.style.borderColor = '#cbd5e1';
            }
        });
    },

    onStartTimeChange(newStartTime) {
        if (!newStartTime) return;
        const [h, m] = newStartTime.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return;

        let totalMins = h * 60 + m + 45;
        let endH = Math.floor(totalMins / 60) % 24;
        let endM = totalMins % 60;
        const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

        const endInput = document.getElementById('sched-end');
        if (endInput && !endInput.dataset.manuallyChanged) {
            endInput.value = endStr;
        }
    },

    async openScheduleModal(defaultDate = null, prefill = {}) {
        const container = document.getElementById('schedule-modal-container');
        if (!container) return;

        const currentLearner = this.learners.find(l => l.learner_id == this.selectedLearnerId);
        const classId = currentLearner?.class_id || 1;
        const targetDate = defaultDate || new Date().toISOString().split('T')[0];

        const isEditing = Boolean(prefill && prefill.scheduleId);
        const suggestedSlot = this.getNextAvailableTimeSlot(targetDate);

        const initialStart = (prefill && prefill.startTime) || suggestedSlot.start;
        const initialEnd = (prefill && prefill.endTime) || suggestedSlot.end;
        const initialSubjectId = (prefill && prefill.subjectId) || '';
        const initialLessonId = (prefill && prefill.lessonId) || '';
        const initialNotes = (prefill && prefill.notes) || '';

        const lockSubject = Boolean(prefill && (prefill.lockSubject || prefill.subjectId));

        let subjects = [];
        try {
            const res = await API.get(`/api/curriculum/classes/${classId}/subjects`);
            subjects = Array.isArray(res.data) ? res.data : (res.data?.subjects || []);
        } catch (e) {
            console.error('Failed to load class subjects:', e);
        }

        const presets = [
            { label: 'Morning', start: '08:30', end: '09:15' },
            { label: 'Mid-Morning', start: '09:30', end: '10:15' },
            { label: 'Late Morning', start: '10:45', end: '11:30' },
            { label: 'Noon', start: '11:45', end: '12:30' },
            { label: 'Afternoon', start: '14:00', end: '14:45' },
            { label: 'Late Afternoon', start: '15:15', end: '16:00' }
        ];

        const targetDateObj = new Date(targetDate + 'T00:00:00');
        const dayOfWeekStr = targetDateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

        container.innerHTML = `
            <div class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; padding:1.25rem; backdrop-filter:blur(3px);">
                <div class="modal-card" style="background:#fff; width:100%; max-width:780px; border-radius:14px; padding:1.75rem; box-shadow:0 20px 40px rgba(0,0,0,0.18); max-height:92vh; overflow-y:auto;">
                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; border-bottom:1px solid #f1f5f9; padding-bottom:0.75rem;">
                        <div>
                            <h3 style="font-size:1.2rem; font-weight:700; margin:0; color:#0f172a;">
                                ${isEditing ? 'Edit Session Slot' : 'Add to Timetable'}
                            </h3>
                            <p style="margin:0.2rem 0 0 0; font-size:0.82rem; color:#64748b;">
                                Learner: <strong>${App.escapeHtml(currentLearner?.full_name || 'Learner')}</strong> (${currentLearner?.class_code || 'P' + classId})
                            </p>
                        </div>
                        <button class="btn btn-secondary btn-sm" style="font-size:1.1rem; line-height:1; padding:0.2rem 0.5rem; border-radius:6px;" onclick="document.getElementById('schedule-modal-container').innerHTML=''">&times;</button>
                    </div>

                    <form id="new-schedule-form" onsubmit="ScheduleApp.submitScheduleForm(event, ${(prefill && prefill.scheduleId) ? prefill.scheduleId : 'null'})">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem; margin-bottom:1.25rem;">
                            
                            <!-- Left: Date & Time Settings -->
                            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                                        <label style="font-size:0.78rem; font-weight:600; color:#334155; margin:0;">
                                            Date *
                                        </label>
                                        <span id="sched-day-name" style="font-size:0.72rem; font-weight:600; color:#2563eb; background:#eff6ff; padding:1px 6px; border-radius:4px;">
                                            ${dayOfWeekStr}
                                        </span>
                                    </div>
                                    <input type="date" id="sched-date" class="form-control" value="${targetDate}" required onchange="ScheduleApp.onDateChanged(this.value)" style="padding:0.35rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                                </div>

                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem;">
                                    <label style="display:block; font-size:0.72rem; font-weight:600; margin-bottom:0.35rem; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
                                        Quick Presets
                                    </label>
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.35rem;">
                                        ${presets.map(p => {
                                            const isCurrent = p.start === initialStart && p.end === initialEnd;
                                            return `
                                                <button type="button" class="time-preset-btn" 
                                                    data-start="${p.start}" data-end="${p.end}"
                                                    onclick="ScheduleApp.setPresetTime('${p.start}', '${p.end}')"
                                                    style="border-radius:6px; border:1px solid ${isCurrent ? '#2563eb' : '#cbd5e1'}; background:${isCurrent ? '#2563eb' : '#fff'}; color:${isCurrent ? '#fff' : '#334155'}; font-size:0.72rem; font-weight:600; padding:0.25rem 0.4rem; cursor:pointer; text-align:center;">
                                                    ${p.label} <span style="font-weight:400; opacity:0.8;">(${p.start})</span>
                                                </button>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>

                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem;">
                                    <div>
                                        <label style="display:block; font-size:0.75rem; font-weight:600; margin-bottom:0.2rem; color:#334155;">
                                            Start Time *
                                        </label>
                                        <input type="time" id="sched-start" class="form-control" value="${initialStart}" required onchange="ScheduleApp.onStartTimeChange(this.value)" style="padding:0.3rem 0.5rem; font-size:0.85rem; border-radius:6px;">
                                    </div>
                                    <div>
                                        <label style="display:block; font-size:0.75rem; font-weight:600; margin-bottom:0.2rem; color:#334155;">
                                            End Time
                                        </label>
                                        <input type="time" id="sched-end" class="form-control" value="${initialEnd}" oninput="this.dataset.manuallyChanged='true'" style="padding:0.3rem 0.5rem; font-size:0.85rem; border-radius:6px;">
                                    </div>
                                </div>
                            </div>

                            <!-- Right: Subject, Milestone & Goal -->
                            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                                        <label style="display:block; font-size:0.78rem; font-weight:600; margin:0; color:#334155;">Subject *</label>
                                        ${lockSubject ? '<span style="font-size:0.68rem; font-weight:600; color:#64748b; background:#e2e8f0; padding:1px 5px; border-radius:3px;">Pre-selected</span>' : ''}
                                    </div>
                                    ${lockSubject ? `
                                        <input type="hidden" id="sched-subject-hidden" value="${initialSubjectId}">
                                        <select id="sched-subject" class="form-control" disabled style="background:#f1f5f9; color:#334155; font-weight:600; cursor:not-allowed; padding:0.35rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                                            ${subjects.map(s => `<option value="${s.subject_id}" ${s.subject_id == initialSubjectId ? 'selected' : ''}>${App.escapeHtml(s.subject_name)}</option>`).join('')}
                                        </select>
                                    ` : `
                                        <select id="sched-subject" class="form-control" required onchange="ScheduleApp.loadSubjectLessons(this.value)" style="padding:0.35rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                                            <option value="">-- Select Subject --</option>
                                            ${subjects.map(s => `<option value="${s.subject_id}" ${s.subject_id == initialSubjectId ? 'selected' : ''}>${App.escapeHtml(s.subject_name)}</option>`).join('')}
                                        </select>
                                    `}
                                </div>

                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem;">
                                    <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:0.25rem; color:#334155;">
                                        Lesson Milestone
                                    </label>
                                    <select id="sched-lesson" class="form-control" onchange="ScheduleApp.onLessonChanged(this)" style="padding:0.35rem 0.6rem; font-size:0.85rem; border-radius:6px;">
                                        <option value="">Select Subject First</option>
                                    </select>
                                </div>

                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem; flex:1; display:flex; flex-direction:column;">
                                    <label style="display:block; font-size:0.78rem; font-weight:600; margin-bottom:0.25rem; color:#334155;">
                                        Learning Goal / Notes
                                    </label>
                                    <input type="text" id="sched-notes" class="form-control" placeholder="e.g. Master milestone concepts and exercises" value="${App.escapeHtml(initialNotes)}" style="padding:0.4rem 0.6rem; font-size:0.85rem; width:100%; border-radius:6px;">
                                </div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid #f1f5f9; padding-top:0.85rem;">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('schedule-modal-container').innerHTML=''">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-sm" style="font-weight:600; padding:0.4rem 1.25rem;">
                                ${isEditing ? 'Save Changes' : 'Save Slot'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        if (initialSubjectId) {
            await this.loadSubjectLessons(initialSubjectId, initialLessonId);
        }
    },

    onLessonChanged(selectElem) {
        if (!selectElem) return;
        const selectedOpt = selectElem.options[selectElem.selectedIndex];
        const notesInput = document.getElementById('sched-notes');
        if (notesInput && selectedOpt) {
            if (selectedOpt.value) {
                const title = selectedOpt.getAttribute('data-title') || selectedOpt.text.replace(/^#\d+\s*-\s*/, '');
                notesInput.value = `Milestone: ${title}`;
            } else {
                notesInput.value = '';
            }
        }
    },

    onDateChanged(newDate) {
        if (newDate) {
            const dateObj = new Date(newDate + 'T00:00:00');
            const dayNameSpan = document.getElementById('sched-day-name');
            if (dayNameSpan && !isNaN(dateObj.getTime())) {
                dayNameSpan.textContent = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
            }
        }
        const slot = this.getNextAvailableTimeSlot(newDate);
        const startInput = document.getElementById('sched-start');
        const endInput = document.getElementById('sched-end');
        if (startInput && endInput && !endInput.dataset.manuallyChanged) {
            startInput.value = slot.start;
            endInput.value = slot.end;
            this.setPresetTime(slot.start, slot.end);
        }
    },

    async loadSubjectLessons(subjectId, preselectedLessonId = null) {
        const select = document.getElementById('sched-lesson');
        if (!select || !subjectId) return;

        select.innerHTML = '<option value="">Loading lessons...</option>';
        try {
            const res = await API.get(`/api/curriculum/subjects/${subjectId}/lessons`);
            const lessons = Array.isArray(res.data) ? res.data : (res.data?.lessons || []);
            select.innerHTML = '<option value="">-- No specific lesson milestone --</option>' +
                lessons.map(l => `<option value="${l.lesson_id}" data-title="${App.escapeHtml(l.lesson_title)}" ${l.lesson_id == preselectedLessonId ? 'selected' : ''}>#${l.sequence_number || 1} - ${App.escapeHtml(l.lesson_title)}</option>`).join('');
            
            if (preselectedLessonId) {
                const matched = lessons.find(l => l.lesson_id == preselectedLessonId);
                const notesInput = document.getElementById('sched-notes');
                if (matched && notesInput && !notesInput.value) {
                    notesInput.value = `Milestone: ${matched.lesson_title}`;
                }
            }
        } catch (err) {
            select.innerHTML = '<option value="">Failed to load lessons</option>';
        }
    },

    async submitScheduleForm(e, scheduleId = null) {
        e.preventDefault();
        const startVal = document.getElementById('sched-start')?.value?.trim() || '';
        const endVal = document.getElementById('sched-end')?.value?.trim() || '';
        const subjVal = document.getElementById('sched-subject-hidden')?.value || document.getElementById('sched-subject')?.value?.trim() || '';
        const lessonVal = document.getElementById('sched-lesson')?.value?.trim() || '';

        const payload = {
            learner_id: parseInt(this.selectedLearnerId),
            scheduled_date: document.getElementById('sched-date').value,
            start_time: startVal ? (startVal.length === 5 ? startVal + ':00' : startVal) : null,
            end_time: endVal ? (endVal.length === 5 ? endVal + ':00' : endVal) : null,
            subject_id: subjVal ? parseInt(subjVal) : null,
            lesson_id: lessonVal ? parseInt(lessonVal) : null,
            notes: document.getElementById('sched-notes')?.value?.trim() || null
        };

        try {
            if (scheduleId && scheduleId !== 'null' && scheduleId !== null) {
                await API.put(`/api/parent/schedule/${scheduleId}`, payload);
            } else {
                await API.post('/api/parent/schedule', payload);
            }
            document.getElementById('schedule-modal-container').innerHTML = '';
            await this.refreshData();
            this.renderView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to save schedule session: ' + (err.message || 'Error occurred'));
        }
    }
};

window.ScheduleApp = ScheduleApp;
