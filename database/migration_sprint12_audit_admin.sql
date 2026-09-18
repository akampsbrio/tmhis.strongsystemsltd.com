-- =========================================================================
-- TMHIS Sprint 12 Migration — Security Audit Trail & Administration System
-- =========================================================================

-- Ensure audit_trail indices and configuration exist
CREATE TABLE IF NOT EXISTS `audit_trail` (
    `audit_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `action_description` VARCHAR(500) NOT NULL,
    `table_affected` VARCHAR(100) DEFAULT NULL,
    `record_id_affected` BIGINT UNSIGNED DEFAULT NULL,
    `ip_address` VARCHAR(50) DEFAULT NULL,
    `user_agent` VARCHAR(500) DEFAULT NULL,
    `before_data` JSON DEFAULT NULL,
    `after_data` JSON DEFAULT NULL,
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`audit_id`),
    KEY `idx_audit_user_time` (`user_id`, `timestamp`),
    KEY `idx_audit_action_time` (`action_type`, `timestamp`),
    KEY `idx_audit_table_record` (`table_affected`, `record_id_affected`),
    KEY `idx_audit_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS `system_settings` (
    `setting_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `setting_key` VARCHAR(150) NOT NULL,
    `setting_value` TEXT DEFAULT NULL,
    `value_type` ENUM('string', 'integer', 'boolean', 'json') NOT NULL DEFAULT 'string',
    `description` VARCHAR(255) DEFAULT NULL,
    `is_public` TINYINT(1) NOT NULL DEFAULT 0,
    `updated_by` BIGINT UNSIGNED DEFAULT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`setting_id`),
    UNIQUE KEY `uk_setting_key` (`setting_key`),
    KEY `idx_settings_updated_by` (`updated_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed essential administrative default settings
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`, `value_type`, `description`, `is_public`) VALUES
('system_institution_name', 'Technology-Mediated Homeschooling Information System (TMHIS)', 'string', 'Official institutional system title', 1),
('system_academic_year', '2026', 'string', 'Active academic calendar year', 1),
('system_current_term', '1', 'integer', 'Active school term (1, 2, or 3)', 1),
('sync_max_batch_size', '50', 'integer', 'Maximum sync queue records processed per client sync batch', 0),
('security_max_failed_logins', '5', 'integer', 'Failed login attempts before temporary lock', 0),
('notification_pacing_scan_interval_hours', '24', 'integer', 'Automated lesson pacing evaluation cadence', 0);
