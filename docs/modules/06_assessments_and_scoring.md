# Module 06 — Assessments, Attempts, Server-Side Scoring & Teacher/Parent Gradebook

## Status: ✅ Completed & Verified (Sprint 6)
- **Module Automated Test Suite**: 10 / 10 assertions passing (`tests/test_sprint6_assessments_scoring.php`)
- **Cumulative Regression Test Suite**: 91 / 91 assertions passing (Sprints 0, 1, 2, 3, 4, 5, 6)

---

## 1. Overview & Pedagogical Purpose
Module 06 delivers an assessment authoring, delivery, auto-scoring, and review pipeline tailored for Ugandan Primary Education (P1–P7). It enables Curriculum Officers, Teachers, and Homeschooling Parents to measure learner competency with high data integrity:
- **Authoring Pipeline**: Curriculum Officers and Teachers author assessments with strict validation rules (minimum questions, option quotas, passing mark thresholds).
- **Distraction-Free Test-Taking Interface**: Clean, single-question navigation with progress tracking, live countdown timer, and automated timeout submission.
- **Server-Side Scoring Engine**: Absolute scoring integrity. Objective questions (Multiple Choice, True/False, Short Answer) are strictly scored on the server using canonical question keys. Client-submitted scores are never trusted.
- **Subjective / Essay Grading**: Structured workflow allowing Teachers and Parents to review written responses, award partial marks, and append qualitative feedback.
- **Offline Resilience & Idempotency**: Unique `client_attempt_uuid` prevents duplicate attempt records and guarantees repeatable scoring during offline test sync.
- **Learner & Parent Gradebook**: Instant scorecard with percentage badges, pass/fail indicators, detailed explanations, and performance analytics.

---

## 2. Assessment Data Architecture

```
Assessments (Title, Class, Subject, Marks, Time Limit, Status)
  ├── Questions (Type, Text, Marks, Explanation)
  │     └── Options (Label, Text, is_correct)
  └── Attempts (Learner, client_attempt_uuid, started_at, status)
        ├── Answers (question_id, option_id, answer_text, marks_awarded, is_correct)
        └── Results (score, total_marks, percentage, feedback, scoring_mode)
```

### Supported Question Types
1. **Multiple Choice (`multiple_choice`)**: 2 to 6 radio options with single canonical correct answer.
2. **True / False (`true_false`)**: Binary concept verification.
3. **Short Answer (`short_answer`)**: Exact/case-insensitive text match evaluated on backend.
4. **Structured Essay (`essay`)**: Step-by-step problem working requiring manual teacher/parent scoring.
5. **Mixed (`mixed`)**: Comprehensive assessments combining objective and essay items.

---

## 3. Database Schema

1. `assessments`: Main assessment catalog entries with class, subject, lesson references, time limit, and total/passing marks.
2. `assessment_questions`: Item bank questions with question order, marks, media/audio attachments, and pedagogical explanations.
3. `assessment_options`: Options for objective multiple-choice and true/false questions.
4. `assessment_attempts`: Test execution sessions tracking learner, attempt mode (online/offline), UUID, and status (`in_progress`, `submitted`, `synced`, `abandoned`).
5. `assessment_answers`: Submitted learner answers linked to attempts with server-awarded marks and correctness flags.
6. `assessment_results`: Final aggregated score records, percentage, pass/fail indicators, feedback, and scoring mode (`automatic`, `manual`, `mixed`).
7. `vw_learner_assessment_summary`: Database view calculating weighted averages and assessment counts per learner and subject.

---

## 4. Complete REST API Reference

### Assessment Catalog & Authoring
- `GET /api/assessments` — List published assessments (filters: `class_id`, `subject_id`, `assessment_type`, `search`)
- `GET /api/assessments/{id}` — Assessment details (sanitizes correct answers when `for_attempt=true`)
- `POST /api/officer/assessments` — Create assessment draft (Curriculum Officer / Admin)
- `PUT /api/officer/assessments/{id}` — Update assessment metadata and question bank
- `POST /api/officer/assessments/{id}/publish` — Validate authoring constraints and publish

### Test Execution & Auto-Scoring
- `POST /api/assessments/{id}/attempts` — Start new test attempt with `client_attempt_uuid` idempotency
- `POST /api/attempts/{id}/submit` — Submit answers and execute server-side auto-scoring engine
- `GET /api/attempts/{id}/result` — Retrieve scorecard with question review, answers, and explanations

### Gradebook & Manual Review
- `GET /api/parent/assessments/results` — Fetch learner assessment history and summary metrics
- `POST /api/results/{id}/manual-score` — Award marks for essay questions and recalculate total score

---

## 5. Automated Testing & Verification

Run the Module 06 test suite:
```bash
php tests/test_sprint6_assessments_scoring.php
```

Run cumulative regression test suite (Modules 00–06):
```bash
for f in tests/test_sprint*.php; do php "$f"; done
```
