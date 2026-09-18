# TMHIS Database Schema & Data Dictionary

The TMHIS database runs on **MySQL 8.0** with InnoDB engine, `utf8mb4_unicode_ci` encoding, foreign key constraints, and performance-optimized indexes.

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
- `learners`: Primary learners (P1–P7) linked to a parent, class level, and special learning needs flags.
- `teachers`: Supporting teachers with subject specialties.
- `curriculum_officers`: NCDC / MoES curriculum officers with department metadata.

### Curriculum Structure (P1–P7)
- `classes`: Primary One (P1) through Primary Seven (P7) with age brackets.
- `subjects`: English, Mathematics, Science, Social Studies, Local Language, Religious Education.
- `curriculum_terms`: Term 1, Term 2, Term 3 with date boundaries.
- `lessons`: Lesson topics, competencies, descriptions, duration, and prerequisites.
- `learner_subjects`: Enrollment mapping between learners and subjects.

### Learning Materials & Guides
- `learning_materials`: Worksheets, texts, audios, and lesson notes.
- `material_versions`: Version history and review statuses (`draft`, `under_review`, `approved`, `retired`).
- `parental_guides`: Step-by-step instructional guides for parents.
- `parental_guide_versions`: Version history of guides.

### Assessments, Exams & Scoring
- `assessments`: Formative quizzes, termly tests, unit reviews.
- `assessment_questions`: Question definitions, types (`multiple_choice`, `true_false`, `short_answer`, `essay`), and marks.
- `assessment_options`: Multiple-choice options.
- `assessment_attempts`: Learner attempt sessions with client UUID idempotency.
- `assessment_answers`: Individual question responses and auto-awarded scores.
- `assessment_results`: Final verified score records.
- `exam_sets`: Official end-of-term exam packages.
- `exam_papers`: Individual subject papers per exam set.
- `exam_submissions`: Candidate exam paper marks.
- `exam_marks`: Subject aggregates, stanine grades (D1–F9), aggregate scores, and UNEB Division classifications.
- `grading_schemes`: Standard UNEB 9-Grade stanine conversion thresholds.

### Offline Synchronisation, Activities & Progress
- `devices`: Registered learner/parent devices with push tokens.
- `sync_queue`: Server-side synchronization buffer for offline batches.
- `sync_log`: Sync history with idempotency UUID tracking.
- `learning_activities`: Learner activity timeline and material reading heartbeats (`client_activity_uuid`).
- `progress_records`: Atomic lesson completion states (`not_started`, `in_progress`, `completed`), time spent, and dates.
- `lesson_observations`: Formative notes, parent feedback, and struggle diagnostic flags.

### Reports, Snapshots & Compliance Benchmarks (Module 09)
- `compliance_benchmarks`: Statutory quality and pacing thresholds (`min_coverage_percentage`, `min_pass_rate`, `min_study_hours`) per class/term or national default.
- `report_snapshots`: Immutable, reproducible JSON payloads of official generated reports with unique UUIDs (`snapshot_uuid`).

### Notifications, Alerts & Broadcasts (Module 10)
- `notifications`: User-scoped alerts, lesson pacing reminders, statutory circulars, and system notices with `action_url`, `priority`, and `metadata_json`.
- `notification_broadcasts`: Official circulars and directives published by Curriculum Officers with target role/class/district filters and reach metrics.

### Communication & Operations
- `message_threads`: Two-way parent-officer communication.
- `messages`: Individual messages within threads.
- `message_attachments`: Uploaded message attachments.
- `audit_trail`: Security and operational audit log with before/after JSON snapshots.
- `system_settings`: Technical system configuration keys.

---

## 2. SQL Views

### `vw_learner_subject_progress`
Computes real-time syllabus completion per learner and subject:
$$\text{Completion \%} = \frac{\text{Completed Lessons}}{\text{Expected Active Lessons}} \times 100$$
Columns: `learner_id`, `learner_name`, `class_code`, `class_id`, `subject_id`, `subject_name`, `subject_code`, `expected_lessons`, `completed_lessons`, `in_progress_lessons`, `completion_percentage`, `total_time_spent_minutes`, `last_progress_at`.

### `vw_learner_assessment_summary`
Computes weighted assessment performance and pass rate:
$$\text{Weighted \%} = \frac{\sum \text{Score}}{\sum \text{Total Possible Marks}} \times 100$$
Columns: `learner_id`, `subject_id`, `subject_name`, `assessment_count`, `total_score`, `total_possible_marks`, `weighted_percentage`, `passed_count`, `latest_assessment_date`.

### `vw_learner_exam_summary`
Computes termly UNEB division outcomes and aggregate scores per learner.

### `vw_district_compliance_summary`
Aggregates active learners, active parents, total expected lessons, completed lessons, average coverage %, average quiz %, total study hours, and at-risk learner counts grouped by district, class level, and class code for MoES statutory compliance monitoring.
