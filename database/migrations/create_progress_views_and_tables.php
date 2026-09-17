<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

try {
    $db = Database::getConnection();
    echo "--- CHECKING PROGRESS RECORDS, LEARNING ACTIVITIES & VIEWS ---\n";

    // 1. Ensure progress_records table
    $db->exec("
        CREATE TABLE IF NOT EXISTS progress_records (
            progress_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            learner_id BIGINT UNSIGNED NOT NULL,
            lesson_id BIGINT UNSIGNED NOT NULL,
            completion_status ENUM('not_started','in_progress','completed') NOT NULL DEFAULT 'not_started',
            score DECIMAL(8,2) NULL,
            time_spent_minutes INT UNSIGNED DEFAULT 0,
            date_started DATETIME NULL,
            date_completed DATETIME NULL,
            date_recorded DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (learner_id) REFERENCES learners(learner_id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id) ON DELETE CASCADE,
            UNIQUE KEY uk_learner_lesson (learner_id, lesson_id),
            INDEX idx_learner_status (learner_id, completion_status),
            INDEX idx_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'progress_records' verified.\n";

    // 2. Ensure learning_activities table
    $db->exec("
        CREATE TABLE IF NOT EXISTS learning_activities (
            activity_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            learner_id BIGINT UNSIGNED NOT NULL,
            material_id BIGINT UNSIGNED NOT NULL,
            activity_status ENUM('cached','opened','completed','synced') NOT NULL DEFAULT 'cached',
            cached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            opened_at DATETIME NULL,
            completed_at DATETIME NULL,
            synced_at DATETIME NULL,
            device_id BIGINT UNSIGNED NULL,
            time_spent_seconds INT UNSIGNED NOT NULL DEFAULT 0,
            client_activity_uuid CHAR(36) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (learner_id) REFERENCES learners(learner_id) ON DELETE CASCADE,
            FOREIGN KEY (material_id) REFERENCES learning_materials(material_id) ON DELETE CASCADE,
            FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE SET NULL,
            INDEX idx_learner_activity (learner_id, activity_status),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'learning_activities' verified.\n";

    // 3. Ensure lesson_observations table
    $db->exec("
        CREATE TABLE IF NOT EXISTS lesson_observations (
            observation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            learner_id BIGINT UNSIGNED NOT NULL,
            lesson_id BIGINT UNSIGNED NOT NULL,
            teacher_id BIGINT UNSIGNED NULL,
            parent_id BIGINT UNSIGNED NULL,
            observation TEXT NOT NULL,
            rating DECIMAL(5,2) NULL,
            observed_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (learner_id) REFERENCES learners(learner_id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL,
            FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE SET NULL,
            INDEX idx_learner_obs (learner_id, observed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "[OK] Table 'lesson_observations' verified.\n";

    // 4. Update / Create view vw_learner_subject_progress
    $db->exec("
        CREATE OR REPLACE VIEW vw_learner_subject_progress AS
        SELECT 
            l.learner_id,
            l.full_name AS learner_name,
            c.class_code,
            c.class_id,
            s.subject_id,
            s.subject_name,
            s.subject_code,
            COUNT(DISTINCT le.lesson_id) AS expected_lessons,
            COUNT(DISTINCT CASE WHEN pr.completion_status = 'completed' THEN pr.lesson_id END) AS completed_lessons,
            COUNT(DISTINCT CASE WHEN pr.completion_status = 'in_progress' THEN pr.lesson_id END) AS in_progress_lessons,
            ROUND(
                CASE 
                    WHEN COUNT(DISTINCT le.lesson_id) = 0 THEN 0 
                    ELSE (COUNT(DISTINCT CASE WHEN pr.completion_status = 'completed' THEN pr.lesson_id END) / COUNT(DISTINCT le.lesson_id)) * 100 
                END, 2
            ) AS completion_percentage,
            COALESCE(SUM(pr.time_spent_minutes), 0) AS total_time_spent_minutes,
            MAX(pr.updated_at) AS last_progress_at
        FROM learners l
        JOIN classes c ON c.class_id = l.class_id
        JOIN learner_subjects ls ON ls.learner_id = l.learner_id AND ls.status = 'active'
        JOIN subjects s ON s.subject_id = ls.subject_id AND s.is_active = 1
        LEFT JOIN lessons le ON le.subject_id = s.subject_id AND le.class_id = l.class_id AND le.status = 'active'
        LEFT JOIN progress_records pr ON pr.learner_id = l.learner_id AND pr.lesson_id = le.lesson_id
        GROUP BY l.learner_id, l.full_name, c.class_code, c.class_id, s.subject_id, s.subject_name, s.subject_code;
    ");
    echo "[OK] View 'vw_learner_subject_progress' updated/verified.\n";

    // 5. Update / Create view vw_learner_assessment_summary
    $db->exec("
        CREATE OR REPLACE VIEW vw_learner_assessment_summary AS
        SELECT 
            ar.learner_id,
            a.subject_id,
            s.subject_name,
            COUNT(ar.result_id) AS assessment_count,
            SUM(ar.score) AS total_score,
            SUM(ar.total_marks) AS total_possible_marks,
            ROUND((SUM(ar.score) / NULLIF(SUM(ar.total_marks), 0)) * 100, 2) AS weighted_percentage,
            COUNT(CASE WHEN ar.score >= COALESCE(a.passing_marks, (a.total_marks * 0.5)) THEN 1 END) AS passed_count,
            MAX(ar.date_taken) AS latest_assessment_date
        FROM assessment_results ar
        JOIN assessments a ON a.assessment_id = ar.assessment_id
        JOIN subjects s ON s.subject_id = a.subject_id
        GROUP BY ar.learner_id, a.subject_id, s.subject_name;
    ");
    echo "[OK] View 'vw_learner_assessment_summary' updated/verified.\n";

    echo "--- SPRINT 8 MIGRATIONS COMPLETED SUCCESSFULLY ---\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
