-- =========================================================================
-- TMHIS Sprint 9 Database Migration
-- Module 09: Reports, Analytics & MoES Curriculum Compliance Engine
-- =========================================================================

-- 1. Table for Ministry & Institutional Compliance Benchmarks
CREATE TABLE IF NOT EXISTS `compliance_benchmarks` (
    `benchmark_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `class_id` BIGINT UNSIGNED NULL,
    `term_id` BIGINT UNSIGNED NULL,
    `min_coverage_percentage` DECIMAL(5,2) NOT NULL DEFAULT 70.00 COMMENT 'Minimum expected syllabus coverage %',
    `min_pass_rate` DECIMAL(5,2) NOT NULL DEFAULT 50.00 COMMENT 'Minimum passing grade average %',
    `min_study_hours` DECIMAL(6,2) NOT NULL DEFAULT 25.00 COMMENT 'Minimum expected study hours per term',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`benchmark_id`),
    KEY `idx_bench_class_term` (`class_id`, `term_id`),
    CONSTRAINT `fk_bench_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`class_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bench_term` FOREIGN KEY (`term_id`) REFERENCES `curriculum_terms` (`term_id`) ON DELETE SET NULL,
    CONSTRAINT `fk_bench_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed standard national benchmark default if empty
INSERT IGNORE INTO `compliance_benchmarks` (`benchmark_id`, `class_id`, `term_id`, `min_coverage_percentage`, `min_pass_rate`, `min_study_hours`, `is_active`)
VALUES (1, NULL, NULL, 70.00, 50.00, 25.00, 1);

-- 2. Table for Reproducible Report Snapshots & Audit Trail
CREATE TABLE IF NOT EXISTS `report_snapshots` (
    `snapshot_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `snapshot_uuid` VARCHAR(64) NOT NULL,
    `report_type` ENUM('learner_term', 'parent_family', 'teacher_class', 'national_compliance') NOT NULL,
    `scope_id` BIGINT UNSIGNED NULL COMMENT 'learner_id / parent_id / class_id depending on report_type',
    `district` VARCHAR(100) NULL,
    `term_id` BIGINT UNSIGNED NULL,
    `academic_year` INT UNSIGNED NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `payload_json` LONGTEXT NOT NULL,
    `summary_metrics` JSON NULL,
    `generated_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`snapshot_id`),
    UNIQUE KEY `uk_snapshot_uuid` (`snapshot_uuid`),
    KEY `idx_snap_type_scope` (`report_type`, `scope_id`, `term_id`),
    KEY `idx_snap_created` (`created_at`),
    CONSTRAINT `fk_snap_term` FOREIGN KEY (`term_id`) REFERENCES `curriculum_terms` (`term_id`) ON DELETE SET NULL,
    CONSTRAINT `fk_snap_user` FOREIGN KEY (`generated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. SQL View for District-Level Homeschooling Compliance Summary
CREATE OR REPLACE VIEW `vw_district_compliance_summary` AS
SELECT 
    COALESCE(p.district, 'Unspecified District') AS district,
    c.level AS class_level,
    c.class_code,
    c.class_name,
    COUNT(DISTINCT l.learner_id) AS total_learners,
    COUNT(DISTINCT p.parent_id) AS total_parents,
    COALESCE(SUM(sp.expected_lessons), 0) AS total_expected_lessons,
    COALESCE(SUM(sp.completed_lessons), 0) AS total_completed_lessons,
    CASE 
        WHEN COALESCE(SUM(sp.expected_lessons), 0) > 0 
        THEN ROUND((SUM(sp.completed_lessons) / SUM(sp.expected_lessons)) * 100, 1)
        ELSE 0.0 
    END AS average_coverage_percentage,
    COALESCE(SUM(sp.total_time_spent_minutes), 0) AS total_study_minutes,
    ROUND(COALESCE(SUM(sp.total_time_spent_minutes), 0) / 60, 1) AS total_study_hours,
    ROUND(AVG(asum.weighted_percentage), 1) AS average_quiz_percentage,
    COUNT(DISTINCT CASE WHEN asum.weighted_percentage IS NOT NULL AND asum.weighted_percentage < 50.0 THEN l.learner_id END) AS at_risk_learners_count
FROM learners l
JOIN classes c ON l.class_id = c.class_id
LEFT JOIN parents p ON l.parent_id = p.parent_id
LEFT JOIN vw_learner_subject_progress sp ON l.learner_id = sp.learner_id
LEFT JOIN vw_learner_assessment_summary asum ON l.learner_id = asum.learner_id
WHERE l.status = 'active'
GROUP BY COALESCE(p.district, 'Unspecified District'), c.level, c.class_code, c.class_name;
