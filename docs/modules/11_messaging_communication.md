# Module 11: Universal In-App Messaging & Transparent Read Receipts Engine

## Overview
Module 11 introduces a direct, asynchronous in-app messaging engine for the **Technology-Mediated Homeschooling Information System (TMHIS)**. It allows any registered system user—Parents, Teachers, Curriculum Officers, Administrators, and Learners—to communicate directly with any other user across roles without real-time synchronization requirements.

A central design pillar of this module is **total communication transparency**: senders are provided with explicit, verifiable read receipts with timestamps indicating the exact second their message was accessed and viewed by the recipient.

---

## Key Features & Capabilities

### 1. Universal Multi-Role Communication
- **Cross-Role Inquiries:** Enables Parents to message Teachers, Parents to message Curriculum Officers, Learners to communicate with Teachers, and Administrators to engage any user.
- **Threaded Discussions:** Every conversation is tracked in a distinct thread (`message_threads`) tagged with subject lines, active/closed status, and optional links to subjects or learners.
- **Priority Inquiries:** Users can flag important or urgent inquiries (`is_important`), highlighting them with a distinct priority badge across views.

### 2. Transparent Read Receipts & Delivery Tracking
- **Initial Delivery (`✓ Sent`):** When a message is sent, its status is recorded as `sent` with `read_at = NULL`.
- **Transparent Stamping (`✓✓ Read · [Timestamp]`):** When the recipient opens the conversation thread via `GET /api/messages/threads/{id}`, the backend automatically executes an atomic update stamping `read_at = NOW()` and setting status to `read` on all unread incoming messages.
- **Sender Verification:** The sender transparently sees the exact date and time the message was opened (e.g. `✓✓ Read · 18 Sep 2026, 04:15 PM`), eliminating uncertainty and providing accountability.

### 3. Integrated Notification Dispatch
- When a new thread or reply is sent to a recipient, the system automatically dispatches an in-app notification (`notifications` table) with a direct link (`#messages?thread={id}`) to notify them immediately.

### 4. Searchable Recipient Directory
- Fast live directory search (`GET /api/messages/recipients?q=...`) allowing users to find any participant by full name, username, email, or role badge (e.g. "Teacher", "NCDC Officer", "Parent").

### 5. Multi-Tenant Privacy & RBAC Isolation
- Users can only list threads in which they are either the creator or the direct recipient (`creator_user_id = :uid OR recipient_user_id = :uid`).
- Strict security barrier: Unauthorized users attempting to fetch or post messages to a third-party thread are immediately rejected with a `403 Forbidden` exception.

---

## Architecture & Database Schema

### `message_threads` Table
Tracks top-level conversation threads between two participants:
- `thread_id`: Primary key (`BIGINT UNSIGNED AUTO_INCREMENT`).
- `creator_user_id`: Initiating user (`BIGINT UNSIGNED NOT NULL`).
- `recipient_user_id`: Targeted recipient user (`BIGINT UNSIGNED NOT NULL`).
- `subject_id`: Optional subject reference (`INT UNSIGNED NULL`).
- `learner_id`: Optional learner reference (`BIGINT UNSIGNED NULL`).
- `subject_line`: Conversation title (`VARCHAR(255) NOT NULL`).
- `status`: ENUM (`open`, `closed`).
- `is_important`: Priority flag (`TINYINT(1) DEFAULT 0`).
- `last_message_at`: Timestamp of newest message activity (`DATETIME NOT NULL`).
- `last_message_preview`: Truncated preview text of newest message (`VARCHAR(255) NULL`).
- `created_at`: Timestamp of thread creation.

### `messages` Table
Stores individual asynchronous messages within a thread:
- `message_id`: Primary key (`BIGINT UNSIGNED AUTO_INCREMENT`).
- `thread_id`: Foreign key referencing `message_threads(thread_id)` with `ON DELETE CASCADE`.
- `sender_user_id`: Sending user (`BIGINT UNSIGNED NOT NULL`).
- `message_body`: Plaintext or formatted message content (`TEXT NOT NULL`).
- `sent_at`: Timestamp message was recorded by the server (`DATETIME NOT NULL`).
- `read_at`: Timestamp when the recipient opened the thread (`DATETIME NULL`).
- `status`: ENUM (`sent`, `delivered`, `read`).
- `client_message_uuid`: Optional client UUID for idempotency (`VARCHAR(64) NULL`).

---

## API Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/messages/threads` | List active user's conversation threads (filterable: `all`, `unread`, `important`, and query `q`) | Yes (Any Role) |
| `POST` | `/api/messages/threads` | Start a new conversation thread with a recipient | Yes (Any Role) |
| `GET` | `/api/messages/threads/{id}` | Retrieve full message stream & stamp `read_at` on unread messages | Yes (Participant) |
| `POST` | `/api/messages/threads/{id}/messages` | Post a new reply message in an existing thread | Yes (Participant) |
| `GET` | `/api/messages/recipients` | Search system user directory for starting conversations | Yes (Any Role) |
| `GET` | `/api/messages/unread-count` | Get total count of unread incoming messages across all threads | Yes (Any Role) |

---

## Frontend User Experience (`#messages`)

- **Header Unread Indicator:** Message icon badge (`💬 2`) in the top navigation bar with periodic background polling.
- **2-Column Responsive Layout:**
  - **Left Pane:** Searchable conversation thread list with filter tabs (`All`, `Unread`, `⭐ Important`), unread green dots, avatar previews, and relative timestamps (`2m ago`, `Yesterday`).
  - **Right Pane:** Chat message stream showing incoming messages (white bubbles) and outgoing messages (blue bubbles), complete with sender names, timestamps, and live read receipts (`✓ Sent` / `✓✓ Read · [Timestamp]`).
- **Asynchronous Composer:** Textarea with <kbd>Ctrl</kbd> + <kbd>Enter</kbd> keyboard shortcut for fast dispatch.
- **New Conversation Modal:** Live autocomplete directory picker with role badges to initiate direct discussions.

---

## Automated Verification & Test Coverage

Sprint 11 features 100% automated integration test coverage in [`tests/test_sprint11_messaging.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/tests/test_sprint11_messaging.php):
1. **Database Schema & Index Verification:** Ensures `message_threads` and `messages` tables and columns exist.
2. **User Fixture Setup:** Creates isolated Parent, Curriculum Officer, and Stranger fixtures.
3. **Directory Search:** Tests recipient lookup and identity resolution.
4. **Thread Creation & Delivery:** Validates conversation creation and incoming unread counter increment.
5. **Transparent Read Receipt Stamping:** Verifies `read_at` is `NULL` initially, stamped with `NOW()` upon thread open, and visible to sender.
6. **Two-Way Reply & Notification Dispatch:** Verifies back-and-forth communication, unread counter recalculations, and in-app alerts.
7. **RBAC Isolation & Security Barrier:** Proves third-party stranger users cannot read or post into unauthorized conversations.
8. **Teardown & Cleanup:** Safely cleans test fixtures without leaving orphaned rows.
