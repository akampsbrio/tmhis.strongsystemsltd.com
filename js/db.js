/**
 * TMHIS IndexedDB Storage Engine (Module 07: PWA Offline Data Store)
 * 
 * Provides robust offline persistence for Ugandan Primary curriculum,
 * learners, lessons, parental guides, assessments, questions, exams, schedules,
 * and the client sync queue.
 */
const TMHIS_DB = {
    dbName: 'tmhis_offline_store',
    dbVersion: 2,
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
                    const examStore = db.createObjectStore('exams', { keyPath: 'set_id' });
                    examStore.createIndex('class_id', 'class_id', { unique: false });
                    examStore.createIndex('term_id', 'term_id', { unique: false });
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
            set_id: Number(e.set_id) || e.set_id
        }));
        await this.putBatch('exams', normalized);
        return true;
    },

    async getExams() {
        return await this.getAll('exams');
    },

    async getExamSet(setId) {
        if (!setId) return null;
        let item = await this.get('exams', Number(setId));
        if (!item) {
            item = await this.get('exams', String(setId));
        }
        return item;
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
        }

        if (Array.isArray(pkg.learners)) {
            await this.saveLearners(pkg.learners);
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
        if (Array.isArray(pkg.assessments)) {
            await this.saveAssessments(pkg.assessments);
        }
        if (Array.isArray(pkg.questions)) {
            await this.putBatch('assessment_questions', pkg.questions);
        }
        if (Array.isArray(pkg.options)) {
            await this.putBatch('assessment_options', pkg.options);
        }
        if (Array.isArray(pkg.schedules)) {
            await this.saveSchedules(pkg.schedules);
        }
        if (Array.isArray(pkg.exams)) {
            await this.saveExams(pkg.exams);
        }

        await this.put('metadata', { 
            key: 'last_downloaded_package', 
            class_id: pkg.class_id, 
            learner_id: pkg.learner_id, 
            timestamp: new Date().toISOString() 
        });

        console.log('[TMHIS DB] Offline package successfully imported.');
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
            assessmentCount,
            questionCount,
            scheduleCount,
            examCount
        ] = await Promise.all([
            this.count('sync_queue'),
            this.count('learners'),
            this.count('subjects'),
            this.count('lessons'),
            this.count('guides'),
            this.count('assessments'),
            this.count('assessment_questions'),
            this.count('schedules'),
            this.count('exams')
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
                assessments: assessmentCount,
                questions: questionCount,
                schedules: scheduleCount,
                exams: examCount
            },
            storage: {
                usageBytes: quotaEstimate.usage || 0,
                quotaBytes: quotaEstimate.quota || 0,
                usageMB: ((quotaEstimate.usage || 0) / (1024 * 1024)).toFixed(2)
            },
            last_package_download: lastPkgMeta?.timestamp || null
        };
    }
};

// Initialize DB on load
if (typeof window !== 'undefined') {
    TMHIS_DB.init().catch(err => console.warn('[TMHIS DB] Autoload error:', err));
}
