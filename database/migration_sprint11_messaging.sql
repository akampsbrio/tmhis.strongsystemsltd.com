-- =========================================================================
-- TMHIS Sprint 11 Migration — Universal In-App Messaging & Read Receipts
-- =========================================================================

-- Modify message_threads to allow universal messaging between any user roles
ALTER TABLE `message_threads`
    MODIFY COLUMN `parent_id` BIGINT UNSIGNED NULL,
    MODIFY COLUMN `officer_id` BIGINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS `creator_user_id` BIGINT UNSIGNED NOT NULL AFTER `thread_id`,
    ADD COLUMN IF NOT EXISTS `recipient_user_id` BIGINT UNSIGNED NOT NULL AFTER `creator_user_id`,
    ADD COLUMN IF NOT EXISTS `last_message_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`,
    ADD COLUMN IF NOT EXISTS `last_message_preview` VARCHAR(255) NULL AFTER `last_message_at`,
    ADD COLUMN IF NOT EXISTS `is_important` TINYINT(1) NOT NULL DEFAULT 0 AFTER `last_message_preview`;

-- Ensure indexes exist on message_threads
CREATE INDEX IF NOT EXISTS `idx_threads_creator_time` ON `message_threads` (`creator_user_id`, `last_message_at`);
CREATE INDEX IF NOT EXISTS `idx_threads_recipient_time` ON `message_threads` (`recipient_user_id`, `last_message_at`);
CREATE INDEX IF NOT EXISTS `idx_threads_last_msg` ON `message_threads` (`last_message_at`);

-- Ensure foreign keys point to users table with ON DELETE CASCADE
ALTER TABLE `message_threads`
    ADD CONSTRAINT `fk_threads_creator_user` FOREIGN KEY (`creator_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
    ADD CONSTRAINT `fk_threads_recipient_user` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

-- Ensure messages table has read_at and status indexes
CREATE INDEX IF NOT EXISTS `idx_messages_thread_time` ON `messages` (`thread_id`, `sent_at`);
CREATE INDEX IF NOT EXISTS `idx_messages_sender_status` ON `messages` (`sender_user_id`, `status`);
