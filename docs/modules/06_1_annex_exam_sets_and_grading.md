# Module 06.1 Annex — Termly Exam Sets, Printable PDF Releases & UNEB Division Auto-Grading Engine

## Status: ✅ Completed & Verified (Sprint 6.1)
- **Module Automated Test Suite**: 21 / 21 assertions passing (`tests/test_sprint6_1_exams_grading.php`)
- **Cumulative Regression Test Suite**: 114 / 114 assertions passing (Sprints 0, 1, 2, 3, 4, 5, 6, 6.1)

---

## 1. Overview & Core Features
Module 06.1 Annex delivers an independent examination set release, offline sitting supervision, and standardized grading engine aligned with the **Uganda National Examinations Board (UNEB) Primary Leaving Examination (PLE) stanine scoring system**:
- **Termly Examination Sets**: Curriculum Officers and Administrators release full 4-paper examination sets (Beginning of Term, Mid-Term, End of Term, National Mock PLE).
- **Printable Question Papers & Marking Guides (PDF)**: High-resolution downloadable PDF assets for offline paper-and-pen examination administration under timed conditions.
- **Parent Mark Entry Portal**: Homeschooling parents mark scripts using official marking schemes, entering subject scores (0–100) into a responsive mark entry interface.
- **Automated UNEB 9-Grade (D1–F9) & Division 1–4 Grading Engine**: Instant real-time computation of subject grade points and overall aggregate.
- **Strict Ugandan F9 Demotion Rules**: Strictly enforces that any candidate with an F9 in a core subject (e.g. `1, 1, 1, 9 = Aggregate 12`) is demoted from Division 1 to **Division 2**.
- **Printable Terminal Report Card / Exam Slip**: Standardized A4 printable transcript with institution headers, subject breakdown, aggregate, final division badge, and signature slots.
- **Child Level Gatekeeping**: P3 learners and parents can only see exam sets for P1–P3, shielding higher-level papers (P4–P7).

---

## 2. Ugandan UNEB Grading Scale & Division Rules

### 9-Point Stanine Scale (D1 to F9)
| Grade | Points | Score Range | Classification / Descriptor |
|---|---|---|---|
| **D1** | 1 pt | 90% – 100% | Distinction 1 (Outstanding Performance) |
| **D2** | 2 pts | 80% – 89% | Distinction 2 (Excellent Performance) |
| **C3** | 3 pts | 70% – 79% | Credit 3 (Very Good Performance) |
| **C4** | 4 pts | 60% – 69% | Credit 4 (Good Performance) |
| **C5** | 5 pts | 55% – 59% | Credit 5 (Above Average Performance) |
| **C6** | 6 pts | 50% – 54% | Credit 6 (Credit Pass) |
| **P7** | 7 pts | 45% – 49% | Pass 7 (Pass with Remediation Recommended) |
| **P8** | 8 pts | 40% – 44% | Pass 8 (Bare Minimum Pass) |
| **F9** | 9 pts | 0% – 39% | Fail 9 (Ungraded / Fail) |

### Division Determination & F9 Demotion Rules
1. **Division 1 (Aggregate 4 to 12)**:
   - Requires pass in all 4 core subjects with Grade 8 or better (**Zero F9s allowed**).
   - Candidate must pass both English and Mathematics.
   - **Crucial Demotion Rule**: If a candidate attains an Aggregate between 4 and 12 but has **1 or more F9s** (e.g., `1, 1, 1, 9 = Aggregate 12`), they are **STRICTLY DEMOTED to Division 2**.
2. **Division 2 (Aggregate 13 to 24)**:
   - Requires at least 3 passes (at most 1 F9).
   - Must pass either English or Mathematics. If candidate fails both English and Math (both F9), candidate is demoted to Division 3.
3. **Division 3 (Aggregate 25 to 28)**:
   - Requires at least 3 passes.
4. **Division 4 (Aggregate 29 to 32)**:
   - Requires at least 2 passes.
5. **Division U (Aggregate 33 to 36)**:
   - Ungraded / failed (fewer than 2 passes).
6. **Division X**:
   - Absent in one or more core examination papers.

---

## 3. Database Schema

