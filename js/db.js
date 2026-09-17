/**
 * TMHIS IndexedDB Storage Engine (Module 07: PWA Offline Data Store)
 * 
 * Provides robust offline persistence for Ugandan Primary curriculum,
 * lessons, parental guides, assessments, questions, schedules, and the client sync queue.
 */
const TMHIS_DB = {
    dbName: 'tmhis_offline_store',
    dbVersion: 1,
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

                // 2. Metadata (terms, active classes, config)
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
                    db.createObjectStore('learners', { keyPath: 'learner_id' });
                }

                // 10. Schedules
                if (!db.objectStoreNames.contains('schedules')) {
                    const schedStore = db.createObjectStore('schedules', { keyPath: 'schedule_id' });
                    schedStore.createIndex('learner_id', 'learner_id', { unique: false });
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
                store.put(item);
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
                await this.put('metadata', { key: 'classes', data: pkg.metadata.classes });
            }
            if (pkg.metadata.terms) {
                await this.put('metadata', { key: 'terms', data: pkg.metadata.terms });
            }
        }

        if (Array.isArray(pkg.subjects)) {
            await this.putBatch('subjects', pkg.subjects);
        }
        if (Array.isArray(pkg.lessons)) {
            await this.putBatch('lessons', pkg.lessons);
        }
        if (Array.isArray(pkg.guides)) {
            await this.putBatch('guides', pkg.guides);
        }
        if (Array.isArray(pkg.assessments)) {
            await this.putBatch('assessments', pkg.assessments);
        }
        if (Array.isArray(pkg.questions)) {
            await this.putBatch('assessment_questions', pkg.questions);
        }
        if (Array.isArray(pkg.options)) {
            await this.putBatch('assessment_options', pkg.options);
        }
        if (Array.isArray(pkg.schedules)) {
            await this.putBatch('schedules', pkg.schedules);
        }

        await this.put('metadata', { 
            key: 'last_downloaded_package', 
            class_id: pkg.class_id, 
            learner_id: pkg.learner_id, 
            timestamp: new Date().toISOString() 
        });

        return true;
    },

    // ----------------------------------------------------
    // Storage Diagnostics
    // ----------------------------------------------------
    async getStorageStats() {
        const [
            queueCount,
            subjectCount,
            lessonCount,
            guideCount,
            assessmentCount,
            questionCount,
            scheduleCount
        ] = await Promise.all([
            this.count('sync_queue'),
            this.count('subjects'),
            this.count('lessons'),
            this.count('guides'),
            this.count('assessments'),
            this.count('assessment_questions'),
            this.count('schedules')
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
                subjects: subjectCount,
                lessons: lessonCount,
                guides: guideCount,
                assessments: assessmentCount,
                questions: questionCount,
                schedules: scheduleCount
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
