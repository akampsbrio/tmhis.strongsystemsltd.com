/**
 * TMHIS API Client - Standardized JSON Request, Offline Fallback & Transparent Cache
 */
const API = {
    tokenKey: 'tmhis_auth_token',

    getToken() {
        return localStorage.getItem(this.tokenKey);
    },

    setToken(token) {
        if (token) {
            localStorage.setItem(this.tokenKey, token);
        } else {
            localStorage.removeItem(this.tokenKey);
        }
    },

    isOffline() {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
        if (typeof TMHIS_Sync !== 'undefined' && TMHIS_Sync.isOnlineState === false) return true;
        return false;
    },

    async request(url, options = {}) {
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        const method = (options.method || 'GET').toUpperCase();
        const headers = {
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        if (!isFormData && !headers['Content-Type'] && method !== 'GET') {
            headers['Content-Type'] = 'application/json';
        }

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 1. INSTANT OFFLINE FAST-PATH (0ms latency, no fetch call)
        if (this.isOffline()) {
            if (method === 'GET') {
                const cached = await this.getOfflineFallback(url);
                if (cached) return cached;

                // Return graceful empty fallback for unknown GETs in offline mode
                return {
                    success: true,
                    data: null,
                    offline: true,
                    fromCache: true,
                    message: 'Offline mode: resource not in local cache.'
                };
            }

            // For offline mutations, throw immediately so caller or TMHIS_Sync can queue it
            const offlineErr = new Error('You are currently offline. Operations will sync when reconnected.');
            offlineErr.isOffline = true;
            offlineErr.status = 503;
            throw offlineErr;
        }

        // 2. ONLINE REQUEST WITH STRICT 2500ms TIMEOUT
        const controller = new AbortController();
        const timeoutMs = options.timeoutMs || 2500;
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        const config = {
            ...options,
            method,
            headers,
            signal: options.signal || controller.signal
        };

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            const json = await response.json().catch(() => ({
                success: false,
                message: 'Unexpected server response format.',
                errors: ['parse_error']
            }));

            if (!response.ok) {
                // If 401 Unauthorized, trigger auth logout
                if (response.status === 401 && !url.includes('/login')) {
                    if (typeof Auth !== 'undefined' && Auth.clearSession) {
                        Auth.clearSession();
                        window.location.hash = '#login';
                    }
                }

                // If server returns 503 or offline error during GET, fallback to cache immediately
                if (method === 'GET' && (response.status === 503 || json.errors?.includes('offline_mode'))) {
                    const cached = await this.getOfflineFallback(url);
                    if (cached) return cached;
                }

                const error = new Error(json.message || `Request failed with status ${response.status}`);
                error.data = json;
                error.status = response.status;
                throw error;
            }

            // Transparently cache successful GET response into IndexedDB
            if (method === 'GET' && json && json.success && json.data) {
                this.cacheResponse(url, json.data).catch(e => console.warn('[TMHIS API] Cache write warning:', e));
            }

            return json;
        } catch (err) {
            clearTimeout(timeoutId);

            // If network timed out or failed, update online state to offline
            if (typeof TMHIS_Sync !== 'undefined' && TMHIS_Sync.setOnlineState && (err.name === 'AbortError' || !navigator.onLine)) {
                TMHIS_Sync.setOnlineState(false);
            }

            // If GET request failed due to network error/timeout, fallback immediately to IndexedDB
            if (method === 'GET') {
                const cached = await this.getOfflineFallback(url);
                if (cached) {
                    console.info('[TMHIS API] Served cached response after network drop:', url);
                    return cached;
                }
            }

            if (this.isOffline() || err.name === 'AbortError') {
                console.warn('[TMHIS API] Network unreachable/timed out:', url);
                const offlineErr = new Error('You are currently offline. Operations will sync when reconnected.');
                offlineErr.isOffline = true;
                offlineErr.status = 503;
                throw offlineErr;
            }
            throw err;
        }
    },

    get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    },

    post(url, data, options = {}) {
        const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
        return this.request(url, {
            ...options,
            method: 'POST',
            body: isFormData ? data : JSON.stringify(data)
        });
    },

    patch(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    upload(url, formData, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            body: formData
        });
    },

    delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    },

    // ----------------------------------------------------
    // Transparent Local Caching Helpers
    // ----------------------------------------------------
    async cacheResponse(url, data) {
        if (typeof TMHIS_DB === 'undefined' || !TMHIS_DB.put) return;
        const cleanUrl = url.split('?')[0];

        try {
            // 1. Learners
            if (cleanUrl === '/api/parent/learners') {
                const list = Array.isArray(data) ? data : (data.learners || []);
                if (list.length) await TMHIS_DB.saveLearners(list);
            } else if (cleanUrl.startsWith('/api/parent/learners/')) {
                const single = data.learner || data;
                if (single && single.learner_id) await TMHIS_DB.saveLearner(single);
            }

            // 2. Classes & Terms
            else if (cleanUrl === '/api/parent/classes' || cleanUrl === '/api/curriculum/classes') {
                const list = Array.isArray(data) ? data : (data.classes || []);
                if (list.length) await TMHIS_DB.saveClasses(list);
            } else if (cleanUrl === '/api/parent/terms' || cleanUrl === '/api/curriculum/terms') {
                const list = Array.isArray(data) ? data : (data.terms || []);
                if (list.length) await TMHIS_DB.saveTerms(list);
            }

            // 3. Subjects
            else if (cleanUrl.includes('/subjects')) {
                if (Array.isArray(data)) {
                    await TMHIS_DB.saveSubjects(data);
                } else if (data.subjects && Array.isArray(data.subjects)) {
                    await TMHIS_DB.saveSubjects(data.subjects);
                }
            }

            // 4. Lessons
            else if (cleanUrl.includes('/lessons')) {
                if (cleanUrl.match(/\/subjects\/\d+\/lessons/)) {
                    const lessons = Array.isArray(data) ? data : (data.lessons || []);
                    if (lessons.length) await TMHIS_DB.saveLessons(lessons);
                } else if (cleanUrl.match(/\/lessons\/\d+/)) {
                    const lesson = data.lesson || data;
                    if (lesson && lesson.lesson_id) await TMHIS_DB.put('lessons', lesson);
                }
            }

            // 5. Guides
            else if (cleanUrl === '/api/parent/guides' || cleanUrl === '/api/guides') {
                const guides = Array.isArray(data) ? data : (data.guides || []);
                if (guides.length) await TMHIS_DB.saveGuides(guides);
            } else if (cleanUrl.startsWith('/api/guides/')) {
                const guide = data.guide || data;
                if (guide && guide.guide_id) await TMHIS_DB.put('guides', guide);
            }

            // 6. Schedules
            else if (cleanUrl === '/api/parent/schedule' || cleanUrl.startsWith('/api/parent/schedule')) {
                const schedules = Array.isArray(data) ? data : (data.schedules || []);
                if (schedules.length) await TMHIS_DB.saveSchedules(schedules);
            }

            // 7. Assessments
            else if (cleanUrl === '/api/assessments') {
                const assessments = Array.isArray(data) ? data : (data.assessments || []);
                if (assessments.length) await TMHIS_DB.saveAssessments(assessments);
            }

            // 8. Exams
            else if (cleanUrl === '/api/exams/sets') {
                const exams = Array.isArray(data) ? data : (data.sets || []);
                if (exams.length) await TMHIS_DB.saveExams(exams);
            }
        } catch (e) {
            console.warn('[TMHIS API] cacheResponse error:', e);
        }
    },

    async getOfflineFallback(url) {
        if (typeof TMHIS_DB === 'undefined') return null;

        try {
            const parsedUrl = new URL(url, 'http://localhost');
            const cleanUrl = parsedUrl.pathname;
            const searchParams = parsedUrl.searchParams;

            // 0. Auth Profile Check
            if (cleanUrl === '/api/auth/me') {
                if (typeof Auth !== 'undefined') {
                    const user = Auth.getUser();
                    if (user) {
                        return { success: true, data: user, offline: true, fromCache: true };
                    }
                }
                return { success: true, data: null, offline: true, fromCache: true };
            }

            // 1. Learners List & Single
            if (cleanUrl === '/api/parent/learners') {
                const list = await TMHIS_DB.getLearners();
                return { success: true, data: list || [], offline: true, fromCache: true, message: 'Loaded from local offline store.' };
            }
            const learnerMatch = cleanUrl.match(/\/api\/parent\/learners\/(\d+)/);
            if (learnerMatch) {
                const id = Number(learnerMatch[1]);
                const learner = await TMHIS_DB.getLearner(id);
                if (learner) {
                    return { success: true, data: learner, offline: true, fromCache: true };
                }
            }

            // 2. Classes & Terms
            if (cleanUrl === '/api/parent/classes' || cleanUrl === '/api/curriculum/classes') {
                const classes = await TMHIS_DB.getClasses();
                return { success: true, data: classes || [], offline: true, fromCache: true };
            }
            if (cleanUrl === '/api/parent/terms' || cleanUrl === '/api/curriculum/terms') {
                const terms = await TMHIS_DB.getTerms();
                return { success: true, data: terms || [], offline: true, fromCache: true };
            }

            // 3. Subjects
            const classSubMatch = cleanUrl.match(/\/api\/curriculum\/classes\/(\d+)\/subjects/);
            if (classSubMatch) {
                const classId = Number(classSubMatch[1]);
                const subjects = await TMHIS_DB.getSubjects(classId);
                return { success: true, data: subjects || [], offline: true, fromCache: true };
            }
            if (cleanUrl === '/api/curriculum/subjects') {
                const subjects = await TMHIS_DB.getSubjects();
                return { success: true, data: subjects || [], offline: true, fromCache: true };
            }
            const singleSubMatch = cleanUrl.match(/\/api\/curriculum\/subjects\/(\d+)$/);
            if (singleSubMatch) {
                const subjectId = Number(singleSubMatch[1]);
                const allSubs = await TMHIS_DB.getSubjects();
                const subject = allSubs.find(s => s.subject_id == subjectId) || null;
                return { success: true, data: subject, offline: true, fromCache: true };
            }

            // 4. Lessons
            const subjectLessonMatch = cleanUrl.match(/\/api\/curriculum\/subjects\/(\d+)\/lessons/);
            if (subjectLessonMatch) {
                const subjectId = Number(subjectLessonMatch[1]);
                const lessons = await TMHIS_DB.getLessons(subjectId);
                return {
                    success: true,
                    data: { lessons: lessons || [], total: (lessons || []).length },
                    offline: true,
                    fromCache: true
                };
            }
            const singleLessonMatch = cleanUrl.match(/\/api\/curriculum\/lessons\/(\d+)/);
            if (singleLessonMatch) {
                const lessonId = Number(singleLessonMatch[1]);
                const lesson = await TMHIS_DB.getLesson(lessonId);
                return { success: true, data: lesson || null, offline: true, fromCache: true };
            }

            // 5. Guides
            if (cleanUrl === '/api/parent/guides' || cleanUrl === '/api/guides') {
                const guides = await TMHIS_DB.getGuides();
                return { 
                    success: true, 
                    data: { guides: guides || [], total: (guides || []).length }, 
                    offline: true, 
                    fromCache: true 
                };
            }
            const singleGuideMatch = cleanUrl.match(/\/api\/guides\/(\d+)/);
            if (singleGuideMatch) {
                const guideId = Number(singleGuideMatch[1]);
                const guide = await TMHIS_DB.get('guides', guideId);
                return { success: true, data: guide || null, offline: true, fromCache: true };
            }

            // 6. Schedules & Roadmaps
            if (cleanUrl === '/api/parent/schedule/term-summary') {
                const learnerId = searchParams.get('learner_id');
                const schedules = await TMHIS_DB.getSchedules(learnerId ? Number(learnerId) : null);
                const completed = schedules.filter(s => s.status === 'completed').length;
                const inProgress = schedules.filter(s => s.status === 'in_progress').length;
                const pending = schedules.filter(s => s.status === 'pending' || !s.status).length;
                const total = schedules.length;
                const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
                return {
                    success: true,
                    data: {
                        total_scheduled: total,
                        completed_count: completed,
                        in_progress_count: inProgress,
                        pending_count: pending,
                        completion_rate: rate
                    },
                    offline: true,
                    fromCache: true
                };
            }

            if (cleanUrl === '/api/parent/schedule/suggested-next') {
                const learnerId = searchParams.get('learner_id');
                const schedules = await TMHIS_DB.getSchedules(learnerId ? Number(learnerId) : null);
                const pendingList = schedules.filter(s => s.status !== 'completed');
                return {
                    success: true,
                    data: {
                        suggestions: pendingList.slice(0, 3)
                    },
                    offline: true,
                    fromCache: true
                };
            }

            if (cleanUrl === '/api/parent/schedule/term-roadmap') {
                const learnerId = searchParams.get('learner_id');
                const schedules = await TMHIS_DB.getSchedules(learnerId ? Number(learnerId) : null);
                return {
                    success: true,
                    data: {
                        roadmap: schedules || []
                    },
                    offline: true,
                    fromCache: true
                };
            }

            if (cleanUrl === '/api/parent/schedule') {
                const learnerId = searchParams.get('learner_id');
                const startDate = searchParams.get('start_date');
                const endDate = searchParams.get('end_date');
                const schedules = await TMHIS_DB.getSchedulesByRange(learnerId ? Number(learnerId) : null, startDate, endDate);
                return { success: true, data: schedules || [], offline: true, fromCache: true };
            }

            // 7. Assessments & Quiz Results
            const singleAttemptResultMatch = cleanUrl.match(/\/api\/attempts\/(\d+)\/result/);
            if (singleAttemptResultMatch) {
                const attemptId = Number(singleAttemptResultMatch[1]);
                const allResults = await TMHIS_DB.getAssessmentResults();
                const result = allResults.find(r => Number(r.attempt_id) === attemptId || Number(r.result_id) === attemptId) || null;
                const answers = await TMHIS_DB.getAssessmentAnswers(attemptId);
                if (result) {
                    return {
                        success: true,
                        data: {
                            result: result,
                            answers: answers || []
                        },
                        offline: true,
                        fromCache: true
                    };
                }
            }

            const singleAssessMatch = cleanUrl.match(/\/api\/assessments\/(\d+)/);
            if (singleAssessMatch) {
                const assessId = Number(singleAssessMatch[1]);
                const details = await TMHIS_DB.getAssessmentWithQuestions(assessId);
                if (details) {
                    return {
                        success: true,
                        data: {
                            assessment: details.assessment,
                            questions: details.questions || []
                        },
                        offline: true,
                        fromCache: true
                    };
                }
            }

            if (cleanUrl === '/api/assessments') {
                const assessments = await TMHIS_DB.getAssessments();
                return { success: true, data: assessments || [], offline: true, fromCache: true };
            }

            if (cleanUrl === '/api/parent/assessments/results') {
                const learnerId = searchParams.get('learner_id');
                const results = await TMHIS_DB.getAssessmentResults(learnerId ? Number(learnerId) : null);
                return { success: true, data: results || [], offline: true, fromCache: true };
            }

            // 8. Exams, Papers, Mark Entry & Report Cards
            const reportCardMatch = cleanUrl.match(/\/api\/parent\/exams\/submissions\/(\d+)\/report-card/);
            if (reportCardMatch) {
                const subId = Number(reportCardMatch[1]);
                const sub = await TMHIS_DB.getExamSubmission(subId);
                const marks = await TMHIS_DB.getExamMarks(subId);
                const learner = sub ? await TMHIS_DB.getLearner(sub.learner_id) : null;
                const exam = sub ? await TMHIS_DB.getExamSet(sub.exam_set_id) : null;

                const scaleLegend = [
                    { grade: 'D1', points: 1, range: '90 - 100%', label: 'Distinction 1 (Outstanding)' },
                    { grade: 'D2', points: 2, range: '80 - 89%',  label: 'Distinction 2 (Excellent)' },
                    { grade: 'C3', points: 3, range: '70 - 79%',  label: 'Credit 3 (Very Good)' },
                    { grade: 'C4', points: 4, range: '60 - 69%',  label: 'Credit 4 (Good)' },
                    { grade: 'C5', points: 5, range: '55 - 59%',  label: 'Credit 5 (Above Average)' },
                    { grade: 'C6', points: 6, range: '50 - 54%',  label: 'Credit 6 (Credit Pass)' },
                    { grade: 'P7', points: 7, range: '45 - 49%',  label: 'Pass 7 (Pass / Needs Help)' },
                    { grade: 'P8', points: 8, range: '40 - 44%',  label: 'Pass 8 (Minimum Pass)' },
                    { grade: 'F9', points: 9, range: '0 - 39%',   label: 'Fail 9 (Ungraded / Fail)' }
                ];

                return {
                    success: true,
                    data: {
                        report_card: {
                            ...(sub || {}),
                            learner_name: learner?.full_name || 'Candidate',
                            learner_avatar: learner?.avatar_url || '',
                            class_name: learner?.class_name || 'Primary',
                            class_code: learner?.class_code || 'P1',
                            exam_set_title: exam?.title || 'Examination Set',
                            academic_year: exam?.academic_year || '2026',
                            exam_type: exam?.exam_type || 'mid_term'
                        },
                        subject_marks: marks || [],
                        grading_legend: scaleLegend,
                        institution: {
                            name: "The Master's Home International School",
                            motto: 'Nurturing Champions in Christ and Academic Excellence',
                            address: 'Kampala, Uganda',
                            website: 'https://tmhis.strongsystemsltd.com'
                        }
                    },
                    offline: true,
                    fromCache: true
                };
            }

            const singleExamMatch = cleanUrl.match(/\/api\/exams\/sets\/(\d+)/);
            if (singleExamMatch) {
                const setId = Number(singleExamMatch[1]);
                const learnerId = searchParams.get('learner_id');
                const exam = await TMHIS_DB.getExamSet(setId);
                const papers = await TMHIS_DB.getExamPapers(setId);
                const subs = await TMHIS_DB.getExamSubmissions(learnerId ? Number(learnerId) : null, setId);
                const sub = subs && subs.length > 0 ? subs[0] : null;
                const marks = sub ? await TMHIS_DB.getExamMarks(sub.submission_id) : [];

                return {
                    success: true,
                    data: {
                        exam_set: exam,
                        set: exam,
                        papers: papers || [],
                        submission: sub,
                        marks: marks || []
                    },
                    offline: true,
                    fromCache: true
                };
            }

            if (cleanUrl === '/api/exams/sets') {
                const learnerId = searchParams.get('learner_id');
                let exams = await TMHIS_DB.getExams();
                const papers = await TMHIS_DB.getExamPapers();
                const submissions = await TMHIS_DB.getExamSubmissions(learnerId ? Number(learnerId) : null);

                exams = exams.map(e => {
                    const setPapers = papers.filter(p => Number(p.exam_set_id) === Number(e.exam_set_id));
                    const sub = submissions.find(s => Number(s.exam_set_id) === Number(e.exam_set_id));
                    return {
                        ...e,
                        papers_count: setPapers.length,
                        is_graded: Boolean(sub),
                        submission: sub || null,
                        total_aggregate: sub?.total_aggregate || null,
                        division: sub?.division || null
                    };
                });

                return { success: true, data: { sets: exams, data: exams }, offline: true, fromCache: true };
            }

            if (cleanUrl === '/api/parent/exams/results') {
                const learnerId = searchParams.get('learner_id');
                const subs = await TMHIS_DB.getExamSubmissions(learnerId ? Number(learnerId) : null);
                return { success: true, data: subs || [], offline: true, fromCache: true };
            }

            // 9. Sync Status & Diagnostics
            if (cleanUrl === '/api/sync/status') {
                const stats = await TMHIS_DB.getStorageStats();
                return { success: true, data: stats, offline: true, fromCache: true };
            }

            // 10. Digital Materials & Resources
            if (cleanUrl === '/api/materials') {
                const materials = await TMHIS_DB.getMaterials();
                return { success: true, data: { materials: materials || [], total: (materials || []).length }, offline: true, fromCache: true };
            }

            // 11. Grading Schemes
            if (cleanUrl === '/api/grading/schemes' || cleanUrl === '/api/grading/uneb') {
                const schemes = await TMHIS_DB.getGradingSchemes();
                return { success: true, data: schemes || [], offline: true, fromCache: true };
            }

        } catch (e) {
            console.warn('[TMHIS API] getOfflineFallback error:', e);
        }

        return null;
    }
};

window.API = API;
window.Api = API;
