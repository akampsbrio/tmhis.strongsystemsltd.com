# TMHIS REST API Reference

All endpoints return JSON wrapped in the standard response envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable message",
  "errors": []
}
```

---

## Authentication Endpoints

### 1. User Login
- **Endpoint:** `POST /api/auth/login`
- **Body:**
  ```json
  {
    "login": "parent@example.com",
    "password": "Password123!",
    "remember": true
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "token": "NTpjYWM0ZWE4...",
      "user": {
        "user_id": 5,
        "role_code": "parent",
        "email": "parent@example.com",
        "dashboard_url": "/#parent-dashboard"
      }
    },
    "message": "Login successful."
  }
  ```

### 2. Parent Self-Registration
- **Endpoint:** `POST /api/auth/register-parent`
- **Body:**
  ```json
  {
    "full_name": "Sarah Namubiru",
    "email": "sarah@example.com",
    "phone": "+256 700 112233",
    "district": "Wakiso",
    "password": "SecurePassword123!",
    "password_confirmation": "SecurePassword123!"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "data": {
      "user_id": 6,
      "parent_id": 2,
      "email": "sarah@example.com"
    },
    "message": "Parent account created successfully."
  }
  ```

### 3. Current User Profile
- **Endpoint:** `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns authenticated user, profile, and permissions array.

### 4. Forgot Password
- **Endpoint:** `POST /api/auth/forgot-password`
- **Body:** `{"email": "user@example.com"}`

### 5. Reset Password
- **Endpoint:** `POST /api/auth/reset-password`
- **Body:**
  ```json
  {
    "token": "<raw_reset_token>",
    "password": "NewPassword123!",
    "password_confirmation": "NewPassword123!"
  }
  ```

### 6. Change Password
- **Endpoint:** `POST /api/auth/change-password`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "current_password": "OldPassword123!",
    "new_password": "NewPassword123!",
    "new_password_confirmation": "NewPassword123!"
  }
  ```

---

## Administration Endpoints (Admin Role Required)

### 1. List Users
- **Endpoint:** `GET /api/admin/users?role=parent&status=active&page=1&limit=20`
- **Headers:** `Authorization: Bearer <admin_token>`

### 2. Create User
- **Endpoint:** `POST /api/admin/users`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Body:**
  ```json
  {
    "role_code": "teacher",
    "full_name": "David Mukasa",
    "email": "mukasa@example.com",
    "phone": "+256 701 445566",
    "password": "TeacherPassword123!"
  }
  ```

### 3. Update User Status
- **Endpoint:** `PATCH /api/admin/users/{id}/status`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Body:** `{"status": "suspended"}`

---

## Module 05: Parental Guides & Scheduling Endpoints

### 1. Academic Terms Catalog
- **Endpoint:** `GET /api/parent/terms` or `GET /api/curriculum/terms`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns 2026 academic terms (Term 1, 2, 3), date bounds, `is_current` flag, and dynamic term-week calculation (1–12).

### 2. List Parental Guides
- **Endpoint:** `GET /api/parent/guides?class_id=1&term_id=3&education_level_target=basic&search=phonics`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Fetches published guides with filters and metadata.

### 3. Get Single Guide Details
- **Endpoint:** `GET /api/guides/{id}`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Retrieves structured learning objectives, materials checklist, step-by-step instructions, common mistakes, assessment checklists, and linked learning assets.

### 4. Printable Guide Export
- **Endpoint:** `GET /api/guides/{id}/export`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Formatted layout for home printing or offline distribution.

### 5. Officer Guide Authoring
- **Endpoint:** `POST /api/officer/guides`
- **Headers:** `Authorization: Bearer <officer_token>`
- **Body:**
  ```json
  {
    "class_id": 4,
    "subject_id": 12,
    "term_id": 3,
    "title": "Parent Guide: Teaching Place Value",
    "education_level_target": "intermediate",
    "expected_duration_minutes": 45,
    "learning_objectives": "- Identify place values up to 100,000",
    "materials_needed": "Abacus, grid notebook, number cards",
    "suggested_steps": "Step 1: Base Ten Review\nStep 2: Position Value",
    "guide_body": "Step 1: Base Ten Review\nStep 2: Position Value",
    "common_mistakes": "- Skipping zero placeholders",
    "assessment_checklist": "[] Learner states place value\n[] Learner writes expanded form"
  }
  ```

### 6. Get Weekly Learner Schedule
- **Endpoint:** `GET /api/parent/schedule?learner_id=14&start_date=2026-09-14&end_date=2026-09-20`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Returns timetable slots with subject and lesson metadata.

### 7. Create Learning Schedule Slot
- **Endpoint:** `POST /api/parent/schedule`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Body:**
  ```json
  {
    "learner_id": 14,
    "scheduled_date": "2026-09-18",
    "start_time": "09:00:00",
    "end_time": "09:45:00",
    "subject_id": 12,
    "lesson_id": 45,
    "notes": "Morning numeracy session"
  }
  ```

### 8. Term Summary Metrics
- **Endpoint:** `GET /api/parent/schedule/term-summary?learner_id=14&term_id=3`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Computes completed sessions, hours logged, and term completion percentage.

### 9. Explainable Next-Lesson Suggestions
- **Endpoint:** `GET /api/parent/schedule/suggested-next?learner_id=14`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Generates rule-based suggestions based on syllabus progression and skipped lesson backlog.

### 10. 12-Week Termly Syllabus Roadmap
- **Endpoint:** `GET /api/parent/schedule/term-roadmap?learner_id=14&term_id=3`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Retrieves the full 12-week syllabus pacing roadmap across all class subjects for a learner, including milestone status (`completed`, `planned`, `unscheduled`), associated parental guides, and aggregated completion metrics.

### 11. Auto-Preplan Term Milestones Engine
- **Endpoint:** `POST /api/parent/schedule/auto-distribute`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Body:**
  ```json
  {
    "learner_id": 14,
    "term_id": 3,
    "start_date": "2026-09-17",
    "start_time": "09:00:00",
    "lessons_per_day": 2,
    "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
  }
  ```
- **Description:** Automatically identifies all unscheduled syllabus milestones and distributes them sequentially across active term weekdays without overlapping existing scheduled sessions.

---

## Assessments, Attempts & Server-Side Scoring (Module 06)

### 12. List Assessments
- **Endpoint:** `GET /api/assessments?class_id=6&subject_id=1`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns published assessments filtered by class, subject, or type.

### 13. Get Assessment Details (with Sanitization)
- **Endpoint:** `GET /api/assessments/1?for_attempt=true`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns assessment questions and options with correct answers withheld during active student attempts.

### 14. Start Assessment Attempt
- **Endpoint:** `POST /api/assessments/1/attempts`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "learner_id": 14,
    "client_attempt_uuid": "att_20260917_01a",
    "attempt_mode": "online"
  }
  ```
