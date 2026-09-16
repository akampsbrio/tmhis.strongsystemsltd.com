/**
 * TMHIS API Client - Standardized JSON Request & Error Handler
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

    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const json = await response.json().catch(() => ({
                success: false,
                message: 'Unexpected server response format.',
                errors: ['parse_error']
            }));

            if (!response.ok) {
                // If 401 Unauthorized, trigger auth logout
                if (response.status === 401 && !url.includes('/login')) {
                    Auth.clearSession();
                    window.location.hash = '#login';
                }
                const error = new Error(json.message || `Request failed with status ${response.status}`);
                error.data = json;
                error.status = response.status;
                throw error;
            }

            return json;
        } catch (err) {
            if (!navigator.onLine) {
                console.warn('[TMHIS] Network request failed due to offline status:', url);
                const offlineErr = new Error('You are currently offline. Operations will sync when reconnected.');
                offlineErr.isOffline = true;
                throw offlineErr;
            }
            throw err;
        }
    },

    get(url) {
        return this.request(url, { method: 'GET' });
    },

    post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    patch(url, data) {
        return this.request(url, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(url) {
        return this.request(url, { method: 'DELETE' });
    }
};
