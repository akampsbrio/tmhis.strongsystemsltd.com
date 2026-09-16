# TMHIS Database Schema & Data Dictionary

The TMHIS database runs on **MySQL 8.0** with InnoDB engine, utf8mb4 encoding, foreign key constraints, and performance indexes.

---

## 1. Entity Relationship Groupings

### Core Authentication & RBAC
- `roles`: System roles (`learner`, `parent`, `teacher`, `curriculum_officer`, `administrator`).
- `permissions`: Granular capabilities.
- `role_permissions`: Mapping between roles and permissions.
- `users`: Core login accounts with hashed passwords, account statuses, and lockout fields.
- `user_permissions`: Direct per-user overrides.
- `password_resets`: Secure, single-use, time-expiring reset tokens.

### Stakeholders & Actors
- `parents`: Homeschooling facilitators with contact info and district.
- `learners`: Primary learners (P1–P7) linked to a parent and class level.
- `teachers`: Supporting teachers with subject specialties.
- `curriculum_officers`: NCDC / MoES curriculum officers with department metadata.

### Curriculum Structure (P1–P7)
- `classes`: P1, P2, P3, P4, P5, P6, P7.
- `subjects`: English, Mathematics, Science, Social Studies, Local Language.
- `curriculum_terms`: Term 1, Term 2, Term 3.
- `lessons`: Lesson topics, competencies, descriptions, prerequisites.
- `learner_subjects`: Enrollment mapping between learners and subjects.

### Learning Materials & Guides
- `learning_materials`: Worksheets, texts, audios, and lesson notes.
- `material_versions`: Version history and review statuses (`draft`, `under_review`, `approved`, `retired`).
- `parental_guides`: Step-by-step instructional guides for parents.
- `parental_guide_versions`: Version history of guides.

### Assessments & Scoring
- `assessments`: Formative quizzes, termly tests, unit reviews.
- `assessment_questions`: Question definitions and marks.
- `assessment_options`: Multiple-choice options.
- `assessment_attempts`: Learner submissions.
- `assessment_answers`: Individual question responses.
- `assessment_results`: Final verified score records.

### Offline Synchronisation & Audit
- `devices`: Registered learner/parent devices.
- `sync_queue`: Server-side synchronization buffer.
- `sync_log`: Sync history with idempotency UUID tracking.
- `learning_activities`: Learner activity timeline.
- `progress_records`: Progress summaries.
- `notifications`: In-app notification alerts.
- `message_threads`: Two-way parent-officer communication.
- `messages`: Individual messages within threads.
- `message_attachments`: Uploaded message attachments.
- `audit_trail`: Security and operational audit log with before/after JSON snapshots.
- `system_settings`: Technical system configuration keys.

---

## 2. Views
- `vw_learner_subject_progress`: Computed aggregate progress per subject.
- `vw_learner_assessment_summary`: Computed average assessment scores per learner.
