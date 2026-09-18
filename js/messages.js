/**
 * TMHIS Universal Messaging & Transparent Read Receipts Engine (Sprint 11)
 * Enables direct asynchronous communication between any system users (Parents, Teachers,
 * Curriculum Officers, Administrators, and Learners) with transparent read receipts.
 */

const MessagesApp = {
    threads: [],
    activeThreadId: null,
    activeThreadData: null,
    unreadCount: 0,
    currentFilter: 'all', // 'all', 'unread', 'important'
    searchQuery: '',
    pollInterval: null,
    directoryUsers: [],
    selectedRecipient: null,

    async init() {
        if (!Auth.isLoggedIn()) return;
        await this.refreshUnreadBadge();

        // Background polling every 30s
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            if (Auth.isLoggedIn() && document.visibilityState === 'visible') {
                this.refreshUnreadBadge();
                if (window.location.hash.startsWith('#messages') && this.activeThreadId) {
                    this.pollActiveThread();
                }
            }
        }, 30000);
    },

    async refreshUnreadBadge() {
        if (!Auth.isLoggedIn()) return;
        try {
            const res = await API.get('/api/messages/unread-count');
            if (res && res.success && res.data) {
                this.unreadCount = res.data.unread_count || 0;
                this.updateHeaderBadge();
            }
        } catch (e) {
            // Silently fail if offline or network error
        }
    },

    updateHeaderBadge() {
        const badge = document.getElementById('header-messages-badge');
        if (!badge) return;
        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    },

    /**
     * Main Entry point for #messages route
     */
    async initMessagesCenter(container) {
        if (!Auth.isLoggedIn()) {
            window.location.hash = '#login';
            return;
        }

        // Check if a specific thread was requested via URL e.g. #messages?thread=12
        const hash = window.location.hash;
        const threadMatch = hash.match(/thread=(\d+)/);
        if (threadMatch) {
            this.activeThreadId = parseInt(threadMatch[1], 10);
        }

        container.innerHTML = `
            <div class="messages-page-wrapper">
                <div class="messages-header-bar">
                    <div class="header-titles">
                        <div class="title-with-badge">
                            <h2>💬 Messages & Direct Communication</h2>
                            <span class="badge badge-pill badge-primary" id="msg-total-badge">Universal Inbox</span>
                        </div>
                        <p class="subtitle">Direct, asynchronous messaging between Parents, Teachers, Curriculum Officers, and Administrators with transparent read receipts.</p>
                    </div>
                    <div class="header-actions-group">
                        <button class="btn btn-primary" onclick="MessagesApp.openNewConversationModal()">
                            ✏️ New Conversation
                        </button>
                    </div>
                </div>

                <div class="messages-layout-container">
                    <!-- Left Column: Conversations List -->
                    <div class="threads-sidebar-pane">
                        <div class="threads-search-box">
                            <input type="text" id="threads-search-input" placeholder="🔍 Search conversations..." oninput="MessagesApp.handleSearch(this.value)">
                        </div>
                        <div class="threads-filter-tabs">
                            <button class="filter-tab active" id="tab-filter-all" onclick="MessagesApp.setFilter('all')">All</button>
                            <button class="filter-tab" id="tab-filter-unread" onclick="MessagesApp.setFilter('unread')">Unread</button>
                            <button class="filter-tab" id="tab-filter-important" onclick="MessagesApp.setFilter('important')">⭐ Important</button>
                        </div>
                        <div class="threads-list-scrollable" id="threads-list-container">
                            <div class="loading-spinner-area">
                                <div class="spinner"></div>
                                <span>Loading conversations...</span>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Active Conversation Stream -->
                    <div class="thread-chat-pane" id="thread-chat-pane">
                        <div class="chat-placeholder-state">
                            <div class="placeholder-icon">📬</div>
                            <h3>Select a conversation</h3>
                            <p>Choose a thread from the left or start a new conversation to begin messaging.</p>
                            <button class="btn btn-secondary mt-3" onclick="MessagesApp.openNewConversationModal()">
                                ✏️ Start New Conversation
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- New Conversation Modal Container -->
            <div id="new-msg-modal-container"></div>
        `;

        await this.loadThreads();
    },

    async loadThreads() {
        const listContainer = document.getElementById('threads-list-container');
        if (!listContainer) return;

        try {
            let url = `/api/messages/threads?filter=${this.currentFilter}`;
            if (this.searchQuery) {
                url += `&q=${encodeURIComponent(this.searchQuery)}`;
            }
            const res = await API.get(url);
            if (res && res.success && res.data) {
                this.threads = res.data.threads || [];
                this.renderThreadsList();

                // If activeThreadId is set, open it
                if (this.activeThreadId) {
                    this.selectThread(this.activeThreadId);
                } else if (this.threads.length > 0 && window.innerWidth > 768) {
                    // Automatically open first conversation on desktop
                    this.selectThread(this.threads[0].thread_id);
                }
            } else {
                listContainer.innerHTML = '<div class="empty-state p-4">No conversations found.</div>';
            }
        } catch (e) {
            listContainer.innerHTML = `<div class="error-state p-4">Failed to load conversations: ${App.escapeHtml(e.message)}</div>`;
        }
    },

    renderThreadsList() {
        const listContainer = document.getElementById('threads-list-container');
        if (!listContainer) return;

        if (this.threads.length === 0) {
            listContainer.innerHTML = `
                <div class="threads-empty-state">
                    <span style="font-size:2rem; margin-bottom:8px;">📭</span>
                    <p style="font-weight:600; color:var(--text-main);">No conversations</p>
                    <p style="font-size:0.82rem; color:var(--text-muted); text-align:center;">Click "New Conversation" to message any Teacher, Parent, or Officer.</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.threads.forEach(t => {
            const isActive = this.activeThreadId === parseInt(t.thread_id, 10);
            const hasUnread = parseInt(t.unread_count, 10) > 0;
            const otherName = t.other_user_name || t.other_username || 'Participant';
            const otherRole = t.other_role_name || t.other_role_code || 'User';
            const avatarUrl = t.other_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=2563eb&color=fff&rounded=true&bold=true`;
            const dateStr = this.formatRelativeTime(t.last_message_at || t.created_at);

            html += `
                <div class="thread-item-card ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
                     onclick="MessagesApp.selectThread(${t.thread_id})" 
                     id="thread-card-${t.thread_id}">
                    <div class="thread-avatar-col">
                        <img src="${App.escapeHtml(avatarUrl)}" alt="Avatar" class="thread-avatar-img">
                        ${hasUnread ? `<span class="unread-dot-badge"></span>` : ''}
                    </div>
                    <div class="thread-details-col">
                        <div class="thread-top-line">
                            <span class="thread-participant-name">${App.escapeHtml(otherName)}</span>
                            <span class="thread-timestamp">${dateStr}</span>
                        </div>
                        <div class="thread-role-badge-row">
                            <span class="role-pill-micro ${this.getRoleClass(t.other_role_code)}">${App.escapeHtml(otherRole)}</span>
                            ${t.is_important ? '<span class="important-pill-micro">⭐ Important</span>' : ''}
                        </div>
                        <div class="thread-subject-line">${App.escapeHtml(t.subject_line || 'No Subject')}</div>
                        <div class="thread-preview-line">${App.escapeHtml(t.last_message_preview || 'No messages yet')}</div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    },

    async selectThread(threadId) {
        this.activeThreadId = parseInt(threadId, 10);
        window.history.replaceState(null, '', `#messages?thread=${threadId}`);

        // Update active class in list
        document.querySelectorAll('.thread-item-card').forEach(el => el.classList.remove('active'));
        const card = document.getElementById(`thread-card-${threadId}`);
        if (card) {
            card.classList.add('active');
            card.classList.remove('unread');
            const unreadDot = card.querySelector('.unread-dot-badge');
            if (unreadDot) unreadDot.remove();
        }

        const chatPane = document.getElementById('thread-chat-pane');
        if (!chatPane) return;

        chatPane.innerHTML = `
            <div class="loading-spinner-area" style="height:100%;">
                <div class="spinner"></div>
                <span>Opening conversation & updating read receipts...</span>
            </div>
        `;

        try {
            const res = await API.get(`/api/messages/threads/${threadId}`);
            if (res && res.success && res.data) {
                this.activeThreadData = res.data;
                this.renderThreadChatView();
                this.refreshUnreadBadge();
            } else {
                chatPane.innerHTML = `<div class="error-state p-4">Could not load conversation: ${App.escapeHtml(res.message || 'Unknown error')}</div>`;
            }
        } catch (e) {
            chatPane.innerHTML = `<div class="error-state p-4">Error loading thread: ${App.escapeHtml(e.message)}</div>`;
        }
    },

    async pollActiveThread() {
        if (!this.activeThreadId) return;
        try {
            const res = await API.get(`/api/messages/threads/${this.activeThreadId}`);
            if (res && res.success && res.data) {
                const prevCount = this.activeThreadData?.messages?.length || 0;
                const newCount = res.data.messages?.length || 0;
                this.activeThreadData = res.data;
                
                // If message count changed or read status changed, re-render chat
                this.renderThreadChatView(prevCount !== newCount);
            }
        } catch (e) {
            // Silently ignore polling errors
        }
    },

    renderThreadChatView(shouldScroll = true) {
        const chatPane = document.getElementById('thread-chat-pane');
        if (!chatPane || !this.activeThreadData) return;

        const thread = this.activeThreadData.thread;
        const messages = this.activeThreadData.messages || [];
        const currentUser = Auth.getUser();
        const currentUserId = currentUser?.user_id || 0;

        const isCreator = currentUserId === parseInt(thread.creator_user_id, 10);
        const otherName = isCreator ? (thread.recipient_name || thread.recipient_username) : (thread.creator_name || thread.creator_username);
        const otherRole = isCreator ? (thread.recipient_role || 'User') : (thread.creator_role || 'User');
        const otherAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName || 'User')}&background=2563eb&color=fff&rounded=true&bold=true`;

        let messagesHtml = '';
        if (messages.length === 0) {
            messagesHtml = `
                <div class="empty-messages-prompt">
                    <p>This conversation has no messages yet. Type a message below to begin.</p>
                </div>
            `;
        } else {
            messages.forEach(m => {
                const isMine = m.is_mine || parseInt(m.sender_user_id, 10) === currentUserId;
                const senderName = isMine ? 'You' : (m.sender_name || m.sender_username || 'Participant');
                const senderAvatar = isMine 
                    ? (currentUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.full_name || 'Me')}&background=10b981&color=fff&rounded=true&bold=true`)
                    : otherAvatar;
                
                const sentTime = this.formatFullDateTime(m.sent_at || m.created_at);
                
                // Read Receipt status
                let receiptHtml = '';
                if (isMine) {
                    if (m.is_read || m.read_at) {
                        const readTime = this.formatFullDateTime(m.read_at);
                        receiptHtml = `
                            <span class="read-receipt read" title="Read on ${readTime}">
                                <span class="receipt-icon">✓✓</span> Read · ${this.formatTimeOnly(m.read_at)}
                            </span>
                        `;
                    } else {
                        receiptHtml = `
                            <span class="read-receipt sent" title="Delivered. Awaiting recipient to open.">
                                <span class="receipt-icon">✓</span> Sent
                            </span>
                        `;
                    }
                }

                messagesHtml += `
                    <div class="message-row ${isMine ? 'outgoing' : 'incoming'}">
                        <div class="message-avatar-wrap">
                            <img src="${App.escapeHtml(senderAvatar)}" alt="${App.escapeHtml(senderName)}" class="msg-bubble-avatar">
                        </div>
                        <div class="message-content-wrap">
                            <div class="message-sender-title">
                                <span class="sender-name-label">${App.escapeHtml(senderName)}</span>
                                <span class="sender-time-label">${sentTime}</span>
                            </div>
                            <div class="message-bubble-body">
                                ${this.formatMessageBody(m.message_body)}
                            </div>
                            <div class="message-meta-footer">
                                ${receiptHtml}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        chatPane.innerHTML = `
            <div class="chat-thread-header">
                <div class="chat-header-user-info">
                    <button class="mobile-back-btn btn-icon" onclick="MessagesApp.closeActiveThread()" title="Back to inbox">←</button>
                    <img src="${App.escapeHtml(otherAvatar)}" alt="Avatar" class="chat-header-avatar">
                    <div class="chat-header-text">
                        <div class="chat-header-name-row">
                            <h3 class="chat-header-name">${App.escapeHtml(otherName)}</h3>
                            <span class="role-pill-micro ${this.getRoleClass(otherRole)}">${App.escapeHtml(otherRole)}</span>
                            ${thread.is_important ? '<span class="important-pill-micro">⭐ Important</span>' : ''}
                        </div>
                        <div class="chat-header-subject">
                            <strong>Subject:</strong> ${App.escapeHtml(thread.subject_line || 'Direct Inquiry')}
                            ${thread.subject_name ? `<span class="subject-badge-micro">📘 ${App.escapeHtml(thread.subject_name)}</span>` : ''}
                            ${thread.learner_name ? `<span class="learner-badge-micro">🧒 ${App.escapeHtml(thread.learner_name)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="chat-header-status-badge">
                    <span class="status-pill-small ${thread.status === 'open' ? 'status-open' : 'status-closed'}">
                        ${thread.status === 'open' ? '🟢 Active Thread' : '🔒 Closed'}
                    </span>
                </div>
            </div>

            <!-- Message Stream Area -->
            <div class="chat-messages-stream" id="chat-messages-stream">
                ${messagesHtml}
            </div>

            <!-- Message Composer Area -->
            <div class="chat-composer-container">
                <form id="chat-reply-form" onsubmit="MessagesApp.handleSendMessage(event)">
                    <div class="composer-inner-box">
                        <textarea id="composer-text-input" 
                                  placeholder="Type your reply here... (Press Ctrl + Enter to send)" 
                                  rows="2" 
                                  onkeydown="MessagesApp.handleComposerKeydown(event)"
                                  required></textarea>
                        <div class="composer-actions-bar">
                            <span class="composer-hint">💡 Direct & asynchronous &bull; Recipient notified instantly</span>
                            <button type="submit" class="btn btn-primary btn-send-msg" id="btn-send-message">
                                <span>Send</span> <span>➤</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        `;

        if (shouldScroll) {
            this.scrollToBottom();
        }
    },

    scrollToBottom() {
        const stream = document.getElementById('chat-messages-stream');
        if (stream) {
            stream.scrollTop = stream.scrollHeight;
        }
    },

    handleComposerKeydown(event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.handleSendMessage(event);
        }
    },

    async handleSendMessage(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('composer-text-input');
        const sendBtn = document.getElementById('btn-send-message');
        if (!input || !this.activeThreadId) return;

        const body = input.value.trim();
        if (!body) return;

        input.disabled = true;
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `<span>Sending...</span>`;
        }

        try {
            const res = await API.post(`/api/messages/threads/${this.activeThreadId}/messages`, {
                message_body: body
            });

            if (res && res.success && res.data) {
                input.value = '';
                input.disabled = false;
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = `<span>Send</span> <span>➤</span>`;
                }

                // Add to local data immediately and scroll
                if (!this.activeThreadData.messages) this.activeThreadData.messages = [];
                const currentUser = Auth.getUser();
                this.activeThreadData.messages.push({
                    message_id: res.data.message_id,
                    thread_id: this.activeThreadId,
                    sender_user_id: currentUser?.user_id,
                    sender_name: currentUser?.full_name || 'You',
                    sender_username: currentUser?.username,
                    message_body: body,
                    sent_at: res.data.sent_at || new Date().toISOString(),
                    read_at: null,
                    is_mine: true,
                    is_read: false
                });

                this.renderThreadChatView(true);
                this.loadThreads(); // Refresh thread preview in left sidebar
            } else {
                alert(`Failed to send message: ${res.message || 'Unknown error'}`);
                input.disabled = false;
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = `<span>Send</span> <span>➤</span>`;
                }
            }
        } catch (e) {
            alert(`Error sending message: ${e.message}`);
            input.disabled = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<span>Send</span> <span>➤</span>`;
            }
        }
    },

    closeActiveThread() {
        this.activeThreadId = null;
        window.history.replaceState(null, '', '#messages');
        const chatPane = document.getElementById('thread-chat-pane');
        if (chatPane) {
            chatPane.innerHTML = `
                <div class="chat-placeholder-state">
                    <div class="placeholder-icon">📬</div>
                    <h3>Select a conversation</h3>
                    <p>Choose a thread from the left or start a new conversation to begin messaging.</p>
                    <button class="btn btn-secondary mt-3" onclick="MessagesApp.openNewConversationModal()">
                        ✏️ Start New Conversation
                    </button>
                </div>
            `;
        }
        document.querySelectorAll('.thread-item-card').forEach(el => el.classList.remove('active'));
    },

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        const activeTab = document.getElementById(`tab-filter-${filter}`);
        if (activeTab) activeTab.classList.add('active');
        this.loadThreads();
    },

    handleSearch(query) {
        this.searchQuery = query.trim();
        this.loadThreads();
    },

    /**
     * Searchable Recipient Directory & New Thread Creation Modal
     */
    directoryRoleFilter: 'all',
    searchDebounceTimer: null,

    async openNewConversationModal() {
        const container = document.getElementById('new-msg-modal-container');
        if (!container) return;

        this.selectedRecipient = null;
        this.directoryRoleFilter = 'all';

        container.innerHTML = `
            <div class="modal-backdrop-custom" onclick="if(event.target === this) MessagesApp.closeNewConversationModal()">
                <div class="modal-dialog-custom modal-dialog-lg">
                    <div class="modal-header-custom">
                        <div class="modal-title-wrap">
                            <h3>✏️ Start New Conversation</h3>
                            <p class="modal-subtitle">Directly message any Teacher, Parent, Curriculum Officer, or Administrator.</p>
                        </div>
                        <button class="modal-close-btn" onclick="MessagesApp.closeNewConversationModal()">✕</button>
                    </div>
                    
                    <form id="new-thread-form" onsubmit="MessagesApp.handleCreateThreadSubmit(event)">
                        <div class="modal-body-custom">
                            <!-- Step 1: Select Recipient -->
                            <div class="form-group-custom">
                                <label class="form-label-custom">1. Select Recipient <span class="required">*</span></label>
                                
                                <!-- Isolated Selected Recipient Display -->
                                <div id="selected-recipient-pill" style="display:none; margin-bottom:8px;"></div>
                                <input type="hidden" id="selected-recipient-id" required>

                                <!-- Recipient Search & Selector Box -->
                                <div id="recipient-picker-wrapper" class="recipient-picker-box">
                                    <!-- Role Filter Pills -->
                                    <div class="recip-role-filters" style="display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
                                        <button type="button" class="recip-filter-pill active" id="rf-all" onclick="MessagesApp.setDirectoryRoleFilter('all')">All Users</button>
                                        <button type="button" class="recip-filter-pill" id="rf-teacher" onclick="MessagesApp.setDirectoryRoleFilter('teacher')">👨‍🏫 Teachers</button>
                                        <button type="button" class="recip-filter-pill" id="rf-parent" onclick="MessagesApp.setDirectoryRoleFilter('parent')">👨‍👩‍👧 Parents</button>
                                        <button type="button" class="recip-filter-pill" id="rf-curriculum_officer" onclick="MessagesApp.setDirectoryRoleFilter('curriculum_officer')">🏛️ Officers</button>
                                        <button type="button" class="recip-filter-pill" id="rf-administrator" onclick="MessagesApp.setDirectoryRoleFilter('administrator')">⚙️ Admins</button>
                                    </div>

                                    <div style="position:relative;">
                                        <input type="text" id="recipient-search-input" 
                                               class="form-control" 
                                               placeholder="🔍 Type a name, email, or username (Press Enter to select top match)..." 
                                               oninput="MessagesApp.handleDirectorySearchInput(this.value)"
                                               onfocus="MessagesApp.handleDirectorySearchInput(this.value)"
                                               onkeydown="MessagesApp.handleDirectorySearchKeydown(event)"
                                               autocomplete="off">
                                        <div id="recipient-search-dropdown" class="recipient-dropdown-results" style="display:none;"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Step 2: Subject Line -->
                            <div class="form-group-custom">
                                <label class="form-label-custom">2. Conversation Subject <span class="required">*</span></label>
                                <input type="text" id="new-thread-subject" class="form-control" placeholder="e.g. P4 Mathematics Inquiry / Term 1 Scheme of Work" required maxlength="255">
                            </div>

                            <!-- Step 3: Message Body -->
                            <div class="form-group-custom">
                                <label class="form-label-custom">3. Initial Message <span class="required">*</span></label>
                                <textarea id="new-thread-body" class="form-control" rows="4" placeholder="Write your message here..." required></textarea>
                            </div>

                            <!-- Step 4: Importance Flag -->
                            <div class="form-group-custom check-group">
                                <label class="checkbox-container">
                                    <input type="checkbox" id="new-thread-important">
                                    <span class="checkbox-label">⭐ Mark as Important / Priority Inquiry</span>
                                </label>
                            </div>
                        </div>

                        <div class="modal-footer-custom">
                            <button type="button" class="btn btn-secondary" onclick="MessagesApp.closeNewConversationModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="btn-submit-new-thread">
                                <span>Send Message</span> <span>➤</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Preload directory users and show dropdown immediately
        await this.searchDirectoryUsers('');
    },

    closeNewConversationModal() {
        const container = document.getElementById('new-msg-modal-container');
        if (container) container.innerHTML = '';
        this.selectedRecipient = null;
    },

    setDirectoryRoleFilter(role) {
        this.directoryRoleFilter = role;
        document.querySelectorAll('.recip-filter-pill').forEach(el => el.classList.remove('active'));
        const activeBtn = document.getElementById(`rf-${role}`);
        if (activeBtn) activeBtn.classList.add('active');

        const searchInput = document.getElementById('recipient-search-input');
        const query = searchInput ? searchInput.value : '';
        this.renderDirectoryDropdown(query);
    },

    handleDirectorySearchInput(query) {
        // Immediate local filtering
        this.renderDirectoryDropdown(query);

        // Debounced server search
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
            this.searchDirectoryUsers(query);
        }, 300);
    },

    handleDirectorySearchKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const visibleOptions = document.querySelectorAll('.recipient-option-item');
            if (visibleOptions.length > 0) {
                visibleOptions[0].click();
            }
        }
    },

    async searchDirectoryUsers(query = '') {
        const dropdown = document.getElementById('recipient-search-dropdown');
        if (!dropdown) return;

        try {
            const cleanQuery = (query || '').trim();
            const url = cleanQuery ? `/api/messages/recipients?q=${encodeURIComponent(cleanQuery)}` : '/api/messages/recipients';
            const res = await API.get(url);
            
            if (res && res.success && res.data) {
                if (Array.isArray(res.data)) {
                    this.directoryUsers = res.data;
                } else if (Array.isArray(res.data.recipients)) {
                    this.directoryUsers = res.data.recipients;
                } else {
                    this.directoryUsers = [];
                }
                this.renderDirectoryDropdown(cleanQuery);
            } else {
                dropdown.innerHTML = '<div class="dropdown-item-empty">No active users found</div>';
                dropdown.style.display = 'block';
            }
        } catch (e) {
            dropdown.innerHTML = `<div class="p-2 text-danger" style="font-size:0.82rem;">Error loading directory: ${App.escapeHtml(e.message)}</div>`;
            dropdown.style.display = 'block';
        }
    },

    renderDirectoryDropdown(query = '') {
        const dropdown = document.getElementById('recipient-search-dropdown');
        if (!dropdown) return;

        let filtered = this.directoryUsers || [];

        // Apply role filter if selected
        if (this.directoryRoleFilter && this.directoryRoleFilter !== 'all') {
            filtered = filtered.filter(u => u.role_code === this.directoryRoleFilter);
        }

        // Apply local text filter if query is provided
        const q = (query || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(u => {
                const name = (u.display_name || u.full_name || '').toLowerCase();
                const username = (u.username || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                const role = (u.role_name || u.role_code || '').toLowerCase();
                return name.includes(q) || username.includes(q) || email.includes(q) || role.includes(q);
            });
        }

        if (filtered.length === 0) {
            dropdown.innerHTML = `
                <div class="dropdown-item-empty" style="padding:1.25rem 1rem; text-align:center;">
                    <span style="font-size:1.5rem; display:block; margin-bottom:4px;">🔍</span>
                    <strong style="color:var(--text-main);">No matching user found</strong>
                    <p style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">Try searching by a different name, email, or select "All Users".</p>
                </div>
            `;
            dropdown.style.display = 'block';
            return;
        }

        let html = `
            <div style="padding:0.4rem 0.85rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:0.72rem; font-weight:700; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
                <span>MATCHING USERS (${filtered.length})</span>
                <span style="font-size:0.68rem; font-weight:500; color:#94a3b8;">Click to select</span>
            </div>
        `;
        
        filtered.forEach(u => {
            const name = u.display_name || u.full_name || u.username || u.email;
            const role = u.role_name || u.role_code || 'User';
            const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&rounded=true&bold=true`;

            html += `
                <div class="recipient-option-item" onclick="MessagesApp.selectRecipient(${u.user_id})">
                    <img src="${App.escapeHtml(avatar)}" alt="Avatar" class="recip-opt-avatar">
                    <div class="recip-opt-info">
                        <div class="recip-opt-name">${App.escapeHtml(name)}</div>
                        <div class="recip-opt-meta">${App.escapeHtml(u.email || u.username)} &bull; <span class="role-pill-micro ${this.getRoleClass(u.role_code)}">${App.escapeHtml(role)}</span></div>
                    </div>
                    <span class="recip-select-arrow" style="color:var(--primary); font-size:0.85rem; font-weight:700; margin-left:auto;">Select ➔</span>
                </div>
            `;
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
    },

    selectRecipient(userId) {
        const user = this.directoryUsers.find(u => parseInt(u.user_id, 10) === parseInt(userId, 10));
        if (!user) return;

        this.selectedRecipient = user;
        const hiddenInput = document.getElementById('selected-recipient-id');
        const pillContainer = document.getElementById('selected-recipient-pill');
        const pickerWrapper = document.getElementById('recipient-picker-wrapper');
        const dropdown = document.getElementById('recipient-search-dropdown');

        if (hiddenInput) hiddenInput.value = user.user_id;
        if (dropdown) dropdown.style.display = 'none';

        const name = user.display_name || user.full_name || user.username || user.email;
        const role = user.role_name || user.role_code || 'User';
        const avatar = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff&rounded=true&bold=true`;

        if (pillContainer) {
            pillContainer.innerHTML = `
                <div class="isolated-recipient-card">
                    <div class="isolated-user-left">
                        <img src="${App.escapeHtml(avatar)}" alt="Avatar" class="isolated-avatar">
                        <div class="isolated-info">
                            <div class="isolated-title-row">
                                <strong class="isolated-name">${App.escapeHtml(name)}</strong>
                                <span class="role-pill-micro ${this.getRoleClass(user.role_code)}">${App.escapeHtml(role)}</span>
                                <span class="badge-isolated-check">✓ Isolated Recipient</span>
                            </div>
                            <div class="isolated-email">${App.escapeHtml(user.email || user.username)}</div>
                        </div>
                    </div>
                    <button type="button" class="btn-change-recipient" onclick="MessagesApp.clearSelectedRecipient()" title="Change recipient">
                        ✕ Change
                    </button>
                </div>
            `;
            pillContainer.style.display = 'block';
        }

        // Hide search picker to isolate the recipient visually
        if (pickerWrapper) {
            pickerWrapper.style.display = 'none';
        }

        // Focus next field (Subject Line)
        const subjectInput = document.getElementById('new-thread-subject');
        if (subjectInput) subjectInput.focus();
    },

    clearSelectedRecipient() {
        this.selectedRecipient = null;
        const hiddenInput = document.getElementById('selected-recipient-id');
        const pillContainer = document.getElementById('selected-recipient-pill');
        const pickerWrapper = document.getElementById('recipient-picker-wrapper');
        const searchInput = document.getElementById('recipient-search-input');

        if (hiddenInput) hiddenInput.value = '';
        if (pillContainer) {
            pillContainer.innerHTML = '';
            pillContainer.style.display = 'none';
        }
        if (pickerWrapper) {
            pickerWrapper.style.display = 'block';
        }
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
            this.renderDirectoryDropdown('');
        }
    },

    async handleCreateThreadSubmit(event) {
        event.preventDefault();
        const recipientId = document.getElementById('selected-recipient-id')?.value;
        const subject = document.getElementById('new-thread-subject')?.value.trim();
        const body = document.getElementById('new-thread-body')?.value.trim();
        const isImportant = document.getElementById('new-thread-important')?.checked;
        const submitBtn = document.getElementById('btn-submit-new-thread');

        if (!recipientId) {
            alert('Please select a recipient for your message.');
            return;
        }
        if (!subject || !body) {
            alert('Please provide both a subject and an initial message.');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Sending...</span>`;
        }

        try {
            const res = await API.post('/api/messages/threads', {
                recipient_user_id: parseInt(recipientId, 10),
                subject_line: subject,
                initial_message: body,
                is_important: isImportant ? 1 : 0
            });

            if (res && res.success && res.data) {
                this.closeNewConversationModal();
                this.activeThreadId = parseInt(res.data.thread_id, 10);
                await this.loadThreads();
                this.selectThread(this.activeThreadId);
            } else {
                alert(`Could not start conversation: ${res.message || 'Unknown error'}`);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Send Message</span> <span>➤</span>`;
                }
            }
        } catch (e) {
            alert(`Error starting conversation: ${e.message}`);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Send Message</span> <span>➤</span>`;
            }
        }
    },

    /**
     * Helpers & Formatters
     */
    formatMessageBody(text) {
        if (!text) return '';
        const escaped = App.escapeHtml(text);
        return escaped.replace(/\n/g, '<br>');
    },

    formatRelativeTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr.replace(/-/g, '/'));
        if (isNaN(date.getTime())) return dateStr;

        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    },

    formatFullDateTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr.replace(/-/g, '/'));
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-GB', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
        });
    },

    formatTimeOnly(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr.replace(/-/g, '/'));
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },

    getRoleClass(roleCode) {
        switch (roleCode) {
            case 'curriculum_officer': return 'role-officer';
            case 'teacher': return 'role-teacher';
            case 'parent': return 'role-parent';
            case 'administrator': return 'role-admin';
            case 'learner': return 'role-learner';
            default: return 'role-default';
        }
    }
};

window.MessagesApp = MessagesApp;
