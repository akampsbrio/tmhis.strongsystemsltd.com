<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Config\Database;
use App\Utils\Response;
use PDO;

class AuthMiddleware
{
    private static ?array $authenticatedUser = null;

    public static function handle(): array
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // 1. Check active PHP session
        if (isset($_SESSION['user_id'])) {
            $user = self::fetchUserById((int)$_SESSION['user_id']);
            if ($user) {
                self::$authenticatedUser = $user;
                return $user;
            }
        }

        // 2. Check Authorization Bearer header or custom token
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (str_starts_with($authHeader, 'Bearer ')) {
            $token = trim(substr($authHeader, 7));
            $user = self::validateBearerToken($token);
            if ($user) {
                self::$authenticatedUser = $user;
                return $user;
            }
        }

        // 3. Check remember-me cookie
        if (isset($_COOKIE['tmhis_remember'])) {
            $cookieToken = $_COOKIE['tmhis_remember'];
            $user = self::validateRememberToken($cookieToken);
            if ($user) {
                $_SESSION['user_id'] = $user['user_id'];
                self::$authenticatedUser = $user;
                return $user;
            }
        }

        Response::unauthorized('Authentication required. Please log in.');
        return [];
    }

    public static function user(): ?array
    {
        return self::$authenticatedUser;
    }

    public static function setUser(array $user): void
    {
        self::$authenticatedUser = $user;
    }

    private static function fetchUserById(int $userId): ?array
    {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT 
                u.user_id, 
                u.role_id, 
                r.role_code, 
                r.role_name, 
                u.username, 
                u.email, 
                u.avatar_url,
                u.account_status,
                u.last_login_at
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = :id AND u.account_status = "active"
        ');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return null;
        }

        // Fetch associated role profile details
        $user['profile'] = self::fetchUserProfile($user['user_id'], $user['role_code']);
        return $user;
    }

    private static function validateBearerToken(string $token): ?array
    {
        // Token format: base64(user_id:hmac_hash:timestamp)
        $decoded = base64_decode($token, true);
        if (!$decoded) {
            return null;
        }

        $parts = explode(':', $decoded, 3);
        if (count($parts) !== 3) {
            return null;
        }

        [$userIdStr, $hmac, $timestampStr] = $parts;
        $userId = (int)$userIdStr;
        $timestamp = (int)$timestampStr;

        // Check token age (24 hours)
        if (time() - $timestamp > 86400) {
            return null;
        }

        $config = require __DIR__ . '/../Config/config.php';
        $secret = $config['security']['token_secret'];
        $expectedHmac = hash_hmac('sha256', "{$userId}:{$timestamp}", $secret);

        if (!hash_equals($expectedHmac, $hmac)) {
            return null;
        }

        return self::fetchUserById($userId);
    }

    private static function validateRememberToken(string $token): ?array
    {
        $db = Database::getConnection();
        $tokenHash = hash('sha256', $token);

        $stmt = $db->prepare('
            SELECT 
                u.user_id, 
                u.role_id, 
                r.role_code, 
                r.role_name, 
                u.username, 
                u.email, 
                u.avatar_url,
                u.account_status,
                u.last_login_at
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.remember_token_hash = :hash 
              AND u.remember_token_expires_at > NOW()
              AND u.account_status = "active"
        ');
        $stmt->execute([':hash' => $tokenHash]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return null;
        }

        $user['profile'] = self::fetchUserProfile($user['user_id'], $user['role_code']);
        return $user;
    }

    public static function fetchUserProfile(int $userId, string $roleCode): ?array
    {
        $db = Database::getConnection();
        switch ($roleCode) {
            case 'parent':
                $stmt = $db->prepare('SELECT parent_id, full_name, national_id, phone, email, physical_address, district, preferred_language, status FROM parents WHERE user_id = :uid');
                $stmt->execute([':uid' => $userId]);
                return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            case 'learner':
                $stmt = $db->prepare('SELECT learner_id, parent_id, class_id, first_name, last_name, gender, date_of_birth, admission_number, status FROM learners WHERE user_id = :uid');
                $stmt->execute([':uid' => $userId]);
                return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            case 'teacher':
                $stmt = $db->prepare('SELECT teacher_id, full_name, subject_specialty, phone, school, status FROM teachers WHERE user_id = :uid');
                $stmt->execute([':uid' => $userId]);
                return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            case 'curriculum_officer':
                $stmt = $db->prepare('SELECT officer_id, full_name, department, officer_role, phone, institution, status FROM curriculum_officers WHERE user_id = :uid');
                $stmt->execute([':uid' => $userId]);
                return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            case 'administrator':
                return ['user_id' => $userId, 'role' => 'administrator', 'scope' => 'system_technical'];

            default:
                return null;
        }
    }
}
