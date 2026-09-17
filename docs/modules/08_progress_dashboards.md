# TMHIS Module 08: Activities, Progress Tracking & Role-Based Dashboards

## 1. Overview & Objectives
Module 08 delivers responsive, actionable progress tracking and analytics across all four user roles in the TMHIS Homeschooling platform:
- **Learners**: Real-time syllabus completion progress bars, weighted assessment scores, continue-learning recommendation, and recent activity timeline.
- **Parents**: Multi-child family dashboard with progress velocity, attention alerts for struggling or stalled learners, and upcoming lessons.
- **Teachers**: Class-level learner rosters, diagnostic filters for learners needing intervention, and commonly failed assessments.
- **Curriculum Officers**: System-wide primary curriculum (P1–P7) syllabus coverage, subject attainment benchmarks, and platform engagement metrics.

---

## 2. Mathematical Calculations
- **Syllabus Completion %**:
  $$\text{Completion \%} = \frac{\text{Completed Active Lessons}}{\text{Expected Active Lessons}} \times 100$$
- **Weighted Assessment Average**:
  $$\text{Weighted \%} = \frac{\sum \text{Score Earned}}{\sum \text{Total Possible Marks}} \times 100$$
  *Avoids the skew of naive percentage averaging when assessment point values vary (e.g. 10-point quiz vs 100-point exam).*

---

## 3. Database Schema
- Tables: `progress_records`, `learning_activities`, `lesson_observations`.
- SQL Views: `vw_learner_subject_progress`, `vw_learner_assessment_summary`.

---

## 4. API Endpoints
- `GET /api/progress/learner` (Self learner progress)
- `GET /api/progress/learner/{id}` (RBAC-protected learner progress)
- `GET /api/progress/parent` (Parent multi-child dashboard)
- `GET /api/progress/teacher` (Teacher class roster & diagnostic flags)
- `GET /api/progress/officer` (Curriculum officer macro analytics)
- `POST /api/progress/lesson` (Atomic progress update)
- `POST /api/progress/activity` (Heartbeat / material activity ingestion)

---

## 5. Automated Verification
- Test file: `tests/test_sprint8_progress_dashboards.php`
- Assertions: **27 passed, 0 failed**.
- Cumulative Regression: **102 passed, 0 failed**.
