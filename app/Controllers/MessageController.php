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

        $status = $query['status'] ?? 'all';
        $search = $query['search'] ?? null;
        $page = max(1, (int)($query['page'] ?? 1));
        $limit = min(50, max(5, (int)($query['limit'] ?? 25)));

        $result = $this->messageService->getUserThreads($userId, $status, $search, $page, $limit);
        Response::success($result, 'Threads retrieved successfully.');
    }

    /**
     * POST /api/messages/threads
     * Start a new conversation thread
     */
    public function createThread(array $body): void
    {
        $user = AuthMiddleware::handle();
        $creatorUserId = (int)$user['user_id'];

        $recipientUserId = (int)($body['recipient_user_id'] ?? 0);
        $subjectLine = trim($body['subject_line'] ?? '');
        $initialMessage = trim($body['message_body'] ?? '');
        $subjectId = !empty($body['subject_id']) ? (int)$body['subject_id'] : null;
        $learnerId = !empty($body['learner_id']) ? (int)$body['learner_id'] : null;
        $isImportant = !empty($body['is_important']);

        if ($recipientUserId <= 0) {
            Response::badRequest('recipient_user_id is required.');
            return;
        }

        if ($subjectLine === '') {
            Response::badRequest('subject_line is required.');
            return;
        }

        if ($initialMessage === '') {
            Response::badRequest('message_body is required.');
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
    public function sendReply(int $id, array $body): void
    {
        $user = AuthMiddleware::handle();
        $userId = (int)$user['user_id'];
        $messageBody = trim($body['message_body'] ?? '');

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
        $search = $query['q'] ?? $query['search'] ?? $query['query'] ?? null;

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
