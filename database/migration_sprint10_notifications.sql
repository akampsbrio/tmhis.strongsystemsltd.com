-- =========================================================================
-- TMHIS Sprint 10 Database Migration
-- Module 10: Notifications, Alerts & MoES Statutory Circulars Engine
-- =========================================================================

-- 1. Enhance notifications table with action_url, priority, and metadata_json if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'action_url');
SET @query = IF(@col_exists = 0, 'ALTER TABLE `notifications` ADD COLUMN `action_url` VARCHAR(255) NULL AFTER `message`', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'priority');
SET @query = IF(@col_exists = 0, 'ALTER TABLE `notifications` ADD COLUMN `priority` ENUM(\'low\', \'normal\', \'high\', \'urgent\') NOT NULL DEFAULT \'normal\' AFTER `action_url`', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'metadata_json');
SET @query = IF(@col_exists = 0, 'ALTER TABLE `notifications` ADD COLUMN `metadata_json` JSON NULL AFTER `priority`', 'SELECT 1');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Create notification_broadcasts table
CREATE TABLE IF NOT EXISTS `notification_broadcasts` (
    `broadcast_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sender_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `broadcast_type` ENUM('circular', 'announcement', 'system', 'alert') NOT NULL DEFAULT 'circular',
    `target_role` VARCHAR(50) NULL COMMENT 'NULL for all roles, or parent/teacher/learner',
    `target_class_id` BIGINT UNSIGNED NULL,
    `target_district` VARCHAR(100) NULL,
    `priority` ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    `action_url` VARCHAR(255) NULL,
    `recipients_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`broadcast_id`),
    KEY `idx_broad_sender` (`sender_id`),
    KEY `idx_broad_created` (`created_at`),
    CONSTRAINT `fk_broad_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_broad_class` FOREIGN KEY (`target_class_id`) REFERENCES `classes` (`class_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
