/**
 * TMHIS IndexedDB Storage Engine (Module 07: PWA Offline Data Store)
 * 
 * Provides robust offline persistence for Ugandan Primary curriculum,
 * learners, lessons, parental guides, assessments, questions, exams, schedules,
 * and the client sync queue.
 */
const TMHIS_DB = {
    dbName: 'tmhis_offline_store',
    dbVersion: 3,
    db: null,

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn('[TMHIS DB] IndexedDB is not supported on this browser.');
                resolve(null);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Sync Queue
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const queueStore = db.createObjectStore('sync_queue', { keyPath: 'client_transaction_uuid' });
                    queueStore.createIndex('status', 'status', { unique: false });
                    queueStore.createIndex('created_at', 'created_at', { unique: false });
                    queueStore.createIndex('entity_type', 'entity_type', { unique: false });
                }

                // 2. Metadata (terms, active classes, config, user info)
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }

                // 3. Subjects
                if (!db.objectStoreNames.contains('subjects')) {
                    const subStore = db.createObjectStore('subjects', { keyPath: 'subject_id' });
                    subStore.createIndex('class_id', 'class_id', { unique: false });
                }

                // 4. Lessons
                if (!db.objectStoreNames.contains('lessons')) {
                    const lessonStore = db.createObjectStore('lessons', { keyPath: 'lesson_id' });
                    lessonStore.createIndex('subject_id', 'subject_id', { unique: false });
                    lessonStore.createIndex('class_id', 'class_id', { unique: false });
                }

                // 5. Parental Guides
                if (!db.objectStoreNames.contains('guides')) {
                    const guideStore = db.createObjectStore('guides', { keyPath: 'guide_id' });
                    guideStore.createIndex('lesson_id', 'lesson_id', { unique: false });
                }

                // 6. Assessments
                if (!db.objectStoreNames.contains('assessments')) {
                    const assessStore = db.createObjectStore('assessments', { keyPath: 'assessment_id' });
                    assessStore.createIndex('lesson_id', 'lesson_id', { unique: false });
                }

                // 7. Assessment Questions
                if (!db.objectStoreNames.contains('assessment_questions')) {
                    const qStore = db.createObjectStore('assessment_questions', { keyPath: 'question_id' });
                    qStore.createIndex('assessment_id', 'assessment_id', { unique: false });
                }

                // 8. Assessment Options
                if (!db.objectStoreNames.contains('assessment_options')) {
                    const optStore = db.createObjectStore('assessment_options', { keyPath: 'option_id' });
                    optStore.createIndex('question_id', 'question_id', { unique: false });
                }

                // 9. Learners
                if (!db.objectStoreNames.contains('learners')) {
                    const lStore = db.createObjectStore('learners', { keyPath: 'learner_id' });
                    lStore.createIndex('class_id', 'class_id', { unique: false });
                    lStore.createIndex('parent_id', 'parent_id', { unique: false });
                }

                // 10. Schedules
                if (!db.objectStoreNames.contains('schedules')) {
                    const schedStore = db.createObjectStore('schedules', { keyPath: 'schedule_id' });
                    schedStore.createIndex('learner_id', 'learner_id', { unique: false });
                    schedStore.createIndex('scheduled_date', 'scheduled_date', { unique: false });
                }

                // 11. Exams & Exam Sets
                if (!db.objectStoreNames.contains('exams')) {
                    const examStore = db.createObjectStore('exams', { keyPath: 'exam_set_id' });
                    examStore.createIndex('class_id', 'class_id', { unique: false });
                    examStore.createIndex('term_id', 'term_id', { unique: false });
                }

                // 12. Exam Papers
                if (!db.objectStoreNames.contains('exam_papers')) {
                    const epStore = db.createObjectStore('exam_papers', { keyPath: 'exam_paper_id' });
                    epStore.createIndex('exam_set_id', 'exam_set_id', { unique: false });
                    epStore.createIndex('subject_id', 'subject_id', { unique: false });
                }

                // 13. Exam Submissions
                if (!db.objectStoreNames.contains('exam_submissions')) {
                    const esStore = db.createObjectStore('exam_submissions', { keyPath: 'submission_id' });
                    esStore.createIndex('learner_id', 'learner_id', { unique: false });
                    esStore.createIndex('exam_set_id', 'exam_set_id', { unique: false });
                }

                // 14. Exam Marks
                if (!db.objectStoreNames.contains('exam_marks')) {
                    const emStore = db.createObjectStore('exam_marks', { keyPath: 'mark_id', autoIncrement: true });
                    emStore.createIndex('submission_id', 'submission_id', { unique: false });
                    emStore.createIndex('exam_paper_id', 'exam_paper_id', { unique: false });
                }

                // 15. Assessment Results & Answers
                if (!db.objectStoreNames.contains('assessment_results')) {
                    const arStore = db.createObjectStore('assessment_results', { keyPath: 'result_id' });
                    arStore.createIndex('learner_id', 'learner_id', { unique: false });
                    arStore.createIndex('attempt_id', 'attempt_id', { unique: false });
                }
                if (!db.objectStoreNames.contains('assessment_answers')) {
                    const aaStore = db.createObjectStore('assessment_answers', { keyPath: 'answer_id', autoIncrement: true });
                    aaStore.createIndex('attempt_id', 'attempt_id', { unique: false });
                    aaStore.createIndex('result_id', 'result_id', { unique: false });
                }

                // 16. Grading Schemes
                if (!db.objectStoreNames.contains('grading_schemes')) {
                    db.createObjectStore('grading_schemes', { keyPath: 'scheme_id' });
                }

                // 17. Materials
                if (!db.objectStoreNames.contains('materials')) {
                    const matStore = db.createObjectStore('materials', { keyPath: 'material_id' });
                    matStore.createIndex('lesson_id', 'lesson_id', { unique: false });
                }

                // 18. Learner Subjects
                if (!db.objectStoreNames.contains('learner_subjects')) {
                    const lsStore = db.createObjectStore('learner_subjects', { keyPath: 'learner_subject_id', autoIncrement: true });
                    lsStore.createIndex('learner_id', 'learner_id', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('[TMHIS DB] Open error:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    async getStore(storeName, mode = 'readonly') {
        const db = await this.init();
        if (!db) throw new Error('IndexedDB unavailable');
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    },

    async put(storeName, item) {
        if (!item) return null;
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async putBatch(storeName, items) {
        if (!Array.isArray(items) || items.length === 0) return true;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const item of items) {
                if (item) store.put(item);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    async get(storeName, key) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async getAll(storeName) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    async getAllByIndex(storeName, indexName, value) {
        const store = await this.getStore(storeName, 'readonly');
        const index = store.index(indexName);
        return new Promise((resolve, reject) => {
            const req = index.getAll(value);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    async delete(storeName, key) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    async clear(storeName) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    async count(storeName) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => reject(req.error);
        });
    },

    // UUID Generator for idempotent transactions
    generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // ----------------------------------------------------
    // High-Level Domain Data Helpers
    // ----------------------------------------------------

    // Learners
    async saveLearners(learners) {
        if (!Array.isArray(learners)) return false;
        // Normalize IDs
        const normalized = learners.map(l => ({
            ...l,
            learner_id: Number(l.learner_id) || l.learner_id
        }));
        await this.putBatch('learners', normalized);
        return true;
    },

    async getLearners() {
        return await this.getAll('learners');
    },

    async getLearner(learnerId) {
        if (!learnerId) return null;
        let learner = await this.get('learners', Number(learnerId));
        if (!learner) {
            learner = await this.get('learners', String(learnerId));
        }
        return learner;
    },

    async saveLearner(learner) {
        if (!learner) return null;
        return await this.put('learners', learner);
    },

    // Classes & Terms Metadata
    async saveClasses(classes) {
        if (!Array.isArray(classes)) return false;
        await this.put('metadata', { key: 'classes', data: classes });
        return true;
    },

    async getClasses() {
        const row = await this.get('metadata', 'classes');
        return row ? row.data : [];
    },

    async saveTerms(terms) {
        if (!Array.isArray(terms)) return false;
        await this.put('metadata', { key: 'terms', data: terms });
        return true;
    },

    async getTerms() {
        const row = await this.get('metadata', 'terms');
        return row ? row.data : [];
    },

    // Subjects
    async saveSubjects(subjects) {
        if (!Array.isArray(subjects)) return false;
        const normalized = subjects.map(s => ({
            ...s,
            subject_id: Number(s.subject_id) || s.subject_id,
            class_id: Number(s.class_id) || s.class_id
        }));
        await this.putBatch('subjects', normalized);
        return true;
    },

    async getSubjects(classId = null) {
        if (classId) {
            return await this.getAllByIndex('subjects', 'class_id', Number(classId));
        }
        return await this.getAll('subjects');
    },

    // Lessons
    async saveLessons(lessons) {
        if (!Array.isArray(lessons)) return false;
        const normalized = lessons.map(l => ({
            ...l,
            lesson_id: Number(l.lesson_id) || l.lesson_id,
            subject_id: Number(l.subject_id) || l.subject_id,
            class_id: l.class_id ? Number(l.class_id) : undefined
        }));
        await this.putBatch('lessons', normalized);
        return true;
    },

    async getLessons(subjectId = null) {
        if (subjectId) {
            return await this.getAllByIndex('lessons', 'subject_id', Number(subjectId));
        }
        return await this.getAll('lessons');
    },

    async getLesson(lessonId) {
        if (!lessonId) return null;
        let l = await this.get('lessons', Number(lessonId));
        if (!l) {
            l = await this.get('lessons', String(lessonId));
        }
        return l;
    },

    // Guides
    async saveGuides(guides) {
        if (!Array.isArray(guides)) return false;
        const normalized = guides.map(g => ({
            ...g,
            guide_id: Number(g.guide_id) || g.guide_id,
            lesson_id: Number(g.lesson_id) || g.lesson_id
        }));
        await this.putBatch('guides', normalized);
        return true;
    },

    async getGuides(lessonId = null) {
        if (lessonId) {
            return await this.getAllByIndex('guides', 'lesson_id', Number(lessonId));
        }
        return await this.getAll('guides');
    },

    // Schedules
    async saveSchedules(schedules) {
        if (!Array.isArray(schedules)) return false;
        const normalized = schedules.map(s => ({
            ...s,
            schedule_id: Number(s.schedule_id) || s.schedule_id,
            learner_id: Number(s.learner_id) || s.learner_id
        }));
        await this.putBatch('schedules', normalized);
        return true;
    },

    async getSchedules(learnerId = null) {
        if (learnerId) {
            return await this.getAllByIndex('schedules', 'learner_id', Number(learnerId));
        }
        return await this.getAll('schedules');
    },

    async getSchedulesByRange(learnerId = null, startDate = null, endDate = null) {
        let list = await this.getSchedules(learnerId);
        if (startDate && endDate) {
            list = list.filter(s => s.scheduled_date >= startDate && s.scheduled_date <= endDate);
        }
        return list;
    },

    // Assessments
    async saveAssessments(assessments) {
        if (!Array.isArray(assessments)) return false;
        const normalized = assessments.map(a => ({
            ...a,
            assessment_id: Number(a.assessment_id) || a.assessment_id,
            lesson_id: Number(a.lesson_id) || a.lesson_id
        }));
        await this.putBatch('assessments', normalized);
        return true;
    },

    async getAssessments(lessonId = null) {
        if (lessonId) {
            return await this.getAllByIndex('assessments', 'lesson_id', Number(lessonId));
        }
        return await this.getAll('assessments');
    },

    async getAssessment(assessmentId) {
        if (!assessmentId) return null;
        let item = await this.get('assessments', Number(assessmentId));
        if (!item) {
            item = await this.get('assessments', String(assessmentId));
        }
        return item;
    },

    async getAssessmentWithQuestions(assessmentId) {
        const id = Number(assessmentId) || assessmentId;
        const assessment = await this.getAssessment(id);
        if (!assessment) return null;

        let questions = [];
        try {
            questions = await this.getAllByIndex('assessment_questions', 'assessment_id', Number(id));
            if (!questions || questions.length === 0) {
                questions = await this.getAllByIndex('assessment_questions', 'assessment_id', String(id));
            }
        } catch (e) {}

        // Attach options for each question
        for (const q of questions) {
            try {
                let options = await this.getAllByIndex('assessment_options', 'question_id', Number(q.question_id));
                if (!options || options.length === 0) {
                    options = await this.getAllByIndex('assessment_options', 'question_id', String(q.question_id));
                }
                q.options = options || [];
            } catch (e) {
                q.options = [];
            }
        }

        return {
            assessment,
            questions
        };
    },

    // Exams
    async saveExams(exams) {
        if (!Array.isArray(exams)) return false;
        const normalized = exams.map(e => ({
            ...e,
            exam_set_id: Number(e.exam_set_id || e.set_id) || (e.exam_set_id || e.set_id)
        }));
        await this.putBatch('exams', normalized);
        return true;
    },

    async getExams(classId = null) {
        let all = await this.getAll('exams');
        if (classId) {
            all = all.filter(e => Number(e.class_id) === Number(classId));
        }
        return all;
    },

    async getExamSet(setId) {
        if (!setId) return null;
        let item = await this.get('exams', Number(setId));
        if (!item) {
            item = await this.get('exams', String(setId));
        }
        return item;
    },

    // Exam Papers
    async saveExamPapers(papers) {
        if (!Array.isArray(papers)) return false;
        const normalized = papers.map(p => ({
            ...p,
            exam_paper_id: Number(p.exam_paper_id) || p.exam_paper_id,
            exam_set_id: Number(p.exam_set_id) || p.exam_set_id,
            subject_id: Number(p.subject_id) || p.subject_id
        }));
        await this.putBatch('exam_papers', normalized);
        return true;
    },

    async getExamPapers(examSetId = null) {
        if (examSetId) {
            return await this.getAllByIndex('exam_papers', 'exam_set_id', Number(examSetId));
        }
        return await this.getAll('exam_papers');
    },

    // Exam Submissions & Marks
    async saveExamSubmissions(submissions) {
        if (!Array.isArray(submissions)) return false;
        const normalized = submissions.map(s => ({
            ...s,
            submission_id: Number(s.submission_id) || s.submission_id,
            exam_set_id: Number(s.exam_set_id) || s.exam_set_id,
            learner_id: Number(s.learner_id) || s.learner_id
        }));
        await this.putBatch('exam_submissions', normalized);
        return true;
    },

    async getExamSubmissions(learnerId = null, examSetId = null) {
        let list = await this.getAll('exam_submissions');
        if (learnerId) {
            list = list.filter(s => Number(s.learner_id) === Number(learnerId));
        }
        if (examSetId) {
            list = list.filter(s => Number(s.exam_set_id) === Number(examSetId));
        }
        return list;
    },

    async getExamSubmission(submissionId) {
        if (!submissionId) return null;
        let sub = await this.get('exam_submissions', Number(submissionId));
        if (!sub) {
            sub = await this.get('exam_submissions', String(submissionId));
        }
        return sub;
    },

    async saveExamMarks(marks) {
        if (!Array.isArray(marks)) return false;
        await this.putBatch('exam_marks', marks);
        return true;
    },

    async getExamMarks(submissionId) {
        if (!submissionId) return [];
        return await this.getAllByIndex('exam_marks', 'submission_id', Number(submissionId));
    },

    // Assessment Results & Answers
    async saveAssessmentResults(results) {
        if (!Array.isArray(results)) return false;
        const normalized = results.map(r => ({
            ...r,
            result_id: Number(r.result_id) || r.result_id,
            learner_id: Number(r.learner_id) || r.learner_id,
            attempt_id: Number(r.attempt_id) || r.attempt_id
        }));
        await this.putBatch('assessment_results', normalized);
        return true;
    },

    async getAssessmentResults(learnerId = null) {
        if (learnerId) {
            return await this.getAllByIndex('assessment_results', 'learner_id', Number(learnerId));
        }
        return await this.getAll('assessment_results');
    },

    async saveAssessmentAnswers(answers) {
        if (!Array.isArray(answers)) return false;
        await this.putBatch('assessment_answers', answers);
        return true;
    },

    async getAssessmentAnswers(attemptId) {
        if (!attemptId) return [];
        return await this.getAllByIndex('assessment_answers', 'attempt_id', Number(attemptId));
    },

    // Grading Schemes
    async saveGradingSchemes(schemes) {
        if (!Array.isArray(schemes)) return false;
        const normalized = schemes.map(s => ({
            ...s,
            scheme_id: Number(s.scheme_id) || s.scheme_id
        }));
        await this.putBatch('grading_schemes', normalized);
        return true;
    },

    async getGradingSchemes() {
        return await this.getAll('grading_schemes');
    },

    // Materials
    async saveMaterials(materials) {
        if (!Array.isArray(materials)) return false;
        const normalized = materials.map(m => ({
            ...m,
            material_id: Number(m.material_id) || m.material_id,
            lesson_id: Number(m.lesson_id) || m.lesson_id
        }));
        await this.putBatch('materials', normalized);
        return true;
    },

    async getMaterials(lessonId = null) {
        if (lessonId) {
            return await this.getAllByIndex('materials', 'lesson_id', Number(lessonId));
        }
        return await this.getAll('materials');
    },

    // Learner Subjects
    async saveLearnerSubjects(learnerSubjects) {
        if (!Array.isArray(learnerSubjects)) return false;
        await this.putBatch('learner_subjects', learnerSubjects);
        return true;
    },

    async getLearnerSubjects(learnerId = null) {
        if (learnerId) {
            return await this.getAllByIndex('learner_subjects', 'learner_id', Number(learnerId));
        }
        return await this.getAll('learner_subjects');
    },

    // ----------------------------------------------------
    // Per-Learner Offline Breakdown Summary
    // ----------------------------------------------------
    async getLearnerOfflineSummary(learnerId = null) {
        const learners = await this.getLearners();
        const targetLearners = learnerId 
            ? learners.filter(l => Number(l.learner_id) === Number(learnerId))
            : learners;

        const [
            allSubjects,
            allLessons,
            allGuides,
            allAssessments,
            allExams,
            allPapers,
            allSubmissions,
            allResults,
            allSchedules
        ] = await Promise.all([
            this.getAll('subjects'),
            this.getAll('lessons'),
            this.getAll('guides'),
            this.getAll('assessments'),
            this.getAll('exams'),
            this.getAll('exam_papers'),
            this.getAll('exam_submissions'),
            this.getAll('assessment_results'),
            this.getAll('schedules')
        ]);

        return targetLearners.map(l => {
            const classId = Number(l.class_id);
            const lrnId = Number(l.learner_id);

            // Filter domain items for this learner / class
            const subjects = allSubjects.filter(s => Number(s.class_id) === classId);
            const subIds = new Set(subjects.map(s => Number(s.subject_id)));
            const lessons = allLessons.filter(les => subIds.has(Number(les.subject_id)) || Number(les.class_id) === classId);
            const lesIds = new Set(lessons.map(les => Number(les.lesson_id)));
            const guides = allGuides.filter(g => lesIds.has(Number(g.lesson_id)));
            const assessments = allAssessments.filter(a => lesIds.has(Number(a.lesson_id)));
            const exams = allExams.filter(e => Number(e.class_id) === classId);
            const examIds = new Set(exams.map(e => Number(e.exam_set_id)));
            const papers = allPapers.filter(p => examIds.has(Number(p.exam_set_id)));
            const submissions = allSubmissions.filter(s => Number(s.learner_id) === lrnId);
            const results = allResults.filter(r => Number(r.learner_id) === lrnId);
            const schedules = allSchedules.filter(s => Number(s.learner_id) === lrnId);

            return {
                learner: l,
                counts: {
                    subjects: subjects.length,
                    lessons: lessons.length,
                    guides: guides.length,
                    assessments: assessments.length,
                    exams: exams.length,
                    papers: papers.length,
                    submissions: submissions.length,
                    results: results.length,
                    schedules: schedules.length
                },
                subjects_list: subjects.map(s => ({
                    subject_id: s.subject_id,
                    name: s.subject_name,
                    code: s.subject_code,
                    lessons_count: lessons.filter(les => Number(les.subject_id) === Number(s.subject_id)).length
                })),
                exams_list: exams.map(e => ({
                    exam_set_id: e.exam_set_id,
                    title: e.title,
                    type: e.exam_type,
                    year: e.academic_year,
                    papers_count: papers.filter(p => Number(p.exam_set_id) === Number(e.exam_set_id)).length,
                    submission: submissions.find(s => Number(s.exam_set_id) === Number(e.exam_set_id)) || null
                })),
                recent_results: results.slice(0, 5)
            };
        });
    },

    // ----------------------------------------------------
    // Sync Queue Helpers
    // ----------------------------------------------------
    async enqueueSyncItem(entityType, operation, payload, learnerId = null) {
        const uuid = payload.client_transaction_uuid || this.generateUUID();
        const item = {
            client_transaction_uuid: uuid,
            entity_type: entityType,
            operation: operation,
            learner_id: learnerId || payload.learner_id || null,
            payload: payload,
            status: 'pending',
            retry_count: 0,
            last_error: null,
            created_at: new Date().toISOString()
        };

        await this.put('sync_queue', item);
        console.log(`[TMHIS DB] Enqueued offline sync item: ${entityType} (${uuid})`);
        return item;
    },

    async getPendingSyncItems() {
        const items = await this.getAll('sync_queue');
        return items.filter(i => i.status === 'pending' || i.status === 'failed');
    },

    async markSyncItemStatus(uuid, status, lastError = null, responseData = null) {
        const item = await this.get('sync_queue', uuid);
        if (!item) return;

        item.status = status;
        item.processed_at = new Date().toISOString();
        if (lastError) {
            item.last_error = String(lastError);
            item.retry_count = (item.retry_count || 0) + 1;
        }
        if (responseData) {
            item.response_data = responseData;
        }
        await this.put('sync_queue', item);
    },

    // ----------------------------------------------------
    // Package Importer
    // ----------------------------------------------------
    async importOfflinePackage(pkg) {
        if (!pkg) return false;

        if (pkg.metadata) {
            if (pkg.metadata.classes) {
                await this.saveClasses(pkg.metadata.classes);
            }
            if (pkg.metadata.terms) {
                await this.saveTerms(pkg.metadata.terms);
            }
            if (pkg.metadata.grading_schemes) {
                await this.saveGradingSchemes(pkg.metadata.grading_schemes);
            }
        }

        if (Array.isArray(pkg.learners)) {
            await this.saveLearners(pkg.learners);
        }
        if (Array.isArray(pkg.learner_subjects)) {
            await this.saveLearnerSubjects(pkg.learner_subjects);
        }
        if (Array.isArray(pkg.subjects)) {
            await this.saveSubjects(pkg.subjects);
        }
        if (Array.isArray(pkg.lessons)) {
            await this.saveLessons(pkg.lessons);
        }
        if (Array.isArray(pkg.guides)) {
            await this.saveGuides(pkg.guides);
        }
        if (Array.isArray(pkg.materials)) {
            await this.saveMaterials(pkg.materials);
        }
        if (Array.isArray(pkg.assessments)) {
            await this.saveAssessments(pkg.assessments);
        }
        if (Array.isArray(pkg.questions)) {
            await this.putBatch('assessment_questions', pkg.questions);
        }
        if (Array.isArray(pkg.options)) {
            await this.putBatch('assessment_options', pkg.options);
        }
        if (Array.isArray(pkg.assessment_results)) {
            await this.saveAssessmentResults(pkg.assessment_results);
        }
        if (Array.isArray(pkg.assessment_answers)) {
            await this.saveAssessmentAnswers(pkg.assessment_answers);
        }
        if (Array.isArray(pkg.schedules)) {
            await this.saveSchedules(pkg.schedules);
        }
        if (Array.isArray(pkg.exams)) {
            await this.saveExams(pkg.exams);
        }
        if (Array.isArray(pkg.exam_papers)) {
            await this.saveExamPapers(pkg.exam_papers);
        }
        if (Array.isArray(pkg.exam_submissions)) {
            await this.saveExamSubmissions(pkg.exam_submissions);
        }
        if (Array.isArray(pkg.exam_marks)) {
            await this.saveExamMarks(pkg.exam_marks);
        }
        if (Array.isArray(pkg.grading_schemes)) {
            await this.saveGradingSchemes(pkg.grading_schemes);
        }

        await this.put('metadata', { 
            key: 'last_downloaded_package', 
            class_id: pkg.class_id, 
            learner_id: pkg.learner_id, 
            timestamp: new Date().toISOString(),
            package_version: pkg.package_version || '2.0.0',
            counts: pkg.counts || {}
        });

        console.log('[TMHIS DB] Comprehensive offline package successfully imported into IndexedDB.');
        return true;
    },

    // ----------------------------------------------------
    // Storage Diagnostics
    // ----------------------------------------------------
    async getStorageStats() {
        const [
            queueCount,
            learnerCount,
            subjectCount,
            lessonCount,
            guideCount,
            materialCount,
            assessmentCount,
            questionCount,
            optionCount,
            scheduleCount,
            examCount,
            paperCount,
            submissionCount,
            resultCount
        ] = await Promise.all([
            this.count('sync_queue'),
            this.count('learners'),
            this.count('subjects'),
            this.count('lessons'),
            this.count('guides'),
            this.count('materials'),
            this.count('assessments'),
            this.count('assessment_questions'),
            this.count('assessment_options'),
            this.count('schedules'),
            this.count('exams'),
            this.count('exam_papers'),
            this.count('exam_submissions'),
            this.count('assessment_results')
        ]);

        let quotaEstimate = { usage: 0, quota: 0 };
        if (navigator.storage && navigator.storage.estimate) {
            try {
                quotaEstimate = await navigator.storage.estimate();
            } catch (e) {}
        }

        const lastPkgMeta = await this.get('metadata', 'last_downloaded_package');

        return {
            counts: {
                queue: queueCount,
                learners: learnerCount,
                subjects: subjectCount,
                lessons: lessonCount,
                guides: guideCount,
                materials: materialCount,
                assessments: assessmentCount,
                questions: questionCount,
                options: optionCount,
                schedules: scheduleCount,
                exams: examCount,
                exam_papers: paperCount,
                exam_submissions: submissionCount,
                assessment_results: resultCount
            },
            storage: {
                usageBytes: quotaEstimate.usage || 0,
                quotaBytes: quotaEstimate.quota || 0,
                usageMB: ((quotaEstimate.usage || 0) / (1024 * 1024)).toFixed(2)
            },
            last_package_download: lastPkgMeta?.timestamp || null,
            last_package_meta: lastPkgMeta || null
        };
    }
};

// Initialize DB on load
if (typeof window !== 'undefined') {
    TMHIS_DB.init().catch(err => console.warn('[TMHIS DB] Autoload error:', err));
}

