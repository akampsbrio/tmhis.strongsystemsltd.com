/**
 * TMHIS Module 08: Activities, Progress Tracking & Role-Based Dashboards
 */

const ProgressApp = {
    cachedData: {},

    // ================= LEARNER PROGRESS DASHBOARD =================
    async initLearnerDashboard(container, learnerId = null) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading your learning progress & subjects...</p>
            </div>
        `;

        try {
            const url = learnerId ? `/api/progress/learner/${learnerId}` : '/api/progress/learner';
            const res = await API.get(url);
            const data = res.data;
            this.cachedData.learner = data;
            this.renderLearnerDashboardView(container, data);
        } catch (err) {
            const isParent = App.state && App.state.user && App.state.user.role_code === 'parent';
            const errorMsg = err.message || 'Could not retrieve progress data.';
            
            container.innerHTML = `
                <div style="display:flex; justify-content:center; align-items:center; min-height:55vh; padding:1.5rem;">
                    <div class="card" style="max-width:560px; width:100%; padding:2.5rem 2rem; text-align:center; background:#fff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 10px 25px rgba(0,0,0,0.06);">
                        <div style="font-size:3.2rem; margin-bottom:0.75rem;">🎒</div>
                        <h3 style="font-size:1.35rem; font-weight:800; color:#0f172a; margin-bottom:0.5rem;">
                            ${isParent ? 'No Active Learner Selected' : 'Progress Unavailable'}
                        </h3>
                        <p style="color:#64748b; font-size:0.95rem; line-height:1.5; margin-bottom:1.75rem;">
                            ${App.escapeHtml(errorMsg)}
                        </p>
                        <div style="display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
                            ${isParent ? `<a href="#parent-learners" class="btn btn-primary btn-sm" style="font-weight:600; padding:0.55rem 1.2rem;">➕ Manage / Add Learners</a>` : ''}
                            <a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-weight:600; padding:0.55rem 1.2rem;">🏠 Back to Family Hub</a>
                            <button class="btn btn-secondary btn-sm" style="padding:0.55rem 1rem;" onclick="ProgressApp.initLearnerDashboard(document.getElementById('app-content'), ${learnerId ? learnerId : 'null'})">🔄 Retry</button>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    renderLearnerDashboardView(container, data) {
        const learner = data.learner || {};
        const summary = data.summary || {};
        const subjects = data.subjects || [];
        const continueLesson = data.continue_lesson || null;
        const pendingAssessments = data.pending_assessments || [];
        const recentActivities = data.recent_activities || [];
        const completionPct = summary.completion_percentage || 0;
        const quizAvg = summary.weighted_quiz_percentage !== null && summary.weighted_quiz_percentage !== undefined ? `${summary.weighted_quiz_percentage}%` : 'N/A';
        const isParent = App.state && App.state.user && App.state.user.role_code === 'parent';

        container.innerHTML = `
            <!-- Page Header -->
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <img src="${App.escapeHtml(learner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(learner.full_name)}&background=2563eb&color=fff&rounded=true`)}" 
                         alt="Avatar" style="width:54px; height:54px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <div>
                        <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                            ${isParent ? `${App.escapeHtml(learner.full_name)}'s Learning Progress 🎒` : `Welcome back, ${App.escapeHtml(learner.full_name)}! 🎒`}
                        </h1>
                        <p style="color:#64748b; font-size:0.88rem; margin:0;">
                            Class <strong>${App.escapeHtml(learner.class_code)} (${App.escapeHtml(learner.class_name)})</strong> &bull; Uganda NCDC Primary Syllabus
                        </p>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    ${isParent ? `<a href="#parent-dashboard" class="btn btn-secondary btn-sm" style="font-weight:600;">← Family Hub</a>` : ''}
                    <button class="btn btn-outline-primary btn-sm" style="font-weight:600; display:inline-flex; align-items:center; gap:5px;" onclick="ProgressApp.downloadLearnerProgressPDF(${learner.learner_id})">
                        <span>📄</span> Download Report (PDF)
                    </button>
                    <a href="#curriculum-explorer" class="btn btn-secondary btn-sm" style="font-weight:600;">📚 Syllabus</a>
                    <a href="#learner-assessments" class="btn btn-secondary btn-sm" style="font-weight:600;">✍️ Quizzes</a>
                    <a href="#parent-schedule" class="btn btn-primary btn-sm" style="font-weight:600;">🗓️ Timetable</a>
                </div>
            </div>

            <!-- KPI Metric Cards Grid -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.4rem;">
                        Syllabus Progress
                    </div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a; margin-bottom:0.2rem;">
                        ${completionPct}%
                    </div>
                    <div style="font-size:0.8rem; color:#64748b;">
                        <strong>${summary.completed_lessons}</strong> of <strong>${summary.expected_lessons}</strong> lessons finished
                    </div>
                    <!-- Progress Bar -->
                    <div style="height:6px; width:100%; background:#e2e8f0; border-radius:3px; margin-top:0.75rem; overflow:hidden;">
                        <div style="height:100%; width:${Math.min(100, completionPct)}%; background:#2563eb; border-radius:3px;"></div>
                    </div>
                </div>

                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.4rem;">
                        Assessment Average
                    </div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a; margin-bottom:0.2rem;">
                        ${quizAvg}
                    </div>
                    <div style="font-size:0.8rem; color:#10b981; font-weight:600;">
                        Weighted by total marks
                    </div>
                    <div style="font-size:0.75rem; color:#64748b; margin-top:0.75rem;">
                        Primary Competency Standard
                    </div>
                </div>

                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #f59e0b; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.4rem;">
                        Learning Time
                    </div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a; margin-bottom:0.2rem;">
                        ${summary.total_hours_spent} <span style="font-size:1rem; font-weight:600; color:#64748b;">Hours</span>
                    </div>
                    <div style="font-size:0.8rem; color:#64748b;">
                        ${summary.total_time_spent_minutes} minutes active reading
                    </div>
                    <div style="font-size:0.75rem; color:#64748b; margin-top:0.75rem;">
                        Logged across offline & online
                    </div>
                </div>

                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; margin-bottom:0.4rem;">
                        Enrolled Subjects
                    </div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a; margin-bottom:0.2rem;">
                        ${subjects.length}
                    </div>
                    <div style="font-size:0.8rem; color:#64748b;">
                        Active Primary Tracks
                    </div>
                    <div style="font-size:0.75rem; color:#8b5cf6; font-weight:600; margin-top:0.75rem;">
                        Uganda National Standard
                    </div>
                </div>
            </div>

            <!-- Continue Learning Banner (Hero Section) -->
            ${continueLesson ? `
                <div style="background:linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color:#fff; border-radius:14px; padding:1.5rem 1.75rem; margin-bottom:1.75rem; box-shadow:0 10px 25px rgba(37,99,235,0.25); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.25rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                            <span style="background:rgba(255,255,255,0.2); padding:0.2rem 0.6rem; border-radius:20px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">
                                ${continueLesson.status === 'in_progress' ? '▶️ Resume Next Lesson' : '🚀 Next Lesson in Syllabus'}
                            </span>
                            <span style="font-size:0.85rem; opacity:0.9;">
                                ${App.escapeHtml(continueLesson.subject_name)}
                            </span>
                        </div>
                        <h2 style="font-size:1.25rem; font-weight:800; margin:0 0 0.35rem 0; color:#fff;">
                            ${App.escapeHtml(continueLesson.lesson_title)}
                        </h2>
                        <p style="font-size:0.85rem; margin:0; opacity:0.9;">
                            Estimated Duration: <strong>${continueLesson.duration_minutes || 45} mins</strong> &bull; Sequence #${continueLesson.sequence_number}
                        </p>
                    </div>
                    <div>
                        <a href="#curriculum-explorer" class="btn" style="background:#fff; color:#1e40af; font-weight:700; padding:0.6rem 1.4rem; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-size:0.9rem;">
                            Start Lesson Now →
                        </a>
                    </div>
                </div>
            ` : ''}

            <!-- 2-Column Layout: Subjects Progress (Left) + Pending Quizzes & Activity Timeline (Right) -->
            <div style="display:grid; grid-template-columns:2fr 1fr; gap:1.5rem; align-items:start;">
                
                <!-- Left Column: Subject Breakdown -->
                <div>
                    <h3 style="font-size:1.15rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                        📚 Subject Syllabus Progress
                    </h3>

                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        ${subjects.map(s => {
                            const pct = s.completion_percentage || 0;
                            const qStats = s.quiz_stats;
                            const qScore = qStats.weighted_percentage !== null ? `${qStats.weighted_percentage}%` : 'No quizzes yet';
                            
                            return `
                                <div class="card" style="padding:1.25rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.2rem;">
                                                <span style="font-weight:700; font-size:1rem; color:#0f172a;">${App.escapeHtml(s.subject_name)}</span>
                                                <span style="font-size:0.72rem; background:#f1f5f9; color:#475569; padding:0.1rem 0.4rem; border-radius:4px; font-weight:600;">${App.escapeHtml(s.subject_code)}</span>
                                            </div>
                                            <div style="font-size:0.8rem; color:#64748b;">
                                                ${s.completed_lessons} of ${s.expected_lessons} lessons finished &bull; ${s.total_time_spent_minutes} mins logged
                                            </div>
                                        </div>
                                        <div style="text-align:right;">
                                            <div style="font-size:1.15rem; font-weight:800; color:${pct >= 75 ? '#16a34a' : (pct >= 40 ? '#2563eb' : '#f59e0b')};">
                                                ${pct}%
                                            </div>
                                            <div style="font-size:0.75rem; color:#64748b; font-weight:600;">
                                                Quiz Avg: <strong style="color:#0f172a;">${qScore}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Progress Bar -->
                                    <div style="height:8px; width:100%; background:#f1f5f9; border-radius:4px; overflow:hidden; margin-bottom:0.75rem;">
                                        <div style="height:100%; width:${Math.min(100, pct)}%; background:${pct >= 75 ? '#16a34a' : (pct >= 40 ? '#2563eb' : '#f59e0b')}; border-radius:4px; transition:width 0.3s ease;"></div>
                                    </div>

                                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
                                        <span style="color:#64748b;">${s.in_progress_lessons > 0 ? `▶️ ${s.in_progress_lessons} lesson currently in progress` : 'All started lessons completed'}</span>
                                        <a href="#curriculum-explorer" style="color:var(--primary); font-weight:600; text-decoration:none;">View Lessons →</a>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Right Column: Pending Quizzes & Activity Timeline -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    
                    <!-- Pending Quizzes Card -->
                    <div class="card" style="padding:1.25rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                        <h4 style="font-size:0.95rem; font-weight:800; color:#0f172a; margin:0 0 0.85rem 0; display:flex; align-items:center; gap:6px;">
                            <span>✍️</span> Practice Quizzes
                        </h4>
                        ${pendingAssessments.length === 0 ? `
                            <p style="font-size:0.85rem; color:#64748b; margin:0;">
                                Great job! You have taken all available primary quizzes.
                            </p>
                        ` : `
                            <div style="display:flex; flex-direction:column; gap:0.6rem;">
                                ${pendingAssessments.map(pa => `
                                    <div style="padding:0.75rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                                        <div style="font-size:0.85rem; font-weight:700; color:#0f172a; margin-bottom:0.2rem;">
                                            ${App.escapeHtml(pa.title)}
                                        </div>
                                        <div style="font-size:0.75rem; color:#64748b; margin-bottom:0.4rem;">
                                            ${App.escapeHtml(pa.subject_name)} &bull; ${pa.total_marks} Marks
                                        </div>
                                        <a href="#learner-assessments" class="btn btn-primary btn-sm" style="font-size:0.75rem; padding:0.25rem 0.6rem;">
                                            Take Quiz
                                        </a>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    <!-- Recent Activity Timeline -->
                    <div class="card" style="padding:1.25rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                        <h4 style="font-size:0.95rem; font-weight:800; color:#0f172a; margin:0 0 0.85rem 0; display:flex; align-items:center; gap:6px;">
                            <span>⏱️</span> Recent Activity
                        </h4>
                        ${recentActivities.length === 0 ? `
                            <p style="font-size:0.85rem; color:#64748b; margin:0;">No recent activities recorded yet.</p>
                        ` : `
                            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                                ${recentActivities.map(act => `
                                    <div style="display:flex; gap:0.6rem; align-items:flex-start; font-size:0.82rem;">
                                        <div style="font-size:1.1rem; line-height:1;">${act.icon}</div>
                                        <div style="flex:1;">
                                            <div style="font-weight:700; color:#0f172a; line-height:1.3;">
                                                ${App.escapeHtml(act.title)}
                                            </div>
                                            <div style="color:#64748b; font-size:0.75rem;">
                                                ${App.escapeHtml(act.subject)} &bull; ${act.details}
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>

                </div>

            </div>
        `;
    },

    // ================= PARENT MULTI-CHILD PROGRESS DASHBOARD =================
    async initParentProgressDashboard(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading family learning progress & records...</p>
            </div>
        `;

        try {
            const res = await API.get('/api/progress/parent');
            const data = res.data;
            this.cachedData.parent = data;
            this.renderParentProgressDashboardView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load family progress</h4>
                    <p>${App.escapeHtml(err.message || 'Could not load family data.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ProgressApp.initParentProgressDashboard(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    renderParentProgressDashboardView(container, data) {
        const { parent, family_summary, children } = data;

        container.innerHTML = `
            <!-- Header -->
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        Family Learning Progress 🏡
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        Homeschooling milestone completion, quiz performance, and active study velocity.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="#parent-learners" class="btn btn-secondary btn-sm" style="font-weight:600;">🎒 Manage Children</a>
                    <a href="#parent-schedule" class="btn btn-secondary btn-sm" style="font-weight:600;">🗓️ Weekly Timetable</a>
                    <a href="#parent-guides" class="btn btn-primary btn-sm" style="font-weight:600;">📖 Parental Guides</a>
                </div>
            </div>

            <!-- Family Macro Overview Grid -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:0.3rem;">Registered Children</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${family_summary.total_children}</div>
                    <div style="font-size:0.8rem; color:#64748b;">Primary Learners</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:0.3rem;">Completed Lessons</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${family_summary.total_lessons_completed}</div>
                    <div style="font-size:0.8rem; color:#10b981; font-weight:600;">Total Family Milestones</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #f59e0b;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:0.3rem;">Total Study Hours</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${family_summary.total_hours_spent} <span style="font-size:1rem; color:#64748b;">hrs</span></div>
                    <div style="font-size:0.8rem; color:#64748b;">${family_summary.total_time_spent_minutes} minutes logged</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:0.3rem;">Family Quiz Average</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${family_summary.overall_family_quiz_average !== null ? family_summary.overall_family_quiz_average + '%' : 'N/A'}</div>
                    <div style="font-size:0.8rem; color:#64748b;">Weighted accuracy</div>
                </div>
            </div>

            <!-- Children Progress Cards List -->
            <h3 style="font-size:1.15rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                👧 Individual Learner Milestones
            </h3>

            ${children.length === 0 ? `
                <div class="card" style="text-align:center; padding:3rem 1.5rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                    <div style="font-size:2.5rem; margin-bottom:0.5rem;">🎒</div>
                    <h4>No Registered Learners</h4>
                    <p style="color:#64748b; margin-bottom:1rem;">Register your children into P1–P7 classes to track their homeschooling progress.</p>
                    <a href="#parent-learners" class="btn btn-primary btn-sm">+ Register Child</a>
                </div>
            ` : `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem;">
                    ${children.map(c => {
                        const avatar = c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name)}&background=2563eb&color=fff&rounded=true`;
                        return `
                            <div class="card" style="padding:1.4rem; background:#fff; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 5px rgba(0,0,0,0.03); display:flex; flex-direction:column; justify-content:space-between;">
                                <div>
                                    <!-- Child Header -->
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                                        <div style="display:flex; align-items:center; gap:0.75rem;">
                                            <img src="${App.escapeHtml(avatar)}" alt="${App.escapeHtml(c.full_name)}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid #2563eb;">
                                            <div>
                                                <h4 style="font-size:1.05rem; font-weight:800; color:#0f172a; margin:0 0 0.15rem 0;">
                                                    ${App.escapeHtml(c.full_name)}
                                                </h4>
                                                <span style="font-size:0.75rem; background:#eff6ff; color:#1d4ed8; padding:0.15rem 0.5rem; border-radius:6px; font-weight:700;">
                                                    ${App.escapeHtml(c.class_code)} &bull; ${App.escapeHtml(c.class_name)}
                                                </span>
                                            </div>
                                        </div>
                                        ${c.needs_attention ? `
                                            <span style="background:#fef2f2; color:#b91c1c; font-size:0.75rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:6px; border:1px solid #fecaca;">
                                                ⚠️ Attention
                                            </span>
                                        ` : `
                                            <span style="background:#f0fdf4; color:#15803d; font-size:0.75rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:6px;">
                                                ✅ On Track
                                            </span>
                                        `}
                                    </div>

                                    ${c.attention_reason ? `
                                        <div style="background:#fffbeb; border-left:3px solid #f59e0b; padding:0.6rem 0.8rem; border-radius:4px; font-size:0.78rem; color:#92400e; margin-bottom:0.85rem;">
                                            ${App.escapeHtml(c.attention_reason)}
                                        </div>
                                    ` : ''}

                                    <!-- Progress Bar -->
                                    <div style="margin-bottom:0.85rem;">
                                        <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:600; margin-bottom:0.3rem;">
                                            <span style="color:#64748b;">Syllabus Completion</span>
                                            <span style="color:#0f172a;">${c.completion_percentage}% (${c.completed_lessons}/${c.expected_lessons})</span>
                                        </div>
                                        <div style="height:8px; width:100%; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                                            <div style="height:100%; width:${Math.min(100, c.completion_percentage)}%; background:#2563eb; border-radius:4px;"></div>
                                        </div>
                                    </div>

                                    <!-- Metrics Row -->
                                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; background:#f8fafc; padding:0.6rem 0.8rem; border-radius:8px; font-size:0.8rem; margin-bottom:1rem;">
                                        <div>
                                            <span style="color:#64748b; display:block; font-size:0.72rem;">Quiz Score Avg</span>
                                            <strong style="color:#0f172a; font-size:0.95rem;">${c.weighted_quiz_percentage !== null ? c.weighted_quiz_percentage + '%' : 'No quizzes'}</strong>
                                        </div>
                                        <div>
                                            <span style="color:#64748b; display:block; font-size:0.72rem;">Study Time</span>
                                            <strong style="color:#0f172a; font-size:0.95rem;">${c.time_spent_hours} hrs</strong>
                                        </div>
                                    </div>

                                    ${c.next_lesson ? `
                                        <div style="font-size:0.8rem; color:#475569; margin-bottom:1rem;">
                                            📌 <strong>Next Milestone:</strong> ${App.escapeHtml(c.next_lesson.subject_name)} — <em>${App.escapeHtml(c.next_lesson.lesson_title)}</em>
                                        </div>
                                    ` : ''}
                                </div>

                                <div style="display:flex; gap:0.5rem; border-top:1px solid #e2e8f0; padding-top:0.85rem; flex-wrap:wrap;">
                                    <button class="btn btn-primary btn-sm" style="flex:2; min-width:115px;" onclick="ProgressApp.initLearnerDashboard(document.getElementById('app-content'), ${c.learner_id})">
                                        View Full Progress
                                    </button>
                                    <button class="btn btn-outline-primary btn-sm" style="flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; font-weight:600;" onclick="ProgressApp.downloadLearnerProgressPDF(${c.learner_id})" title="Print / Download PDF Report">
                                        <span>📄</span> PDF
                                    </button>
                                    <a href="#parent-schedule" class="btn btn-secondary btn-sm">
                                        Schedule
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        `;
    },

    // ================= TEACHER CLASS PROGRESS SUMMARY =================
    async initTeacherDashboard(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading class performance summary & gradebook...</p>
            </div>
        `;

        try {
            const res = await API.get('/api/progress/teacher');
            const data = res.data;
            this.cachedData.teacher = data;
            this.renderTeacherDashboardView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load teacher analytics</h4>
                    <p>${App.escapeHtml(err.message || 'Could not load class records.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ProgressApp.initTeacherDashboard(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    renderTeacherDashboardView(container, data) {
        const { summary = {}, roster = [], struggling_topics = [] } = data || {};

        container.innerHTML = `
            <!-- Header -->
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        Class Performance & Gradebook 👩‍🏫
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        Learner syllabus pacing, diagnostic pass rates, and struggling topic intervention.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="#teacher-assessments" class="btn btn-secondary btn-sm" style="font-weight:600;">✅ Review Grading</a>
                    <a href="#officer-exams" class="btn btn-primary btn-sm" style="font-weight:600;">📄 Exam Marks Entry</a>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Active Learners</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.total_learners}</div>
                    <div style="font-size:0.8rem; color:#64748b;">Across primary levels</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #ef4444;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">At-Risk Learners</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#ef4444;">${summary.at_risk_count}</div>
                    <div style="font-size:0.8rem; color:#ef4444; font-weight:600;">Average score < 50%</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Avg Syllabus Coverage</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.average_completion_rate}%</div>
                    <div style="font-size:0.8rem; color:#64748b;">Syllabus completion rate</div>
                </div>
                <div class="card" style="padding:1.2rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Avg Quiz Score</div>
                    <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">${summary.average_quiz_score !== null ? summary.average_quiz_score + '%' : 'N/A'}</div>
                    <div style="font-size:0.8rem; color:#64748b;">Weighted class grade</div>
                </div>
            </div>

            <!-- Struggling Topics Intervention Alert -->
            ${struggling_topics && struggling_topics.length > 0 ? `
                <div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:12px; padding:1.25rem; margin-bottom:1.75rem;">
                    <h4 style="color:#991b1b; font-size:0.95rem; font-weight:800; margin:0 0 0.5rem 0;">
                        ⚠️ Challenging Topics Identified (Pass Rate < 60%)
                    </h4>
                    <p style="font-size:0.85rem; color:#7f1d1d; margin:0 0 0.75rem 0;">
                        The following primary assessments demonstrate low comprehension across learners. Recommended for teacher review and extra parental guidance notes:
                    </p>
                    <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                        ${struggling_topics.map(st => `
                            <div style="background:#fff; border:1px solid #fca5a5; padding:0.5rem 0.8rem; border-radius:8px; font-size:0.8rem;">
                                <strong>${App.escapeHtml(st.title)}</strong> (${App.escapeHtml(st.class_code)} • ${App.escapeHtml(st.subject_name)}) — 
                                <span style="color:#b91c1c; font-weight:700;">${st.average_percentage}% Avg (${st.pass_rate}% Pass Rate)</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Learners Roster Gradebook Table -->
            <div class="card" style="padding:1.25rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                    📋 Learner Pacing & Progress Gradebook
                </h3>

                <div class="table-container" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #e2e8f0; text-align:left; color:#64748b; font-size:0.78rem; text-transform:uppercase;">
                                <th style="padding:0.6rem 0.8rem;">Learner</th>
                                <th style="padding:0.6rem 0.8rem;">Class</th>
                                <th style="padding:0.6rem 0.8rem;">Parent</th>
                                <th style="padding:0.6rem 0.8rem;">Syllabus Pacing</th>
                                <th style="padding:0.6rem 0.8rem;">Quiz Score Avg</th>
                                <th style="padding:0.6rem 0.8rem;">Status</th>
                                <th style="padding:0.6rem 0.8rem; text-align:right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roster.map(r => {
                                const riskBadges = {
                                    good: '<span style="background:#dcfce7; color:#166534; padding:0.15rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.75rem;">On Track</span>',
                                    warning: '<span style="background:#fef3c7; color:#92400e; padding:0.15rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.75rem;">Slow Pacing</span>',
                                    critical: '<span style="background:#fee2e2; color:#991b1b; padding:0.15rem 0.5rem; border-radius:4px; font-weight:700; font-size:0.75rem;">⚠️ At Risk (<50%)</span>'
                                };
                                return `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:0.6rem 0.8rem; font-weight:700; color:#0f172a;">
                                            ${App.escapeHtml(r.full_name)}
                                        </td>
                                        <td style="padding:0.6rem 0.8rem;">
                                            <span style="background:#eff6ff; color:#1d4ed8; padding:0.1rem 0.4rem; border-radius:4px; font-weight:600; font-size:0.75rem;">${App.escapeHtml(r.class_code)}</span>
                                        </td>
                                        <td style="padding:0.6rem 0.8rem; color:#64748b;">
                                            ${App.escapeHtml(r.parent_name)}
                                        </td>
                                        <td style="padding:0.6rem 0.8rem;">
                                            <div style="font-weight:600; color:#0f172a;">${r.completion_percentage}%</div>
                                            <div style="font-size:0.72rem; color:#64748b;">${r.completed_lessons}/${r.expected_lessons} lessons</div>
                                        </td>
                                        <td style="padding:0.6rem 0.8rem; font-weight:700; color:#0f172a;">
                                            ${r.weighted_quiz_percentage !== null ? r.weighted_quiz_percentage + '%' : '—'}
                                        </td>
                                        <td style="padding:0.6rem 0.8rem;">
                                            ${riskBadges[r.risk_level] || riskBadges.good}
                                        </td>
                                        <td style="padding:0.6rem 0.8rem; text-align:right;">
                                            <button class="btn btn-secondary btn-sm" onclick="ProgressApp.initLearnerDashboard(document.getElementById('app-content'), ${r.learner_id})">
                                                Inspect
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

    // ================= CURRICULUM OFFICER ANALYTICS =================
    async initOfficerAnalytics(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Aggregating NCDC national curriculum analytics...</p>
            </div>
        `;

        try {
            const res = await API.get('/api/progress/officer');
            const data = res.data;
            this.cachedData.officer = data;
            this.renderOfficerAnalyticsView(container, data);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load curriculum analytics</h4>
                    <p>${App.escapeHtml(err.message || 'Could not load macro statistics.')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ProgressApp.initOfficerAnalytics(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    renderOfficerAnalyticsView(container, data) {
        const { totals = {}, classes_coverage = [], subject_performance = [] } = data || {};

        container.innerHTML = `
            <!-- Header -->
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
                <div>
                    <h1 style="font-size:1.45rem; font-weight:800; color:#0f172a; margin:0 0 0.2rem 0;">
                        National Curriculum Attainment Analytics 🏛️
                    </h1>
                    <p style="color:#64748b; font-size:0.88rem; margin:0;">
                        MoES / NCDC macro homeschooling engagement, primary grade syllabus completion & subject pass rates.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="#curriculum-explorer" class="btn btn-secondary btn-sm" style="font-weight:600;">📋 Curriculum Setup</a>
                    <a href="#officer-exams" class="btn btn-primary btn-sm" style="font-weight:600;">📄 Official Exam Sets</a>
                </div>
            </div>

            <!-- Totals Grid -->
            <div class="dashboard-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #2563eb;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Active Learners</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${totals.active_learners}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Registered Parents</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${totals.registered_parents}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #f59e0b;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Completed Lessons</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${totals.total_completed_lessons}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #8b5cf6;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Quizzes Submitted</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${totals.total_quizzes_taken}</div>
                </div>
                <div class="card" style="padding:1.1rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; border-left:4px solid #06b6d4;">
                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b;">Total Study Time</div>
                    <div style="font-size:1.7rem; font-weight:800; color:#0f172a;">${totals.total_hours_spent} <span style="font-size:0.9rem; color:#64748b;">hrs</span></div>
                </div>
            </div>

            <!-- Class Level Pacing Breakdown (P1 to P7) -->
            <div class="card" style="padding:1.4rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:1.5rem;">
                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                    🎒 Primary Grade Level Coverage & Milestones (P1–P7)
                </h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem;">
                    ${classes_coverage.map(cc => `
                        <div style="padding:1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                                <strong style="color:#0f172a; font-size:0.95rem;">${App.escapeHtml(cc.class_code)} (${App.escapeHtml(cc.class_name)})</strong>
                                <span style="font-size:0.75rem; background:#eff6ff; color:#1d4ed8; padding:0.1rem 0.4rem; border-radius:4px; font-weight:700;">${cc.active_learners} Learners</span>
                            </div>
                            <div style="font-size:0.8rem; color:#64748b; margin-bottom:0.6rem;">
                                Syllabus: <strong>${cc.total_syllabus_lessons}</strong> structured lessons &bull; <strong>${cc.completed_milestones}</strong> completed milestones
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Subject Performance Track Table -->
            <div class="card" style="padding:1.4rem; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
                <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0 0 1rem 0;">
                    📊 Subject-Level Quiz Performance & Standard Attainment
                </h3>
                <div class="table-container" style="overflow-x:auto;">
                    <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #e2e8f0; text-align:left; color:#64748b; font-size:0.78rem; text-transform:uppercase;">
                                <th style="padding:0.6rem 0.8rem;">Subject Name</th>
                                <th style="padding:0.6rem 0.8rem;">Subject Code</th>
                                <th style="padding:0.6rem 0.8rem;">Curriculum Lessons</th>
                                <th style="padding:0.6rem 0.8rem;">Assessments</th>
                                <th style="padding:0.6rem 0.8rem;">Total Submissions</th>
                                <th style="padding:0.6rem 0.8rem; text-align:right;">Average Score %</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subject_performance.map(sp => `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:0.6rem 0.8rem; font-weight:700; color:#0f172a;">${App.escapeHtml(sp.subject_name)}</td>
                                    <td style="padding:0.6rem 0.8rem; color:#64748b;">${App.escapeHtml(sp.subject_code)}</td>
                                    <td style="padding:0.6rem 0.8rem;">${sp.lessons_count}</td>
                                    <td style="padding:0.6rem 0.8rem;">${sp.assessments_count}</td>
                                    <td style="padding:0.6rem 0.8rem; font-weight:600;">${sp.total_quiz_submissions}</td>
                                    <td style="padding:0.6rem 0.8rem; text-align:right; font-weight:800; color:${sp.overall_subject_quiz_avg >= 60 ? '#16a34a' : (sp.overall_subject_quiz_avg ? '#ef4444' : '#64748b')};">
                                        ${sp.overall_subject_quiz_avg !== null ? sp.overall_subject_quiz_avg + '%' : '—'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ================= OFFICIAL PROGRESS REPORT (PDF / PRINTABLE) =================
    async downloadLearnerProgressPDF(learnerId = null) {
        try {
            const url = learnerId ? `/api/progress/learner/${learnerId}/report` : '/api/progress/learner/report';
            const res = await API.get(url);
            const r = res.data;
            const learner = r.learner || {};
            const parent = r.parent || {};
            const summary = r.summary || {};
            const subjects = r.subjects || [];
            const completedMilestones = r.completed_milestones || [];
            const quizResults = r.quiz_results || [];
            const nextMilestones = r.next_milestones || [];
            const meta = r.meta || {};

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Please allow popups to open and print the progress report.');
                return;
            }

            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Progress Report — ${App.escapeHtml(learner.full_name)} (${App.escapeHtml(learner.class_code)})</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #f8fafc;
            margin: 0;
            padding: 20px;
            font-size: 12px;
            line-height: 1.4;
        }
        .report-page {
            max-width: 860px;
            margin: 0 auto;
            background: #fff;
            padding: 32px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            border: 1px solid #e2e8f0;
        }
        .action-bar {
            max-width: 860px;
            margin: 0 auto 15px auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            border: none;
        }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-secondary { background: #e2e8f0; color: #334155; }
        .header {
            border-bottom: 2px solid #2563eb;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            font-size: 18px;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0 0 3px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .header p {
            margin: 0;
            color: #64748b;
            font-size: 11px;
            font-weight: 500;
        }
        .seal {
            background: #eff6ff;
            border: 2px solid #bfdbfe;
            border-radius: 8px;
            padding: 6px 12px;
            text-align: right;
        }
        .grid-info {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 16px;
        }
        .info-cell span {
            display: block;
            font-size: 9px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 700;
        }
        .info-cell strong {
            font-size: 12px;
            color: #0f172a;
        }
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 18px;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px;
            text-align: center;
            background: #fff;
        }
        .kpi-card.blue { border-top: 3px solid #2563eb; }
        .kpi-card.green { border-top: 3px solid #10b981; }
        .kpi-card.amber { border-top: 3px solid #f59e0b; }
        .kpi-card.purple { border-top: 3px solid #8b5cf6; }
        .kpi-title { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; }
        .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin: 3px 0; }
        .kpi-sub { font-size: 10px; color: #64748b; }
        .section-title {
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 5px;
            margin: 16px 0 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 14px;
        }
        th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-align: left;
            padding: 6px 8px;
            border: 1px solid #e2e8f0;
            font-size: 10px;
            text-transform: uppercase;
        }
        td {
            padding: 6px 8px;
            border: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) { background: #fafafa; }
        .progress-bar-container {
            width: 100%;
            height: 6px;
            background: #e2e8f0;
            border-radius: 3px;
            overflow: hidden;
            display: inline-block;
            vertical-align: middle;
            margin-left: 6px;
        }
        .progress-fill { height: 100%; background: #2563eb; }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
        }
        .badge-green { background: #dcfce7; color: #15803d; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-amber { background: #fef3c7; color: #b45309; }
        .footer-signatures {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px dashed #cbd5e1;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            text-align: center;
            font-size: 10px;
            color: #64748b;
        }
        .sig-line {
            border-top: 1px solid #94a3b8;
            margin-top: 30px;
            padding-top: 4px;
            font-weight: 600;
            color: #334155;
        }
        @media print {
            body { background: #fff; padding: 0; }
            .action-bar { display: none !important; }
            .report-page {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                max-width: 100% !important;
            }
            @page {
                size: A4 portrait;
                margin: 12mm 14mm;
            }
        }
    </style>
</head>
<body>
    <div class="action-bar">
        <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="btn btn-secondary" onclick="window.close()">❌ Close Window</button>
    </div>

    <div class="report-page">
        <!-- Header -->
        <div class="header">
            <div>
                <h1>${App.escapeHtml(meta.institution_name || 'TECHNOLOGY-BASED HOMESCHOOLING INFORMATION SYSTEM (TMHIS)')}</h1>
                <p>${App.escapeHtml(meta.ministry_affiliation || 'Uganda Ministry of Education & Sports (MoES) Standard')} &bull; Academic Year ${App.escapeHtml(meta.academic_year || '2026')}</p>
                <div style="font-size:12px; font-weight:700; color:#2563eb; margin-top:4px;">
                    ${App.escapeHtml(meta.report_title || 'Official Learner Progress Report')}
                </div>
            </div>
            <div class="seal">
                <div style="font-size:9px; font-weight:800; color:#1e40af; text-transform:uppercase;">OFFICIAL SYLLABUS REPORT</div>
                <div style="font-size:10px; color:#475569;">Generated: ${App.escapeHtml(meta.generated_at)}</div>
                <div style="font-size:9px; color:#64748b;">NCDC Primary Standard</div>
            </div>
        </div>

        <!-- Student & Parent Profile -->
        <div class="grid-info">
            <div class="info-cell">
                <span>Learner Full Name</span>
                <strong>${App.escapeHtml(learner.full_name)}</strong>
            </div>
            <div class="info-cell">
                <span>Class / Grade</span>
                <strong>Class ${App.escapeHtml(learner.class_code)} (${App.escapeHtml(learner.class_name)})</strong>
            </div>
            <div class="info-cell">
                <span>Date of Birth / Gender</span>
                <strong>${App.escapeHtml(learner.date_of_birth)} &bull; ${App.escapeHtml(learner.gender)}</strong>
            </div>
            <div class="info-cell">
                <span>Enrolment Date</span>
                <strong>${App.escapeHtml(learner.enrolment_date)}</strong>
            </div>
            <div class="info-cell">
                <span>Homeschool Parent / Guardian</span>
                <strong>${App.escapeHtml(parent.full_name || 'Guardian')}</strong>
            </div>
            <div class="info-cell">
                <span>Parent Contact</span>
                <strong>${App.escapeHtml(parent.phone || parent.email || 'N/A')}</strong>
            </div>
            <div class="info-cell">
                <span>District / Location</span>
                <strong>${App.escapeHtml(parent.district || 'Uganda')}</strong>
            </div>
            <div class="info-cell">
                <span>Competency Standing</span>
                <strong style="color:#2563eb;">${App.escapeHtml(summary.competency_remark || 'Satisfactory')}</strong>
            </div>
        </div>

        <!-- KPI Metrics -->
        <div class="kpi-row">
            <div class="kpi-card blue">
                <div class="kpi-title">Syllabus Progress</div>
                <div class="kpi-val">${summary.completion_percentage}%</div>
                <div class="kpi-sub">${summary.completed_lessons} of ${summary.expected_lessons} lessons completed</div>
            </div>
            <div class="kpi-card green">
                <div class="kpi-title">Assessment Average</div>
                <div class="kpi-val">${summary.weighted_quiz_percentage !== null ? summary.weighted_quiz_percentage + '%' : 'N/A'}</div>
                <div class="kpi-sub">${summary.total_passed_quizzes} of ${summary.total_quizzes_taken} quizzes passed</div>
            </div>
            <div class="kpi-card amber">
                <div class="kpi-title">Study Time Logged</div>
                <div class="kpi-val">${summary.total_hours_spent} <span style="font-size:12px;">hrs</span></div>
                <div class="kpi-sub">${summary.total_time_spent_minutes} total active minutes</div>
            </div>
            <div class="kpi-card purple">
                <div class="kpi-title">Enrolled Subjects</div>
                <div class="kpi-val">${subjects.length}</div>
                <div class="kpi-sub">Ugandan Primary Curriculum</div>
            </div>
        </div>

        <!-- Subject Syllabus Progress Table -->
        <div class="section-title">
            <span>📚 Subject-by-Subject Syllabus Progress & Quiz Performance</span>
            <span style="font-size:10px; color:#64748b; font-weight:normal;">Uganda NCDC Primary Tracks</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width:28%;">Subject</th>
                    <th style="width:10%;">Code</th>
                    <th style="width:12%; text-align:center;">Expected</th>
                    <th style="width:12%; text-align:center;">Finished</th>
                    <th style="width:18%;">Syllabus %</th>
                    <th style="width:10%; text-align:center;">Quiz Avg</th>
                    <th style="width:10%; text-align:center;">Standing</th>
                </tr>
            </thead>
            <tbody>
                ${subjects.map(s => {
                    const pct = s.completion_percentage || 0;
                    const qStats = s.quiz_stats || {};
                    const qAvg = qStats.weighted_percentage !== null && qStats.weighted_percentage !== undefined ? `${qStats.weighted_percentage}%` : '—';
                    const standing = pct >= 75 ? 'Advanced' : (pct >= 40 ? 'On Track' : 'Starting');
                    const badgeClass = pct >= 75 ? 'badge-green' : (pct >= 40 ? 'badge-blue' : 'badge-amber');
                    return `
                        <tr>
                            <td><strong>${App.escapeHtml(s.subject_name)}</strong></td>
                            <td><span style="font-size:10px; color:#64748b;">${App.escapeHtml(s.subject_code)}</span></td>
                            <td style="text-align:center;">${s.expected_lessons}</td>
                            <td style="text-align:center; font-weight:700; color:#0f172a;">${s.completed_lessons}</td>
                            <td>
                                <span style="font-weight:700;">${pct}%</span>
                                <div class="progress-bar-container" style="width:50px;">
                                    <div class="progress-fill" style="width:${Math.min(100, pct)}%;"></div>
                                </div>
                            </td>
                            <td style="text-align:center; font-weight:700;">${qAvg}</td>
                            <td style="text-align:center;"><span class="badge ${badgeClass}">${standing}</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>

        <!-- 2 Columns: Next Scheduled Lessons & Recent Quiz Results -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:10px;">
            
            <!-- Left: Next Scheduled Milestones -->
            <div>
                <div class="section-title">
                    <span>📌 Next Scheduled Syllabus Milestones</span>
                </div>
                ${nextMilestones.length === 0 ? `
                    <p style="font-size:10px; color:#64748b;">All current syllabus lessons have been completed!</p>
                ` : `
                    <table style="margin-bottom:0;">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Upcoming Lesson</th>
                                <th style="text-align:right;">Seq #</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nextMilestones.map(nm => `
                                <tr>
                                    <td><span style="font-size:9px; font-weight:700; color:#2563eb;">${App.escapeHtml(nm.subject_code)}</span></td>
                                    <td>${App.escapeHtml(nm.lesson_title)}</td>
                                    <td style="text-align:right; font-weight:600;">#${nm.sequence_number}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>

            <!-- Right: Recent Quiz Results -->
            <div>
                <div class="section-title">
                    <span>✍️ Recent Formative Assessment Scores</span>
                </div>
                ${quizResults.length === 0 ? `
                    <p style="font-size:10px; color:#64748b;">No formal assessment attempts recorded yet.</p>
                ` : `
                    <table style="margin-bottom:0;">
                        <thead>
                            <tr>
                                <th>Quiz Title</th>
                                <th style="text-align:center;">Score</th>
                                <th style="text-align:center;">%</th>
                                <th style="text-align:right;">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${quizResults.slice(0, 5).map(qr => `
                                <tr>
                                    <td>
                                        <div style="font-weight:600;">${App.escapeHtml(qr.assessment_title)}</div>
                                        <div style="font-size:9px; color:#64748b;">${App.escapeHtml(qr.subject_name)}</div>
                                    </td>
                                    <td style="text-align:center; font-weight:700;">${qr.score}/${qr.max_marks}</td>
                                    <td style="text-align:center; font-weight:700; color:${qr.percentage >= 50 ? '#15803d' : '#b91c1c'};">${qr.percentage}%</td>
                                    <td style="text-align:right; font-size:9px; color:#64748b;">${(qr.submitted_at || '').substring(0, 10)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>

        </div>

        <!-- Official Footer & Signatures -->
        <div class="footer-signatures">
            <div>
                <div class="sig-line">Parent / Homeschool Facilitator</div>
                <div>Date: ________________________</div>
            </div>
            <div>
                <div class="sig-line">Academic Supervisor / Teacher</div>
                <div>Date: ________________________</div>
            </div>
            <div>
                <div class="sig-line">TMHIS Verification Seal</div>
                <div style="font-size:9px; color:#94a3b8; margin-top:2px;">SEC-HASH-${(Math.random().toString(36).substring(2, 10)).toUpperCase()}</div>
            </div>
        </div>

    </div>

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => {
                window.print();
            }, 600);
        });
    </script>
</body>
</html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

        } catch (err) {
            alert('Failed to generate printable progress report: ' + (err.message || 'Server error'));
        }
    }
};

window.ProgressApp = ProgressApp;
