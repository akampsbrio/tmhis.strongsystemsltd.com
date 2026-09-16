/**
 * TMHIS Authentication Store & State Manager
 */
const Auth = {
    userKey: 'tmhis_user_profile',

    getUser() {
        const user = localStorage.getItem(this.userKey);
        try {
            return user ? JSON.parse(user) : null;
        } catch {
            return null;
        }
    },

    setUser(user) {
        if (user) {
            localStorage.setItem(this.userKey, JSON.stringify(user));
        } else {
            localStorage.removeItem(this.userKey);
        }
    },

    isAuthenticated() {
        return !!this.getUser() && !!API.getToken();
    },

    getRole() {
        const user = this.getUser();
        return user ? user.role_code : null;
    },

    clearSession() {
        API.setToken(null);
        this.setUser(null);
    },

    async login(login, password, remember = false) {
        const res = await API.post('/api/auth/login', { login, password, remember });
        if (res.success && res.data) {
            API.setToken(res.data.token);
            this.setUser(res.data.user);
            return res.data;
        }
        throw new Error(res.message || 'Login failed.');
    },

    async registerParent(payload) {
        const res = await API.post('/api/auth/register-parent', payload);
        return res;
    },

    async forgotPassword(email) {
        return await API.post('/api/auth/forgot-password', { email });
    },

    async resetPassword(token, password, password_confirmation) {
        return await API.post('/api/auth/reset-password', {
            token,
            password,
            password_confirmation
        });
    },

    async changePassword(current_password, new_password, new_password_confirmation) {
        return await API.post('/api/auth/change-password', {
            current_password,
            new_password,
            new_password_confirmation
        });
    },

    async refreshProfile() {
        try {
            const res = await API.get('/api/auth/me');
            if (res.success && res.data) {
                this.setUser(res.data);
                return res.data;
            }
        } catch (e) {
            console.error('[TMHIS Auth] Profile refresh failed:', e);
        }
        return null;
    },

    async logout() {
        try {
            await API.post('/api/auth/logout', {});
        } catch (e) {
            console.warn('[TMHIS Auth] Logout request failed (continuing local cleanup):', e);
        } finally {
            this.clearSession();
            window.location.hash = '#login';
            window.location.reload();
        }
    }
};