- **Description:** Initializes an attempt session with idempotent UUID deduplication.

### 15. Submit Attempt & Server-Side Score
- **Endpoint:** `POST /api/attempts/1/submit`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "answers": [
      { "question_id": 1, "option_id": 3 },
      { "question_id": 2, "answer_text": "40" },
      { "question_id": 4, "answer_text": "5 * 20 = 100" }
    ]
  }
  ```
- **Description:** Computes objective question scores on backend, records answers, and generates result record.

### 16. Get Attempt Scorecard & Review Breakdown
- **Endpoint:** `GET /api/attempts/1/result`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns full scorecard with question-by-question correctness, points awarded, and pedagogical explanations.

### 17. Manual Essay Grading
- **Endpoint:** `POST /api/results/1/manual-score`
- **Headers:** `Authorization: Bearer <teacher_or_parent_token>`
- **Body:**
  ```json
  {
    "answers": [
      { "answer_id": 4, "marks_awarded": 4.5 }
    ],
    "feedback": "Great working steps shown."
  }
  ```
- **Description:** Allows authorized teachers/parents to award points for subjective essay questions and recalculates overall percentage.

---

## Module 06.1 Annex: Termly Exam Sets & UNEB Grading

### 18. List Official Exam Sets
- **Endpoint:** `GET /api/exams/sets?term_id=3&class_id=4`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Retrieves official exam sets (End of Term 1, 2, 3 Exams, Mock UNEB Sets) with status and papers count.

### 19. Submit Exam Marks for Learner
- **Endpoint:** `POST /api/exams/submit`
- **Headers:** `Authorization: Bearer <parent_or_teacher_token>`
- **Body:**
  ```json
  {
    "exam_set_id": 1,
    "learner_id": 14,
    "papers": [
      { "subject_code": "ENG", "raw_score": 88 },
      { "subject_code": "MTC", "raw_score": 92 },
      { "subject_code": "SCI", "raw_score": 84 },
      { "subject_code": "SST", "raw_score": 80 }
    ]
  }
  ```
- **Description:** Records paper scores and triggers the server-side Ugandan UNEB 9-Grade stanine calculation and division assignment.

---

## Module 07: PWA Offline Architecture & Synchronisation

### 20. Register Device
- **Endpoint:** `POST /api/sync/register-device`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "device_id": "dev_phone_s8_01",
    "device_type": "android",
    "client_version": "1.0.0"
  }
  ```
