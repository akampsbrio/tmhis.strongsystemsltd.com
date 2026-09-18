<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use PDO;
use Throwable;

class SystemHealthController
{
    /**
     * GET /api/admin/system/health
     * Real-time system health, database metrics, storage usage, and sync queue telemetry
     */
    public function getHealth(): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $startTime = microtime(true);
        $db = Database::getConnection();

        // 1. Database Telemetry
        $dbStatus = 'healthy';
        $dbVersion = 'Unknown';
        $dbSizeMb = 0.0;
        $tableCounts = [];

        try {
            $dbVersion = $db->query('SELECT VERSION()')->fetchColumn() ?: 'MySQL';

            $sizeStmt = $db->query("
                SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE()
            ");
            $dbSizeMb = (float)($sizeStmt->fetchColumn() ?: 0.0);

            $coreTables = ['users', 'learners', 'lessons', 'assessments', 'exam_sets', 'progress_records', 'audit_trail', 'sync_queue', 'notifications'];
            foreach ($coreTables as $t) {
                try {
                    $cnt = (int)$db->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
                    $tableCounts[$t] = $cnt;
                } catch (Throwable $e) {
                    $tableCounts[$t] = 0;
                }
            }
        } catch (Throwable $e) {
            $dbStatus = 'degraded';
        }

        // 2. Offline Sync & Queue Depth Telemetry
        $syncMetrics = [
            'total_queue_items' => 0,
            'pending_items' => 0,
            'processing_items' => 0,
            'failed_dead_letter' => 0,
            'registered_devices' => 0,
            'status' => 'optimal'
        ];

        try {
            $queueStmt = $db->query("
                SELECT status, COUNT(*) as cnt 
                FROM sync_queue 
                GROUP BY status
            ");
            while ($row = $queueStmt->fetch(PDO::FETCH_ASSOC)) {
                $status = $row['status'];
                $cnt = (int)$row['cnt'];
                $syncMetrics['total_queue_items'] += $cnt;
                if ($status === 'pending') $syncMetrics['pending_items'] = $cnt;
                if ($status === 'processing') $syncMetrics['processing_items'] = $cnt;
                if ($status === 'failed' || $status === 'dead_letter') $syncMetrics['failed_dead_letter'] += $cnt;
            }

            $devStmt = $db->query("SELECT COUNT(*) FROM devices");
            $syncMetrics['registered_devices'] = (int)$devStmt->fetchColumn();

            if ($syncMetrics['failed_dead_letter'] > 20) {
                $syncMetrics['status'] = 'attention_required';
            }
        } catch (Throwable $e) {
            $syncMetrics['status'] = 'offline';
        }

        // 3. Storage Telemetry
        $storageDir = dirname(__DIR__, 2) . '/storage';
        $materialsDir = $storageDir . '/materials';
        $examsDir = $storageDir . '/exams';
        $reportsDir = $storageDir . '/reports';

        $storageMetrics = [
            'materials_size_mb' => $this->getDirSizeMb($materialsDir),
            'exams_size_mb' => $this->getDirSizeMb($examsDir),
            'reports_size_mb' => $this->getDirSizeMb($reportsDir),
            'disk_free_gb' => round(@disk_free_space('/') / 1024 / 1024 / 1024, 2),
            'disk_total_gb' => round(@disk_total_space('/') / 1024 / 1024 / 1024, 2),
            'status' => 'healthy'
        ];

        // 4. Runtime & Memory Telemetry
        $memoryUsageMb = round(memory_get_usage(true) / 1024 / 1024, 2);
        $peakMemoryMb = round(memory_get_peak_usage(true) / 1024 / 1024, 2);
        $executionLatencyMs = round((microtime(true) - $startTime) * 1000, 2);

        $runtimeMetrics = [
            'php_version' => PHP_VERSION,
            'memory_current_mb' => $memoryUsageMb,
            'memory_peak_mb' => $peakMemoryMb,
            'max_execution_time' => ini_get('max_execution_time') . 's',
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'post_max_size' => ini_get('post_max_size'),
            'api_latency_ms' => $executionLatencyMs,
            'server_time' => date('Y-m-d H:i:s T')
        ];

        // Overall System Status Assessment
        $overallStatus = 'operational';
        if ($dbStatus !== 'healthy' || $syncMetrics['status'] === 'attention_required') {
            $overallStatus = 'warning';
        }

        Response::success([
            'overall_status' => $overallStatus,
            'database' => [
                'status' => $dbStatus,
                'version' => $dbVersion,
                'database_size_mb' => $dbSizeMb,
                'table_counts' => $tableCounts
            ],
            'sync_engine' => $syncMetrics,
            'storage' => $storageMetrics,
            'runtime' => $runtimeMetrics
        ], 'System telemetry generated successfully.');
    }

    /**
     * GET /api/admin/system/settings
     * Retrieve system administrative settings
     */
    public function getSettings(): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $db = Database::getConnection();
        $stmt = $db->query("
            SELECT setting_id, setting_key, setting_value, value_type, description, is_public, updated_at 
            FROM system_settings 
            ORDER BY setting_id ASC
        ");
        $settings = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success($settings, 'System settings retrieved successfully.');
    }

    /**
     * PATCH /api/admin/system/settings
     * Update an administrative setting with audit trail logging
     */
    public function updateSetting(array $body): void
    {
        $user = RoleMiddleware::requireRole(['administrator']);

        $key = trim($body['setting_key'] ?? '');
        $value = trim((string)($body['setting_value'] ?? ''));

        if ($key === '') {
            Response::badRequest('setting_key is required.');
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM system_settings WHERE setting_key = ?");
        $stmt->execute([$key]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            Response::notFound("Setting '{$key}' not found.");
            return;
        }

        $updateStmt = $db->prepare("
            UPDATE system_settings 
            SET setting_value = :val, updated_by = :uid, updated_at = NOW() 
            WHERE setting_key = :key
        ");
        $updateStmt->execute([
            ':val' => $value,
            ':uid' => $user['user_id'],
            ':key' => $key
        ]);

        // Audit Trail Log
        AuditService::log(
            (int)$user['user_id'],
            'SETTING_UPDATE',
            "Administrator updated system setting '{$key}'",
            'system_settings',
            (int)$existing['setting_id'],
            ['setting_value' => $existing['setting_value']],
            ['setting_value' => $value]
        );

        Response::success([
            'setting_key' => $key,
            'setting_value' => $value
        ], "Setting '{$key}' updated successfully.");
    }

    private function getDirSizeMb(string $dir): float
    {
        if (!is_dir($dir)) {
            return 0.0;
        }

        $size = 0;
        try {
            foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)) as $file) {
                $size += $file->getSize();
            }
        } catch (Throwable $e) {
            return 0.0;
        }

        return round($size / 1024 / 1024, 2);
    }
}
