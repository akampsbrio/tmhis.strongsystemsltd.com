<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use App\Services\AuditService;
use App\Services\NotificationService;
use PDO;
use RuntimeException;
use Throwable;

class MessageService
{
    private NotificationService $notifService;

    public function __construct()
    {
        $this->notifService = new NotificationService();
    }

    /**
     * Get Paginated Conversations for a User
     */
    public function getUserThreads(int $userId, string $status = 'all', ?string $search = null, int $page = 1, int $limit = 30): array
    {
        $db = Database::getConnection();
        $offset = max(0, ($page - 1) * $limit);

        $where = ['(t.creator_user_id = :uid OR t.recipient_user_id = :uid)'];
        $params = [':uid' => $userId];

        if ($status !== 'all' && in_array($status, ['open', 'pending', 'resolved', 'closed'])) {
            $where[] = 't.status = :status';
            $params[':status'] = $status;
        }

        if (!empty($search)) {
            $where[] = '(t.subject_line LIKE :s1 OR t.last_message_preview LIKE :s2 OR u_other.full_name LIKE :s3 OR u_other.username LIKE :s4)';
            $searchVal = '%' . trim($search) . '%';
            $params[':s1'] = $searchVal;
            $params[':s2'] = $searchVal;
            $params[':s3'] = $searchVal;
            $params[':s4'] = $searchVal;
        }

        $whereSql = implode(' AND ', $where);

        $countSql = "
            SELECT COUNT(*) 
            FROM message_threads t
            LEFT JOIN users u_other ON u_other.user_id = CASE WHEN t.creator_user_id = :uid THEN t.recipient_user_id ELSE t.creator_user_id END
            WHERE {$whereSql}
        ";
        $countStmt = $db->prepare($countSql);
        $countStmt->execute($params);
        $totalThreads = (int)$countStmt->fetchColumn();

        $sql = "
            SELECT 
                t.thread_id,
                t.creator_user_id,
                t.recipient_user_id,
                t.subject_id,
                t.learner_id,
                t.subject_line,
                t.status,
                t.last_message_at,
                t.last_message_preview,
                t.is_important,
                t.created_at,
                CASE WHEN t.creator_user_id = :uid THEN t.recipient_user_id ELSE t.creator_user_id END AS other_user_id,
                u_other.full_name AS other_user_name,
                u_other.username AS other_username,
                u_other.email AS other_email,
                u_other.avatar_url AS other_avatar,
                r_other.role_code AS other_role_code,
                r_other.role_name AS other_role_name,
                subj.subject_name,
                l.first_name AS learner_first_name,
                l.last_name AS learner_last_name,
                (
                    SELECT COUNT(*) 
                    FROM messages m 
                    WHERE m.thread_id = t.thread_id 
                      AND m.sender_user_id != :uid 
                      AND (m.read_at IS NULL OR m.status = 'sent')
                ) AS unread_count
            FROM message_threads t
            LEFT JOIN users u_other ON u_other.user_id = CASE WHEN t.creator_user_id = :uid THEN t.recipient_user_id ELSE t.creator_user_id END
            LEFT JOIN roles r_other ON u_other.role_id = r_other.role_id
            LEFT JOIN subjects subj ON t.subject_id = subj.subject_id
            LEFT JOIN learners l ON t.learner_id = l.learner_id
            WHERE {$whereSql}
            ORDER BY t.last_message_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $threads = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'threads' => $threads,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_records' => $totalThreads,
                'total_pages' => (int)ceil($totalThreads / $limit)
            ]
        ];
    }

    /**
     * Start a New Conversation Thread
     */
    public function createThread(
        int $creatorUserId,
        int $recipientUserId,
        string $subjectLine,
        string $initialMessage,
        ?int $subjectId = null,
        ?int $learnerId = null,
        bool $isImportant = false
    ): array {
        if ($creatorUserId === $recipientUserId) {
            throw new RuntimeException("You cannot start a conversation with yourself.");
        }

        $db = Database::getConnection();

        // Verify recipient exists
        $stmtRec = $db->prepare("SELECT user_id, full_name, username, email FROM users WHERE user_id = ? AND account_status = 'active'");
        $stmtRec->execute([$recipientUserId]);
        $recipient = $stmtRec->fetch(PDO::FETCH_ASSOC);

        if (!$recipient) {
            throw new RuntimeException("Recipient user not found or is inactive.");
        }

        // Fetch sender info for notification
        $stmtSend = $db->prepare("SELECT user_id, full_name, username FROM users WHERE user_id = ?");
        $stmtSend->execute([$creatorUserId]);
        $sender = $stmtSend->fetch(PDO::FETCH_ASSOC);
        $senderName = $sender['full_name'] ?: ($sender['username'] ?: "User #{$creatorUserId}");

        $db->beginTransaction();

        try {
            $preview = mb_substr(trim($initialMessage), 0, 150);

            $stmtThread = $db->prepare("
                INSERT INTO message_threads (
                    creator_user_id, recipient_user_id, subject_id, learner_id,
                    subject_line, status, last_message_at, last_message_preview, is_important,
                    created_at, updated_at
                ) VALUES (
                    :creator, :recipient, :subject_id, :learner_id,
                    :subject_line, 'open', NOW(), :preview, :is_important,
                    NOW(), NOW()
                )
            ");

            $stmtThread->execute([
                ':creator' => $creatorUserId,
                ':recipient' => $recipientUserId,
                ':subject_id' => $subjectId,
                ':learner_id' => $learnerId,
                ':subject_line' => trim($subjectLine),
                ':preview' => $preview,
                ':is_important' => $isImportant ? 1 : 0
            ]);

            $threadId = (int)$db->lastInsertId();

            // Insert initial message
            $stmtMsg = $db->prepare("
                INSERT INTO messages (
                    thread_id, sender_user_id, message_body, sent_at, read_at, status
                ) VALUES (
                    :thread_id, :sender_user_id, :message_body, NOW(), NULL, 'sent'
                )
            ");
            $stmtMsg->execute([
                ':thread_id' => $threadId,
                ':sender_user_id' => $creatorUserId,
                ':message_body' => trim($initialMessage)
            ]);
            $messageId = (int)$db->lastInsertId();

            $db->commit();

            // Dispatch in-app notification to recipient
            $this->notifService->sendToUser(
                $recipientUserId,
                "💬 New message from {$senderName}",
                "Subject: {$subjectLine}\n" . mb_substr($initialMessage, 0, 100),
                'announcement',
                $isImportant ? 'high' : 'normal',
                "#messages?thread={$threadId}"
            );

            // Audit log
            AuditService::log(
                $creatorUserId,
                'MESSAGE_THREAD_CREATED',
                "User created conversation thread '{$subjectLine}' with user #{$recipientUserId}",
                'message_threads',
                $threadId
            );

            return [
                'thread_id' => $threadId,
                'message_id' => $messageId,
                'subject_line' => $subjectLine,
                'status' => 'open'
            ];
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Get Thread Messages & Mark As Read (Transparent Read Receipts)
     */
    public function getThreadMessages(int $threadId, int $currentUserId): array
    {
        $db = Database::getConnection();

        // 1. Fetch thread and verify access
        $stmtThread = $db->prepare("
            SELECT 
                t.*,
                u_creator.full_name AS creator_name,
                u_creator.username AS creator_username,
                r_creator.role_code AS creator_role,
                u_recip.full_name AS recipient_name,
                u_recip.username AS recipient_username,
                r_recip.role_code AS recipient_role,
                subj.subject_name,
                l.first_name AS learner_first_name,
                l.last_name AS learner_last_name
            FROM message_threads t
            LEFT JOIN users u_creator ON t.creator_user_id = u_creator.user_id
            LEFT JOIN roles r_creator ON u_creator.role_id = r_creator.role_id
            LEFT JOIN users u_recip ON t.recipient_user_id = u_recip.user_id
            LEFT JOIN roles r_recip ON u_recip.role_id = r_recip.role_id
            LEFT JOIN subjects subj ON t.subject_id = subj.subject_id
            LEFT JOIN learners l ON t.learner_id = l.learner_id
            WHERE t.thread_id = ?
        ");
        $stmtThread->execute([$threadId]);
        $thread = $stmtThread->fetch(PDO::FETCH_ASSOC);

        if (!$thread) {
            throw new RuntimeException("Conversation thread not found.");
        }

        // Access check: User must be creator or recipient
        $isParticipant = ($currentUserId === (int)$thread['creator_user_id'] || $currentUserId === (int)$thread['recipient_user_id']);
        if (!$isParticipant) {
            throw new RuntimeException("Access denied. You are not a participant in this conversation.");
        }

        // 2. Mark incoming unread messages as read (Read Receipt Stamping)
        $updateStmt = $db->prepare("
            UPDATE messages 
            SET read_at = NOW(), status = 'read'
            WHERE thread_id = :thread_id 
              AND sender_user_id != :uid 
              AND read_at IS NULL
        ");
        $updateStmt->execute([
            ':thread_id' => $threadId,
            ':uid' => $currentUserId
        ]);

        // 3. Fetch all messages in the thread
        $stmtMsgs = $db->prepare("
            SELECT 
                m.message_id,
                m.thread_id,
                m.sender_user_id,
                m.message_body,
                m.sent_at,
                m.read_at,
                m.status,
                u.full_name AS sender_name,
                u.username AS sender_username,
                u.avatar_url AS sender_avatar,
                r.role_code AS sender_role
            FROM messages m
            JOIN users u ON m.sender_user_id = u.user_id
            JOIN roles r ON u.role_id = r.role_id
            WHERE m.thread_id = ?
            ORDER BY m.sent_at ASC, m.message_id ASC
        ");
        $stmtMsgs->execute([$threadId]);
        $messages = $stmtMsgs->fetchAll(PDO::FETCH_ASSOC);

        $formattedMsgs = array_map(function ($msg) use ($currentUserId) {
            $isMine = ((int)$msg['sender_user_id'] === $currentUserId);
            $msg['is_mine'] = $isMine;
            $msg['is_read'] = (!empty($msg['read_at']));
            return $msg;
        }, $messages);

        return [
            'thread' => $thread,
            'messages' => $formattedMsgs
        ];
    }

    /**
     * Send a Reply in an Existing Thread
     */
    public function sendMessage(int $threadId, int $senderUserId, string $messageBody): array
    {
        $body = trim($messageBody);
        if ($body === '') {
            throw new RuntimeException("Message body cannot be empty.");
        }

        $db = Database::getConnection();

        // Verify thread and participant access
        $stmtThread = $db->prepare("SELECT * FROM message_threads WHERE thread_id = ?");
        $stmtThread->execute([$threadId]);
        $thread = $stmtThread->fetch(PDO::FETCH_ASSOC);

        if (!$thread) {
            throw new RuntimeException("Conversation thread not found.");
        }

        $creatorId = (int)$thread['creator_user_id'];
        $recipientId = (int)$thread['recipient_user_id'];

        if ($senderUserId !== $creatorId && $senderUserId !== $recipientId) {
            throw new RuntimeException("Access denied. You cannot post to this conversation.");
        }

        $targetRecipientUserId = ($senderUserId === $creatorId) ? $recipientId : $creatorId;

        // Insert message
        $stmtMsg = $db->prepare("
            INSERT INTO messages (
                thread_id, sender_user_id, message_body, sent_at, read_at, status
            ) VALUES (
                :thread_id, :sender_user_id, :message_body, NOW(), NULL, 'sent'
            )
        ");
        $stmtMsg->execute([
            ':thread_id' => $threadId,
            ':sender_user_id' => $senderUserId,
            ':message_body' => $body
        ]);
        $messageId = (int)$db->lastInsertId();

        // Update thread metadata
        $preview = mb_substr($body, 0, 150);
        $updateThread = $db->prepare("
            UPDATE message_threads 
            SET last_message_at = NOW(), 
                last_message_preview = :preview, 
                status = 'open',
                updated_at = NOW()
            WHERE thread_id = :thread_id
        ");
        $updateThread->execute([
            ':preview' => $preview,
            ':thread_id' => $threadId
        ]);

        // Fetch sender name for notification
        $stmtSend = $db->prepare("SELECT full_name, username FROM users WHERE user_id = ?");
        $stmtSend->execute([$senderUserId]);
        $sender = $stmtSend->fetch(PDO::FETCH_ASSOC);
        $senderName = $sender['full_name'] ?: ($sender['username'] ?: "User #{$senderUserId}");

        // Dispatch in-app notification to other participant
        $this->notifService->sendToUser(
            $targetRecipientUserId,
            "💬 Reply from {$senderName}",
            "Re: {$thread['subject_line']}\n" . mb_substr($body, 0, 100),
            'announcement',
            'normal',
            "#messages?thread={$threadId}"
        );

        return [
            'message_id' => $messageId,
            'thread_id' => $threadId,
            'sender_user_id' => $senderUserId,
            'message_body' => $body,
            'sent_at' => date('Y-m-d H:i:s'),
            'read_at' => null,
            'status' => 'sent'
        ];
    }

    /**
     * Search Recipients Directory for Starting New Conversations
     */
    public function getRecipientsDirectory(int $currentUserId, ?string $query = null): array
    {
        $db = Database::getConnection();

        $where = ['u.user_id != :uid', "u.account_status = 'active'"];
        $params = [':uid' => $currentUserId];

        if (!empty($query)) {
            $where[] = '(u.full_name LIKE :s1 OR u.username LIKE :s2 OR u.email LIKE :s3 OR r.role_name LIKE :s4)';
            $searchVal = '%' . trim($query) . '%';
            $params[':s1'] = $searchVal;
            $params[':s2'] = $searchVal;
            $params[':s3'] = $searchVal;
            $params[':s4'] = $searchVal;
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $db->prepare("
            SELECT 
                u.user_id,
                COALESCE(u.full_name, u.username, u.email) AS display_name,
                u.username,
                u.email,
                u.avatar_url,
                r.role_code,
                r.role_name
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE {$whereSql}
            ORDER BY r.role_id ASC, display_name ASC
            LIMIT 100
        ");
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Get Total Unread Incoming Message Count for User
     */
    public function getUnreadMessageCount(int $userId): int
    {
        $db = Database::getConnection();
        $stmt = $db->prepare("
            SELECT COUNT(*) 
            FROM messages m
            JOIN message_threads t ON m.thread_id = t.thread_id
            WHERE (t.creator_user_id = :uid OR t.recipient_user_id = :uid)
              AND m.sender_user_id != :uid
              AND (m.read_at IS NULL OR m.status = 'sent')
        ");
        $stmt->execute([':uid' => $userId]);

        return (int)$stmt->fetchColumn();
    }
}
