<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

try {
    $db = Database::getConnection();
    echo "--- CREATING EXAM SETS AND UNEB GRADING ENGINE TABLES ---\n";

    // 1. grading_schemes table
    $db->exec("
        CREATE TABLE IF NOT EXISTS grading_schemes (
            scheme_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            scheme_name VARCHAR(100) NOT NULL,
            description TEXT,
            is_default TINYINT(1) DEFAULT 1,
            rules_json LONGTEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'grading_schemes' verified.\n";

    // 2. exam_sets table
    $db->exec("
        CREATE TABLE IF NOT EXISTS exam_sets (
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
            INDEX idx_class_status (class_id, status),
            INDEX idx_term (term_id),
            CONSTRAINT fk_exam_sets_class FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_sets_user FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'exam_sets' verified.\n";

    // 3. exam_papers table
    $db->exec("
        CREATE TABLE IF NOT EXISTS exam_papers (
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
            INDEX idx_exam_set (exam_set_id),
            INDEX idx_subject (subject_id),
            CONSTRAINT fk_exam_papers_set FOREIGN KEY (exam_set_id) REFERENCES exam_sets(exam_set_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_papers_subj FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'exam_papers' verified.\n";

    // 4. exam_submissions table
    $db->exec("
        CREATE TABLE IF NOT EXISTS exam_submissions (
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
            INDEX idx_parent_sub (parent_id),
            INDEX idx_learner_sub (learner_id),
            CONSTRAINT fk_exam_sub_set FOREIGN KEY (exam_set_id) REFERENCES exam_sets(exam_set_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_sub_learner FOREIGN KEY (learner_id) REFERENCES learners(learner_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_sub_parent FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'exam_submissions' verified.\n";

    // 5. exam_marks table
    $db->exec("
        CREATE TABLE IF NOT EXISTS exam_marks (
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
            INDEX idx_submission (submission_id),
            CONSTRAINT fk_exam_marks_sub FOREIGN KEY (submission_id) REFERENCES exam_submissions(submission_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_marks_paper FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(exam_paper_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_marks_subj FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE,
            CONSTRAINT fk_exam_marks_user FOREIGN KEY (entered_by) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'exam_marks' verified.\n";

    // 6. View vw_learner_exam_summary
    $db->exec("
        CREATE OR REPLACE VIEW vw_learner_exam_summary AS
        SELECT 
            s.submission_id,
            s.exam_set_id,
            e.title AS exam_set_title,
            e.exam_type,
            e.academic_year,
            c.class_id,
            c.class_name,
            c.class_code,
            c.level AS class_level,
            t.term_name,
            s.learner_id,
            l.full_name AS learner_name,
            l.avatar_url AS learner_avatar,
            s.parent_id,
            p_user.full_name AS parent_name,
            s.sitting_date,
            s.total_raw_marks,
            s.total_possible_marks,
            s.average_percentage,
            s.total_aggregate,
            s.division,
            s.status AS submission_status,
            s.parent_remarks,
            s.teacher_remarks,
            s.created_at AS submitted_at,
            (SELECT COUNT(*) FROM exam_papers ep WHERE ep.exam_set_id = e.exam_set_id) AS total_papers_count,
            (SELECT COUNT(*) FROM exam_marks em WHERE em.submission_id = s.submission_id) AS graded_papers_count
        FROM exam_submissions s
        JOIN exam_sets e ON s.exam_set_id = e.exam_set_id
        JOIN classes c ON e.class_id = c.class_id
        LEFT JOIN curriculum_terms t ON e.term_id = t.term_id
        JOIN learners l ON s.learner_id = l.learner_id
        JOIN parents p ON s.parent_id = p.parent_id
        JOIN users p_user ON p.user_id = p_user.user_id;
    ");
    echo "[OK] View 'vw_learner_exam_summary' created.\n";

    echo "--- MIGRATION COMPLETED SUCCESSFULLY ---\n";
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
