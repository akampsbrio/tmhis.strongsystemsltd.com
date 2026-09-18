<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;
use Throwable;

class AuditService
{
    /**
     * Immutable Audit Event Logger
     */
    public static function log(
        int $userId,
        string $actionType,
        string $actionDescription,
        ?string $tableAffected = null,
        ?int $recordIdAffected = null,
        ?array $beforeData = null,
        ?array $afterData = null
    ): void {
        try {
            $db = Database::getConnection();
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? 'CLI/Unknown', 0, 500);

            $stmt = $db->prepare('
                INSERT INTO audit_trail (
                    user_id,
                    action_type,
                    action_description,
                    table_affected,
                    record_id_affected,
                    ip_address,
                    user_agent,
                    before_data,
                    after_data,
                    timestamp
                ) VALUES (
                    :user_id,
                    :action_type,
                    :action_description,
                    :table_affected,
                    :record_id_affected,
                    :ip_address,
                    :user_agent,
                    :before_data,
                    :after_data,
                    NOW()
                )
            ');

            $stmt->execute([
                ':user_id' => $userId,
                ':action_type' => strtoupper($actionType),
                ':action_description' => $actionDescription,
                ':table_affected' => $tableAffected,
                ':record_id_affected' => $recordIdAffected,
                ':ip_address' => $ipAddress,
                ':user_agent' => $userAgent,
                ':before_data' => $beforeData !== null ? json_encode($beforeData, JSON_UNESCAPED_UNICODE) : null,
                ':after_data' => $afterData !== null ? json_encode($afterData, JSON_UNESCAPED_UNICODE) : null,
            ]);
        } catch (Throwable $e) {
            // Fail-safe logging
            error_log("AuditService Error: " . $e->getMessage());
        }
    }

    /**
     * Query Paginated Audit Trail with Multi-Dimensional Filters
     */
    public function queryLogs(array $filters = [], int $page = 1, int $limit = 25): array
    {
        $db = Database::getConnection();
        $offset = max(0, ($page - 1) * $limit);

        $where = ['1=1'];
        $params = [];

        if (!empty($filters['user_id'])) {
            $where[] = 'a.user_id = :user_id';
            $params[':user_id'] = (int)$filters['user_id'];
        }

        if (!empty($filters['action_type'])) {
            $where[] = 'a.action_type = :action_type';
            $params[':action_type'] = strtoupper(trim($filters['action_type']));
        }

        if (!empty($filters['table_affected'])) {
            $where[] = 'a.table_affected = :table_affected';
            $params[':table_affected'] = trim($filters['table_affected']);
        }

        if (!empty($filters['record_id'])) {
            $where[] = 'a.record_id_affected = :record_id';
            $params[':record_id'] = (int)$filters['record_id'];
        }

        if (!empty($filters['date_from'])) {
            $where[] = 'a.timestamp >= :date_from';
            $params[':date_from'] = $filters['date_from'] . ' 00:00:00';
        }

        if (!empty($filters['date_to'])) {
            $where[] = 'a.timestamp <= :date_to';
            $params[':date_to'] = $filters['date_to'] . ' 23:59:59';
        }

        if (!empty($filters['search'])) {
            $where[] = '(a.action_description LIKE :s1 OR u.username LIKE :s2 OR u.email LIKE :s3 OR a.ip_address LIKE :s4)';
            $searchVal = '%' . trim($filters['search']) . '%';
            $params[':s1'] = $searchVal;
            $params[':s2'] = $searchVal;
            $params[':s3'] = $searchVal;
            $params[':s4'] = $searchVal;
        }

        $whereSql = implode(' AND ', $where);

        // Count total matching records
        $countStmt = $db->prepare("
            SELECT COUNT(*) 
            FROM audit_trail a
            LEFT JOIN users u ON a.user_id = u.user_id
            WHERE {$whereSql}
        ");
        $countStmt->execute($params);
        $totalCount = (int)$countStmt->fetchColumn();

        // Fetch paginated records
        $queryStmt = $db->prepare("
            SELECT 
                a.audit_id,
                a.user_id,
                a.action_type,
                a.action_description,
                a.table_affected,
                a.record_id_affected,
                a.ip_address,
                a.user_agent,
                a.before_data,
                a.after_data,
                a.timestamp,
                u.username,
                u.email,
                r.role_code,
                r.role_name
            FROM audit_trail a
            LEFT JOIN users u ON a.user_id = u.user_id
            LEFT JOIN roles r ON u.role_id = r.role_id
            WHERE {$whereSql}
            ORDER BY a.audit_id DESC
            LIMIT :limit OFFSET :offset
        ");

        foreach ($params as $k => $v) {
            $queryStmt->bindValue($k, $v);
        }
        $queryStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $queryStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $queryStmt->execute();

        $rows = $queryStmt->fetchAll(PDO::FETCH_ASSOC);

        $logs = array_map(function ($row) {
            $row['has_diff'] = (!empty($row['before_data']) || !empty($row['after_data']));
            return $row;
        }, $rows);

        return [
            'logs' => $logs,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_records' => $totalCount,
                'total_pages' => (int)ceil($totalCount / $limit)
            ]
        ];
    }

    /**
     * Inspect Single Audit Record with Computed State Diff
     */
    public function getLogById(int $auditId): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT 
                a.audit_id,
                a.user_id,
                a.action_type,
                a.action_description,
                a.table_affected,
                a.record_id_affected,
                a.ip_address,
                a.user_agent,
                a.before_data,
                a.after_data,
                a.timestamp,
                u.username,
                u.email,
                r.role_code,
                r.role_name
            FROM audit_trail a
            LEFT JOIN users u ON a.user_id = u.user_id
            LEFT JOIN roles r ON u.role_id = r.role_id
            WHERE a.audit_id = ?
        ');
        $stmt->execute([$auditId]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            return null;
        }

        $before = !empty($record['before_data']) ? json_decode($record['before_data'], true) : null;
        $after = !empty($record['after_data']) ? json_decode($record['after_data'], true) : null;

        $record['before_parsed'] = $before;
        $record['after_parsed'] = $after;
        $record['diff_changes'] = $this->computeDiff($before, $after);

        return $record;
    }

