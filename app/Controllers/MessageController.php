<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\MessageService;
use App\Middleware\AuthMiddleware;
use App\Utils\Response;
use Throwable;

class MessageController
{
    private MessageService $messageService;

    public function __construct()
    {
        $this->messageService = new MessageService();
    }

    /**
     * GET /api/messages/threads
     * Retrieve all conversations for the authenticated user
     */
    public function getThreads(array $query = []): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];

        $q = !empty($query) ? $query : $_GET;
        $status = $q['status'] ?? $q['filter'] ?? 'all';
        $search = $q['q'] ?? $q['search'] ?? null;
        $page = max(1, (int)($q['page'] ?? 1));
        $limit = min(50, max(5, (int)($q['limit'] ?? 25)));

        $result = $this->messageService->getUserThreads($userId, $status, $search, $page, $limit);
        Response::success($result, 'Threads retrieved successfully.');
    }

    /**
     * POST /api/messages/threads
     * Start a new conversation thread
     */
    public function createThread(?array $body = null): void
    {
        $user = AuthMiddleware::handle();
        $creatorUserId = (int)$user['user_id'];

        $payload = $body ?? json_decode(file_get_contents('php://input'), true) ?? $_POST ?? [];

        $recipientUserId = (int)($payload['recipient_user_id'] ?? 0);
        $subjectLine = trim((string)($payload['subject_line'] ?? ''));
        $initialMessage = trim((string)($payload['initial_message'] ?? $payload['message_body'] ?? ''));
        $subjectId = !empty($payload['subject_id']) ? (int)$payload['subject_id'] : null;
        $learnerId = !empty($payload['learner_id']) ? (int)$payload['learner_id'] : null;
        $isImportant = !empty($payload['is_important']);

        if ($recipientUserId <= 0) {
            Response::badRequest('recipient_user_id is required.');
            return;
        }

        if ($subjectLine === '') {
            Response::badRequest('subject_line is required.');
            return;
        }

        if ($initialMessage === '') {
            Response::badRequest('initial_message is required.');
            return;
        }

        try {
            $result = $this->messageService->createThread(
                $creatorUserId,
                $recipientUserId,
                $subjectLine,
                $initialMessage,
                $subjectId,
                $learnerId,
                $isImportant
            );

            Response::created($result, 'Conversation started successfully.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/messages/threads/{id}
     * Get thread messages & mark unread incoming messages as read (Read Receipts)
     */
    public function getThread(int $id): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];

        try {
            $result = $this->messageService->getThreadMessages($id, $userId);
            Response::success($result, 'Thread messages retrieved successfully.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 403);
        }
    }

    /**
     * POST /api/messages/threads/{id}/messages
     * Send a reply in an existing thread
     */
    public function sendReply(int $id, ?array $body = null): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];

        $payload = $body ?? json_decode(file_get_contents('php://input'), true) ?? $_POST ?? [];
        $messageBody = trim((string)($payload['message_body'] ?? $payload['body'] ?? ''));

        if ($messageBody === '') {
            Response::badRequest('message_body is required.');
            return;
        }

        try {
            $result = $this->messageService->sendMessage($id, $userId, $messageBody);
            Response::created($result, 'Reply sent successfully.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 403);
        }
    }

    /**
     * GET /api/messages/recipients
     * Search available recipients directory
     */
    public function getRecipients(array $query = []): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];

        $q = !empty($query) ? $query : $_GET;
        $search = $q['q'] ?? $q['search'] ?? $q['query'] ?? null;

        $recipients = $this->messageService->getRecipientsDirectory($userId, $search);
        Response::success([
            'recipients' => $recipients,
            'total' => count($recipients)
        ], 'Recipients directory retrieved successfully.');
    }

    /**
     * GET /api/messages/unread-count
     * Get unread incoming message count
     */
    public function getUnreadCount(): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];

        $count = $this->messageService->getUnreadMessageCount($userId);
        Response::success(['unread_count' => $count], 'Unread count retrieved.');
    }
}
