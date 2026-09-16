# Module 05 — Parental Guides, Flexible Scheduling & Termly Syllabus Planner

## Status: ✅ Completed & Verified (Sprint 5)
- **Module Automated Test Suite**: 13 / 13 assertions passing (`tests/test_sprint5_guides_scheduling.php`)
- **Cumulative Regression Test Suite**: 81 / 81 assertions passing (Sprints 0, 1, 2, 3, 4, 5)

---

## 1. Overview & Core Purpose
Provide homeschooling parents with pedagogical lesson guides tailored to parent education levels, alongside a multi-tier planning suite integrated with the **Ugandan 3-Term Primary School Calendar (`curriculum_terms`)**:
- **Weekly Timetable (7-Day View)**: Daily time slots, status tracking, and explainable next-lesson recommendations.
- **Monthly Calendar Planner**: Full-month calendar grid with daily session distribution, quick-add slots, and rescheduling.
- **12-Week Termly Syllabus Planner**: Pacing roadmap with milestone progress tracking and 1-click **Auto-Preplan Engine** to distribute unscheduled syllabus milestones across term weekdays.
- **Curriculum Officer Authoring Pipeline**: Complete draft &rarr; review &rarr; publish workflow with non-destructive version snapshots.

---

## 2. Target Parent Complexity Calibration
- **Basic Level**: Step-by-step guidance utilizing familiar household items, daily routines, and everyday language analogies.
- **Intermediate Level**: Standard textbook exercises, physical models (e.g. abacus, bundling sticks), and structured classroom pacing.
- **Advanced Level**: Theoretical depth, multi-step problem solving, and Primary Leaving Examination (PLE) preparation.

---

## 3. Core Database Tables
1. `curriculum_terms`: Official Ugandan primary terms (Term 1, Term 2, Term 3) with `start_date`, `end_date`, and `is_current`.
2. `parental_guides`: Full guide metadata, objectives, steps, pitfalls, materials, duration, checklist, and `status`.
3. `parental_guide_versions`: Non-destructive historical version snapshots with author notes.
4. `learning_schedules`: Multi-child schedule entries with time slots and status (`planned`, `completed`, `skipped`, `cancelled`).

---

## 4. Complete REST API Reference

### Terms & Guides
- `GET /api/parent/terms` — Academic terms and active term-week calculator (Weeks 1–12)
- `GET /api/parent/guides` — Published guides list with class, term, and complexity filters
- `GET /api/guides/{id}` — Full structured guide detail and attached digital materials
- `GET /api/guides/{id}/export` — Printable / PDF export payload
- `POST /api/officer/guides` — Officer guide authoring draft endpoint
- `PUT /api/officer/guides/{id}` — Edit guide with automated version snapshot if published
- `POST /api/officer/guides/{id}/submit` — Move draft &rarr; under_review
- `POST /api/officer/guides/{id}/publish` — Approve and publish guide

### Scheduling, Monthly & Termly Planning
- `GET /api/parent/schedule` — Weekly and monthly timetable for learners (date range query)
- `POST /api/parent/schedule` — Schedule session with term auto-resolution
- `PUT /api/parent/schedule/{id}` — Reschedule date, time slot, or goal notes
- `PATCH /api/parent/schedule/{id}/status` — Transition session status (`completed`, `skipped`, `cancelled`)
- `DELETE /api/parent/schedule/{id}` — Remove planned slot
- `GET /api/parent/schedule/term-summary` — Progress metrics (% completion, hours logged)
- `GET /api/parent/schedule/term-roadmap` — 12-week syllabus roadmap across all class subjects
- `POST /api/parent/schedule/auto-distribute` — Auto-distribute unscheduled milestones across term weekdays
- `GET /api/parent/schedule/suggested-next` — Explainable syllabus next-lesson signals

---

## 5. Automated Testing
```bash
php tests/test_sprint5_guides_scheduling.php
```
Cumulative Regression test:
```bash
php tests/test_sprint0_sprint1.php && php tests/test_sprint2_learners.php && php tests/test_sprint3_curriculum.php && php tests/test_sprint4_materials.php && php tests/test_sprint5_guides_scheduling.php
```
