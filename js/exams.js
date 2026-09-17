/**
 * TMHIS Module 06.1 Annex: Termly Exam Sets, Printable PDF Releases,
 * Ugandan UNEB 9-Point Scale (D1–F9) & Division 1–4 Auto-Grading Engine,
 * and Parent Mark Entry Portal.
 */

const ExamsApp = {
    currentFilters: {
        class_id: '',
        term_id: '',
        exam_type: '',
        search: ''
    },
    classes: [],
    terms: [],
    learners: [],
    selectedLearnerId: null,
    examSets: [],

    /**
     * Entry point for Exam Sets & Grading Portal
     */
    async init(container) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Examination Sets & UNEB Grading Engine...</p>
            </div>
        `;

        try {
            const role = Auth.getRole();
            const [classesRes, termsRes] = await Promise.all([
                API.get('/api/curriculum/classes').catch(() => API.get('/api/parent/classes')).catch(() => ({ data: [] })),
                API.get('/api/curriculum/terms').catch(() => API.get('/api/parent/terms')).catch(() => ({ data: [] }))
            ]);

            this.classes = Array.isArray(classesRes?.data) ? classesRes.data : (classesRes?.data?.classes || []);
            this.terms = Array.isArray(termsRes?.data) ? termsRes.data : (termsRes?.data?.terms || []);

            // If parent or learner, load registered learners
            if (role === 'parent' || role === 'learner') {
                try {
                    const lRes = await API.get('/api/parent/learners');
                    this.learners = Array.isArray(lRes?.data) ? lRes.data : (lRes?.data?.learners || []);
                    if (this.learners.length > 0 && !this.selectedLearnerId) {
                        this.selectedLearnerId = this.learners[0].learner_id;
                    }
                } catch (e) {
                    this.learners = [];
                }
            }

            await this.loadExamSets();
            this.renderCatalogView(container);
        } catch (err) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin:2rem auto; max-width:600px;">
                    <h4>Failed to load examination sets</h4>
                    <p>${App.escapeHtml(err.message || 'Network error')}</p>
                    <button class="btn btn-primary btn-sm" onclick="ExamsApp.init(document.getElementById('app-content'))">Retry</button>
                </div>
            `;
        }
    },

    /**
     * Fetch Exam Sets with Active Child & Filters
     */
    async loadExamSets() {
        try {
            const params = new URLSearchParams();
            if (this.selectedLearnerId) params.append('learner_id', this.selectedLearnerId);
            if (this.currentFilters.class_id) params.append('class_id', this.currentFilters.class_id);
            if (this.currentFilters.term_id) params.append('term_id', this.currentFilters.term_id);
            if (this.currentFilters.exam_type) params.append('exam_type', this.currentFilters.exam_type);

            const res = await API.get(`/api/exams/sets?${params.toString()}`).catch(() => ({ data: [] }));
            let sets = [];
            if (res && Array.isArray(res.data)) {
                sets = res.data;
            } else if (res && Array.isArray(res.data?.sets)) {
                sets = res.data.sets;
            } else if (Array.isArray(res)) {
                sets = res;
            }

            if (sets.length === 0 && typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getExams) {
                sets = await TMHIS_DB.getExams();
            }
            this.examSets = sets;
        } catch (e) {
            console.error('Error loading exam sets:', e);
            if (typeof TMHIS_DB !== 'undefined' && TMHIS_DB.getExams) {
                this.examSets = await TMHIS_DB.getExams();
            } else {
                this.examSets = [];
            }
        }
    },

    /**
     * Render the main Exam Sets catalog
     */
    renderCatalogView(container) {
        const role = Auth.getRole();
        const isStaff = ['administrator', 'curriculum_officer', 'teacher'].includes(role);
        const isParent = role === 'parent';

        const activeChild = Array.isArray(this.learners) ? this.learners.find(l => l.learner_id == this.selectedLearnerId) : null;

        let html = `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h2 style="margin:0 0 0.35rem 0; font-size:1.6rem; color:var(--text-color); display:flex; align-items:center; gap:0.5rem;">
                        <span>📄</span> Termly Examination Sets & UNEB Grading
                    </h2>
                    <p style="margin:0; color:var(--text-muted); font-size:0.95rem;">
                        Official printable examination papers, standardized marking schemes, and Ugandan UNEB Division 1–4 auto-grading.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                    <a href="#parent-assessments" class="btn btn-outline btn-sm">
                        <span>✍️</span> Quizzes & Assessments
                    </a>
                    ${isStaff ? `
                        <button class="btn btn-primary btn-sm" onclick="ExamsApp.openCreateSetModal()">
                            <span>➕</span> Create Exam Set
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="ExamsApp.showGradingScaleModal()">
                        <span>📊</span> UNEB 9-Grade Scale Info
                    </button>
                </div>
            </div>
        `;

        // Child Switcher for Parents & Learners
        if (Array.isArray(this.learners) && this.learners.length > 0) {
            html += `
                <div class="card" style="padding:0.75rem 1rem; margin-bottom:1.25rem; background:var(--surface-color); border:1px solid var(--border-color); border-radius:8px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-weight:600; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Candidate / Child:</span>
                            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                                ${this.learners.map(l => {
                                    const isSel = l.learner_id == this.selectedLearnerId;
                                    const avatar = l.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(l.full_name)}&background=0D8ABC&color=fff&size=64`;
                                    return `
                                        <button class="btn ${isSel ? 'btn-primary' : 'btn-outline'}" 
                                                style="padding:0.25rem 0.65rem; font-size:0.85rem; border-radius:20px; display:inline-flex; align-items:center; gap:0.4rem;"
                                                onclick="ExamsApp.selectLearner(${l.learner_id})">
                                            <img src="${avatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" alt="">
                                            <span>${App.escapeHtml(l.full_name)}</span>
                                            <span class="badge" style="background:rgba(255,255,255,0.2); font-size:0.7rem; padding:1px 5px;">${App.escapeHtml(l.class_name || 'Primary')}</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        ${activeChild ? `
                            <div style="font-size:0.8rem; color:var(--text-muted); background:rgba(0,123,255,0.08); padding:0.25rem 0.6rem; border-radius:6px; border:1px solid rgba(0,123,255,0.15);">
                                🔒 Filtered to <strong>${App.escapeHtml(activeChild.full_name)}</strong>'s level (${App.escapeHtml(activeChild.class_name || 'Class')} & below)
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // Filters Row
        html += `
            <div class="card" style="padding:0.85rem 1rem; margin-bottom:1.5rem; background:var(--surface-color); border:1px solid var(--border-color);">
                <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
                    <div style="flex:1; min-width:200px;">
                        <input type="text" class="form-control" id="exam-search" placeholder="Search exam title or keyword..." 
                               value="${App.escapeHtml(this.currentFilters.search || '')}" 
                               oninput="ExamsApp.filterChanged('search', this.value)" style="min-height:38px; padding:0.45rem 0.85rem; font-size:0.9rem;">
                    </div>
                    <div style="min-width:180px;">
                        <select class="form-control" id="exam-class-filter" onchange="ExamsApp.filterChanged('class_id', this.value)" style="min-height:38px; padding:0.45rem 0.75rem; font-size:0.9rem;">
                            <option value="">All Classes</option>
                            ${(Array.isArray(this.classes) ? this.classes : []).map(c => `<option value="${c.class_id}" ${this.currentFilters.class_id == c.class_id ? 'selected' : ''}>${App.escapeHtml(c.class_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="min-width:200px;">
                        <select class="form-control" id="exam-type-filter" onchange="ExamsApp.filterChanged('exam_type', this.value)" style="min-height:38px; padding:0.45rem 0.75rem; font-size:0.9rem;">
                            <option value="">All Exam Types</option>
                            <option value="beginning_of_term" ${this.currentFilters.exam_type === 'beginning_of_term' ? 'selected' : ''}>Beginning of Term</option>
                            <option value="mid_term" ${this.currentFilters.exam_type === 'mid_term' ? 'selected' : ''}>Mid-Term Exam</option>
                            <option value="end_of_term" ${this.currentFilters.exam_type === 'end_of_term' ? 'selected' : ''}>End of Term Exam</option>
                            <option value="mock_ple" ${this.currentFilters.exam_type === 'mock_ple' ? 'selected' : ''}>Mock PLE Series</option>
                        </select>
                    </div>
                    <div>
                        <button class="btn btn-outline btn-sm" onclick="ExamsApp.resetFilters()" style="min-height:38px; padding:0.45rem 1rem;">Reset</button>
                    </div>
                </div>
            </div>
        `;

        // Filter list locally for search keyword
        let displaySets = Array.isArray(this.examSets) ? [...this.examSets] : [];
        if (this.currentFilters.search && this.currentFilters.search.trim()) {
            const q = this.currentFilters.search.toLowerCase();
            displaySets = displaySets.filter(s => 
                (s && s.title && s.title.toLowerCase().includes(q)) || 
                (s && s.description && s.description.toLowerCase().includes(q)) ||
                (s && s.class_name && s.class_name.toLowerCase().includes(q))
            );
        }

        if (!Array.isArray(displaySets) || displaySets.length === 0) {
            html += `
                <div class="card" style="text-align:center; padding:3rem; color:var(--text-muted); border:1px dashed var(--border-color);">
                    <div style="font-size:2.5rem; margin-bottom:0.5rem;">📂</div>
                    <h4 style="margin:0 0 0.5rem 0; color:var(--text-color);">No Examination Sets Found</h4>
                    <p style="margin:0; font-size:0.9rem;">There are no examination sets matching the selected filters or candidate grade level.</p>
                </div>
            `;
        } else {
            html += `<div style="display:flex; flex-direction:column; gap:1rem;">`;

            displaySets.forEach(set => {
                if (!set) return;
                const sub = set.submission;
                const isGraded = !!sub;

                let divBadge = '';
                if (isGraded) {
                    const divColor = sub.division === 'I' ? '#28a745' : (sub.division === 'II' ? '#17a2b8' : (sub.division === 'III' ? '#ffc107' : '#dc3545'));
                    divBadge = `
                        <div onclick="ExamsApp.openReportCardView(${sub.submission_id})" style="background:${divColor}18; border:1px solid ${divColor}; color:${divColor}; padding:0.25rem 0.65rem; border-radius:6px; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; gap:0.35rem; cursor:pointer; transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'" title="Click to view Official Terminal Report Card">
                            <span>🏆</span> Division ${App.escapeHtml(sub.division)} (Agg ${sub.total_aggregate})
                        </div>
                    `;
                } else if (isParent || isStaff) {
                    divBadge = `
                        <div onclick="ExamsApp.openMarkEntryModal(${set.exam_set_id})" style="background:#007bff12; border:1px solid #007bff40; color:#007bff; padding:0.25rem 0.65rem; border-radius:6px; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; gap:0.35rem; cursor:pointer; transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'" title="Click to open mark entry and auto-grading portal">
                            <span>📝</span> Enter Marks & Grade
                        </div>
                    `;
                }

                html += `
                    <div class="card exam-set-card" style="padding:1.25rem; border:1px solid var(--border-color); border-radius:8px; transition:transform 0.15s, box-shadow 0.15s; background:var(--surface-color);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                            <div style="flex:1; min-width:260px;">
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; flex-wrap:wrap;">
                                    <span class="badge" style="background:var(--primary-color); color:#fff; font-size:0.75rem; padding:0.2rem 0.5rem; border-radius:4px;">
                                        ${App.escapeHtml(set.class_name || 'Class')}
                                    </span>
                                    <span class="badge" style="background:var(--accent-color); color:#fff; font-size:0.75rem; padding:0.2rem 0.5rem; border-radius:4px;">
                                        ${set.exam_type === 'mock_ple' ? 'Mock PLE Series' : (set.exam_type === 'mid_term' ? 'Mid-Term Exam' : (set.exam_type === 'end_of_term' ? 'End of Term' : 'Exam Set'))}
                                    </span>
                                    <span style="font-size:0.8rem; color:var(--text-muted);">Year ${App.escapeHtml(set.academic_year || '2026')}</span>
                                    ${divBadge}
                                </div>
                                <h3 style="margin:0 0 0.35rem 0; font-size:1.15rem; color:var(--text-color);">
                                    ${App.escapeHtml(set.title)}
                                </h3>
                                <p style="margin:0 0 0.75rem 0; color:var(--text-muted); font-size:0.88rem; line-height:1.4;">
                                    ${App.escapeHtml(set.description || 'Standard Ugandan Primary Curriculum Examination Set.')}
                                </p>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:0.4rem; align-items:flex-end;">
                                <button class="btn btn-outline btn-sm" onclick="ExamsApp.viewSetDetails(${set.exam_set_id})">
                                    <span>👁️</span> View Papers & PDFs (${set.total_papers_count || 4})
                                </button>
                                ${isStaff ? `
                                    <button class="btn btn-outline btn-sm" style="color:var(--primary-color); border-color:var(--primary-color);" onclick="ExamsApp.openUploadPaperModal(${set.exam_set_id})">
                                        <span>➕</span> Add Paper PDF
                                    </button>
                                ` : ''}
                                ${isParent || isStaff ? `
                                    <button class="btn ${isGraded ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="ExamsApp.openMarkEntryModal(${set.exam_set_id})">
                                        <span>📝</span> ${isGraded ? 'Edit / Review Marks' : 'Enter Marks & Grade'}
                                    </button>
                                ` : ''}
                                ${isGraded ? `
                                    <button class="btn btn-outline btn-sm" style="color:#28a745; border-color:#28a745;" onclick="ExamsApp.openReportCardView(${sub.submission_id})">
                                        <span>📜</span> View Report Card
                                    </button>
                                ` : ''}
                                ${isStaff ? `
                                    <button class="btn btn-outline btn-sm" style="color:#dc3545; border-color:#dc3545; font-size:0.8rem;" onclick="ExamsApp.deleteExamSet(${set.exam_set_id}, '${App.escapeHtml(set.title.replace(/'/g, "\\'"))}')">
                                        <span>🗑️</span> Delete Set
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        }

        container.innerHTML = html;
    },

    /**
     * Switch Selected Learner
     */
    async selectLearner(learnerId) {
        this.selectedLearnerId = learnerId;
        await this.loadExamSets();
        this.renderCatalogView(document.getElementById('app-content'));
    },

    /**
     * Handle Filter Change
     */
    async filterChanged(key, value) {
        this.currentFilters[key] = value;
        if (key !== 'search') {
            await this.loadExamSets();
        }
        this.renderCatalogView(document.getElementById('app-content'));
    },

    /**
     * Reset Filters
     */
    async resetFilters() {
        this.currentFilters = { class_id: '', term_id: '', exam_type: '', search: '' };
        await this.loadExamSets();
        this.renderCatalogView(document.getElementById('app-content'));
    },

    /**
     * View Detailed Exam Set with Paper Cards & Printable PDF Download Links
     */
    async viewSetDetails(examSetId) {
        App.showModal(`
            <div style="text-align:center; padding:2rem;">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading examination papers and download assets...</p>
            </div>
        `, 'Exam Papers & Printable PDF Releases');

        try {
            const learnerParam = this.selectedLearnerId ? `?learner_id=${this.selectedLearnerId}` : '';
            const res = await API.get(`/api/exams/sets/${examSetId}${learnerParam}`);
            const payload = res.data?.data || res.data || res;
            const set = payload.exam_set || payload.set || (payload.exam_set_id ? payload : {});
            const papers = payload.papers || [];
            const sub = payload.submission || null;
            const marks = payload.marks || [];
            const role = Auth.getRole();
            const isStaff = ['administrator', 'curriculum_officer', 'teacher'].includes(role);
            const isParent = role === 'parent';

            let body = `
                <div style="margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
                        <div>
                            <span class="badge" style="background:var(--primary-color); color:#fff; font-size:0.75rem;">${App.escapeHtml(set.class_name || 'Primary')}</span>
                            <span class="badge" style="background:var(--accent-color); color:#fff; font-size:0.75rem;">${App.escapeHtml(set.academic_year || '2026')}</span>
                            <h3 style="margin:0.35rem 0 0.2rem 0; font-size:1.25rem;">${App.escapeHtml(set.title || 'Exam Set')}</h3>
                        </div>
                        ${sub ? `
                            <div style="background:#28a74515; border:1px solid #28a745; color:#28a745; padding:0.35rem 0.75rem; border-radius:6px; font-weight:700; text-align:right;">
                                <div>Division ${App.escapeHtml(sub.division)}</div>
                                <div style="font-size:0.75rem; font-weight:normal;">Agg: ${sub.total_aggregate} | Avg: ${sub.average_percentage}%</div>
                            </div>
                        ` : ''}
                    </div>
                    <p style="font-size:0.9rem; color:var(--text-muted); margin:0 0 0.5rem 0;">${App.escapeHtml(set.description || '')}</p>
                    ${set.instructions ? `
                        <div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:6px; padding:0.6rem 0.8rem; font-size:0.85rem; color:var(--text-muted);">
                            <strong>Sitting Instructions:</strong><br>
                            ${App.escapeHtml(set.instructions).replace(/\n/g, '<br>')}
                        </div>
                    ` : ''}
                </div>

                <h4 style="margin:0 0 0.75rem 0; font-size:1rem; color:var(--text-color); display:flex; align-items:center; gap:0.4rem;">
                    <span>📚</span> Subject Examination Papers (${papers.length})
                </h4>

                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    ${papers.map((p, idx) => {
                        const m = marks.find(mark => mark.exam_paper_id == p.exam_paper_id);
                        return `
                            <div class="card" style="padding:0.85rem 1rem; border:1px solid var(--border-color); border-radius:6px; background:var(--surface-color);">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                                    <div style="flex:1; min-width:200px;">
                                        <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.2rem; flex-wrap:wrap;">
                                            <span style="font-weight:700; font-size:0.95rem; color:var(--text-color);">${idx + 1}. ${App.escapeHtml(p.title)}</span>
                                            <span class="badge" style="background:rgba(0,0,0,0.06); color:var(--text-muted); font-size:0.75rem;">${App.escapeHtml(p.paper_code)}</span>
                                            ${p.is_aggregate_contributor ? `
                                                <span class="badge" style="background:#0B3C5D; color:#fff; font-size:0.72rem; padding:0.15rem 0.45rem; border-radius:4px;">🎯 Core Aggregate</span>
                                            ` : `
                                                <span class="badge" style="background:rgba(0,0,0,0.08); color:var(--text-muted); font-size:0.72rem; padding:0.15rem 0.45rem; border-radius:4px;">📝 Graded (Non-Agg)</span>
                                            `}
                                        </div>
                                        <div style="font-size:0.8rem; color:var(--text-muted);">
                                            <span>⏱️ ${p.duration_minutes || 135} Mins</span> &bull; 
                                            <span>💯 ${p.total_marks || 100} Marks</span> &bull;
                                            <span>📖 ${App.escapeHtml(p.subject_name)}</span>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                                        ${m ? `
                                            <span class="badge" style="background:#28a745; color:#fff; font-size:0.8rem; padding:0.25rem 0.5rem;">
                                                Score: ${m.raw_score}/${m.max_marks} (${m.grade_label})
                                            </span>
                                        ` : ''}
                                        <a href="/${App.escapeHtml(p.pdf_file_path)}" target="_blank" download class="btn btn-outline btn-sm" style="display:inline-flex; align-items:center; gap:0.3rem;">
                                            <span>📥</span> Question Paper (PDF)
                                        </a>
                                        ${(isStaff || isParent) && p.marking_guide_pdf_path ? `
                                            <a href="/${App.escapeHtml(p.marking_guide_pdf_path)}" target="_blank" download class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:0.3rem;">
                                                <span>🔑</span> Marking Guide (PDF)
                                            </a>
                                        ` : ''}
                                        ${isStaff ? `
                                            <button class="btn btn-outline btn-sm" style="color:#dc3545; border-color:#dc3545;" onclick="ExamsApp.deleteExamPaper(${p.exam_paper_id}, ${set.exam_set_id}, '${App.escapeHtml(p.title.replace(/'/g, "\\'"))}')">
                                                <span>🗑️</span> Delete
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:0.5rem;">
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button class="btn btn-outline btn-sm" onclick="App.hideModal()">Close</button>
                        ${isStaff ? `
                            <button class="btn btn-outline btn-sm" style="color:#dc3545; border-color:#dc3545;" onclick="ExamsApp.deleteExamSet(${set.exam_set_id}, '${App.escapeHtml(set.title.replace(/'/g, "\\'"))}')">
                                <span>🗑️</span> Delete Exam Set
                            </button>
                        ` : ''}
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        ${isStaff ? `
                            <button class="btn btn-outline btn-sm" onclick="ExamsApp.openUploadPaperModal(${set.exam_set_id})">
                                <span>➕</span> Add Paper PDF
                            </button>
                        ` : ''}
                        ${(isParent || isStaff) ? `
                            <button class="btn btn-primary btn-sm" onclick="App.hideModal(); ExamsApp.openMarkEntryModal(${set.exam_set_id});">
                                <span>📝</span> ${sub ? 'Update Marks' : 'Enter Candidate Marks'}
                            </button>
                        ` : ''}
                        ${sub ? `
                            <button class="btn btn-outline btn-sm" style="color:#28a745; border-color:#28a745;" onclick="App.hideModal(); ExamsApp.openReportCardView(${sub.submission_id});">
                                <span>📜</span> Printable Report Card
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;

            App.showModal(body, `Exam Set: ${set.title}`, 'lg');
        } catch (err) {
            App.showModal(`
                <div class="alert alert-danger">
                    Failed to load exam details: ${App.escapeHtml(err.message || 'Error')}
                </div>
            `, 'Error', 'md');
        }
    },

    /**
     * Parent Mark Entry Portal & Live UNEB Division Calculator
     */
    async openMarkEntryModal(examSetId) {
        if (!this.selectedLearnerId && this.learners.length > 0) {
            this.selectedLearnerId = this.learners[0].learner_id;
        }

        App.showModal(`
            <div style="text-align:center; padding:2rem;">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Loading Mark Entry Portal...</p>
            </div>
        `, 'Candidate Mark Entry & Auto-Grading');

        try {
            const learnerParam = this.selectedLearnerId ? `?learner_id=${this.selectedLearnerId}` : '';
            const res = await API.get(`/api/exams/sets/${examSetId}${learnerParam}`);
            const payload = res.data?.data || res.data || res;
            const set = payload.exam_set || payload.set || (payload.exam_set_id ? payload : {});
            const papers = payload.papers || [];
            const sub = payload.submission || {};
            const existingMarks = payload.marks || [];

            const activeChild = this.learners.find(l => l.learner_id == this.selectedLearnerId) || { full_name: 'Selected Candidate' };

            let modalHtml = `
                <div style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                        <div>
                            <span class="badge" style="background:var(--primary-color); color:#fff; font-size:0.75rem;">${App.escapeHtml(set.class_name || 'Primary')}</span>
                            <span style="font-weight:600; font-size:1.05rem; color:var(--text-color); margin-left:0.4rem;">${App.escapeHtml(set.title || 'Exam Set')}</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted);">
                            Candidate: <strong>${App.escapeHtml(activeChild.full_name)}</strong>
                        </div>
                    </div>
                </div>

                <div class="alert alert-info" style="font-size:0.85rem; margin-bottom:1rem; padding:0.6rem 0.8rem;">
                    💡 <strong>Parent Instructions:</strong> Mark your candidate's handwritten scripts using the official Marking Guides. Enter raw scores below (0 to 100). The system will automatically compute the UNEB Stanine Grade (D1 to F9), Total Aggregate, and Final Division according to national grading rules.
                </div>

                <form id="mark-entry-form" onsubmit="ExamsApp.saveMarks(event, ${examSetId})">
                    <div style="margin-bottom:1rem; display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Candidate Sitting Date</label>
                            <input type="date" class="form-control" name="sitting_date" value="${sub.sitting_date || new Date().toISOString().split('T')[0]}" required style="height:36px; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Parent / Supervisor Remarks</label>
                            <input type="text" class="form-control" name="parent_remarks" value="${App.escapeHtml(sub.parent_remarks || 'Script marked under strict timed conditions.')}" placeholder="e.g. Excellent focus" style="height:36px; font-size:0.9rem;">
                        </div>
                    </div>

                    <div style="border:1px solid var(--border-color); border-radius:6px; overflow:hidden; margin-bottom:1rem;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                            <thead>
                                <tr style="background:var(--surface-color); border-bottom:1px solid var(--border-color); text-align:left;">
                                    <th style="padding:0.5rem 0.75rem;">Subject / Paper</th>
                                    <th style="padding:0.5rem 0.75rem; width:110px;">Role</th>
                                    <th style="padding:0.5rem 0.75rem; width:120px;">Raw Score</th>
                                    <th style="padding:0.5rem 0.75rem; width:90px;">Max</th>
                                    <th style="padding:0.5rem 0.75rem; width:130px;">Stanine Grade</th>
                                    <th style="padding:0.5rem 0.75rem; width:70px; text-align:center;">Absent</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${papers.map((p, idx) => {
                                    const exM = existingMarks.find(m => m.exam_paper_id == p.exam_paper_id) || {};
                                    const defaultScore = exM.raw_score !== undefined ? exM.raw_score : '';
                                    const isContrib = p.is_aggregate_contributor !== undefined ? (p.is_aggregate_contributor ? 1 : 0) : (exM.is_aggregate_contributor !== undefined ? (exM.is_aggregate_contributor ? 1 : 0) : 1);
                                    return `
                                        <tr style="border-bottom:1px solid var(--border-color);" data-paper-id="${p.exam_paper_id}" data-max="${p.total_marks || 100}" data-subject="${App.escapeHtml(p.subject_name)}" data-code="${App.escapeHtml(p.paper_code)}" data-contributor="${isContrib}">
                                            <td style="padding:0.5rem 0.75rem;">
                                                <div style="font-weight:600; color:var(--text-color);">${idx + 1}. ${App.escapeHtml(p.title)}</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">${App.escapeHtml(p.paper_code)} &bull; ${App.escapeHtml(p.subject_name)}</div>
                                            </td>
                                            <td style="padding:0.5rem 0.75rem;">
                                                ${isContrib ? `
                                                    <span class="badge" style="background:#0B3C5D; color:#fff; font-size:0.72rem; padding:0.2rem 0.45rem; border-radius:4px;">🎯 Core Agg</span>
                                                ` : `
                                                    <span class="badge" style="background:rgba(0,0,0,0.08); color:var(--text-muted); font-size:0.72rem; padding:0.2rem 0.45rem; border-radius:4px;">📝 Non-Agg</span>
                                                `}
                                            </td>
                                            <td style="padding:0.5rem 0.75rem;">
                                                <input type="number" step="0.5" min="0" max="${p.total_marks || 100}" 
                                                       class="form-control score-input" 
                                                       data-paper-id="${p.exam_paper_id}"
                                                       value="${defaultScore}" 
                                                       placeholder="0-${p.total_marks || 100}" 
                                                       required
                                                       oninput="ExamsApp.recalculateLivePreview()"
                                                       style="height:34px; font-weight:600; font-size:0.9rem;">
                                            </td>
                                            <td style="padding:0.5rem 0.75rem; color:var(--text-muted); font-weight:500;">
                                                / ${p.total_marks || 100}
                                            </td>
                                            <td style="padding:0.5rem 0.75rem;">
                                                <span class="grade-pill badge" id="grade-pill-${p.exam_paper_id}" style="font-size:0.85rem; padding:0.25rem 0.5rem; background:rgba(0,0,0,0.06); color:var(--text-color);">
                                                    ${exM.grade_label ? `${exM.grade_label} (${exM.grade_point}pt)` : '--'}
                                                </span>
                                            </td>
                                            <td style="padding:0.5rem 0.75rem; text-align:center;">
                                                <input type="checkbox" class="absent-check" data-paper-id="${p.exam_paper_id}" ${exM.is_absent ? 'checked' : ''} onchange="ExamsApp.toggleAbsent(${p.exam_paper_id})">
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Live UNEB Evaluation Summary Box -->
                    <div id="live-grading-box" style="background:var(--surface-color); border:2px solid var(--border-color); border-radius:8px; padding:1rem; margin-bottom:1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                            <div>
                                <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Live UNEB Grading Preview (Core Aggregate Papers)</div>
                                <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.2rem; flex-wrap:wrap;">
                                    <span id="preview-div-badge" class="badge" style="font-size:1.1rem; padding:0.35rem 0.75rem; background:#007bff; color:#fff;">Division --</span>
                                    <span id="preview-agg-text" style="font-weight:700; font-size:1rem; color:var(--text-color);">Total Aggregate: --</span>
                                    <span id="preview-avg-text" style="font-size:0.85rem; color:var(--text-muted);">(Avg: --%)</span>
                                </div>
                            </div>
                            <div id="preview-demotion-notice" style="display:none; max-width:400px; font-size:0.8rem; color:#856404; background:#fff3cd; border:1px solid #ffeeba; padding:0.4rem 0.6rem; border-radius:4px;">
                                ⚠️ <strong>F9 Demotion Rule:</strong> Candidate demoted due to F9.
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="App.hideModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-marks" style="padding:0.4rem 1.25rem;">
                            <span>💾</span> Save Marks & Issue Division Slip
                        </button>
                    </div>
                </form>
            `;

            App.showModal(modalHtml, 'Parent Mark Entry Portal', 'lg');
            this.recalculateLivePreview();
        } catch (err) {
            App.showModal(`
                <div class="alert alert-danger">
                    Failed to open mark entry portal: ${App.escapeHtml(err.message || 'Error')}
                </div>
            `, 'Error', 'md');
        }
    },

    /**
     * Helper to compute Grade on the fly for UI preview
     */
    computeGrade(score, maxMarks) {
        if (maxMarks <= 0) return { pt: 9, lbl: 'F9' };
        const pct = (score / maxMarks) * 100;
        if (pct >= 90) return { pt: 1, lbl: 'D1' };
        if (pct >= 80) return { pt: 2, lbl: 'D2' };
        if (pct >= 70) return { pt: 3, lbl: 'C3' };
        if (pct >= 60) return { pt: 4, lbl: 'C4' };
        if (pct >= 55) return { pt: 5, lbl: 'C5' };
        if (pct >= 50) return { pt: 6, lbl: 'C6' };
        if (pct >= 45) return { pt: 7, lbl: 'P7' };
        if (pct >= 40) return { pt: 8, lbl: 'P8' };
        return { pt: 9, lbl: 'F9' };
    },

    /**
     * Toggle Absent Checkbox
     */
    toggleAbsent(paperId) {
        const row = document.querySelector(`tr[data-paper-id="${paperId}"]`);
        if (!row) return;
        const check = row.querySelector('.absent-check');
        const input = row.querySelector('.score-input');
        if (check && input) {
            input.disabled = check.checked;
            if (check.checked) {
                input.value = 0;
            }
        }
        this.recalculateLivePreview();
    },

    /**
     * Dynamic Live UNEB Calculation in Mark Entry Modal
     */
    recalculateLivePreview() {
        const rows = document.querySelectorAll('#mark-entry-form tbody tr');
        if (!rows.length) return;

        let totalAggregate = 0;
        let totalRaw = 0;
        let totalPossible = 0;
        let countF9 = 0;
        let countPasses = 0;
        let hasAbsent = false;
        let allFilled = true;

        let engGrade = null;
        let mtcGrade = null;

        rows.forEach(r => {
            const paperId = r.getAttribute('data-paper-id');
            const max = parseFloat(r.getAttribute('data-max')) || 100;
            const code = (r.getAttribute('data-code') || '').toUpperCase();
            const subj = (r.getAttribute('data-subject') || '').toLowerCase();
            const isContributor = r.getAttribute('data-contributor') !== '0';

            const check = r.querySelector('.absent-check');
            const input = r.querySelector('.score-input');
            const pill = document.getElementById(`grade-pill-${paperId}`);

            const isAbsent = check ? check.checked : false;
            const val = input.value.trim();

            if (val === '' && !isAbsent) {
                allFilled = false;
                if (pill) pill.innerHTML = '--';
                return;
            }

            totalPossible += max;

            if (isAbsent) {
                if (isContributor) {
                    hasAbsent = true;
                    totalAggregate += 9;
                    countF9++;
                }
                if (pill) {
                    pill.style.background = '#dc354520';
                    pill.style.color = '#dc3545';
                    pill.innerHTML = `F9 (Absent)${!isContributor ? ' <span style="font-size:0.75rem;">(Non-Agg)</span>' : ''}`;
                }
            } else {
                const score = Math.max(0, Math.min(max, parseFloat(val) || 0));
                totalRaw += score;
                const g = this.computeGrade(score, max);

                if (isContributor) {
                    totalAggregate += g.pt;
                    if (g.pt === 9) countF9++;
                    else countPasses++;

                    if (code.includes('ENG') || subj.includes('english')) engGrade = g.pt;
                    if (code.includes('MTC') || code.includes('MATH') || subj.includes('math')) mtcGrade = g.pt;
                }

                if (pill) {
                    const color = g.pt <= 2 ? '#28a745' : (g.pt <= 6 ? '#007bff' : (g.pt <= 8 ? '#ffc107' : '#dc3545'));
                    pill.style.background = `${color}20`;
                    pill.style.color = color;
                    pill.innerHTML = `${g.lbl} (${g.pt} pt)${!isContributor ? ' <span style="font-size:0.72rem; opacity:0.8;">[Non-Agg]</span>' : ''}`;
                }
            }
        });

        const badge = document.getElementById('preview-div-badge');
        const aggText = document.getElementById('preview-agg-text');
        const avgText = document.getElementById('preview-avg-text');
        const demNotice = document.getElementById('preview-demotion-notice');

        if (!badge || !aggText || !avgText || !demNotice) return;

        if (!allFilled) {
            badge.innerHTML = 'Division --';
            badge.style.background = '#6c757d';
            aggText.innerHTML = 'Total Aggregate: --';
            avgText.innerHTML = '(Avg: --%)';
            demNotice.style.display = 'none';
            return;
        }

        const avgPct = totalPossible > 0 ? ((totalRaw / totalPossible) * 100).toFixed(1) : 0;
        aggText.innerHTML = `Total Aggregate: ${totalAggregate}`;
        avgText.innerHTML = `(Avg: ${avgPct}%)`;

        if (hasAbsent) {
            badge.innerHTML = 'Division X (Absent)';
            badge.style.background = '#dc3545';
            demNotice.style.display = 'block';
            demNotice.innerHTML = '⚠️ Candidate absent in one or more core papers.';
            return;
        }

        const isEngPass = engGrade !== null ? engGrade <= 8 : true;
        const isMtcPass = mtcGrade !== null ? mtcGrade <= 8 : true;

        let div = 'U';
        let isDemoted = false;
        let reason = '';

        // UNEB Division Rules
        if (totalAggregate >= 4 && totalAggregate <= 12) {
            if (countF9 === 0 && isEngPass && isMtcPass) {
                div = 'I';
            } else {
                // Strict F9 Demotion Rule: 1, 1, 1, 9 = Aggregate 12 -> Division 2
                div = 'II';
                isDemoted = true;
                reason = `<strong>F9 Demotion Rule:</strong> Aggregate is ${totalAggregate} (Div 1 range), but candidate received an <strong>F9</strong>. Demoted to <strong>Division II</strong>.`;
            }
        } else if (totalAggregate >= 13 && totalAggregate <= 24) {
            if (countPasses >= 3 && (isEngPass || isMtcPass)) {
                div = 'II';
            } else if (countPasses >= 3 && !isEngPass && !isMtcPass) {
                div = 'III';
                isDemoted = true;
                reason = `Demoted to Division III due to failing both English & Mathematics.`;
            } else {
                div = (countPasses >= 2) ? 'IV' : 'U';
                isDemoted = true;
                reason = `Demoted because candidate only passed ${countPasses} subject(s).`;
            }
        } else if (totalAggregate >= 25 && totalAggregate <= 28) {
            div = (countPasses >= 3) ? 'III' : 'IV';
        } else if (totalAggregate >= 29 && totalAggregate <= 32) {
            div = (countPasses >= 2) ? 'IV' : 'U';
        } else {
            div = 'U';
        }

        const divColors = {
            'I': '#28a745',
            'II': '#17a2b8',
            'III': '#ffc107',
            'IV': '#fd7e14',
            'U': '#dc3545'
        };

        badge.innerHTML = `Division ${div}`;
        badge.style.background = divColors[div] || '#6c757d';

        if (isDemoted && reason) {
            demNotice.style.display = 'block';
            demNotice.innerHTML = `⚠️ ${reason}`;
        } else {
            demNotice.style.display = 'none';
        }
    },

    /**
     * Submit Exam Marks & Trigger Server-Side UNEB Auto-Grading Engine
     */
    async saveMarks(event, examSetId) {
        event.preventDefault();
        const form = event.target;
        const btn = document.getElementById('btn-submit-marks');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Calculating Division...';

        const sittingDate = form.elements['sitting_date'].value;
        const parentRemarks = form.elements['parent_remarks'].value;

        const rows = form.querySelectorAll('tbody tr');
        const marks = [];

        rows.forEach(r => {
            const paperId = parseInt(r.getAttribute('data-paper-id'), 10);
            const check = r.querySelector('.absent-check');
            const input = r.querySelector('.score-input');
            const isAbsent = check ? check.checked : false;
            const score = isAbsent ? 0 : parseFloat(input.value) || 0;

            marks.push({
                exam_paper_id: paperId,
                raw_score: score,
                is_absent: isAbsent ? 1 : 0,
                remarks: ''
            });
        });

        try {
            let res;
            if (typeof TMHIS_Sync !== 'undefined' && TMHIS_Sync.submitExamMarks) {
                res = await TMHIS_Sync.submitExamMarks(examSetId, this.selectedLearnerId, marks, sittingDate, parentRemarks);
            } else {
                const payload = {
                    learner_id: this.selectedLearnerId,
                    sitting_date: sittingDate,
                    parent_remarks: parentRemarks,
                    marks: marks
                };
                res = await API.post(`/api/parent/exams/sets/${examSetId}/marks`, payload);
            }

            App.showToast('success', res.message || 'Marks saved and UNEB Division computed successfully!');
            App.hideModal();

            // Reload catalog to show newly graded badge
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));

            // If submission id returned, prompt to view report card
            if (res?.data?.submission_id) {
                this.openReportCardView(res.data.submission_id);
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>💾</span> Save Marks & Issue Division Slip';
            alert('Failed to save exam marks: ' + (err.message || 'Error occurred'));
        }
    },

    /**
     * Printable A4 Terminal Report Card / Exam Slip
     */
    async openReportCardView(submissionId) {
        App.showModal(`
            <div style="text-align:center; padding:2rem;">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Generating Printable Examination Slip & UNEB Report...</p>
            </div>
        `, 'Printable Terminal Report Card');

        try {
            const res = await API.get(`/api/parent/exams/submissions/${submissionId}/report-card`);
            const rc = res.data.report_card;
            const marks = res.data.subject_marks || [];
            const legend = res.data.grading_legend || [];
            const inst = res.data.institution || {};

            const divColor = rc.division === 'I' ? '#28a745' : (rc.division === 'II' ? '#17a2b8' : (rc.division === 'III' ? '#ffc107' : '#dc3545'));

            let cardHtml = `
                <div id="printable-report-card" style="background:#fff; color:#212529; padding:1.5rem; border-radius:6px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size:0.9rem;">
                    
                    <!-- School Header -->
                    <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:0.75rem; margin-bottom:1rem;">
                        <h2 style="margin:0 0 0.2rem 0; font-size:1.4rem; text-transform:uppercase; color:#0B3C5D; letter-spacing:0.5px;">
                            ${App.escapeHtml(inst.name || "THE MASTER'S HOME INTERNATIONAL SCHOOL")}
                        </h2>
                        <div style="font-style:italic; font-size:0.85rem; color:#555; margin-bottom:0.35rem;">
                            "${App.escapeHtml(inst.motto || 'Nurturing Champions in Christ and Academic Excellence')}"
                        </div>
                        <div style="font-size:0.8rem; color:#666;">
                            Accredited Ugandan Primary Curriculum &bull; Kampala, Uganda &bull; Official Terminal Examination Transcript
                        </div>
                        <div style="margin-top:0.4rem; display:inline-block; background:#0B3C5D; color:#fff; padding:0.25rem 0.85rem; border-radius:4px; font-weight:700; font-size:0.85rem; text-transform:uppercase;">
                            ${App.escapeHtml(rc.exam_set_title || 'Termly Examination')}
                        </div>
                    </div>

                    <!-- Candidate Metadata Grid -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; background:#f8f9fa; border:1px solid #dee2e6; border-radius:6px; padding:0.75rem; margin-bottom:1rem; font-size:0.85rem;">
                        <div>
                            <div><strong>Candidate Name:</strong> ${App.escapeHtml(rc.learner_name)}</div>
                            <div><strong>Class Level:</strong> ${App.escapeHtml(rc.class_name)} (${App.escapeHtml(rc.class_code || 'Pri')})</div>
                            <div><strong>Term / Session:</strong> ${App.escapeHtml(rc.term_name || 'Term 3')} (${App.escapeHtml(rc.academic_year || '2026')})</div>
                        </div>
                        <div>
                            <div><strong>Parent / Supervisor:</strong> ${App.escapeHtml(rc.parent_name || 'Parent')}</div>
                            <div><strong>Date of Sitting:</strong> ${App.escapeHtml(rc.sitting_date || rc.submission_date?.split(' ')[0] || '2026-09-17')}</div>
                            <div><strong>Status:</strong> <span style="color:#28a745; font-weight:600;">Verified Official Transcript</span></div>
                        </div>
                    </div>

                    <!-- Subject Marks & UNEB Grade Points Table -->
                    <table style="width:100%; border-collapse:collapse; margin-bottom:1rem; border:1px solid #000; font-size:0.85rem;">
                        <thead>
                            <tr style="background:#e9ecef; border-bottom:1.5px solid #000; text-align:left;">
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6;">Subject Name</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:70px; text-align:center;">Paper</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:95px; text-align:center;">Agg. Role</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:55px; text-align:center;">Max</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:55px; text-align:center;">Mark</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:50px; text-align:center;">%</th>
                                <th style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; width:65px; text-align:center;">Grade</th>
                                <th style="padding:0.4rem 0.6rem;">Remarks / Performance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${marks.map((m, idx) => `
                                <tr style="border-bottom:1px solid #dee2e6; ${idx % 2 === 1 ? 'background:#fdfdfd;' : ''}">
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; font-weight:600;">
                                        ${App.escapeHtml(m.subject_name)}
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center; font-size:0.75rem; color:#555;">
                                        ${App.escapeHtml(m.paper_code)}
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center; font-size:0.75rem;">
                                        ${(m.is_aggregate_contributor !== undefined ? m.is_aggregate_contributor : 1) ? '<strong style="color:#0B3C5D;">Core Agg</strong>' : '<span style="color:#777;">Non-Agg</span>'}
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center;">
                                        ${m.max_marks}
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center; font-weight:700;">
                                        ${m.is_absent ? 'ABS' : m.raw_score}
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center;">
                                        ${m.is_absent ? '0' : m.percentage}%
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; border-right:1px solid #dee2e6; text-align:center; font-weight:700;">
                                        <span style="display:inline-block; padding:1px 6px; border-radius:3px; background:#f0f0f0;">${m.grade_label} (${m.grade_point})</span>
                                    </td>
                                    <td style="padding:0.4rem 0.6rem; font-size:0.8rem; color:#444;">
                                        ${App.escapeHtml(m.remarks || (m.grade_point === 1 ? 'Distinction' : (m.grade_point <= 6 ? 'Credit Pass' : 'Satisfactory')))}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <!-- Aggregate and Division Scorecard Box -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; border:2px solid ${divColor}; border-radius:6px; padding:0.85rem; margin-bottom:1rem; background:${divColor}08;">
                        <div>
                            <div style="font-size:0.75rem; text-transform:uppercase; color:#666; font-weight:700;">Overall Aggregate</div>
                            <div style="font-size:1.8rem; font-weight:800; color:#0B3C5D; line-height:1.2;">
                                ${rc.total_aggregate}
                            </div>
                            <div style="font-size:0.8rem; color:#555;">
                                Total Marks: <strong>${rc.total_raw_marks}</strong> / ${rc.total_possible_marks} (${rc.average_percentage}%)
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.75rem; text-transform:uppercase; color:#666; font-weight:700;">Final UNEB Outcome</div>
                            <div style="font-size:1.8rem; font-weight:800; color:${divColor}; line-height:1.2;">
                                DIVISION ${App.escapeHtml(rc.division)}
                            </div>
                            <div style="font-size:0.8rem; color:#555;">
                                ${rc.division === 'I' ? 'First Grade (Distinction)' : (rc.division === 'II' ? 'Second Grade (Credit Pass)' : 'Standard Pass')}
                            </div>
                        </div>
                    </div>

                    ${rc.teacher_remarks ? `
                        <div style="background:#f8f9fa; border-left:3px solid #0B3C5D; padding:0.5rem 0.75rem; margin-bottom:1rem; font-size:0.85rem;">
                            <strong>Curriculum / Grading Remarks:</strong> ${App.escapeHtml(rc.teacher_remarks)}
                        </div>
                    ` : ''}

                    <!-- UNEB 9-Grade Scale Key -->
                    <div style="font-size:0.7rem; color:#666; border:1px solid #dee2e6; border-radius:4px; padding:0.5rem; margin-bottom:1.25rem;">
                        <strong>UNEB Stanine Grading Key:</strong> D1 (90-100%, 1pt) &bull; D2 (80-89%, 2pt) &bull; C3 (70-79%, 3pt) &bull; C4 (60-69%, 4pt) &bull; C5 (55-59%, 5pt) &bull; C6 (50-54%, 6pt) &bull; P7 (45-49%, 7pt) &bull; P8 (40-44%, 8pt) &bull; F9 (0-39%, 9pt).<br>
                        <em>*Ugandan UNEB Rule: Division 1 requires Aggregate 4-12 with 0 F9s. Any F9 strictly demotes candidates to Division 2.</em>
                    </div>

                    <!-- Signatures Section -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem; padding-top:1.5rem; font-size:0.8rem; border-top:1px dashed #ccc;">
                        <div>
                            <div style="border-bottom:1px solid #000; width:180px; margin-bottom:0.25rem; height:24px;"></div>
                            <strong>Parent / Home Supervisor Signature</strong>
                        </div>
                        <div style="text-align:right;">
                            <div style="border-bottom:1px solid #000; width:180px; margin-left:auto; margin-bottom:0.25rem; height:24px;"></div>
                            <strong>TMHIS Curriculum Dean / Seal</strong>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--border-color);">
                    <button class="btn btn-outline btn-sm" onclick="App.hideModal()">Close</button>
                    <button class="btn btn-primary btn-sm" onclick="window.print()">
                        <span>🖨️</span> Print / Save Official PDF
                    </button>
                </div>
            `;

            App.showModal(cardHtml, `Terminal Exam Slip: ${rc.learner_name}`, 'xl');
        } catch (err) {
            App.showModal(`
                <div class="alert alert-danger">
                    Failed to generate report card: ${App.escapeHtml(err.message || 'Error')}
                </div>
            `, 'Error', 'md');
        }
    },

    /**
     * Show UNEB 9-Grade Scale Info Modal (Large, Prominent View)
     */
    showGradingScaleModal() {
        const modalHtml = `
            <div style="font-size:0.92rem; line-height:1.6; color:#334155;">
                <div style="background:#eff6ff; border-left:4px solid #2563eb; padding:0.85rem 1rem; border-radius:0 8px 8px 0; margin-bottom:1.25rem;">
                    <div style="font-weight:700; color:#1e40af; font-size:1.05rem; margin-bottom:0.25rem;">Official UNEB Primary Leaving Examination (PLE) 9-Point Scale</div>
                    <p style="margin:0; font-size:0.88rem; color:#334155;">
                        The Master's Home International School assesses all termly examination sets using the national standard 9-point stanine scale (<strong>D1</strong> to <strong>F9</strong>) and four aggregate division tiers.
                    </p>
                </div>

                <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:1.5rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; text-align:left;">
                                <th style="padding:0.6rem 0.85rem; width:80px;">Grade</th>
                                <th style="padding:0.6rem 0.85rem; width:80px; text-align:center;">Stanine Points</th>
                                <th style="padding:0.6rem 0.85rem; width:120px;">Mark Range</th>
                                <th style="padding:0.6rem 0.85rem;">Official Classification / Performance Descriptor</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#f0fdf4;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#15803d; font-size:1.05rem;">D1</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">1 pt</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">90% – 100%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#15803d; font-weight:700;">Distinction 1</span> — Outstanding Academic Mastery</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#f0fdf4;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#15803d; font-size:1.05rem;">D2</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">2 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">80% – 89%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#15803d; font-weight:700;">Distinction 2</span> — Excellent Performance</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#eff6ff;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#1d4ed8; font-size:1.05rem;">C3</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">3 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">70% – 79%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#1d4ed8; font-weight:700;">Credit 3</span> — Very Good Understanding</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#eff6ff;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#1d4ed8; font-size:1.05rem;">C4</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">4 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">60% – 69%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#1d4ed8; font-weight:700;">Credit 4</span> — Good Pass</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#eff6ff;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#1d4ed8; font-size:1.05rem;">C5</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">5 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">55% – 59%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#1d4ed8; font-weight:700;">Credit 5</span> — Above Average Credit</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#eff6ff;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#1d4ed8; font-size:1.05rem;">C6</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">6 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">50% – 54%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#1d4ed8; font-weight:700;">Credit 6</span> — Standard Credit Pass</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#fffbeb;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#b45309; font-size:1.05rem;">P7</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">7 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">45% – 49%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#b45309; font-weight:700;">Pass 7</span> — Minimum Pass (Remediation Recommended)</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0; background:#fffbeb;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#b45309; font-size:1.05rem;">P8</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">8 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">40% – 44%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#b45309; font-weight:700;">Pass 8</span> — Bare Minimum Pass</td>
                            </tr>
                            <tr style="background:#fef2f2;">
                                <td style="padding:0.6rem 0.85rem; font-weight:800; color:#b91c1c; font-size:1.05rem;">F9</td>
                                <td style="padding:0.6rem 0.85rem; text-align:center; font-weight:700;">9 pts</td>
                                <td style="padding:0.6rem 0.85rem; font-weight:600;">0% – 39%</td>
                                <td style="padding:0.6rem 0.85rem;"><span style="color:#b91c1c; font-weight:700;">Fail 9</span> — Ungraded / Subject Failure</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h3 style="margin:0 0 0.6rem 0; font-size:1.1rem; color:#0f172a; font-weight:700;">🏆 UNEB Division Determination & Strict Demotion Rules</h3>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; margin-bottom:1.25rem;">
                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:0.85rem;">
                        <div style="font-weight:700; color:#15803d; margin-bottom:0.25rem; font-size:0.95rem;">DIVISION I (First Grade)</div>
                        <div style="font-size:0.85rem; color:#475569;">
                            &bull; Total Aggregate: <strong>4 to 12</strong><br>
                            &bull; Must pass all 4 core subjects (Grade 8 or better).<br>
                            &bull; <strong>Strict Constraint: Zero F9s allowed (0 F9).</strong>
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:0.85rem;">
                        <div style="font-weight:700; color:#0369a1; margin-bottom:0.25rem; font-size:0.95rem;">DIVISION II (Second Grade)</div>
                        <div style="font-size:0.85rem; color:#475569;">
                            &bull; Total Aggregate: <strong>13 to 24</strong> (or 4–12 with 1 F9).<br>
                            &bull; Requires at least 3 passes (at most 1 F9).<br>
                            &bull; Must pass either English or Mathematics.
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:0.85rem;">
                        <div style="font-weight:700; color:#b45309; margin-bottom:0.25rem; font-size:0.95rem;">DIVISION III (Third Grade)</div>
                        <div style="font-size:0.85rem; color:#475569;">
                            &bull; Total Aggregate: <strong>25 to 28</strong>.<br>
                            &bull; Requires at least 3 passes.
                        </div>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:0.85rem;">
                        <div style="font-weight:700; color:#c2410c; margin-bottom:0.25rem; font-size:0.95rem;">DIVISION IV (Fourth Grade)</div>
                        <div style="font-size:0.85rem; color:#475569;">
                            &bull; Total Aggregate: <strong>29 to 32</strong>.<br>
                            &bull; Requires at least 2 passes (at most 2 F9s).
                        </div>
                    </div>
                </div>

                <!-- Highlighted User F9 Demotion Scenario Alert -->
                <div style="background:#fffbeb; border:2px solid #f59e0b; border-radius:8px; padding:0.85rem 1rem; margin-bottom:1rem;">
                    <div style="display:flex; align-items:flex-start; gap:0.6rem;">
                        <span style="font-size:1.4rem; line-height:1;">⚠️</span>
                        <div>
                            <strong style="color:#92400e; font-size:0.95rem;">Crucial Ugandan UNEB Demotion Rule:</strong>
                            <p style="margin:0.2rem 0 0 0; font-size:0.88rem; color:#78350f; line-height:1.5;">
                                If a candidate attains an Aggregate within the Division 1 range (4 to 12) but receives an <strong>F9</strong> in any of the 4 core papers (e.g. <strong>1, 1, 1, 9 = Aggregate 12</strong>), the candidate is <strong>STRICTLY DEMOTED TO DIVISION II</strong>.
                            </p>
                        </div>
                    </div>
                </div>

                <div style="text-align:right; margin-top:1rem;">
                    <button class="btn btn-primary btn-sm" onclick="App.hideModal()" style="padding:0.45rem 1.25rem; font-size:0.9rem;">Understood / Close</button>
                </div>
            </div>
        `;
        App.showModal(modalHtml, 'Ugandan UNEB Primary Grading Rules & 9-Point Scale', 'lg');
    },

    /**
     * Teacher & Officer: Create Exam Set Modal
     */
    async openCreateSetModal() {
        if (!this.classes || this.classes.length === 0) {
            try {
                const cRes = await API.get('/api/curriculum/classes').catch(() => API.get('/api/parent/classes')).catch(() => ({ data: [] }));
                this.classes = Array.isArray(cRes?.data) ? cRes.data : (cRes?.data?.classes || []);
            } catch (e) {
                this.classes = [];
            }
        }

        if (!this.terms || this.terms.length === 0) {
            try {
                const tRes = await API.get('/api/curriculum/terms').catch(() => API.get('/api/parent/terms')).catch(() => ({ data: [] }));
                this.terms = Array.isArray(tRes?.data) ? tRes.data : (tRes?.data?.terms || []);
            } catch (e) {
                this.terms = [];
            }
        }

        const modalHtml = `
            <form id="create-exam-set-form" onsubmit="ExamsApp.submitCreateSet(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Target Class *</label>
                        <select class="form-control" name="class_id" required style="height:36px; font-size:0.9rem;">
                            <option value="">Select Class</option>
                            ${this.classes.map(c => `<option value="${c.class_id}">${App.escapeHtml(c.class_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Exam Type *</label>
                        <select class="form-control" name="exam_type" required style="height:36px; font-size:0.9rem;">
                            <option value="beginning_of_term">Beginning of Term</option>
                            <option value="mid_term" selected>Mid-Term Exam</option>
                            <option value="end_of_term">End of Term Exam</option>
                            <option value="mock_ple">Mock PLE Series</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Academic Year *</label>
                        <input type="text" class="form-control" name="academic_year" value="2026" required style="height:36px; font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Curriculum Term</label>
                        <select class="form-control" name="term_id" style="height:36px; font-size:0.9rem;">
                            <option value="">Term 3 (Active Session)</option>
                            ${(this.terms || []).map(t => `<option value="${t.term_id}">${App.escapeHtml(t.term_name || 'Term')}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Examination Set Title *</label>
                    <input type="text" class="form-control" name="title" placeholder="e.g. Primary 5 Mid-Term 3 Comprehensive Examination 2026" required style="height:36px; font-size:0.9rem;">
                </div>

                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Description & Syllabus Scope</label>
                    <textarea class="form-control" name="description" rows="2" placeholder="Brief summary of covered topics..." style="font-size:0.9rem;"></textarea>
                </div>

                <div style="margin-bottom:0.75rem;">
                    <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Candidate & Parent Sitting Instructions</label>
                    <textarea class="form-control" name="instructions" rows="2" placeholder="1. Print in A4...\n2. 2h 15m time limit..." style="font-size:0.9rem;">1. Print each paper in clean A4 size.
2. Candidate must sit under timed, quiet conditions without reference materials.
3. Marking guide is provided for home evaluation.</textarea>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Release Date</label>
                        <input type="date" class="form-control" name="release_date" value="${new Date().toISOString().split('T')[0]}" required style="height:36px; font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Publish Status</label>
                        <select class="form-control" name="status" style="height:36px; font-size:0.9rem;">
                            <option value="published">Published (Immediate Release to Parents)</option>
                            <option value="draft">Draft (Private Authoring)</option>
                        </select>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="App.hideModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary btn-sm" id="btn-save-set" style="padding:0.4rem 1.25rem;">
                        <span>➕</span> Create Exam Set
                    </button>
                </div>
            </form>
        `;
        App.showModal(modalHtml, 'Create New Termly Exam Set');
    },

    /**
     * Teacher & Officer: Submit New Exam Set
     */
    async submitCreateSet(event) {
        event.preventDefault();
        const form = event.target;
        const btn = document.getElementById('btn-save-set');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Creating...';

        const payload = {
            class_id: parseInt(form.elements['class_id'].value, 10),
            term_id: form.elements['term_id']?.value ? parseInt(form.elements['term_id'].value, 10) : null,
            academic_year: form.elements['academic_year']?.value?.trim() || '2026',
            exam_type: form.elements['exam_type'].value,
            title: form.elements['title'].value.trim(),
            description: form.elements['description'].value.trim(),
            instructions: form.elements['instructions'].value.trim(),
            release_date: form.elements['release_date'].value,
            status: form.elements['status'].value
        };

        try {
            const res = await API.post('/api/officer/exams/sets', payload);
            const newSetId = res.exam_set_id || res.data?.exam_set_id;
            App.showToast('success', res.message || 'Exam set created successfully!');
            App.hideModal();
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));

            // If created, prompt to immediately add paper PDFs
            if (newSetId) {
                setTimeout(() => {
                    this.openUploadPaperModal(newSetId);
                }, 300);
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>➕</span> Create Exam Set';
            alert('Failed to create exam set: ' + (err.message || 'Error'));
        }
    },

    /**
     * Teacher & Officer: Open Upload Exam Paper PDF Modal
     */
    /**
     * Teacher & Officer: Open Upload Exam Paper PDF Modal
     */
    async openUploadPaperModal(examSetId) {
        const setId = parseInt(examSetId, 10);
        App.showModal(`
            <div style="text-align:center; padding:2rem;">
                <div class="spinner"></div>
                <p style="margin-top:1rem;">Preparing Paper Upload Studio...</p>
            </div>
        `, 'Add Exam Paper PDF');

        try {
            const setRes = await API.get(`/api/exams/sets/${setId}`);
            const payload = setRes.data?.data || setRes.data || setRes;
            const setData = payload.exam_set || payload.set || (payload.exam_set_id ? payload : {});
            const papers = Array.isArray(payload.papers) ? payload.papers : [];
            const classId = setData.class_id || 1;

            // Fetch subjects for this class
            let subjects = [];
            try {
                const subRes = await API.get(`/api/curriculum/classes/${classId}/subjects`);
                subjects = Array.isArray(subRes?.data) ? subRes.data : (subRes?.data?.subjects || []);
            } catch (e) {
                // Fallback to all subjects
                try {
                    const allSub = await API.get(`/api/curriculum/subjects`);
                    subjects = (Array.isArray(allSub?.data) ? allSub.data : []).filter(s => s.class_id == classId);
                } catch (e2) {
                    subjects = [];
                }
            }

            if (!subjects || subjects.length === 0) {
                // Standard fallback subjects
                subjects = [
                    { subject_id: 1, subject_name: 'English Language', subject_code: 'ENG' },
                    { subject_id: 2, subject_name: 'Mathematics', subject_code: 'MTC' },
                    { subject_id: 3, subject_name: 'Integrated Science', subject_code: 'SCI' },
                    { subject_id: 4, subject_name: 'Social Studies & RE', subject_code: 'SST' }
                ];
            }

            // Identify and skip subjects that have already been added to this exam set
            const existingSubjectIds = new Set(papers.map(p => parseInt(p.subject_id, 10)));
            const availableSubjects = subjects.filter(s => !existingSubjectIds.has(parseInt(s.subject_id, 10)));

            if (availableSubjects.length === 0) {
                const allSetHtml = `
                    <div style="text-align:center; padding:1.75rem 1rem;">
                        <div style="font-size:3rem; margin-bottom:0.75rem;">🎉</div>
                        <div style="font-weight:700; font-size:1.15rem; color:var(--text-color); margin-bottom:0.5rem;">All Subject Examination Papers Have Been Added!</div>
                        <p style="color:var(--text-muted); font-size:0.9rem; max-width:480px; margin:0 auto 1.5rem auto; line-height:1.5;">
                            All <strong>${papers.length} curriculum subjects</strong> for <strong>${App.escapeHtml(setData.class_name || 'this class')}</strong> have already been attached to this examination set.
                        </p>
                        <div style="display:flex; justify-content:center; gap:0.75rem;">
                            <button class="btn btn-outline btn-sm" onclick="App.hideModal()">Close</button>
                            <button class="btn btn-primary btn-sm" onclick="ExamsApp.viewSetDetails(${setId})">View Exam Set Papers</button>
                        </div>
                    </div>
                `;
                App.showModal(allSetHtml, 'Add Subject Examination Paper (PDF)', 'md');
                return;
            }

            const modalHtml = `
                <div style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <div style="font-weight:700; font-size:1.05rem; color:var(--text-color);">${App.escapeHtml(setData.title || 'Examination Set')}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted);">${App.escapeHtml(setData.class_name || 'Primary')} &bull; Academic Year ${App.escapeHtml(setData.academic_year || '2026')}</div>
                    </div>
                    <div style="text-align:right; font-size:0.78rem; color:var(--text-muted);">
                        <span class="badge" style="background:rgba(40,167,69,0.12); color:#28a745; font-weight:600; padding:3px 8px; border-radius:4px;">
                            ${papers.length} Added &bull; ${availableSubjects.length} Remaining
                        </span>
                    </div>
                </div>

                <form id="upload-paper-form" onsubmit="ExamsApp.submitUploadPaper(event, ${setId})">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Curriculum Subject *</label>
                            <select class="form-control" name="subject_id" id="paper-subject-select" required onchange="ExamsApp.onSubjectSelected(this, '${App.escapeHtml(setData.class_code || 'P5')}')" style="height:36px; font-size:0.9rem;">
                                <option value="">Select Subject (${availableSubjects.length} unadded)</option>
                                ${availableSubjects.map(s => `<option value="${s.subject_id}" data-name="${App.escapeHtml(s.subject_name)}" data-code="${App.escapeHtml(s.subject_code)}">${App.escapeHtml(s.subject_name)} (${App.escapeHtml(s.subject_code)})</option>`).join('')}
                            </select>
                            ${existingSubjectIds.size > 0 ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">⏭️ Skipping ${existingSubjectIds.size} already added subject(s)</div>` : ''}
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Paper Code *</label>
                            <input type="text" class="form-control" name="paper_code" id="paper-code-input" placeholder="e.g. ENG-P5" required style="height:36px; font-size:0.9rem;">
                        </div>
                    </div>

                    <div style="margin-bottom:0.75rem;">
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Paper Title *</label>
                        <input type="text" class="form-control" name="title" id="paper-title-input" placeholder="e.g. Primary 5 English Language Paper 1" required style="height:36px; font-size:0.9rem;">
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Duration (Mins)</label>
                            <input type="number" class="form-control" name="duration_minutes" value="135" min="15" max="300" required style="height:36px; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Total Possible Marks</label>
                            <input type="number" class="form-control" name="total_marks" value="100" min="10" max="500" required style="height:36px; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Paper Order</label>
                            <input type="number" class="form-control" name="paper_order" value="${papers.length + 1}" min="1" max="20" required style="height:36px; font-size:0.9rem;">
                        </div>
                    </div>

                    <!-- Aggregate Contributor Flag Toggle -->
                    <div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:8px; padding:0.75rem 0.85rem; margin-bottom:0.85rem; display:flex; align-items:flex-start; gap:0.6rem;">
                        <input type="checkbox" name="is_aggregate_contributor" id="paper-aggregate-contributor" value="1" checked style="margin-top:0.25rem; transform:scale(1.15); cursor:pointer;">
                        <div>
                            <label for="paper-aggregate-contributor" style="font-size:0.88rem; font-weight:700; color:var(--text-color); cursor:pointer; display:block; margin-bottom:0.15rem;">
                                🎯 Contributes to UNEB Total Aggregate & Division (Core Subject)
                            </label>
                            <p style="margin:0; font-size:0.78rem; color:var(--text-muted); line-height:1.35;">
                                When checked, this paper's Stanine grade point (1–9) will contribute to the candidate's UNEB Total Aggregate (4–36) and Division determination. Uncheck for subsidiary / elective papers (e.g. Kiswahili, CAPE, French) that are graded but excluded from the core 4-aggregate.
                            </p>
                        </div>
                    </div>

                    <!-- PDF Upload Fields & Quick Template Option -->
                    <div style="background:var(--surface-color); border:1px solid var(--border-color); border-radius:8px; padding:0.85rem; margin-bottom:0.85rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <span style="font-size:0.85rem; font-weight:700; color:var(--text-color);">PDF Documents & Release Assets</span>
                            <button type="button" class="btn btn-outline btn-sm" onclick="ExamsApp.fillSamplePdfTemplate()" style="font-size:0.78rem; padding:0.2rem 0.5rem;">
                                📄 Auto-fill Standard Template PDF
                            </button>
                        </div>

                        <div style="margin-bottom:0.75rem;">
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">
                                📄 Question Paper PDF *
                            </label>
                            <input type="file" class="form-control" name="pdf_file" id="paper-pdf-file" accept=".pdf" style="font-size:0.85rem; margin-bottom:0.35rem;">
                            <input type="text" class="form-control" name="pdf_file_path" id="paper-pdf-path" placeholder="Or enter existing PDF path (e.g. storage/uploads/exams/paper_p6_eng_t3_2026.pdf)" style="font-size:0.85rem; height:34px;">
                        </div>

                        <div>
                            <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">
                                🔑 Marking Guide / Scheme PDF (Optional)
                            </label>
                            <input type="file" class="form-control" name="marking_guide_pdf" id="paper-guide-file" accept=".pdf" style="font-size:0.85rem; margin-bottom:0.35rem;">
                            <input type="text" class="form-control" name="marking_guide_pdf_path" id="paper-guide-path" placeholder="Or enter existing guide PDF path (e.g. storage/uploads/exams/guide_p6_eng_t3_2026.pdf)" style="font-size:0.85rem; height:34px;">
                        </div>
                    </div>

                    <div style="margin-bottom:1rem;">
                        <label style="font-size:0.85rem; font-weight:600; display:block; margin-bottom:0.25rem;">Specific Paper Instructions</label>
                        <textarea class="form-control" name="instructions" rows="2" placeholder="e.g. Section A: 40 questions (40 marks), Section B: 15 questions (60 marks)..." style="font-size:0.9rem;">Section A: Answer all questions (40 marks).
Section B: Answer all questions (60 marks). Use blue or black ink.</textarea>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="App.hideModal(); ExamsApp.viewSetDetails(${setId});">Back</button>
                        <button type="submit" class="btn btn-primary btn-sm" id="btn-save-paper" style="padding:0.4rem 1.25rem;">
                            <span>📥</span> Upload & Attach Paper PDF
                        </button>
                    </div>
                </form>
            `;
            App.showModal(modalHtml, 'Add Subject Examination Paper (PDF)', 'lg');
        } catch (err) {
            App.showModal(`
                <div class="alert alert-danger">
                    Failed to open paper upload studio: ${App.escapeHtml(err.message || 'Error')}
                </div>
            `, 'Error', 'md');
        }
    },

    /**
     * Helper to pre-fill standard curriculum sample PDF paths
     */
    fillSamplePdfTemplate() {
        const pPath = document.getElementById('paper-pdf-path');
        const gPath = document.getElementById('paper-guide-path');
        if (pPath) pPath.value = 'storage/uploads/exams/paper_p6_eng_t3_2026.pdf';
        if (gPath) gPath.value = 'storage/uploads/exams/guide_p6_eng_t3_2026.pdf';
        App.showToast('info', 'Sample curriculum PDF templates selected.');
    },

    /**
     * Autofill paper code, title, and aggregate contribution when subject is picked
     */
    onSubjectSelected(selectElem, classCode) {
        const opt = selectElem.options[selectElem.selectedIndex];
        if (!opt || !opt.value) return;

        const sName = opt.getAttribute('data-name') || opt.text.split('(')[0].trim();
        const sCode = opt.getAttribute('data-code') || 'SUB';

        const codeInput = document.getElementById('paper-code-input');
        const titleInput = document.getElementById('paper-title-input');
        const aggCheck = document.getElementById('paper-aggregate-contributor');

        if (codeInput) {
            codeInput.value = `${sCode}-${classCode || 'P5'}`;
        }
        if (titleInput) {
            titleInput.value = `${classCode || 'Primary'} ${sName} Examination Paper 1`;
        }

        if (aggCheck) {
            const upperCode = sCode.toUpperCase();
            const lowerName = sName.toLowerCase();
            const isNonCore = upperCode.includes('CAPE') || upperCode.includes('KIS') || lowerName.includes('kiswahili') || lowerName.includes('creative arts') || lowerName.includes('physical ed') || lowerName.includes('french');
            aggCheck.checked = !isNonCore;
        }
    },

    /**
     * Teacher & Officer: Submit Uploaded Paper
     */
    async submitUploadPaper(event, examSetId) {
        event.preventDefault();
        const setId = parseInt(examSetId, 10);
        const form = event.target;
        const btn = document.getElementById('btn-save-paper');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Uploading PDF...';
        }

        const fileInput = form.elements['pdf_file'];
        const guideFileInput = form.elements['marking_guide_pdf'];
        const textPath = (form.elements['pdf_file_path']?.value || '').trim();
        const guideTextPath = (form.elements['marking_guide_pdf_path']?.value || '').trim();
        const aggCheck = form.elements['is_aggregate_contributor'];

        try {
            const formData = new FormData(form);

            // Explicitly set is_aggregate_contributor
            formData.set('is_aggregate_contributor', aggCheck && aggCheck.checked ? '1' : '0');

            // If no physical file was chosen, delete the empty file field so PHP treats it as text path
            if (!fileInput || !fileInput.files || !fileInput.files.length) {
                formData.delete('pdf_file');
                formData.set('pdf_file_path', textPath || 'storage/uploads/exams/paper_p6_eng_t3_2026.pdf');
            }
            if (!guideFileInput || !guideFileInput.files || !guideFileInput.files.length) {
                formData.delete('marking_guide_pdf');
                if (guideTextPath) {
                    formData.set('marking_guide_pdf_path', guideTextPath);
                }
            }

            const res = await API.post(`/api/officer/exams/sets/${setId}/papers`, formData);
            App.showToast('success', res.message || 'Exam paper PDF attached successfully!');
            App.hideModal();

            // Refresh and show exam set details
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));
            this.viewSetDetails(setId);
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📥</span> Upload & Attach Paper PDF';
            }
            alert('Failed to upload exam paper: ' + (err.message || 'Error'));
        }
    },

    /**
     * Teacher & Officer: Publish Exam Set
     */
    async publishSet(examSetId) {
        if (!confirm('Are you sure you want to publish this examination set? It will immediately become available for parents and candidates to download and sit.')) {
            return;
        }

        try {
            const res = await API.post(`/api/officer/exams/sets/${examSetId}/publish`, {});
            App.showToast('success', res.message || 'Exam set published successfully!');
            App.hideModal();
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to publish exam set: ' + (err.message || 'Error'));
        }
    },

    /**
     * Teacher & Officer: Delete Exam Set
     */
    async deleteExamSet(examSetId, title) {
        const setId = parseInt(examSetId, 10);
        const name = title || 'this examination set';
        if (!confirm(`Are you sure you want to delete "${name}"?\n\n⚠️ This action is permanent and will delete all subject papers, attachments, submissions, and recorded marks for this set.`)) {
            return;
        }

        try {
            const res = await API.delete(`/api/officer/exams/sets/${setId}`);
            App.showToast('success', res.message || 'Exam set deleted successfully');
            App.hideModal();
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));
        } catch (err) {
            alert('Failed to delete examination set: ' + (err.message || 'Server error'));
        }
    },

    /**
     * Teacher & Officer: Delete Exam Paper
     */
    async deleteExamPaper(paperId, examSetId, title) {
        const pId = parseInt(paperId, 10);
        const sId = parseInt(examSetId, 10);
        const name = title || 'this examination paper';
        if (!confirm(`Are you sure you want to delete "${name}"?\n\n⚠️ This will remove the question paper PDF, marking guide, and any marks associated with it.`)) {
            return;
        }

        try {
            const res = await API.delete(`/api/officer/exams/papers/${pId}`);
            App.showToast('success', res.message || 'Exam paper deleted successfully');
            await this.loadExamSets();
            this.renderCatalogView(document.getElementById('app-content'));
            if (sId) {
                this.viewSetDetails(sId);
            }
        } catch (err) {
            alert('Failed to delete examination paper: ' + (err.message || 'Server error'));
        }
    }
};

window.ExamsApp = ExamsApp;