    /**
     * Compute Structured Key-by-Key State Comparison
     */
    private function computeDiff(?array $before, ?array $after): array
    {
        $changes = [];
        $allKeys = array_unique(array_merge(array_keys($before ?? []), array_keys($after ?? [])));

        foreach ($allKeys as $key) {
            $beforeVal = $before[$key] ?? null;
            $afterVal = $after[$key] ?? null;

            if ($beforeVal !== $afterVal) {
                $status = 'modified';
                if ($beforeVal === null && $afterVal !== null) {
                    $status = 'added';
                } elseif ($beforeVal !== null && $afterVal === null) {
                    $status = 'removed';
                }

                $changes[] = [
                    'key' => $key,
                    'status' => $status,
                    'before' => $beforeVal,
                    'after' => $afterVal
                ];
            }
        }

        return $changes;
    }

    /**
     * Aggregated Audit Trail Statistics & Anomaly Indicators
     */
    public function getStats(): array
    {
        $db = Database::getConnection();

        // 1. Total events in last 24 hours
        $stmt24h = $db->query("
            SELECT COUNT(*) FROM audit_trail 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ");
        $total24h = (int)$stmt24h->fetchColumn();

        // 2. Failed logins today
        $stmtFailed = $db->query("
            SELECT COUNT(*) FROM audit_trail 
            WHERE action_type IN ('LOGIN_FAILED', 'AUTH_FAILED', 'FAILED_LOGIN')
            AND timestamp >= CURDATE()
        ");
        $failedLoginsToday = (int)$stmtFailed->fetchColumn();

        // 3. Sensitive configuration & role alterations (last 7 days)
        $stmtSensitive = $db->query("
            SELECT COUNT(*) FROM audit_trail 
            WHERE action_type IN ('ROLE_CHANGE', 'USER_STATUS_CHANGE', 'SETTING_UPDATE', 'EXAM_SET_DELETE', 'BROADCAST_PUBLISHED')
            AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ");
        $sensitiveActions7d = (int)$stmtSensitive->fetchColumn();

        // 4. Action Type Distribution (top 5)
        $stmtActions = $db->query("
            SELECT action_type, COUNT(*) as count 
            FROM audit_trail 
            GROUP BY action_type 
            ORDER BY count DESC 
            LIMIT 5
        ");
        $topActions = $stmtActions->fetchAll(PDO::FETCH_ASSOC);

        // 5. Active Security Actors (top 5)
        $stmtActors = $db->query("
            SELECT a.user_id, COALESCE(u.username, u.email, CONCAT('User #', a.user_id)) as actor_name, COUNT(*) as count
            FROM audit_trail a
            LEFT JOIN users u ON a.user_id = u.user_id
            WHERE a.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY a.user_id, actor_name
            ORDER BY count DESC
            LIMIT 5
        ");
        $topActors = $stmtActors->fetchAll(PDO::FETCH_ASSOC);

        return [
            'events_24h' => $total24h,
            'failed_logins_today' => $failedLoginsToday,
            'sensitive_actions_7d' => $sensitiveActions7d,
            'top_actions' => $topActions,
            'top_actors' => $topActors
        ];
    }
}