- **Description:** Registers a client device token and initializes sync telemetry.

### 21. Pull Delta Updates
- **Endpoint:** `GET /api/sync/pull-updates?since=2026-09-01T00:00:00Z&class_id=4`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Delta sync endpoint retrieving newly created/modified syllabus items, materials, guides, and assessments since last sync.

### 22. Push Offline Event Batch
- **Endpoint:** `POST /api/sync/push-batch`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "device_id": "dev_phone_s8_01",
    "sync_uuid": "sync_batch_20260918_01",
    "events": [
      {
        "type": "progress",
        "learner_id": 14,
        "lesson_id": 4,
        "status": "completed",
        "time_spent_minutes": 35
      },
      {
        "type": "activity",
        "learner_id": 14,
        "material_id": 10,
        "status": "completed",
        "client_activity_uuid": "act_uuid_01",
        "duration_seconds": 120
      }
    ]
  }
  ```
- **Description:** Ingests offline-queued learning events with strict idempotency and deduplication.

---

## Module 08: Activities, Progress Tracking & Role-Based Dashboards

### 23. Learner Self Dashboard
- **Endpoint:** `GET /api/progress/learner`
- **Headers:** `Authorization: Bearer <learner_token>`
- **Description:** Retrieves real-time syllabus completion meters, weighted quiz averages, explainable next recommended lesson, pending assessments, and recent activity timeline.

### 24. Learner Progress Details (RBAC Scoped)
- **Endpoint:** `GET /api/progress/learner/{id}`
- **Headers:** `Authorization: Bearer <parent_or_teacher_or_officer_token>`
- **Description:** Retrieves progress for a specific learner. Enforces strict parent multi-tenant boundary checks.

### 25. Parent Multi-Child Dashboard
- **Endpoint:** `GET /api/progress/parent`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Returns progress cards for all enrolled children under the parent, family completion velocity, next lesson per child, and attention flags (<50% quiz avg or zero completions).

### 26. Teacher Class Roster & Diagnostic Panel
- **Endpoint:** `GET /api/progress/teacher?class_id=4`
- **Headers:** `Authorization: Bearer <teacher_token>`
- **Description:** Returns class-level learner progress roster, risk indicators (`good`, `warning`, `critical`), and struggling topics panel (assessments with pass rates < 60%).

### 27. Curriculum Officer Macro Analytics
- **Endpoint:** `GET /api/progress/officer`
- **Headers:** `Authorization: Bearer <officer_token>`
- **Description:** High-level NCDC primary curriculum coverage across P1–P7, subject attainment averages, and system-wide engagement totals.

### 28. Atomic Lesson Progress Update
- **Endpoint:** `POST /api/progress/lesson`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "learner_id": 14,
    "lesson_id": 4,
    "completion_status": "completed",
    "time_spent_minutes": 40
  }
  ```
- **Description:** Upserts lesson progress milestone (`not_started`, `in_progress`, `completed`), updates dates, and aggregates time spent.

