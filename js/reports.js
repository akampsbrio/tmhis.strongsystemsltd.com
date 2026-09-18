/**
 * TMHIS Module 09: Reports, Analytics & MoES Curriculum Compliance Engine
 */

const ReportsApp = {
    cachedData: {},

    // ================= 1. LEARNER TERMINAL REPORT CARD =================
    async initLearnerReportCard(container, learnerId = null, termId = null) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Generating Official Terminal Report Card...</p>
            </div>
        `;

        try {
            let url = learnerId ? `/api/reports/learner/${learnerId}` : '/api/reports/learner';
            if (termId) url += `?term_id=${termId}`;
            const res = await API.get(url);
            const data = res.data;
            this.cachedData.learnerReport = data;
            this.renderLearnerReportCardView(container, data);
        } catch (err) {
            const isParent = App.state && App.state.user && App.state.user.role_code === 'parent';
            container.innerHTML = `
                <div style="display:flex; justify-content:center; align-items:center; min-height:55vh; padding:1.5rem;">
                    <div class="card" style="max-width:560px; width:100%; padding:2.5rem 2rem; text-align:center; background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 10px 25px rgba(0,0,0,0.06);">
                        <div style="font-size:3.2rem; margin-bottom:0.75rem;">📜</div>
                        <h3 style="font-size:1.35rem; font-weight:800; color:#0f172a; margin-bottom:0.5rem;">
                            Report Card Unavailable
                        </h3>
                        <p style="color:#64748b; font-size:0.95rem; line-height:1.5; margin-bottom:1.75rem;">
                            ${App.escapeHtml(err.message || 'Could not retrieve report card records.')}
                        </p>
                        <div style="display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
                            ${isParent ? `<a href="#parent-learners" class="btn btn-primary btn-sm" style="font-weight:600;">➕ Manage Learners</a>` : ''}
                            <a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-weight:600;">🏠 Family Hub</a>
                            <button class="btn btn-secondary btn-sm" onclick="ReportsApp.initLearnerReportCard(document.getElementById('app-content'), ${learnerId ? learnerId : 'null'})">🔄 Retry</button>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    renderLearnerReportCardView(container, data) {
        const meta = data.meta || {};
        const learner = data.learner || {};
        const parent = data.parent || {};
        const summary = data.summary || {};
        const subjects = data.subjects || [];
        const isParent = App.state && App.state.user && App.state.user.role_code === 'parent';

        container.innerHTML = `
            <!-- Top Action Header -->
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        Terminal Report Card & Gradebook 📜
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        ${App.escapeHtml(meta.term_name)} &bull; Academic Year ${App.escapeHtml(meta.academic_year)} &bull; Uganda NCDC Standard
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    ${isParent ? `<a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-weight:600;">← Family Hub</a>` : ''}
                    <button class="btn btn-primary btn-sm" style="font-weight:600; display:inline-flex; align-items:center; gap:6px;" onclick="ReportsApp.openPrintableReportPDF('learner', { id: ${learner.learner_id} })">
                        <span>🖨️</span> Print / Save Official PDF
                    </button>
                    <a href="#learner-progress" class="btn btn-secondary btn-sm" style="font-weight:600;">📊 Live Dashboard</a>
                </div>
            </div>

            <!-- Report Card Container -->
            <div class="card" style="background:#fff; border-radius:14px; border:1px solid #e2e8f0; padding:2rem; box-shadow:0 4px 20px rgba(0,0,0,0.04); margin-bottom:2rem;">
                
                <!-- Official Header Bar -->
                <div style="border-bottom:2px solid #2563eb; padding-bottom:1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="font-size:0.75rem; font-weight:800; color:#2563eb; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.2rem;">
                            OFFICIAL HOMESCHOOLING ATTAINMENT TRANSCRIPT
                        </div>
                        <h2 style="font-size:1.35rem; font-weight:900; color:#0f172a; margin:0 0 0.2rem 0;">
                            ${App.escapeHtml(meta.institution_name)}
                        </h2>
                        <p style="font-size:0.85rem; color:#64748b; margin:0;">
                            ${App.escapeHtml(meta.ministry_affiliation)}
                        </p>
                    </div>
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:0.6rem 1rem; text-align:right;">
                        <div style="font-size:0.72rem; font-weight:700; color:#1e40af; text-transform:uppercase;">UNEB DIVISION STANDING</div>
                        <div style="font-size:1.15rem; font-weight:900; color:#1e40af;">
                            ${App.escapeHtml(summary.uneb_division)}
                        </div>
                        <div style="font-size:0.75rem; color:#64748b;">
                            Aggregates: <strong>${summary.total_exam_aggregates !== null ? summary.total_exam_aggregates : 'Continuous Mode'}</strong>
                        </div>
                    </div>
                </div>

                <!-- Student & Guardian Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; margin-bottom:1.5rem; font-size:0.88rem;">
                    <div>
                        <span style="display:block; font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">Learner Name</span>
                        <strong style="color:#0f172a; font-size:1rem;">${App.escapeHtml(learner.full_name)}</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">Class / Grade Level</span>
                        <strong style="color:#0f172a;">Class ${App.escapeHtml(learner.class_code)} (${App.escapeHtml(learner.class_name)})</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">Date of Birth / Gender</span>
                        <strong style="color:#0f172a;">${App.escapeHtml(learner.date_of_birth)} &bull; ${App.escapeHtml(learner.gender)}</strong>
                    </div>
                    <div>
                        <span style="display:block; font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">Parent / Guardian</span>
                        <strong style="color:#0f172a;">${App.escapeHtml(parent.full_name)} (${App.escapeHtml(parent.district || 'Uganda')})</strong>
                    </div>
                </div>

                <!-- Macro KPI Summary -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                    <div style="padding:1rem; background:#fff; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:8px;">
                        <div style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Syllabus Coverage</div>
                        <div style="font-size:1.6rem; font-weight:800; color:#0f172a;">${summary.completion_percentage}%</div>
                        <div style="font-size:0.78rem; color:#64748b;">${summary.completed_lessons} of ${summary.expected_lessons} lessons completed</div>
                    </div>
                    <div style="padding:1rem; background:#fff; border:1px solid #e2e8f0; border-left:4px solid #10b981; border-radius:8px;">
                        <div style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Quiz Assessment Avg</div>
                        <div style="font-size:1.6rem; font-weight:800; color:#0f172a;">${summary.weighted_quiz_percentage !== null ? summary.weighted_quiz_percentage + '%' : 'N/A'}</div>
                        <div style="font-size:0.78rem; color:#10b981; font-weight:600;">Continuous Formative Average</div>
                    </div>
                    <div style="padding:1rem; background:#fff; border:1px solid #e2e8f0; border-left:4px solid #f59e0b; border-radius:8px;">
                        <div style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Study Hours Logged</div>
                        <div style="font-size:1.6rem; font-weight:800; color:#0f172a;">${summary.total_hours_spent} <span style="font-size:0.9rem; color:#64748b;">hrs</span></div>
                        <div style="font-size:0.78rem; color:#64748b;">${summary.total_time_spent_minutes} minutes active reading</div>
                    </div>
                </div>

                <!-- Subject Grades Table -->
                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                    📚 Subject Attainment & Formative Assessment Breakdown
                </h3>
                <div style="overflow-x:auto; margin-bottom:1.5rem;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                        <thead>
                            <tr style="background:#f1f5f9; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569; font-size:0.78rem; text-transform:uppercase;">
                                <th style="padding:0.75rem 0.85rem;">Subject Name</th>
                                <th style="padding:0.75rem 0.85rem;">Code</th>
                                <th style="padding:0.75rem 0.85rem; text-align:center;">Expected</th>
                                <th style="padding:0.75rem 0.85rem; text-align:center;">Completed</th>
                                <th style="padding:0.75rem 0.85rem;">Syllabus %</th>
                                <th style="padding:0.75rem 0.85rem; text-align:center;">Quiz %</th>
                                <th style="padding:0.75rem 0.85rem; text-align:center;">Exam Grade</th>
                                <th style="padding:0.75rem 0.85rem;">Competency Standing</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subjects.map(s => {
                                const pct = s.completion_percentage || 0;
                                const qAvg = s.quiz_average_percentage !== null && s.quiz_average_percentage !== undefined ? `${s.quiz_average_percentage}%` : '—';
                                const grade = s.exam_grade ? `${s.exam_grade} (Agg ${s.exam_aggregate})` : '—';
                                return `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:0.75rem 0.85rem; font-weight:700; color:#0f172a;">${App.escapeHtml(s.subject_name)}</td>
                                        <td style="padding:0.75rem 0.85rem; color:#64748b; font-size:0.8rem;">${App.escapeHtml(s.subject_code)}</td>
                                        <td style="padding:0.75rem 0.85rem; text-align:center;">${s.expected_lessons}</td>
                                        <td style="padding:0.75rem 0.85rem; text-align:center; font-weight:700;">${s.completed_lessons}</td>
                                        <td style="padding:0.75rem 0.85rem;">
                                            <strong>${pct}%</strong>
                                            <div style="height:6px; width:60px; background:#e2e8f0; border-radius:3px; display:inline-block; vertical-align:middle; margin-left:6px; overflow:hidden;">
                                                <div style="height:100%; width:${Math.min(100, pct)}%; background:#2563eb;"></div>
                                            </div>
                                        </td>
                                        <td style="padding:0.75rem 0.85rem; text-align:center; font-weight:700;">${qAvg}</td>
                                        <td style="padding:0.75rem 0.85rem; text-align:center; font-weight:800; color:#1e40af;">${grade}</td>
                                        <td style="padding:0.75rem 0.85rem;">
                                            <span style="font-size:0.75rem; background:#f0fdf4; color:#15803d; padding:0.2rem 0.5rem; border-radius:4px; font-weight:600;">
                                                ${App.escapeHtml(s.competency_remark)}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Qualitative Remarks & Signatures -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:1.25rem; margin-bottom:1.5rem;">
                    <h4 style="font-size:0.92rem; font-weight:800; color:#0f172a; margin:0 0 0.5rem 0;">
                        📝 Academic Supervisor Remarks
                    </h4>
                    <p style="font-size:0.88rem; color:#334155; margin:0; line-height:1.5;">
                        ${App.escapeHtml(summary.general_comment)}
                    </p>
                </div>

                <!-- Footer Signatures -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1.5rem; border-top:1px dashed #cbd5e1; padding-top:1.5rem; text-align:center; font-size:0.8rem; color:#64748b;">
                    <div>
                        <div style="border-top:1px solid #94a3b8; margin-top:2rem; padding-top:0.4rem; font-weight:700; color:#0f172a;">
                            Homeschool Facilitator / Parent
                        </div>
                    </div>
                    <div>
                        <div style="border-top:1px solid #94a3b8; margin-top:2rem; padding-top:0.4rem; font-weight:700; color:#0f172a;">
                            Academic Supervisor / Teacher
                        </div>
                    </div>
                    <div>
                        <div style="border-top:1px solid #94a3b8; margin-top:2rem; padding-top:0.4rem; font-weight:700; color:#0f172a;">
                            Official TMHIS Stamp & Seal
                        </div>
                    </div>
                </div>

            </div>
        `;
    },

    // ================= 2. PARENT FAMILY MULTI-LEARNER REPORT =================
    async initParentFamilyReport(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Aggregating family homeschooling reports...</p>
            </div>
        `;

        try {
            const res = await API.get('/api/reports/parent');
            const data = res.data;
            this.cachedData.parentReport = data;
            this.renderParentFamilyReportView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load family report</h4>
                    <p>${App.escapeHtml(err.message || 'Could not aggregate family progress.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ReportsApp.initParentFamilyReport(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    renderParentFamilyReportView(container, data) {
        const meta = data.meta || {};
        const parent = data.parent || {};
        const summary = data.summary || {};
        const children = data.children || [];

        container.innerHTML = `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        Family Multi-Learner Progress Report 🏡
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        Comprehensive academic audit for all children registered under ${App.escapeHtml(parent.full_name)}.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-weight:600;">← Family Hub</a>
                    <button class="btn btn-primary btn-sm" style="font-weight:600;" onclick="ReportsApp.openPrintableReportPDF('parent')">
                        <span>🖨️</span> Print Family Summary
                    </button>
                </div>
            </div>

            <!-- Family Macro Grid -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Registered Children</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.total_children}</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Total Completed Units</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.total_completed_lessons} / ${summary.total_expected_lessons}</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #f59e0b;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Family Syllabus Coverage</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.overall_completion_percentage}%</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Family Study Hours</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.total_study_hours} <span style="font-size:1rem; color:#64748b;">hrs</span></div>
                </div>
            </div>

            <!-- Children List Cards -->
            <div style="display:flex; flex-direction:column; gap:1rem;">
                ${children.map(c => `
                    <div class="card" style="padding:1.25rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <img src="${App.escapeHtml(c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name)}&background=2563eb&color=fff`)}" 
                                 alt="Avatar" style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid #2563eb;">
                            <div>
                                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                                    ${App.escapeHtml(c.full_name)}
                                </h3>
                                <p style="font-size:0.82rem; color:#64748b; margin:0;">
                                    Class <strong>${App.escapeHtml(c.class_code)} (${App.escapeHtml(c.class_name)})</strong> &bull; ${c.subjects_count} Subjects &bull; ${c.time_spent_hours} hrs studied
                                </p>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
                            <div style="text-align:right;">
                                <div style="font-size:1.2rem; font-weight:800; color:#2563eb;">${c.completion_percentage}%</div>
                                <div style="font-size:0.75rem; color:#64748b;">${c.completed_lessons} of ${c.expected_lessons} units</div>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-primary btn-sm" onclick="ReportsApp.initLearnerReportCard(document.getElementById('app-content'), ${c.learner_id})">
                                    📜 View Terminal Report Card
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="ReportsApp.openPrintableReportPDF('learner', { id: ${c.learner_id} })" title="Print PDF">
                                    🖨️ PDF
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ================= 3. TEACHER CLASS DIAGNOSTIC SUMMARY =================
    async initTeacherClassReport(container, classId = 1) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Generating Class Pacing & Diagnostic Report...</p>
            </div>
        `;

        try {
            const res = await API.get(`/api/reports/class-summary?class_id=${classId}`);
            const data = res.data;
            this.cachedData.classReport = data;
            this.renderTeacherClassReportView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load class report</h4>
                    <p>${App.escapeHtml(err.message || 'Could not load class records.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ReportsApp.initTeacherClassReport(document.getElementById('app-content'), ${classId})">Retry</button>
                </div>
            `;
        }
    },

    renderTeacherClassReportView(container, data) {
        const meta = data.meta || {};
        const cls = data.class || {};
        const summary = data.summary || {};
        const roster = data.roster || [];
        const struggling = data.struggling_topics || [];

        container.innerHTML = `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        Class Diagnostic & Pacing Summary 👩‍🏫
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        Class <strong>${App.escapeHtml(cls.class_code)} (${App.escapeHtml(cls.class_name)})</strong> &bull; District: ${App.escapeHtml(cls.district_filter)}
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="/api/reports/class-summary/export?class_id=${cls.class_id}&format=csv" class="btn btn-secondary btn-sm" style="font-weight:600;">
                        📥 Export CSV
                    </a>
                    <button class="btn btn-primary btn-sm" style="font-weight:600;" onclick="ReportsApp.openPrintableReportPDF('class_summary', { class_id: ${cls.class_id} })">
                        <span>🖨️</span> Print Diagnostic Summary
                    </button>
                </div>
            </div>

            <!-- Class Level Selector -->
            <div style="display:flex; gap:0.4rem; margin-bottom:1.5rem; flex-wrap:wrap;">
                ${[1, 2, 3, 4, 5, 6, 7].map(lvl => `
                    <button class="btn ${cls.class_level === lvl ? 'btn-primary' : 'btn-secondary'} btn-sm" style="font-weight:700;" onclick="ReportsApp.initTeacherClassReport(document.getElementById('app-content'), ${lvl})">
                        P${lvl}
                    </button>
                `).join('')}
            </div>

            <!-- KPI Cards -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Learners Monitored</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.total_learners}</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #ef4444;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">At-Risk Learners</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#ef4444;">${summary.at_risk_count}</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Average Coverage</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.average_completion_percentage}%</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Average Score</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.average_quiz_score !== null ? summary.average_quiz_score + '%' : 'N/A'}</div>
                </div>
            </div>

            <!-- Struggling Topics Heatmap -->
            ${struggling.length > 0 ? `
                <div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem;">
                    <h4 style="color:#991b1b; font-size:0.95rem; font-weight:800; margin:0 0 0.5rem 0;">
                        ⚠️ Topic Comprehension Deficits (Pass Rate < 60%)
                    </h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:0.75rem;">
                        ${struggling.map(st => `
                            <div style="background:#fff; border:1px solid #fca5a5; padding:0.6rem 0.9rem; border-radius:8px; font-size:0.82rem;">
                                <div style="font-weight:700; color:#0f172a;">${App.escapeHtml(st.title)}</div>
                                <div style="color:#64748b; font-size:0.75rem; margin-bottom:0.3rem;">${App.escapeHtml(st.subject_name)} (${App.escapeHtml(st.subject_code)})</div>
                                <div style="font-weight:700; color:#b91c1c;">
                                    Pass Rate: ${st.pass_rate}% &bull; Avg Score: ${st.average_percentage}%
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Roster Table -->
            <div class="card" style="padding:1.4rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                    👥 Learner Roster & Pacing Gradebook
                </h3>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569; font-size:0.78rem; text-transform:uppercase;">
                                <th style="padding:0.75rem;">Learner</th>
                                <th style="padding:0.75rem;">Parent / District</th>
                                <th style="padding:0.75rem; text-align:center;">Units Done</th>
                                <th style="padding:0.75rem;">Coverage %</th>
                                <th style="padding:0.75rem; text-align:center;">Score Avg</th>
                                <th style="padding:0.75rem; text-align:center;">Status</th>
                                <th style="padding:0.75rem; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roster.map(r => `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:0.75rem; font-weight:700; color:#0f172a;">${App.escapeHtml(r.full_name)}</td>
                                    <td style="padding:0.75rem; color:#64748b;">${App.escapeHtml(r.parent_name)} (${App.escapeHtml(r.district)})</td>
                                    <td style="padding:0.75rem; text-align:center;">${r.completed_lessons}/${r.expected_lessons}</td>
                                    <td style="padding:0.75rem; font-weight:700; color:#2563eb;">${r.completion_percentage}%</td>
                                    <td style="padding:0.75rem; text-align:center; font-weight:700;">${r.weighted_quiz_percentage !== null ? r.weighted_quiz_percentage + '%' : '—'}</td>
                                    <td style="padding:0.75rem; text-align:center;">
                                        ${r.is_at_risk ? `
                                            <span style="background:#fef2f2; color:#b91c1c; font-size:0.72rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #fecaca;">
                                                ⚠️ ${App.escapeHtml(r.risk_reason)}
                                            </span>
                                        ` : `
                                            <span style="background:#f0fdf4; color:#15803d; font-size:0.72rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:4px;">
                                                ✅ On Track
                                            </span>
                                        `}
                                    </td>
                                    <td style="padding:0.75rem; text-align:right;">
                                        <button class="btn btn-secondary btn-sm" onclick="ReportsApp.initLearnerReportCard(document.getElementById('app-content'), ${r.learner_id})">
                                            📜 Report Card
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ================= 4. NATIONAL MOES COMPLIANCE DASHBOARD =================
    async initComplianceDashboard(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading National Homeschooling Compliance & Attainment Data...</p>
            </div>
        `;

        try {
            const res = await API.get('/api/reports/compliance');
            const data = res.data;
            this.cachedData.complianceReport = data;
            this.renderComplianceDashboardView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load compliance audit</h4>
                    <p>${App.escapeHtml(err.message || 'Could not load national statistics.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ReportsApp.initComplianceDashboard(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    renderComplianceDashboardView(container, data) {
        const meta = data.meta || {};
        const summary = data.summary || {};
        const students = data.students || data.learners || data.district_sectors || [];
        const targets = summary.benchmark_targets || {};

        container.innerHTML = `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        National Student Curriculum Compliance Audit 🏛️
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        Uganda Ministry of Education & Sports (MoES) &bull; NCDC Primary Standards Attainment Tracking (Student-Level Audit)
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="/api/reports/compliance/export?format=csv" class="btn btn-secondary btn-sm" style="font-weight:600;">
                        📥 Export Students CSV
                    </a>
                    <button class="btn btn-primary btn-sm" style="font-weight:600;" onclick="ReportsApp.openPrintableReportPDF('compliance')">
                        <span>🖨️</span> Print Compliance Audit
                    </button>
                </div>
            </div>

            <!-- National Benchmark Targets Bar -->
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h4 style="font-size:0.95rem; font-weight:800; color:#1e40af; margin:0 0 0.2rem 0;">
                        🎯 Active MoES Quality Benchmarks
                    </h4>
                    <p style="font-size:0.82rem; color:#3b82f6; margin:0;">
                        Target Syllabus Coverage: <strong>${targets.min_coverage_percentage}%</strong> &bull; Minimum Pass Rate: <strong>${targets.min_pass_rate}%</strong> &bull; Term Hours: <strong>${targets.min_study_hours} hrs</strong>
                    </p>
                </div>
                <div>
                    <span style="font-size:0.8rem; background:#2563eb; color:#fff; font-weight:700; padding:0.35rem 0.8rem; border-radius:6px;">
                        Student Compliance Rate: ${summary.overall_compliance_rate}%
                    </span>
                </div>
            </div>

            <!-- Macro Metric Grid -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Monitored Students</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${summary.total_monitored_students || summary.total_active_learners || students.length}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Homeschool Parents</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${summary.total_active_parents}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #f59e0b;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Avg Syllabus Coverage</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${summary.national_coverage_percentage || summary.average_coverage_percentage}%</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #ef4444;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Flagged / At-Risk</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#ef4444;">${summary.non_compliant_students_count ?? summary.non_compliant_sectors_count ?? 0}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Total Study Time</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${summary.total_national_study_hours} <span style="font-size:0.85rem; color:#64748b;">hrs</span></div>
                </div>
            </div>

            <!-- Student Audit Roster Card -->
            <div class="card" style="padding:1.4rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0;">
                        🇺🇬 Student-by-Student Curriculum Compliance Roster
                    </h3>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <input type="text" id="compliance-student-filter" placeholder="🔍 Search student or class..." 
                            style="padding:0.4rem 0.75rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; min-width:220px;"
                            oninput="ReportsApp.filterComplianceStudents(this.value)">
                    </div>
                </div>

                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem;" id="compliance-students-table">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569; font-size:0.78rem; text-transform:uppercase;">
                                <th style="padding:0.75rem;">Student Name</th>
                                <th style="padding:0.75rem;">Class / Grade</th>
                                <th style="padding:0.75rem;">Parent / Contact</th>
                                <th style="padding:0.75rem;">Syllabus Coverage %</th>
                                <th style="padding:0.75rem; text-align:center;">Quiz Avg %</th>
                                <th style="padding:0.75rem; text-align:center;">Study Time</th>
                                <th style="padding:0.75rem;">MoES Compliance Status</th>
                                <th style="padding:0.75rem; text-align:center;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map(s => {
                                const issues = s.compliance_issues || [];
                                const issueTooltip = issues.length > 0 ? issues.join('; ') : 'Meets all MoES statutory benchmarks';
                                return `
                                <tr class="compliance-row" data-search="${App.escapeHtml((s.full_name || s.learner_name || '') + ' ' + (s.class_code || '') + ' ' + (s.parent_name || '')).toLowerCase()}" style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:0.75rem; font-weight:700; color:#0f172a;">
                                        ${App.escapeHtml(s.full_name || s.learner_name || 'Learner')}
                                        <div style="font-size:0.75rem; color:#64748b; font-weight:400;">${App.escapeHtml(s.student_number || ('ID: #' + s.learner_id))}</div>
                                    </td>
                                    <td style="padding:0.75rem; color:#475569;">
                                        Class <strong>${App.escapeHtml(s.class_code || '')}</strong>
                                        <div style="font-size:0.75rem; color:#64748b;">${App.escapeHtml(s.class_name || '')}</div>
                                    </td>
                                    <td style="padding:0.75rem; color:#64748b;">
                                        <strong>${App.escapeHtml(s.parent_name || 'Guardian')}</strong>
                                        <div style="font-size:0.75rem; color:#94a3b8;">${App.escapeHtml(s.parent_phone || s.parent_email || '—')}</div>
                                    </td>
                                    <td style="padding:0.75rem;">
                                        <strong>${s.coverage_percentage ?? 0}%</strong>
                                        <div style="height:6px; width:70px; background:#e2e8f0; border-radius:3px; display:inline-block; vertical-align:middle; margin-left:6px; overflow:hidden;">
                                            <div style="height:100%; width:${Math.min(100, s.coverage_percentage ?? 0)}%; background:${s.is_compliant ? '#16a34a' : '#ef4444'};"></div>
                                        </div>
                                        <div style="font-size:0.72rem; color:#94a3b8;">${s.completed_lessons ?? 0}/${s.expected_lessons ?? 0} lessons</div>
                                    </td>
                                    <td style="padding:0.75rem; text-align:center; font-weight:700;">
                                        ${s.quiz_average_percentage !== null && s.quiz_average_percentage !== undefined ? s.quiz_average_percentage + '%' : '—'}
                                    </td>
                                    <td style="padding:0.75rem; text-align:center; font-weight:600; color:#334155;">
                                        ${s.total_study_hours ?? 0} <span style="font-size:0.75rem; color:#64748b;">hrs</span>
                                    </td>
                                    <td style="padding:0.75rem;">
                                        ${s.is_compliant ? `
                                            <span style="background:#f0fdf4; color:#15803d; font-size:0.75rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:6px; display:inline-flex; align-items:center; gap:4px;" title="${App.escapeHtml(issueTooltip)}">
                                                ✅ Compliant
                                            </span>
                                        ` : `
                                            <span style="background:#fef2f2; color:#b91c1c; font-size:0.75rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:6px; border:1px solid #fecaca; display:inline-flex; align-items:center; gap:4px;" title="${App.escapeHtml(issueTooltip)}">
                                                ⚠️ Non-Compliant
                                            </span>
                                            <div style="font-size:0.72rem; color:#dc2626; margin-top:2px;">${App.escapeHtml(issues[0] || 'Flagged')}</div>
                                        `}
                                    </td>
                                    <td style="padding:0.75rem; text-align:center;">
                                        <button class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="ReportsApp.openPrintableReportPDF('learner', { id: ${s.learner_id} })" title="View Official Report Card">
                                            📄 Report
                                        </button>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    filterComplianceStudents(query) {
        const q = (query || '').toLowerCase().trim();
        const rows = document.querySelectorAll('#compliance-students-table .compliance-row');
        rows.forEach(row => {
            const text = row.getAttribute('data-search') || '';
            if (!q || text.includes(q)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },

    // ================= 5. HIGH-FIDELITY PRINTABLE / PDF GENERATOR =================
    async openPrintableReportPDF(type, params = {}) {
        try {
            let url = '';
            if (type === 'learner') {
                url = params.id ? `/api/reports/learner/${params.id}` : '/api/reports/learner';
            } else if (type === 'parent') {
                url = '/api/reports/parent';
            } else if (type === 'class_summary') {
                url = `/api/reports/class-summary?class_id=${params.class_id || 1}`;
            } else if (type === 'compliance') {
                url = '/api/reports/compliance';
            }

            const res = await API.get(url);
            const r = res.data;
            const meta = r.meta || {};

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Please allow popups to open the printable report.');
                return;
            }

            let bodyHtml = '';
            if (type === 'learner') {
                const learner = r.learner || {};
                const parent = r.parent || {};
                const summary = r.summary || {};
                const subjects = r.subjects || [];
                bodyHtml = `
                    <div class="grid-info">
                        <div class="info-cell"><span>Learner Name</span><strong>${App.escapeHtml(learner.full_name)}</strong></div>
                        <div class="info-cell"><span>Class / Grade</span><strong>Class ${App.escapeHtml(learner.class_code)} (${App.escapeHtml(learner.class_name)})</strong></div>
                        <div class="info-cell"><span>Date of Birth</span><strong>${App.escapeHtml(learner.date_of_birth)} (${App.escapeHtml(learner.gender)})</strong></div>
                        <div class="info-cell"><span>Guardian / Location</span><strong>${App.escapeHtml(parent.full_name)} (${App.escapeHtml(parent.district || 'Uganda')})</strong></div>
                    </div>
                    <div class="kpi-row">
                        <div class="kpi-card blue"><div class="kpi-title">Syllabus Coverage</div><div class="kpi-val">${summary.completion_percentage}%</div><div class="kpi-sub">${summary.completed_lessons}/${summary.expected_lessons} units</div></div>
                        <div class="kpi-card green"><div class="kpi-title">Quiz Average</div><div class="kpi-val">${summary.weighted_quiz_percentage !== null ? summary.weighted_quiz_percentage + '%' : 'N/A'}</div><div class="kpi-sub">Continuous Assessment</div></div>
                        <div class="kpi-card purple"><div class="kpi-title">UNEB Division</div><div class="kpi-val" style="font-size:14px;">${App.escapeHtml(summary.uneb_division)}</div><div class="kpi-sub">Aggregates: ${summary.total_exam_aggregates || 'N/A'}</div></div>
                        <div class="kpi-card amber"><div class="kpi-title">Study Hours</div><div class="kpi-val">${summary.total_hours_spent} hrs</div><div class="kpi-sub">${summary.total_time_spent_minutes} mins</div></div>
                    </div>
                    <div class="section-title"><span>📚 Subject Performance Breakdown</span></div>
                    <table>
                        <thead><tr><th>Subject</th><th>Code</th><th style="text-align:center;">Expected</th><th style="text-align:center;">Completed</th><th>Coverage %</th><th style="text-align:center;">Quiz %</th><th style="text-align:center;">Exam Grade</th><th>Remarks</th></tr></thead>
                        <tbody>
                            ${subjects.map(s => `
                                <tr>
                                    <td><strong>${App.escapeHtml(s.subject_name)}</strong></td>
                                    <td>${App.escapeHtml(s.subject_code)}</td>
                                    <td style="text-align:center;">${s.expected_lessons}</td>
                                    <td style="text-align:center; font-weight:700;">${s.completed_lessons}</td>
                                    <td><strong>${s.completion_percentage}%</strong></td>
                                    <td style="text-align:center;">${s.quiz_average_percentage !== null ? s.quiz_average_percentage + '%' : '—'}</td>
                                    <td style="text-align:center; font-weight:700; color:#1e40af;">${s.exam_grade ? s.exam_grade + ' (Agg ' + s.exam_aggregate + ')' : '—'}</td>
                                    <td>${App.escapeHtml(s.competency_remark)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px 14px; border-radius:6px; margin-top:10px;">
                        <strong style="font-size:10px; color:#64748b; text-transform:uppercase; display:block;">Academic Supervisor Remarks</strong>
                        <p style="margin:4px 0 0 0; font-size:11px;">${App.escapeHtml(summary.general_comment)}</p>
                    </div>
                `;
            } else if (type === 'parent') {
                const parent = r.parent || {};
                const summary = r.summary || {};
                const children = r.children || [];
                bodyHtml = `
                    <div class="grid-info">
                        <div class="info-cell"><span>Parent / Guardian</span><strong>${App.escapeHtml(parent.full_name)}</strong></div>
                        <div class="info-cell"><span>District</span><strong>${App.escapeHtml(parent.district || 'Uganda')}</strong></div>
                        <div class="info-cell"><span>Contact Phone</span><strong>${App.escapeHtml(parent.phone || 'N/A')}</strong></div>
                        <div class="info-cell"><span>Registered Learners</span><strong>${children.length} Children</strong></div>
                    </div>
                    <div class="kpi-row">
                        <div class="kpi-card blue"><div class="kpi-title">Family Coverage</div><div class="kpi-val">${summary.overall_completion_percentage}%</div><div class="kpi-sub">${summary.total_completed_lessons}/${summary.total_expected_lessons} lessons</div></div>
                        <div class="kpi-card green"><div class="kpi-title">Family Quiz Avg</div><div class="kpi-val">${summary.overall_quiz_average !== null ? summary.overall_quiz_average + '%' : 'N/A'}</div><div class="kpi-sub">Weighted accuracy</div></div>
                        <div class="kpi-card amber"><div class="kpi-title">Family Study Time</div><div class="kpi-val">${summary.total_study_hours} hrs</div><div class="kpi-sub">${summary.total_time_spent_minutes} minutes</div></div>
                        <div class="kpi-card purple"><div class="kpi-title">Total Children</div><div class="kpi-val">${summary.total_children}</div><div class="kpi-sub">Primary levels</div></div>
                    </div>
                    <div class="section-title"><span>👧 Individual Learner Milestones</span></div>
                    <table>
                        <thead><tr><th>Learner</th><th>Class</th><th style="text-align:center;">Units Done</th><th>Coverage %</th><th style="text-align:center;">Quiz %</th><th style="text-align:center;">Study Time</th><th>Pacing Status</th></tr></thead>
                        <tbody>
                            ${children.map(c => `
                                <tr>
                                    <td><strong>${App.escapeHtml(c.full_name)}</strong></td>
                                    <td>Class ${App.escapeHtml(c.class_code)} (${App.escapeHtml(c.class_name)})</td>
                                    <td style="text-align:center;">${c.completed_lessons}/${c.expected_lessons}</td>
                                    <td><strong>${c.completion_percentage}%</strong></td>
                                    <td style="text-align:center;">${c.weighted_quiz_percentage !== null ? c.weighted_quiz_percentage + '%' : '—'}</td>
                                    <td style="text-align:center;">${c.time_spent_hours} hrs</td>
                                    <td>${App.escapeHtml(c.status)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else if (type === 'compliance') {
                const summary = r.summary || {};
                const students = r.students || r.learners || r.district_sectors || [];
                const targets = summary.benchmark_targets || {};
                bodyHtml = `
                    <div class="kpi-row">
                        <div class="kpi-card blue"><div class="kpi-title">Monitored Students</div><div class="kpi-val">${summary.total_monitored_students || summary.total_active_learners || students.length}</div><div class="kpi-sub">National homeschooling</div></div>
                        <div class="kpi-card green"><div class="kpi-title">Avg Coverage</div><div class="kpi-val">${summary.national_coverage_percentage || summary.average_coverage_percentage}%</div><div class="kpi-sub">Target: ${targets.min_coverage_percentage}%</div></div>
                        <div class="kpi-card purple"><div class="kpi-title">Compliance Rate</div><div class="kpi-val">${summary.overall_compliance_rate}%</div><div class="kpi-sub">MoES standard</div></div>
                        <div class="kpi-card amber"><div class="kpi-title">Total Study Time</div><div class="kpi-val">${summary.total_national_study_hours} hrs</div><div class="kpi-sub">National study hours</div></div>
                    </div>
                    <div class="section-title"><span>🇺🇬 Student-by-Student MoES Curriculum Compliance & Attainment Audit</span></div>
                    <table>
                        <thead><tr><th>Student Name</th><th>Class</th><th>Parent / Guardian</th><th>Lessons</th><th>Coverage %</th><th style="text-align:center;">Quiz %</th><th style="text-align:center;">Study Time</th><th>Compliance</th></tr></thead>
                        <tbody>
                            ${students.map(s => `
                                <tr>
                                    <td><strong>${App.escapeHtml(s.full_name || s.learner_name || 'Learner')}</strong><br><small style="color:#64748b;">${App.escapeHtml(s.student_number || ('#' + s.learner_id))}</small></td>
                                    <td>Class ${App.escapeHtml(s.class_code || '')}</td>
                                    <td>${App.escapeHtml(s.parent_name || 'Guardian')}<br><small style="color:#64748b;">${App.escapeHtml(s.parent_phone || '')}</small></td>
                                    <td style="text-align:center;">${s.completed_lessons || 0}/${s.expected_lessons || 0}</td>
                                    <td><strong>${s.coverage_percentage || 0}%</strong></td>
                                    <td style="text-align:center;">${s.quiz_average_percentage !== null && s.quiz_average_percentage !== undefined ? s.quiz_average_percentage + '%' : '—'}</td>
                                    <td style="text-align:center;">${s.total_study_hours || 0} hrs</td>
                                    <td><span class="badge ${s.is_compliant ? 'badge-green' : 'badge-amber'}">${s.is_compliant ? 'Compliant' : 'Flagged'}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }

            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${App.escapeHtml(meta.report_title || 'Official TMHIS Report')}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #f8fafc; margin: 0; padding: 20px; font-size: 11px; line-height: 1.4; }
        .report-page { max-width: 860px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
        .action-bar { max-width: 860px; margin: 0 auto 15px auto; display: flex; justify-content: space-between; align-items: center; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; cursor: pointer; border: none; }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-secondary { background: #e2e8f0; color: #334155; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 17px; font-weight: 800; color: #1e3a8a; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .header p { margin: 0; color: #64748b; font-size: 11px; font-weight: 500; }
        .seal { background: #eff6ff; border: 2px solid #bfdbfe; border-radius: 8px; padding: 6px 12px; text-align: right; }
        .grid-info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
        .info-cell span { display: block; font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .info-cell strong { font-size: 12px; color: #0f172a; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
        .kpi-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; background: #fff; }
        .kpi-card.blue { border-top: 3px solid #2563eb; }
        .kpi-card.green { border-top: 3px solid #10b981; }
        .kpi-card.amber { border-top: 3px solid #f59e0b; }
        .kpi-card.purple { border-top: 3px solid #8b5cf6; }
        .kpi-title { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; }
        .kpi-val { font-size: 17px; font-weight: 800; color: #0f172a; margin: 3px 0; }
        .kpi-sub { font-size: 10px; color: #64748b; }
        .section-title { font-size: 12px; font-weight: 800; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin: 16px 0 10px 0; display: flex; justify-content: space-between; align-items: center; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
        th { background: #f1f5f9; color: #475569; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 10px; text-transform: uppercase; }
        td { padding: 6px 8px; border: 1px solid #e2e8f0; color: #334155; }
        tr:nth-child(even) { background: #fafafa; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
        .badge-green { background: #dcfce7; color: #15803d; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-amber { background: #fef3c7; color: #b45309; }
        .footer-signatures { margin-top: 25px; padding-top: 15px; border-top: 1px dashed #cbd5e1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; font-size: 10px; color: #64748b; }
        .sig-line { border-top: 1px solid #94a3b8; margin-top: 28px; padding-top: 4px; font-weight: 600; color: #334155; }
        @media print {
            body { background: #fff; padding: 0; }
            .action-bar { display: none !important; }
            .report-page { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: 100% !important; }
            @page { size: A4 portrait; margin: 12mm 14mm; }
        }
    </style>
</head>
<body>
    <div class="action-bar">
        <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="btn btn-secondary" onclick="window.close()">❌ Close Window</button>
    </div>
    <div class="report-page">
        <div class="header">
            <div>
                <h1>${App.escapeHtml(meta.institution_name || 'TECHNOLOGY-BASED HOMESCHOOLING INFORMATION SYSTEM (TMHIS)')}</h1>
                <p>${App.escapeHtml(meta.ministry_affiliation || 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard')} &bull; Academic Year ${App.escapeHtml(meta.academic_year || '2026')}</p>
                <div style="font-size:12px; font-weight:700; color:#2563eb; margin-top:4px;">
                    ${App.escapeHtml(meta.report_title || 'Official Academic Attainment Report')}
                </div>
            </div>
            <div class="seal">
                <div style="font-size:9px; font-weight:800; color:#1e40af; text-transform:uppercase;">OFFICIAL MOES TRANSCRIPT</div>
                <div style="font-size:10px; color:#475569;">Generated: ${App.escapeHtml(meta.generated_at)}</div>
            </div>
        </div>

        ${bodyHtml}

        <div class="footer-signatures">
            <div><div class="sig-line">Parent / Facilitator</div><div>Signature & Date</div></div>
            <div><div class="sig-line">Academic Supervisor / Teacher</div><div>Signature & Date</div></div>
            <div><div class="sig-line">Official TMHIS Verification Seal</div><div>Ref: SEC-VER-${Math.random().toString(36).substring(2, 8).toUpperCase()}</div></div>
        </div>
    </div>
    <script>
        window.addEventListener('load', () => {
            setTimeout(() => { window.print(); }, 600);
        });
    </script>
</body>
</html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

        } catch (err) {
            alert('Failed to generate printable report: ' + (err.message || 'Server error'));
        }
    },

    // Aliases for seamless router interoperability
    renderOfficerComplianceView(container) {
        return this.initComplianceDashboard(container);
    },
    renderLearnerReportView(container, learnerId) {
        return this.initLearnerReportCard(container, learnerId);
    },
    renderParentFamilyReportView(container) {
        return this.initParentFamilyReport(container);
    },
    renderTeacherClassReportView(container, classId) {
        return this.initTeacherClassReport(container, classId);
    }
};

window.ReportsApp = ReportsApp;
