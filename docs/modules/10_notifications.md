# Module 10: Notifications, Alerts & MoES Statutory Circulars Engine

## Overview
Module 10 provides real-time notification dispatch, automated lesson pacing reminders, at-risk academic alerts, and official MoES statutory circular broadcasts for the **Technology-Based Homeschooling Information System (TMHIS)**. It ensures that homeschooling parents, educators, curriculum officers, and learners receive timely alerts and authoritative directives with strict multi-tenant privacy isolation.

---

## Key Features & Capabilities

### 1. Multi-Category Notification Delivery
- **⏰ Lesson Pacing Reminders (`reminder`):** Automated reminders sent to parents when a child falls behind their expected schedule (<50% coverage) or has pending quiz submissions.
- **⚠️ Academic & At-Risk Alerts (`alert`):** Urgent alerts triggered when syllabus progress or continuous assessment pass rates drop below statutory thresholds.
- **🏛️ MoES Statutory Circulars & Announcements (`circular` / `announcement`):** Official Ministry circulars, academic calendar updates, and national directives published by Curriculum Officers.
- **⚙️ System & Offline Notices (`system`):** Sync queue conflict alerts, storage notices, password updates, and account security notifications.

### 2. Multi-Role Scoped Delivery & Privacy
- Strict multi-tenant security: Users can only query, read, or dismiss their own notifications.
- All actions validated through `AuthMiddleware` and `RoleMiddleware`.

### 3. Curriculum Officer MoES Broadcast Engine
- Role-restricted broadcast publishing endpoint (`POST /api/officer/notifications/broadcast`).
- Audience targeting options:
  - By Role: All Parents, All Teachers, All Learners, or All Users.
  - By Primary Grade Level: P1 through P7 candidates.
  - By District: Specific Ugandan district (e.g., Kampala, Wakiso, Mukono).
- Delivery metrics & history tracking (`GET /api/officer/notifications/broadcasts`).
- Audit trail logging for all official broadcast publications.

### 4. Interactive Frontend User Experience
- **Interactive Header Bell Badge:** Real-time unread count indicator (`🔔 3`) with periodic 45s background polling when active.
- **Dropdown Quick-View Popover:** Click-to-open preview of the latest 5 unread alerts with time-ago formatting, category icons, and "Mark all read" button.
- **Notification Center (`#notifications`):** Full-screen management inbox with category tabs (`All`, `Unread`, `⏰ Reminders`, `🏛️ MoES Circulars`, `⚠️ Alerts`, `⚙️ System`), deep-linking navigation, and item dismissal.
- **Officer Circular Publisher Modal:** Rich composer dialog for Curriculum Officers to draft directives and select target audiences.

---

## Database Architecture

### `notifications` Table
Stores individual notification alerts for each user:
- `notification_id`: Primary key (BIGINT UNSIGNED).
- `user_id`: Foreign key to `users(user_id)` with `ON DELETE CASCADE`.
- `notification_type`: ENUM (`reminder`, `alert`, `circular`, `announcement`, `system`).
- `title`: Short descriptive title (VARCHAR 200).
- `message`: Full notification text (TEXT).
- `action_url`: Optional client routing hash (VARCHAR 255 - e.g. `#learner-reports?id=4`).
- `priority`: ENUM (`low`, `normal`, `high`, `urgent`).
- `metadata_json`: Contextual JSON payload (e.g. learner ID, broadcast ID).
- `status`: ENUM (`unread`, `read`, `dismissed`).
- `date_created`: Timestamp of creation.
- `date_read`: Timestamp when marked as read.

### `notification_broadcasts` Table
Tracks official broadcasts published by Curriculum Officers:
- `broadcast_id`: Primary key (BIGINT UNSIGNED).
- `sender_id`: Foreign key to `users(user_id)`.
- `title`: Circular title (VARCHAR 200).
- `message`: Circular content (TEXT).
- `broadcast_type`: ENUM (`circular`, `announcement`, `system`, `alert`).
- `target_role`: Scoped role (VARCHAR 50 NULL).
- `target_class_id`: Scoped class ID (BIGINT NULL).
- `target_district`: Scoped district (VARCHAR 100 NULL).
- `priority`: ENUM (`low`, `normal`, `high`, `urgent`).
- `recipients_count`: Number of users reached.
- `created_at`: Broadcast publication timestamp.

---

## API Endpoints

### User Notifications
- `GET /api/notifications`: Retrieve paginated notifications and unread count badge.
- `PATCH /api/notifications/{id}/read`: Mark individual notification as read.
- `POST /api/notifications/mark-all-read`: Mark all unread notifications for current user as read.
- `POST /api/notifications/{id}/dismiss`: Dismiss/hide a notification from active view.

### Officer Broadcasts & Automation
- `POST /api/officer/notifications/broadcast`: Publish statutory circular or announcement (Curriculum Officers & Admins only).
- `GET /api/officer/notifications/broadcasts`: Retrieve broadcast history and delivery counts.
- `POST /api/notifications/evaluate-pacing`: Trigger automated lesson pacing scan and parent reminder generation.

---

## Automated Verification
Module 10 is covered by the automated integration test suite in `tests/test_sprint10_notifications.php` with 23 assertions verifying table schemas, individual dispatch, unread metrics, read state transitions, dismissal, multi-tenant RBAC security, broadcast audience targeting, and automated lesson pacing reminder evaluation.