### 29. Record Learning Activity Heartbeat
- **Endpoint:** `POST /api/progress/activity`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "learner_id": 14,
    "material_id": 12,
    "activity_status": "completed",
    "time_spent_seconds": 120,
    "client_activity_uuid": "uuid-act-001"
  }
  ```
- **Description:** Ingests material viewing heartbeats and reading time with client UUID idempotency.

---

## Module 09: Reports, Analytics & MoES Curriculum Compliance Endpoints

### 30. Learner Official Terminal Report Card
- **Endpoint:** `GET /api/reports/learner/{id}?term_id=1&year=2026`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns official terminal report card with syllabus progress breakdown, weighted quiz averages, UNEB PLE Division grade and total aggregate point calculation, pedagogical remarks, and snapshot UUID.

### 31. Parent Multi-Child Family Consolidated Report
- **Endpoint:** `GET /api/reports/parent?term_id=1&year=2026`
- **Headers:** `Authorization: Bearer <parent_token>`
- **Description:** Returns comparative progress audit across all children registered under the authenticated parent.

### 32. Teacher Class Pacing & Diagnostic Summary
- **Endpoint:** `GET /api/reports/class-summary?class_id=4&district=Wakiso&year=2026`
- **Headers:** `Authorization: Bearer <teacher_token>`
- **Description:** Returns class gradebook roster, at-risk learner detection, topic difficulty heatmap (<60% pass rate), and study hour metrics.

### 33. MoES Student-by-Student Curriculum Compliance Audit
- **Endpoint:** `GET /api/reports/compliance?class_id=4&class_level=6&year=2026&search=Grace`
- **Headers:** `Authorization: Bearer <officer_or_teacher_token>`
- **Description:** Evaluates active learners individually against statutory MoES syllabus coverage, quiz pass rates, and study hours benchmarks from `compliance_benchmarks`. Returns student compliance status, violation flags, and macro summary.

### 34. List Compliance Quality Benchmarks
- **Endpoint:** `GET /api/reports/benchmarks`
- **Headers:** `Authorization: Bearer <officer_or_admin_token>`
- **Description:** Returns active national and class-level quality benchmark targets.

### 35. Configure Compliance Quality Benchmarks
- **Endpoint:** `POST /api/reports/benchmarks`
- **Headers:** `Authorization: Bearer <officer_or_admin_token>`
- **Body:**
  ```json
  {
    "min_coverage_percentage": 75.0,
    "min_pass_rate": 55.0,
    "min_study_hours": 30.0,
    "class_id": 6,
    "term_id": 1
  }
  ```
- **Description:** Updates statutory quality thresholds in `compliance_benchmarks` and logs audit trail event.

### 36. Raw CSV Report Data Export
- **Endpoint:** `GET /api/reports/{type}/export?format=csv&id=14&class_id=4`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Streams raw formatted CSV output for learner terminal records, class diagnostics, or student-by-student compliance audits.

### 37. Retrieve Immutable Report Snapshot
- **Endpoint:** `GET /api/reports/snapshots/{uuid}`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Fetches historical reproducible report snapshot payload by immutable UUID.

---

## Module 10: Notifications, Alerts & MoES Statutory Circulars Endpoints

### 38. Retrieve User Notifications
- **Endpoint:** `GET /api/notifications?status=unread&type=circular&limit=20`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Returns paginated notifications and real-time unread badge count for the authenticated user.

### 39. Mark Notification as Read
- **Endpoint:** `PATCH /api/notifications/{id}/read`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Updates status of specified notification to `read` with timestamp.

### 40. Mark All Notifications as Read
- **Endpoint:** `POST /api/notifications/mark-all-read`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Bulk updates all unread notifications for authenticated user to `read`.

### 41. Dismiss Notification
- **Endpoint:** `POST /api/notifications/{id}/dismiss`
- **Headers:** `Authorization: Bearer <token>`
- **Description:** Hides/dismisses notification from active notification center view.

### 42. Publish Statutory Circular Broadcast
- **Endpoint:** `POST /api/officer/notifications/broadcast`
- **Headers:** `Authorization: Bearer <officer_or_admin_token>`
- **Body:**
  ```json
  {
    "title": "MoES Term 1 Assessment Circular",
    "message": "All homeschooling parents are requested to review continuous assessment marks before Week 10.",
    "broadcast_type": "circular",
    "target_role": "parent",
    "target_class_id": 4,
    "target_district": "Wakiso",
    "priority": "high",
    "action_url": "#schedule"
  }
  ```
- **Description:** Dispatches official circular notification to targeted users and records broadcast delivery metrics with security audit logging.

### 43. List Broadcast History
- **Endpoint:** `GET /api/officer/notifications/broadcasts?limit=20`
- **Headers:** `Authorization: Bearer <officer_or_admin_token>`
- **Description:** Returns chronological log of published circulars with delivery and audience reach metrics.

### 44. Evaluate Automated Pacing Reminders
- **Endpoint:** `POST /api/notifications/evaluate-pacing`
- **Headers:** `Authorization: Bearer <officer_or_admin_token>`
- **Description:** Scans active learners for pacing delays (<50% coverage) and dispatches automated parent reminders idempotently.




