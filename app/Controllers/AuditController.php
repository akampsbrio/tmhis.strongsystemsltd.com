<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuditService;
use App\Middleware\RoleMiddleware;
use App\Utils\Response;

class AuditController
{
    private AuditService $auditService;

    public function __construct()
    {
        $this->auditService = new AuditService();
    }

    /**
     * GET /api/admin/audit
     * Paginated audit trail listing with multi-dimensional filtering
     */
    public function list(array $query = []): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $page = max(1, (int)($query['page'] ?? 1));
        $limit = min(100, max(10, (int)($query['limit'] ?? 25)));

        $filters = [
            'user_id' => $query['user_id'] ?? null,
            'action_type' => $query['action_type'] ?? null,
            'table_affected' => $query['table_affected'] ?? null,
            'record_id' => $query['record_id'] ?? null,
            'date_from' => $query['date_from'] ?? null,
            'date_to' => $query['date_to'] ?? null,
            'search' => $query['search'] ?? null,
        ];

        $result = $this->auditService->queryLogs($filters, $page, $limit);
        Response::success($result, 'Audit logs retrieved successfully.');
    }

    /**
     * GET /api/admin/audit/stats
     * Aggregated audit statistics and security telemetry
     */
    public function stats(): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $stats = $this->auditService->getStats();
        Response::success($stats, 'Audit statistics retrieved successfully.');
    }

    /**
     * GET /api/admin/audit/{id}
     * Inspect single audit record with state diff breakdown
     */
    public function show(int $id): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $record = $this->auditService->getLogById($id);
        if (!$record) {
            Response::notFound('Audit log record not found.');
            return;
        }

        Response::success($record, 'Audit log record retrieved successfully.');
    }

    /**
     * GET /api/admin/audit/export
     * Export filtered audit trail to compliant CSV
     */
    public function export(array $query = []): void
    {
        RoleMiddleware::requireRole(['administrator']);

        $filters = [
            'user_id' => $query['user_id'] ?? null,
            'action_type' => $query['action_type'] ?? null,
            'table_affected' => $query['table_affected'] ?? null,
            'record_id' => $query['record_id'] ?? null,
            'date_from' => $query['date_from'] ?? null,
            'date_to' => $query['date_to'] ?? null,
            'search' => $query['search'] ?? null,
        ];

        // Fetch up to 5,000 records for CSV export
        $result = $this->auditService->queryLogs($filters, 1, 5000);
        $logs = $result['logs'] ?? [];

        $filename = 'tmhis_audit_trail_' . date('Ymd_His') . '.csv';

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $output = fopen('php://output', 'w');

        // CSV Header row
        fputcsv($output, [
            'Audit ID',
            'Timestamp (EAT)',
            'Actor Username',
            'Actor Email',
            'Role Code',
            'Action Type',
            'Description',
            'Entity Affected',
            'Record ID',
            'IP Address',
            'User Agent'
        ]);

        foreach ($logs as $log) {
            fputcsv($output, [
                $log['audit_id'],
                $log['timestamp'],
                $log['username'] ?? 'System / Anonymous',
                $log['email'] ?? 'N/A',
                $log['role_code'] ?? 'N/A',
                $log['action_type'],
                $log['action_description'],
                $log['table_affected'] ?? 'N/A',
                $log['record_id_affected'] ?? 'N/A',
                $log['ip_address'] ?? 'N/A',
                $log['user_agent'] ?? 'N/A'
            ]);
        }

        fclose($output);
        exit(0);
    }
}
