<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\SyncService;
use App\Services\DeviceService;
use App\Services\AuditService;
use App\Utils\Response;
use App\Middleware\AuthMiddleware;
use App\Config\Database;
use PDO;
use Throwable;

class SyncController
{
    /**
     * Register or update client device metadata.
     * POST /api/devices/register
     */
    public function registerDevice(): void
    {
        $user = AuthMiddleware::authenticate();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $deviceUuid = trim((string)($data['device_uuid'] ?? ''));
        if (empty($deviceUuid)) {
            Response::error('Device UUID is required.', 422, ['device_uuid' => 'Required']);
            return;
        }

        try {
            $device = DeviceService::registerDevice(
                $deviceUuid,
                (int)$user['user_id'],
                isset($data['learner_id']) ? (int)$data['learner_id'] : null,
                $data['device_name'] ?? null,
                $data['platform'] ?? null,
                $data['browser'] ?? null,
                $data['app_version'] ?? '1.0.0'
            );

            Response::success($device, 'Device registered successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to register device: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Process batch of offline sync queue items.
     * POST /api/sync/process
     */
    public function processSync(): void
    {
        $user = AuthMiddleware::authenticate();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $items = $data['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            // Check if single item payload passed
            if (!empty($data['client_transaction_uuid'])) {
                $items = [$data];
            } else {
                Response::error('No sync items provided in payload.', 422);
                return;
            }
        }

        $deviceUuid = trim((string)($data['device_uuid'] ?? ''));

        try {
            $results = SyncService::processBatch((int)$user['user_id'], $items, $deviceUuid ?: null);

            $syncedCount = count(array_filter($results, fn($r) => !empty($r['success'])));
            $failedCount = count($results) - $syncedCount;

            AuditService::log(
                (int)$user['user_id'],
                'OFFLINE_SYNC_BATCH',
                "Processed sync batch: {$syncedCount} succeeded, {$failedCount} failed.",
                'sync_queue',
                null,
                null,
                ['total' => count($results), 'synced' => $syncedCount, 'failed' => $failedCount]
            );

            Response::success([
                'total' => count($results),
                'synced_count' => $syncedCount,
                'failed_count' => $failedCount,
                'results' => $results,
                'server_time' => date('c')
            ], 'Sync batch processed.');
        } catch (Throwable $e) {
            Response::error('Sync batch processing error: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Sync Status summary, queue counts, and recent logs.
     * GET /api/sync/status
     */
    public function getStatus(): void
    {
        $user = AuthMiddleware::authenticate();
        $learnerId = isset($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;

        try {
            $status = SyncService::getSyncStatus((int)$user['user_id'], $learnerId);
            Response::success($status, 'Sync status retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to get sync status: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Download comprehensive offline bundle package for a learner / class level.
     * GET /api/sync/download-package
     */
    public function downloadPackage(): void
    {
        $user = AuthMiddleware::authenticate();
        $learnerId = isset($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;
        $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : null;

        try {
            $package = SyncService::generateOfflinePackage((int)$user['user_id'], $learnerId, $classId);

            AuditService::log(
                (int)$user['user_id'],
                'OFFLINE_PACKAGE_DOWNLOAD',
                "Generated offline package for learner #{$learnerId} / class #{$classId}.",
                'classes',
                $classId
            );

            Response::success($package, 'Offline package downloaded successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate offline package: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Retry failed sync items in the queue.
     * POST /api/sync/retry-failed
     */
    public function retryFailed(): void
    {
        $user = AuthMiddleware::authenticate();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $queueId = isset($data['queue_id']) ? (int)$data['queue_id'] : null;

        $db = Database::getConnection();

        try {
            if ($queueId) {
                $stmt = $db->prepare('SELECT * FROM sync_queue WHERE queue_id = :id AND user_id = :uid LIMIT 1');
                $stmt->execute([':id' => $queueId, ':uid' => $user['user_id']]);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $stmt = $db->prepare('SELECT * FROM sync_queue WHERE user_id = :uid AND status IN ("failed", "dead_letter") ORDER BY created_at ASC LIMIT 50');
                $stmt->execute([':uid' => $user['user_id']]);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            if (empty($items)) {
                Response::success(['retried_count' => 0], 'No failed items found to retry.');
                return;
            }

            $results = [];
            foreach ($items as $rawItem) {
                $itemPayload = [
                    'client_transaction_uuid' => $rawItem['client_transaction_uuid'],
                    'entity_type' => $rawItem['entity_type'],
                    'entity_id' => $rawItem['entity_id'],
                    'operation' => $rawItem['operation'],
                    'learner_id' => $rawItem['learner_id'],
                    'payload' => json_decode($rawItem['payload_json'] ?? '{}', true)
                ];
                $results[] = SyncService::processSingleItem((int)$user['user_id'], $itemPayload, $rawItem['device_id'] ? (int)$rawItem['device_id'] : null);
            }

            Response::success([
                'retried_count' => count($results),
                'results' => $results
            ], 'Retry process completed.');
        } catch (Throwable $e) {
            Response::error('Failed to retry sync queue: ' . $e->getMessage(), 500);
        }
    }
}
