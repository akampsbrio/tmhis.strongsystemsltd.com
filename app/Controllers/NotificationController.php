<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\NotificationService;
use App\Utils\Response;
use PDO;
use Throwable;

/**
 * Controller for managing in-app notifications, user alert states,
 * and Curriculum Officer statutory circular broadcasts.
 */
class NotificationController
{
    private PDO $db;
    private NotificationService $service;

    public function __construct(?PDO $db = null, ?NotificationService $service = null)
    {
        $this->db = $db ?: Database::getConnection();
        $this->service = $service ?: new NotificationService($this->db);
    }

    /**
     * GET /api/notifications
     * Retrieve paginated notifications and unread badge count for authenticated user.
     */
    public function getNotifications(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $userId = (int)$user['user_id'];

            $status = isset($_GET['status']) ? trim((string)$_GET['status']) : 'all';
            $type = isset($_GET['type']) ? trim((string)$_GET['type']) : null;
            $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int)$_GET['limit'] : 30;
            $offset = isset($_GET['offset']) && is_numeric($_GET['offset']) ? (int)$_GET['offset'] : 0;

            $result = $this->service->getUserNotifications($userId, [
                'status' => $status,
                'type' => $type,
                'limit' => $limit,
                'offset' => $offset
            ]);

            Response::success($result, 'Notifications retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to retrieve notifications: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PATCH /api/notifications/{id}/read
     * Mark a specific notification as read.
     */
    public function markRead(array $params = []): void
    {
        try {
            $user = AuthMiddleware::handle();
            $userId = (int)$user['user_id'];
            $notificationId = isset($params['id']) && is_numeric($params['id']) ? (int)$params['id'] : null;

            if (!$notificationId) {
                Response::error('Invalid notification ID provided.', 400);
                return;
            }

            $success = $this->service->markRead($userId, $notificationId);
            if (!$success) {
                Response::error('Notification not found or unauthorized.', 404);
                return;
            }

            Response::success(['notification_id' => $notificationId, 'status' => 'read'], 'Notification marked as read.');
        } catch (Throwable $e) {
            Response::error('Failed to update notification: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/notifications/mark-all-read
     * Mark all unread notifications as read for current user.
     */
    public function markAllRead(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $userId = (int)$user['user_id'];

            $count = $this->service->markAllRead($userId);

            Response::success(['marked_read_count' => $count], 'All notifications marked as read.');
        } catch (Throwable $e) {
            Response::error('Failed to mark notifications as read: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/notifications/{id}/dismiss
     * Dismiss/hide a notification from active view.
     */
    public function dismiss(array $params = []): void
    {
        try {
            $user = AuthMiddleware::handle();
            $userId = (int)$user['user_id'];
            $notificationId = isset($params['id']) && is_numeric($params['id']) ? (int)$params['id'] : null;

            if (!$notificationId) {
                Response::error('Invalid notification ID provided.', 400);
                return;
            }

            $success = $this->service->dismiss($userId, $notificationId);
            if (!$success) {
                Response::error('Notification not found or unauthorized.', 404);
                return;
            }

            Response::success(['notification_id' => $notificationId, 'status' => 'dismissed'], 'Notification dismissed.');
        } catch (Throwable $e) {
            Response::error('Failed to dismiss notification: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/officer/notifications/broadcast
     * Curriculum Officer / Administrator official broadcast engine.
     */
    public function broadcast(): void
    {
        try {
            $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
            $senderUserId = (int)$user['user_id'];

            $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

            $result = $this->service->broadcast($senderUserId, $input);

            // Audit log
            try {
                $auditStmt = $this->db->prepare("
                    INSERT INTO audit_trail (user_id, action_type, entity_type, entity_id, new_values, ip_address, created_at)
                    VALUES (:uid, 'BROADCAST_CIRCULAR', 'notification_broadcast', :bid, :vals, :ip, NOW())
                ");
                $auditStmt->execute([
                    ':uid' => $senderUserId,
                    ':bid' => $result['broadcast_id'],
                    ':vals' => json_encode($result, JSON_UNESCAPED_UNICODE),
                    ':ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
                ]);
            } catch (Throwable $ae) {
                // Ignore audit logging failures
            }

            Response::success($result, 'Statutory circular broadcast dispatched successfully.', 201);
        } catch (Throwable $e) {
            Response::error('Failed to dispatch broadcast: ' . $e->getMessage(), 400);
        }
    }

    /**
     * GET /api/officer/notifications/broadcasts
     * History of official broadcasts published by Curriculum Officers.
     */
    public function getBroadcasts(): void
    {
        try {
            RoleMiddleware::requireRoles(['curriculum_officer', 'administrator', 'teacher']);
            $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int)$_GET['limit'] : 20;

            $stmt = $this->db->prepare("
                SELECT 
                    b.broadcast_id,
                    b.sender_id,
                    u.full_name as sender_name,
                    b.title,
                    b.message,
                    b.broadcast_type,
                    b.target_role,
                    b.target_class_id,
                    c.class_code,
                    b.target_district,
                    b.priority,
                    b.action_url,
                    b.recipients_count,
                    b.created_at
                FROM notification_broadcasts b
                JOIN users u ON b.sender_id = u.user_id
                LEFT JOIN classes c ON b.target_class_id = c.class_id
                ORDER BY b.created_at DESC
                LIMIT {$limit}
            ");
            $stmt->execute();
            $broadcasts = $stmt->fetchAll(PDO::FETCH_ASSOC);

            Response::success($broadcasts, 'Broadcast history retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to retrieve broadcast history: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/notifications/evaluate-pacing
     * Evaluates learner pacing and creates automatic reminders for parents.
     */
    public function evaluatePacing(): void
    {
        try {
            RoleMiddleware::requireRoles(['curriculum_officer', 'administrator', 'teacher']);
            $result = $this->service->scanAndGeneratePacingReminders();
            Response::success($result, 'Learner pacing evaluation completed.');
        } catch (Throwable $e) {
            Response::error('Pacing evaluation failed: ' . $e->getMessage(), 500);
        }
    }
}
