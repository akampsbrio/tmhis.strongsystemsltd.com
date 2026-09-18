<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;
use Throwable;

/**
 * Service for managing user notifications, automated pacing reminders,
 * and Curriculum Officer MoES statutory circular broadcasts.
 */
class NotificationService
{
    private PDO $db;

    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?: Database::getConnection();
    }

    /**
     * Dispatch an individual notification to a targeted user.
     */
    public function sendToUser(
        int $userId,
        string $type,
        string $title,
        string $message,
        ?string $actionUrl = null,
        string $priority = 'normal',
        ?array $meta = null,
        ?string $entityType = null,
        ?int $entityId = null,
        string $channel = 'in_app'
    ): int {
        $allowedTypes = ['reminder', 'alert', 'circular', 'announcement', 'system'];
        if (!in_array($type, $allowedTypes, true)) {
            $type = 'system';
        }

        $allowedPriorities = ['low', 'normal', 'high', 'urgent'];
        if (!in_array($priority, $allowedPriorities, true)) {
            $priority = 'normal';
        }

        $stmt = $this->db->prepare("
            INSERT INTO notifications 
                (user_id, notification_type, title, message, action_url, priority, metadata_json, status, date_created, related_entity_type, related_entity_id, channel)
            VALUES 
                (:uid, :type, :title, :msg, :url, :prio, :meta, 'unread', NOW(), :etype, :eid, :channel)
        ");

        $stmt->execute([
            ':uid' => $userId,
            ':type' => $type,
            ':title' => mb_substr($title, 0, 200),
            ':msg' => $message,
            ':url' => $actionUrl ? mb_substr($actionUrl, 0, 255) : null,
            ':prio' => $priority,
            ':meta' => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
            ':etype' => $entityType,
            ':eid' => $entityId,
            ':channel' => $channel
        ]);

        return (int)$this->db->lastInsertId();
    }

    /**
     * Get paginated notifications for a specific user with unread summary.
     */
    public function getUserNotifications(int $userId, array $filters = []): array
    {
        $status = $filters['status'] ?? 'all';
        $type = $filters['type'] ?? null;
        $limit = isset($filters['limit']) && is_numeric($filters['limit']) ? min((int)$filters['limit'], 100) : 30;
        $offset = isset($filters['offset']) && is_numeric($filters['offset']) ? max((int)$filters['offset'], 0) : 0;

        // 1. Unread count metric
        $uStmt = $this->db->prepare("
            SELECT COUNT(*) FROM notifications 
            WHERE user_id = :uid AND status = 'unread'
        ");
        $uStmt->execute([':uid' => $userId]);
        $unreadCount = (int)$uStmt->fetchColumn();

        // 2. Query notifications
        $query = "
            SELECT 
                notification_id, 
                user_id, 
                notification_type, 
                title, 
                message, 
                action_url, 
                priority, 
                metadata_json, 
                status, 
                date_created, 
                date_read, 
                related_entity_type, 
                related_entity_id, 
                channel
            FROM notifications
            WHERE user_id = :uid
        ";
        $params = [':uid' => $userId];

        if ($status === 'unread') {
            $query .= " AND status = 'unread'";
        } elseif ($status === 'read') {
            $query .= " AND status = 'read'";
        } elseif ($status !== 'all') {
            $query .= " AND status != 'dismissed'";
        }

        if ($type && trim((string)$type) !== '') {
            $query .= " AND notification_type = :type";
            $params[':type'] = trim((string)$type);
        }

        $query .= " ORDER BY date_created DESC LIMIT {$limit} OFFSET {$offset}";

        $stmt = $this->db->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $notifications = array_map(function ($row) {
            $row['notification_id'] = (int)$row['notification_id'];
            $row['user_id'] = (int)$row['user_id'];
            $row['is_read'] = ($row['status'] === 'read');
            $row['metadata'] = !empty($row['metadata_json']) ? json_decode($row['metadata_json'], true) : null;
            return $row;
        }, $rows);

        return [
            'unread_count' => $unreadCount,
            'total_returned' => count($notifications),
            'notifications' => $notifications
        ];
    }

    /**
     * Mark a single notification as read.
     */
    public function markRead(int $userId, int $notificationId): bool
    {
        $stmt = $this->db->prepare("
            UPDATE notifications 
            SET status = 'read', date_read = NOW() 
            WHERE notification_id = :nid AND user_id = :uid
        ");
        $stmt->execute([
            ':nid' => $notificationId,
            ':uid' => $userId
        ]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Mark all unread notifications for a user as read.
     */
    public function markAllRead(int $userId): int
    {
        $stmt = $this->db->prepare("
            UPDATE notifications 
            SET status = 'read', date_read = NOW() 
            WHERE user_id = :uid AND status = 'unread'
        ");
        $stmt->execute([':uid' => $userId]);
        return $stmt->rowCount();
    }

    /**
     * Dismiss a notification (hide from active list).
     */
    public function dismiss(int $userId, int $notificationId): bool
    {
        $stmt = $this->db->prepare("
            UPDATE notifications 
            SET status = 'dismissed' 
            WHERE notification_id = :nid AND user_id = :uid
        ");
        $stmt->execute([
            ':nid' => $notificationId,
            ':uid' => $userId
        ]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Broadcast an announcement or MoES circular to targeted roles/classes/districts.
     */
    public function broadcast(int $senderUserId, array $payload): array
    {
        $title = trim((string)($payload['title'] ?? ''));
        $message = trim((string)($payload['message'] ?? ''));
        $broadcastType = $payload['broadcast_type'] ?? 'circular';
        $targetRole = isset($payload['target_role']) && trim((string)$payload['target_role']) !== '' ? trim((string)$payload['target_role']) : null;
        $targetClassId = isset($payload['target_class_id']) && is_numeric($payload['target_class_id']) ? (int)$payload['target_class_id'] : null;
        $targetDistrict = isset($payload['target_district']) && trim((string)$payload['target_district']) !== '' ? trim((string)$payload['target_district']) : null;
        $priority = $payload['priority'] ?? 'normal';
        $actionUrl = isset($payload['action_url']) && trim((string)$payload['action_url']) !== '' ? trim((string)$payload['action_url']) : null;

        if ($title === '' || $message === '') {
            throw new \InvalidArgumentException('Broadcast title and message are required.');
        }

        // 1. Resolve recipient user IDs based on targeting criteria
        $query = "
            SELECT DISTINCT u.user_id, r.role_code
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            LEFT JOIN parents p ON (p.user_id = u.user_id OR p.email = u.email)
            LEFT JOIN learners l ON (l.parent_id = p.parent_id OR l.user_id = u.user_id)
            WHERE (u.account_status = 'active' OR u.account_status IS NULL)
        ";
        $params = [];

        if ($targetRole) {
            // Normalizing role codes
            $normRole = str_replace(' ', '_', strtolower($targetRole));
            $query .= " AND (r.role_code = :role OR r.role_name LIKE :role_name)";
            $params[':role'] = $normRole;
            $params[':role_name'] = '%' . $targetRole . '%';
        }

        if ($targetClassId) {
            $query .= " AND (l.class_id = :cid)";
            $params[':cid'] = $targetClassId;
        }

        if ($targetDistrict) {
            $query .= " AND (p.district = :dist)";
            $params[':dist'] = $targetDistrict;
        }

        $stmt = $this->db->prepare($query);
        $stmt->execute($params);
        $recipients = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $insertedCount = 0;
        $this->db->beginTransaction();

        try {
            // 2. Insert broadcast record
            $bStmt = $this->db->prepare("
                INSERT INTO notification_broadcasts
                    (sender_id, title, message, broadcast_type, target_role, target_class_id, target_district, priority, action_url, recipients_count, created_at)
                VALUES
                    (:sid, :title, :msg, :btype, :trole, :tclass, :tdist, :prio, :url, :rcount, NOW())
            ");
            $bStmt->execute([
                ':sid' => $senderUserId,
                ':title' => mb_substr($title, 0, 200),
                ':msg' => $message,
                ':btype' => in_array($broadcastType, ['circular', 'announcement', 'system', 'alert'], true) ? $broadcastType : 'circular',
                ':trole' => $targetRole,
                ':tclass' => $targetClassId,
                ':tdist' => $targetDistrict,
                ':prio' => in_array($priority, ['low', 'normal', 'high', 'urgent'], true) ? $priority : 'normal',
                ':url' => $actionUrl,
                ':rcount' => count($recipients)
            ]);
            $broadcastId = (int)$this->db->lastInsertId();

            // 3. Batch insert notifications for targeted users
            if (!empty($recipients)) {
                $nStmt = $this->db->prepare("
                    INSERT INTO notifications 
                        (user_id, notification_type, title, message, action_url, priority, metadata_json, status, date_created, related_entity_type, related_entity_id, channel)
                    VALUES 
                        (:uid, :ntype, :title, :msg, :url, :prio, :meta, 'unread', NOW(), 'broadcast', :bid, 'in_app')
                ");

                $notifType = in_array($broadcastType, ['circular', 'announcement', 'system', 'alert'], true) ? $broadcastType : 'circular';
                $metaJson = json_encode([
                    'broadcast_id' => $broadcastId,
                    'sender_id' => $senderUserId,
                    'target_role' => $targetRole,
                    'target_class_id' => $targetClassId,
                    'target_district' => $targetDistrict
                ], JSON_UNESCAPED_UNICODE);

                foreach ($recipients as $rec) {
                    $nStmt->execute([
                        ':uid' => (int)$rec['user_id'],
                        ':ntype' => $notifType,
                        ':title' => mb_substr($title, 0, 200),
                        ':msg' => $message,
                        ':url' => $actionUrl,
                        ':prio' => $priority,
                        ':meta' => $metaJson,
                        ':bid' => $broadcastId
                    ]);
                    $insertedCount++;
                }
            }

            $this->db->commit();

            return [
                'broadcast_id' => $broadcastId,
                'title' => $title,
                'recipients_count' => $insertedCount,
                'target_role' => $targetRole ?: 'All Roles',
                'target_class_id' => $targetClassId,
                'target_district' => $targetDistrict,
                'created_at' => date('Y-m-d H:i:s')
            ];
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Scan database for overdue lessons and at-risk students, generating automated reminders.
     */
    public function scanAndGeneratePacingReminders(): array
    {
        $createdReminders = 0;

        // 1. Identify active learners with <50% syllabus coverage or low quiz scores
        $stmt = $this->db->query("
            SELECT 
                l.learner_id, 
                l.full_name as learner_name, 
                l.parent_id,
                p.user_id as parent_user_id,
                p.full_name as parent_name,
                c.class_code
            FROM learners l
            JOIN classes c ON l.class_id = c.class_id
            JOIN parents p ON l.parent_id = p.parent_id
            WHERE l.status = 'active' AND p.user_id IS NOT NULL
        ");

        while ($lrn = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $lid = (int)$lrn['learner_id'];
            $parentUserId = (int)$lrn['parent_user_id'];

            // Check if reminder was sent in the last 24 hours
            $checkStmt = $this->db->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = :puid 
                  AND related_entity_type = 'learner_pacing' 
                  AND related_entity_id = :lid 
                  AND date_created >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ");
            $checkStmt->execute([':puid' => $parentUserId, ':lid' => $lid]);
            if ((int)$checkStmt->fetchColumn() > 0) {
                continue;
            }

            // Check progress
            $pStmt = $this->db->prepare("
                SELECT SUM(expected_lessons) as exp, SUM(completed_lessons) as comp 
                FROM vw_learner_subject_progress 
                WHERE learner_id = :lid
            ");
            $pStmt->execute([':lid' => $lid]);
            $prog = $pStmt->fetch(PDO::FETCH_ASSOC);
            $exp = (int)($prog['exp'] ?? 0);
            $comp = (int)($prog['comp'] ?? 0);

            if ($exp > 0 && ($comp / $exp) < 0.50) {
                $pct = round(($comp / $exp) * 100, 1);
                $this->sendToUser(
                    $parentUserId,
                    'reminder',
                    "Lesson Pacing Reminder: {$lrn['learner_name']}",
                    "{$lrn['learner_name']} is currently at {$pct}% syllabus coverage ({$comp}/{$exp} lessons completed in Class {$lrn['class_code']}). Review the study schedule to stay on track.",
                    "#learner-reports?id={$lid}",
                    'normal',
                    ['learner_id' => $lid, 'coverage_pct' => $pct],
                    'learner_pacing',
                    $lid
                );
                $createdReminders++;
            }
        }

        return [
            'pacing_reminders_generated' => $createdReminders,
            'evaluated_at' => date('Y-m-d H:i:s')
        ];
    }
}