```sql
-- 1. Grading Schemes
CREATE TABLE grading_schemes (
    scheme_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    scheme_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default TINYINT(1) DEFAULT 1,
    rules_json LONGTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Exam Sets
CREATE TABLE exam_sets (
    exam_set_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    class_id BIGINT UNSIGNED NOT NULL,
    term_id BIGINT UNSIGNED NULL,
    academic_year VARCHAR(20) NOT NULL DEFAULT '2026',
    exam_type ENUM('beginning_of_term', 'mid_term', 'end_of_term', 'mock_ple', 'topical_set') DEFAULT 'mid_term',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    instructions TEXT,
    grading_scheme_id BIGINT UNSIGNED NULL,
    release_date DATE NULL,
    due_date DATE NULL,
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_exam_sets_class FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_sets_user FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Exam Papers
CREATE TABLE exam_papers (
    exam_paper_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    exam_set_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    paper_code VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    duration_minutes INT DEFAULT 120,
    total_marks DECIMAL(5,2) DEFAULT 100.00,
    pdf_file_path VARCHAR(255) NOT NULL,
    marking_guide_pdf_path VARCHAR(255) NULL,
    paper_order INT DEFAULT 1,
    instructions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_exam_papers_set FOREIGN KEY (exam_set_id) REFERENCES exam_sets(exam_set_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_papers_subj FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
);

-- 4. Exam Submissions
CREATE TABLE exam_submissions (
    submission_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    exam_set_id BIGINT UNSIGNED NOT NULL,
    learner_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NOT NULL,
    sitting_date DATE NULL,
    total_raw_marks DECIMAL(6,2) DEFAULT 0.00,
    total_possible_marks DECIMAL(6,2) DEFAULT 400.00,
    average_percentage DECIMAL(5,2) DEFAULT 0.00,
    total_aggregate INT NOT NULL DEFAULT 36,
    division ENUM('I', 'II', 'III', 'IV', 'U', 'X') NOT NULL DEFAULT 'U',
    status ENUM('submitted', 'verified', 'disputed') DEFAULT 'submitted',
    parent_remarks TEXT,
    teacher_remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_set_learner (exam_set_id, learner_id),
    CONSTRAINT fk_exam_sub_set FOREIGN KEY (exam_set_id) REFERENCES exam_sets(exam_set_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_sub_learner FOREIGN KEY (learner_id) REFERENCES learners(learner_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_sub_parent FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE
);

-- 5. Exam Marks
CREATE TABLE exam_marks (
    mark_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id BIGINT UNSIGNED NOT NULL,
    exam_paper_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    raw_score DECIMAL(5,2) DEFAULT 0.00,
    max_marks DECIMAL(5,2) DEFAULT 100.00,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    grade_point INT NOT NULL DEFAULT 9,
    grade_label VARCHAR(10) NOT NULL DEFAULT 'F9',
    is_absent TINYINT(1) DEFAULT 0,
    remarks VARCHAR(255) NULL,
    entered_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sub_paper (submission_id, exam_paper_id),
    CONSTRAINT fk_exam_marks_sub FOREIGN KEY (submission_id) REFERENCES exam_submissions(submission_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_marks_paper FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(exam_paper_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_marks_subj FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_marks_user FOREIGN KEY (entered_by) REFERENCES users(user_id) ON DELETE CASCADE
);
```

---

## 4. Complete REST API Reference

### Exam Sets & Catalog
- `GET /api/exams/sets` — List published exam sets with papers count and submission status. Supports `class_id`, `term_id`, `exam_type`, and `learner_id` parameters.
- `GET /api/exams/sets/{id}` — Full examination set details, papers breakdown, PDF download URLs, and marking guides.

### Exam Set Authoring & PDF Releases (Teachers, Curriculum Officers & Admins)
- `POST /api/officer/exams/sets` or `POST /api/teacher/exams/sets` — Create new termly examination set (Draft or Published).
- `POST /api/officer/exams/sets/{id}/papers` or `POST /api/teacher/exams/sets/{id}/papers` — Upload question paper PDF and marking guide PDF.
- `POST /api/officer/exams/sets/{id}/publish` or `POST /api/teacher/exams/sets/{id}/publish` — Publish exam set for learner/parent access.

### Parent Mark Entry & Terminal Reports
- `POST /api/parent/exams/sets/{id}/marks` — Submit subject scores, compute UNEB stanine grades and final Division.
- `GET /api/parent/exams/submissions/{id}/report-card` — Full printable Terminal Report Card / Exam Slip payload.
- `GET /api/parent/exams/results` — Historical examination transcripts for a learner.
