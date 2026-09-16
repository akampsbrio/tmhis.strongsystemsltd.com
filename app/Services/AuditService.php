<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;
use Throwable;

class AuditService
{
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
                ':action_type' => $actionType,
                ':action_description' => $actionDescription,
                ':table_affected' => $tableAffected,
                ':record_id_affected' => $recordIdAffected,
                ':ip_address' => $ipAddress,
                ':user_agent' => $userAgent,
                ':before_data' => $beforeData ? json_encode($beforeData) : null,
                ':after_data' => $afterData ? json_encode($afterData) : null,
            ]);
        } catch (Throwable $e) {
            // Never let audit failure break main operation, but log to error log
            error_log("AuditService Error: " . $e->getMessage());
        }
    }
}
