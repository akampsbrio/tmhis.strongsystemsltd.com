<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;
use Throwable;

class DeviceService
{
    /**
     * Register or update a device heartbeat.
     */
    public static function registerDevice(
        string $deviceUuid,
        ?int $userId = null,
        ?int $learnerId = null,
        ?string $deviceName = null,
        ?string $platform = null,
        ?string $browser = null,
        ?string $appVersion = '1.0.0'
    ): array {
        $db = Database::getConnection();

        // Check if device already registered
        $stmt = $db->prepare('SELECT * FROM devices WHERE device_uuid = :uuid LIMIT 1');
        $stmt->execute([':uuid' => $deviceUuid]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $updateSql = '
                UPDATE devices 
                SET last_seen_at = NOW()
            ';
            $params = [':uuid' => $deviceUuid];

            if ($userId !== null) {
                $updateSql .= ', user_id = :user_id';
                $params[':user_id'] = $userId;
            }
            if ($learnerId !== null) {
                $updateSql .= ', learner_id = :learner_id';
                $params[':learner_id'] = $learnerId;
            }
            if ($deviceName !== null) {
                $updateSql .= ', device_name = :device_name';
                $params[':device_name'] = $deviceName;
            }
            if ($platform !== null) {
                $updateSql .= ', platform = :platform';
                $params[':platform'] = $platform;
            }
            if ($browser !== null) {
                $updateSql .= ', browser = :browser';
                $params[':browser'] = $browser;
            }
            if ($appVersion !== null) {
                $updateSql .= ', app_version = :app_version';
                $params[':app_version'] = $appVersion;
            }

            $updateSql .= ' WHERE device_uuid = :uuid';
            $stmt = $db->prepare($updateSql);
            $stmt->execute($params);

            $stmt = $db->prepare('SELECT * FROM devices WHERE device_uuid = :uuid LIMIT 1');
            $stmt->execute([':uuid' => $deviceUuid]);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // Insert new device record
        $stmt = $db->prepare('
            INSERT INTO devices (
                device_uuid,
                user_id,
                learner_id,
                device_name,
                platform,
                browser,
                app_version,
                last_seen_at,
                created_at
            ) VALUES (
                :uuid,
                :user_id,
                :learner_id,
                :device_name,
                :platform,
                :browser,
                :app_version,
                NOW(),
                NOW()
            )
        ');

        $stmt->execute([
            ':uuid' => $deviceUuid,
            ':user_id' => $userId,
            ':learner_id' => $learnerId,
            ':device_name' => $deviceName ?? 'Unknown Device',
            ':platform' => $platform ?? 'Web',
            ':browser' => $browser ?? 'Browser',
            ':app_version' => $appVersion ?? '1.0.0'
        ]);

        $deviceId = (int)$db->lastInsertId();

        $stmt = $db->prepare('SELECT * FROM devices WHERE device_id = :id');
        $stmt->execute([':id' => $deviceId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Look up a device record by device_uuid.
     */
    public static function getByUuid(string $deviceUuid): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM devices WHERE device_uuid = :uuid LIMIT 1');
        $stmt->execute([':uuid' => $deviceUuid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}
