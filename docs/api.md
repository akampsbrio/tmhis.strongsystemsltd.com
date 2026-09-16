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


