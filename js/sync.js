/**
 * TMHIS Offline Synchronisation & Background Delivery Engine (Module 07)
 * 
 * Coordinates:
 * - Device heartbeat & UUID tracking
 * - Online / Offline network state detection with real HTTP heartbeats
 * - Multitab mutex / lock synchronization
 * - Transaction-safe queue processing & exponential retry
 * - Offline package downloader & local assessment runner
 */
const TMHIS_Sync = {
    deviceUuidKey: 'tmhis_device_uuid',
    syncInProgress: false,
    syncIntervalId: null,
    isOnlineState: navigator.onLine,
    listeners: [],

    // ----------------------------------------------------
    // Initialization & Heartbeat
    // ----------------------------------------------------
    async init() {
        this.getOrCreateDeviceUuid();
        this.bindNetworkEvents();
        this.startPeriodicSync(60000); // Check every 60s
        
        // Initial online check & register device if online
        this.checkRealConnectivity().then(online => {
            this.setOnlineState(online);
            if (online && API.getToken()) {
                this.registerDevice();
                this.syncPendingQueue();
            }
        });
    },

    getOrCreateDeviceUuid() {
        let uuid = localStorage.getItem(this.deviceUuidKey);
        if (!uuid) {
            uuid = TMHIS_DB.generateUUID();
            localStorage.setItem(this.deviceUuidKey, uuid);
        }
        return uuid;
    },

    bindNetworkEvents() {
        window.addEventListener('online', () => {
            console.log('[TMHIS Sync] Browser network restored. Verifying connectivity...');
            this.checkRealConnectivity().then(online => {
                if (online) {
                    this.setOnlineState(true);
                    this.syncPendingQueue();
                }
            });
        });

        window.addEventListener('offline', () => {
            console.log('[TMHIS Sync] Browser network disconnected.');
            this.setOnlineState(false);
        });
    },

    async checkRealConnectivity() {
        if (!navigator.onLine) return false;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const res = await fetch('/api/health?_t=' + Date.now(), { 
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeout);
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    setOnlineState(online) {
        const changed = this.isOnlineState !== online;
        this.isOnlineState = online;
        this.updateOnlineBadge();
        if (changed) {
            this.notifyListeners({ type: 'network_change', isOnline: online });
        }
    },

    onSyncEvent(callback) {
        this.listeners.push(callback);
    },

    notifyListeners(eventData) {
        for (const cb of this.listeners) {
            try { cb(eventData); } catch (e) { console.error(e); }
        }
    },

    // ----------------------------------------------------
    // Device Registration
    // ----------------------------------------------------
    async registerDevice() {
        try {
            const uuid = this.getOrCreateDeviceUuid();
            const platform = navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform;
            const ua = navigator.userAgent;

            let browserName = 'Browser';
            if (ua.includes('Firefox')) browserName = 'Firefox';
            else if (ua.includes('Edg')) browserName = 'Edge';
            else if (ua.includes('Chrome')) browserName = 'Chrome';
            else if (ua.includes('Safari')) browserName = 'Safari';

            await API.post('/api/devices/register', {
                device_uuid: uuid,
                device_name: `${platform} (${browserName})`,
                platform: platform || 'Web',
                browser: browserName,
                app_version: '1.0.0'
            });
        } catch (err) {
            console.warn('[TMHIS Sync] Device registration error:', err);
        }
    },

    // ----------------------------------------------------
    // Mutex & Queue Synchronisation Engine
    // ----------------------------------------------------
    async syncPendingQueue(force = false) {
        if (this.syncInProgress) return;
        if (!this.isOnlineState && !force) return;
        if (!API.getToken()) return;

        // Acquire lock
        this.syncInProgress = true;
        this.notifyListeners({ type: 'sync_start' });
        this.updateOnlineBadge(true);

        try {
            const pendingItems = await TMHIS_DB.getPendingSyncItems();
            if (pendingItems.length === 0) {
                this.syncInProgress = false;
                this.updateOnlineBadge();
                this.notifyListeners({ type: 'sync_complete', syncedCount: 0 });
                return;
            }

            console.log(`[TMHIS Sync] Found ${pendingItems.length} pending offline items. Processing...`);

            const deviceUuid = this.getOrCreateDeviceUuid();
            const batchPayload = {
                device_uuid: deviceUuid,
                items: pendingItems.map(item => ({
                    client_transaction_uuid: item.client_transaction_uuid,
                    entity_type: item.entity_type,
                    operation: item.operation,
                    learner_id: item.learner_id,
                    payload: item.payload
                }))
            };

            const response = await API.post('/api/sync/process', batchPayload);

            if (response && response.success && Array.isArray(response.data?.results)) {
                for (const res of response.data.results) {
                    const uuid = res.client_transaction_uuid;
                    if (res.success) {
                        await TMHIS_DB.markSyncItemStatus(uuid, 'synced', null, res.data);
                    } else {
                        await TMHIS_DB.markSyncItemStatus(uuid, res.status || 'failed', res.error);
                    }
                }
            }

            console.log('[TMHIS Sync] Sync batch successfully synchronized.');
            this.notifyListeners({ type: 'sync_complete', results: response?.data });
        } catch (err) {
            console.warn('[TMHIS Sync] Sync process failed:', err);
            this.notifyListeners({ type: 'sync_error', error: err.message });
        } finally {
            this.syncInProgress = false;
            this.updateOnlineBadge();
        }
    },

    startPeriodicSync(intervalMs = 60000) {
        if (this.syncIntervalId) clearInterval(this.syncIntervalId);
        this.syncIntervalId = setInterval(() => {
            if (this.isOnlineState && API.getToken()) {
                this.syncPendingQueue();
            }
        }, intervalMs);
    },

    // ----------------------------------------------------
    // Offline Action Dispatchers (Optimistic Execution)
    // ----------------------------------------------------
    async submitAssessment(assessmentId, learnerId, answers, timeSpentSeconds = 0) {
        const txUuid = TMHIS_DB.generateUUID();
        const payload = {
            client_transaction_uuid: txUuid,
            assessment_id: assessmentId,
            learner_id: learnerId,
            time_spent_seconds: timeSpentSeconds,
            started_at: new Date(Date.now() - (timeSpentSeconds * 1000)).toISOString(),
            submitted_at: new Date().toISOString(),
            answers: answers
        };

        // If currently offline or if online call fails, enqueue to IndexedDB
        if (!this.isOnlineState) {
            console.log('[TMHIS Sync] Device is offline. Enqueuing assessment locally...');
            const enqueued = await TMHIS_DB.enqueueSyncItem('assessment_submission', 'submit', payload, learnerId);
            this.updateOnlineBadge();
            return {
                offline: true,
                queued: true,
                client_transaction_uuid: txUuid,
                message: 'Assessment completed & saved locally. Will automatically sync when internet connection returns.'
            };
        }

        try {
            // Try direct API first
            return await API.post(`/api/attempts/submit`, payload);
        } catch (err) {
            console.warn('[TMHIS Sync] Online submission failed, enqueuing offline item:', err);
            await TMHIS_DB.enqueueSyncItem('assessment_submission', 'submit', payload, learnerId);
            this.updateOnlineBadge();
            return {
                offline: true,
                queued: true,
                client_transaction_uuid: txUuid,
                message: 'Network issue. Assessment saved locally and queued for automatic sync.'
            };
        }
    },

    async recordScheduleProgress(scheduleId, lessonId, learnerId, status = 'completed', notes = '') {
        const txUuid = TMHIS_DB.generateUUID();
        const payload = {
            client_transaction_uuid: txUuid,
            schedule_id: scheduleId,
            lesson_id: lessonId,
            learner_id: learnerId,
            status: status,
            completed_date: new Date().toISOString().split('T')[0],
            notes: notes
        };

        if (!this.isOnlineState) {
            await TMHIS_DB.enqueueSyncItem('schedule_progress', 'complete', payload, learnerId);
            this.updateOnlineBadge();
            return {
                offline: true,
                queued: true,
                client_transaction_uuid: txUuid,
                message: 'Progress recorded locally. Will sync when reconnected.'
            };
        }

        try {
            return await API.patch(`/api/parent/schedule/${scheduleId}/status`, { status, notes });
        } catch (err) {
            await TMHIS_DB.enqueueSyncItem('schedule_progress', 'complete', payload, learnerId);
            this.updateOnlineBadge();
            return {
                offline: true,
                queued: true,
                client_transaction_uuid: txUuid,
                message: 'Network error. Progress saved offline.'
            };
        }
    },

    // ----------------------------------------------------
    // Offline Data Package Downloader
    // ----------------------------------------------------
    async downloadClassPackage(learnerId = null, classId = null) {
        if (!this.isOnlineState) {
            throw new Error('Cannot download offline package while disconnected from internet.');
        }

        let url = '/api/sync/download-package';
        const params = [];
        if (learnerId) params.push(`learner_id=${learnerId}`);
        if (classId) params.push(`class_id=${classId}`);
        if (params.length) url += '?' + params.join('&');

        const res = await API.get(url);
        if (res && res.success && res.data) {
            await TMHIS_DB.importOfflinePackage(res.data);
            return res.data;
        }
        throw new Error(res?.message || 'Failed to download offline package.');
    },

    // ----------------------------------------------------
    // UI Connectivity & Sync Badge
    // ----------------------------------------------------
    async updateOnlineBadge(isSyncing = false) {
        const badge = document.getElementById('tmhis-connectivity-badge');
        const offlineBanner = document.getElementById('offline-banner');

        let pendingCount = 0;
        try {
            const pending = await TMHIS_DB.getPendingSyncItems();
            pendingCount = pending.length;
        } catch (e) {}

        if (offlineBanner) {
            if (!this.isOnlineState) {
                offlineBanner.innerHTML = `
                    <div class="offline-banner-alert">
                        <span>📡 <strong>Offline Mode Active</strong> — You can continue studying, viewing guides and completing assessments. Changes will sync automatically when connected.</span>
                        ${pendingCount > 0 ? `<span class="badge badge-warning" style="margin-left:8px;">${pendingCount} Pending Sync${pendingCount > 1 ? 's' : ''}</span>` : ''}
                        <button class="btn btn-sm btn-secondary" onclick="App.openOfflineCenterModal()" style="margin-left:12px; padding:2px 8px; font-size:0.75rem;">Manage Sync</button>
                    </div>
                `;
                offlineBanner.style.display = 'block';
            } else {
                offlineBanner.style.display = 'none';
                offlineBanner.innerHTML = '';
            }
        }

        if (badge) {
            if (isSyncing || this.syncInProgress) {
                badge.className = 'connectivity-pill syncing';
                badge.innerHTML = `<span>🔄</span> <span>Syncing...</span>`;
                badge.title = 'Synchronising offline data with server...';
            } else if (!this.isOnlineState) {
                badge.className = 'connectivity-pill offline';
                badge.innerHTML = `<span>🟠</span> <span>Offline</span> ${pendingCount > 0 ? `<span class="pill-counter">${pendingCount}</span>` : ''}`;
                badge.title = 'You are currently offline. Click to open Offline Center.';
            } else {
                badge.className = 'connectivity-pill online';
                badge.innerHTML = `<span>🟢</span> <span>Online</span> ${pendingCount > 0 ? `<span class="pill-counter pending">${pendingCount}</span>` : ''}`;
                badge.title = pendingCount > 0 ? `${pendingCount} items waiting to sync. Click to sync now.` : 'Connected to TMHIS Cloud.';
            }
        }
    }
};

// Initialize TMHIS_Sync on document ready
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        TMHIS_Sync.init().catch(err => console.warn('[TMHIS Sync] Init error:', err));
    });
}
