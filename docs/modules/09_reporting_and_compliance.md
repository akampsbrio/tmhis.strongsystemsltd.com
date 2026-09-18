# Module 09: Reports, Analytics & MoES Curriculum Compliance Engine

## Overview
Module 09 provides official terminal report generation, parent multi-child audits, teacher class diagnostic summaries, and statutory curriculum compliance tracking for the **Technology-Based Homeschooling Information System (TMHIS)**. It translates day-to-day lesson pacing, continuous assessment scores, and summative UNEB exam grades into reproducible official reports adhering to the Uganda Ministry of Education & Sports (MoES) and National Curriculum Development Centre (NCDC) guidelines.

---

## Key Features & Capabilities

### 1. Official Learner Terminal Report Card
- **Institutional Branding:** Features the institutional header: *Technology-Based Homeschooling Information System (TMHIS)*.
- **Subject-by-Subject Breakdown:**
  - Syllabus unit progression & completion percentage.
  - Formative weighted quiz average.
  - Summative UNEB exam score, grade (D1–F9), and aggregate value (1–9).
  - Pedagogical competency remarks (*Distinction / Exemplary Concept Mastery*, *Credit / Steady Syllabus Progression*, *Needs Revision on Foundational Units*).
- **UNEB Primary Leaving Examination (PLE) Division Grading Engine:**
  - Automated calculation of total aggregate points across 4 core subjects (English, Mathematics, Basic Science, Social Studies).
  - Strict UNEB F9 demotion rule: Any candidate scoring an F9 in a core subject is demoted from Division 1/2 to Division 3/4.
  - Grade point scale: D1 (1), D2 (2), C3 (3), C4 (4), C5 (5), C6 (6), P7 (7), P8 (8), F9 (9).
- **Immutable Snapshots:** Every generated report card saves a reproducible snapshot with a unique UUID (`snapshot_uuid`).

### 2. Multi-Child Parent Family Consolidated Progress
- Aggregate dashboard for parents managing multiple learners.
- Filterable by term and academic year.
- High-level progress indicators: Total study hours, average syllabus completion %, and overall assessment performance.

### 3. Teacher Class Diagnostic Summary & Difficulty Heatmap
- Class pacing gradebook with at-risk learner detection (learners with <30% syllabus completion or <50% quiz average).
- Topic difficulty heatmap identifying struggling units where class pass rate falls below 60%.
- District pacing distribution across homeschooling families.

### 4. MoES Student-by-Student Curriculum Compliance Audit Engine
- Statutory curriculum attainment audits for Curriculum Officers and Ministry inspectors evaluating **individual learners** across all primary grades (P1–P7).
- Dynamic quality benchmarks managed via `compliance_benchmarks` table:
  - Minimum Syllabus Coverage (Default: 70%)
  - Minimum Assessment Pass Rate (Default: 50%)
  - Minimum Study Hours per Term (Default: 25 hrs)
- Threshold violation flags identifying individual students requiring pedagogical intervention (e.g. low syllabus coverage, failing quiz marks, or insufficient study hours).
- Real-time search and filter controls by student name, class code, or parent guardian.
- Direct quick-links to individual official terminal report cards.

### 5. Multi-Format Output & Export Engine
- **Printable A4 Report Card & Compliance PDF Generator:** Clean, high-resolution printable layout with institution letterhead (*Technology-Based Homeschooling Information System*), MoES compliance status badges, QR verification code simulation, and official signature blocks.
- **CSV Data Exporter:** One-click streaming export of formatted student compliance and report metrics (`/api/reports/compliance/export?format=csv`).

---

## Database Architecture

### `compliance_benchmarks` Table
Stores national and grade-level quality benchmarks.
- `benchmark_id`: Primary key.
- `class_id` / `term_id`: Optional class and term scoping (NULL for national default).
- `min_coverage_percentage`: Minimum syllabus coverage target (DECIMAL 5,2).
- `min_pass_rate`: Minimum passing percentage (DECIMAL 5,2).
- `min_study_hours`: Minimum recommended study hours (DECIMAL 6,2).
- `is_active`: Benchmark active status flag.

### `report_snapshots` Table
Stores reproducible JSON payloads of official reports.
- `snapshot_id`: Primary key.
- `snapshot_uuid`: Unique identifier for the snapshot.
- `report_type`: `learner_term`, `parent_family`, `teacher_class`, or `national_compliance`.
- `scope_id`, `district`, `term_id`, `academic_year`: Scope filters.
- `payload_json`: Complete report dataset.
- `summary_metrics`: High-level aggregate metrics.
- `generated_by`: User ID of generator.

### `vw_district_compliance_summary` SQL View
Aggregates active learners, parents, expected lessons, completed lessons, coverage %, quiz average %, total study hours, and at-risk learner counts grouped by district and class level.

---

## API Endpoints

### Report Generation & Queries
- `GET /api/reports/learner/{id}`: Official learner terminal report card.
- `GET /api/reports/parent`: Multi-child family consolidated report.
- `GET /api/reports/class-summary`: Teacher class diagnostic summary & difficulty heatmap.
- `GET /api/reports/compliance`: MoES student-by-student curriculum compliance & attainment audit report.
- `GET /api/reports/{type}/export?format=csv`: Raw CSV data stream export (per-student compliance export).
- `GET /api/reports/snapshots/{uuid}`: Retrieve immutable report snapshot by UUID.

### Quality Benchmarks Management
- `GET /api/reports/benchmarks`: List active quality benchmarks.
- `POST /api/reports/benchmarks`: Configure or update quality benchmarks (Curriculum Officers & Admins only).

---

## Automated Verification
Module 09 is covered by the automated integration test suite in `tests/test_sprint9_reporting_compliance.php` with 32 assertions verifying all 4 report formats, UNEB Division calculations, benchmark updates, CSV exports, snapshot reproducibility, and multi-tenant RBAC security.
