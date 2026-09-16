<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

class AuthController
{
    /**
     * POST /api/auth/login
     */
    public function login(): void
    {
        RateLimitMiddleware::check('login', 10, 60);

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('login', 'Email or Username')
            ->required('password', 'Password');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $loginInput = trim((string)$body['login']);
        $password = (string)$body['password'];
        $remember = !empty($body['remember']);

        $db = Database::getConnection();

        // Fetch user by email or username
        $stmt = $db->prepare('
            SELECT 
                u.user_id,
                u.role_id,
                r.role_code,
                r.role_name,
                u.username,
                u.email,
                u.avatar_url,
                u.password_hash,
                u.account_status,
                u.failed_login_attempts,
                u.locked_until
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.email = :login_email OR u.username = :login_user
            LIMIT 1
        ');
        $stmt->execute([
            ':login_email' => $loginInput,
            ':login_user' => $loginInput
        ]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Response::error('Invalid login credentials.', 401);
        }

        // Check account lock
        if ($user['locked_until'] && strtotime($user['locked_until']) > time()) {
            $remainingMinutes = ceil((strtotime($user['locked_until']) - time()) / 60);
            Response::error("Account is temporarily locked due to too many failed attempts. Please try again in {$remainingMinutes} minutes.", 423);
        }

        // Check account status
        if ($user['account_status'] !== 'active') {
            Response::error("Your account is currently {$user['account_status']}. Please contact support or the administrator.", 403);
        }

        // Verify password
        if (!password_verify($password, $user['password_hash'])) {
            // Increment failed attempts
            $newAttempts = (int)$user['failed_login_attempts'] + 1;
            $lockedUntil = null;
            if ($newAttempts >= 5) {
                $lockedUntil = date('Y-m-d H:i:s', time() + (15 * 60)); // 15 minute lockout
            }

            $updateStmt = $db->prepare('
                UPDATE users 
                SET failed_login_attempts = :attempts, locked_until = :locked
                WHERE user_id = :id
            ');
            $updateStmt->execute([
                ':attempts' => $newAttempts,
                ':locked' => $lockedUntil,
                ':id' => $user['user_id']
            ]);

            AuditService::log((int)$user['user_id'], 'LOGIN_FAILED', "Failed login attempt for user {$user['email']}");

            if ($lockedUntil) {
                Response::error('Too many failed attempts. Account locked for 15 minutes.', 423);
            }
            Response::error('Invalid login credentials.', 401);
        }

        // Reset failed login attempts & update last_login_at
        $updateStmt = $db->prepare('
            UPDATE users 
            SET failed_login_attempts = 0, 
                locked_until = NULL, 
                last_login_at = NOW() 
            WHERE user_id = :id
        ');
        $updateStmt->execute([':id' => $user['user_id']]);

        // Start session
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $_SESSION['user_id'] = (int)$user['user_id'];
        $_SESSION['role_code'] = $user['role_code'];

        // Generate Bearer token
        $timestamp = time();
        $config = require __DIR__ . '/../Config/config.php';
        $secret = $config['security']['token_secret'];
        $hmac = hash_hmac('sha256', "{$user['user_id']}:{$timestamp}", $secret);
        $token = base64_encode("{$user['user_id']}:{$hmac}:{$timestamp}");

        // Remember Me Cookie
        if ($remember) {
            $randomToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $randomToken);
            $expiresAt = date('Y-m-d H:i:s', time() + (30 * 86400));

            $remStmt = $db->prepare('
                UPDATE users 
                SET remember_token_hash = :hash, remember_token_expires_at = :expires 
                WHERE user_id = :id
            ');
            $remStmt->execute([
                ':hash' => $tokenHash,
                ':expires' => $expiresAt,
                ':id' => $user['user_id']
            ]);

            setcookie('tmhis_remember', $randomToken, [
                'expires' => time() + (30 * 86400),
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax',
                'secure' => false // set true when running HTTPS
            ]);
        }

        // Fetch detailed profile
        $profile = AuthMiddleware::fetchUserProfile((int)$user['user_id'], $user['role_code']);

        AuditService::log((int)$user['user_id'], 'LOGIN_SUCCESS', "User {$user['email']} logged in as {$user['role_code']}");

        // Dashboard redirect map
        $dashboardUrls = [
            'learner' => '/#learner-dashboard',
            'parent' => '/#parent-dashboard',
            'teacher' => '/#teacher-dashboard',
            'curriculum_officer' => '/#officer-dashboard',
            'administrator' => '/#admin-dashboard',
        ];

        Response::success([
            'token' => $token,
            'user' => [
                'user_id' => (int)$user['user_id'],
                'role_id' => (int)$user['role_id'],
                'role_code' => $user['role_code'],
                'role_name' => $user['role_name'],
                'username' => $user['username'],
                'email' => $user['email'],
                'avatar_url' => $user['avatar_url'] ?? null,
                'dashboard_url' => $dashboardUrls[$user['role_code']] ?? '/#dashboard',
                'profile' => $profile
            ]
        ], 'Login successful.');
    }

    /**
     * POST /api/auth/register-parent
     */
    public function registerParent(): void
    {
        RateLimitMiddleware::check('register', 5, 60);

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('full_name', 'Full Name')
            ->required('phone', 'Phone Number')
            ->required('email', 'Email Address')
            ->email('email')
            ->required('password', 'Password')
            ->minLength('password', 8, 'Password')
            ->matches('password', 'password_confirmation', 'Password confirmation');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $email = strtolower(trim((string)$body['email']));
        $phone = trim((string)$body['phone']);
        $fullName = trim((string)$body['full_name']);
        $nationalId = !empty($body['national_id']) ? trim((string)$body['national_id']) : null;
        $district = !empty($body['district']) ? trim((string)$body['district']) : null;
        $address = !empty($body['physical_address']) ? trim((string)$body['physical_address']) : null;
        $password = (string)$body['password'];

        $db = Database::getConnection();

        // Check if email or phone exists
        $checkStmt = $db->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
        $checkStmt->execute([':email' => $email]);
        if ($checkStmt->fetch()) {
            Response::error('An account with this email address already exists.', 409, ['email' => ['Email already registered']]);
        }

        $phoneCheck = $db->prepare('SELECT parent_id FROM parents WHERE phone = :phone LIMIT 1');
        $phoneCheck->execute([':phone' => $phone]);
        if ($phoneCheck->fetch()) {
            Response::error('A parent account with this phone number already exists.', 409, ['phone' => ['Phone number already registered']]);
        }

        try {
            Database::beginTransaction();

            // Insert into users
            $userStmt = $db->prepare('
                INSERT INTO users (
                    role_id, 
                    username, 
                    email, 
                    password_hash, 
                    account_status, 
                    email_verified_at, 
                    created_at
                ) VALUES (
                    2, -- role_id 2 for parent
                    :username,
                    :email,
                    :pwd_hash,
                    "active",
                    NOW(),
                    NOW()
                )
            ');

            $username = explode('@', $email)[0] . '_' . rand(100, 999);
            $pwdHash = password_hash($password, PASSWORD_BCRYPT);
            $userStmt->execute([
                ':username' => $username,
                ':email' => $email,
                ':pwd_hash' => $pwdHash
            ]);

            $userId = (int)$db->lastInsertId();

            // Insert into parents table
            $parentStmt = $db->prepare('
                INSERT INTO parents (
                    user_id,
                    full_name,
                    national_id,
                    phone,
                    email,
                    physical_address,
                    district,
                    registration_date,
                    status,
                    created_at
                ) VALUES (
                    :uid,
                    :name,
                    :nid,
                    :phone,
                    :email,
                    :address,
                    :district,
                    CURDATE(),
                    "active",
                    NOW()
                )
            ');

            $parentStmt->execute([
                ':uid' => $userId,
                ':name' => $fullName,
                ':nid' => $nationalId,
                ':phone' => $phone,
                ':email' => $email,
                ':address' => $address,
                ':district' => $district
            ]);

            $parentId = (int)$db->lastInsertId();

            Database::commit();

            AuditService::log($userId, 'PARENT_REGISTERED', "Parent registered: {$fullName} ({$email})", 'parents', $parentId);

            Response::success([
                'user_id' => $userId,
                'parent_id' => $parentId,
                'email' => $email,
                'full_name' => $fullName
            ], 'Parent account created successfully. You can now log in.', 201);

        } catch (Throwable $e) {
            Database::rollBack();
            error_log("Parent registration error: " . $e->getMessage());
            Response::error('Failed to create parent account: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/auth/me
     */
    public function me(): void
    {
        $user = AuthMiddleware::handle();

        // Fetch user permissions
        $db = Database::getConnection();
        $permStmt = $db->prepare('
            SELECT p.permission_code, p.permission_name
            FROM permissions p
            JOIN role_permissions rp ON p.permission_id = rp.permission_id
            WHERE rp.role_id = :rid
            UNION
            SELECT p.permission_code, p.permission_name
            FROM permissions p
            JOIN user_permissions up ON p.permission_id = up.permission_id
            WHERE up.user_id = :uid
        ');
        $permStmt->execute([
            ':rid' => $user['role_id'],
            ':uid' => $user['user_id']
        ]);
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);

        $user['permissions'] = $permissions;

        Response::success($user);
    }

    /**
     * POST /api/auth/logout
     */
    public function logout(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $userId = $_SESSION['user_id'] ?? null;
        if ($userId) {
            $db = Database::getConnection();
            $stmt = $db->prepare('UPDATE users SET remember_token_hash = NULL, remember_token_expires_at = NULL WHERE user_id = :id');
            $stmt->execute([':id' => $userId]);

            AuditService::log((int)$userId, 'LOGOUT', "User logged out");
        }

        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();

        if (isset($_COOKIE['tmhis_remember'])) {
            setcookie('tmhis_remember', '', time() - 3600, '/');
        }

        Response::success(null, 'Logged out successfully.');
    }

    /**
     * POST /api/auth/forgot-password
     */
    public function forgotPassword(): void
    {
        RateLimitMiddleware::check('forgot_password', 5, 60);

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('email', 'Email Address')
            ->email('email');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $email = strtolower(trim((string)$body['email']));
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT user_id, email, username FROM users WHERE email = :email AND account_status = "active" LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            // Return success even if email not found to prevent user enumeration
            Response::success(null, 'If that email is registered, a password reset link has been generated.');
        }

        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + (60 * 60)); // 1 hour expiry

        $resetStmt = $db->prepare('
            INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
            VALUES (:uid, :thash, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())
        ');
        $resetStmt->execute([
            ':uid' => $user['user_id'],
            ':thash' => $tokenHash
        ]);

        AuditService::log((int)$user['user_id'], 'PASSWORD_RESET_REQUESTED', "Password reset token requested for {$email}");

        // In a live system an email is sent; for the prototype API we provide the reset token
        Response::success([
            'reset_token' => $rawToken,
            'expires_at' => $expiresAt,
            'message' => 'Password reset token generated. In production, this is sent via email.'
        ], 'Password reset instructions dispatched.');
    }

    /**
     * POST /api/auth/reset-password
     */
    public function resetPassword(): void
    {
        RateLimitMiddleware::check('reset_password', 5, 60);

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('token', 'Reset Token')
            ->required('password', 'New Password')
            ->minLength('password', 8, 'New Password')
            ->matches('password', 'password_confirmation', 'Password confirmation');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $token = trim((string)$body['token']);
        $tokenHash = hash('sha256', $token);
        $password = (string)$body['password'];

        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT password_reset_id, user_id, expires_at, used_at
            FROM password_resets
            WHERE token_hash = :thash
            LIMIT 1
        ');
        $stmt->execute([':thash' => $tokenHash]);
        $reset = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$reset) {
            Response::error('Invalid or expired password reset token.', 400);
        }

        if ($reset['used_at'] !== null) {
            Response::error('This password reset token has already been used.', 400);
        }

        if (strtotime($reset['expires_at']) < time()) {
            Response::error('This password reset token has expired. Please request a new one.', 400);
        }

        try {
            Database::beginTransaction();

            $pwdHash = password_hash($password, PASSWORD_BCRYPT);
            $updateUser = $db->prepare('
                UPDATE users 
                SET password_hash = :phash, 
                    remember_token_hash = NULL,
                    failed_login_attempts = 0,
                    locked_until = NULL
                WHERE user_id = :uid
            ');
            $updateUser->execute([
                ':phash' => $pwdHash,
                ':uid' => $reset['user_id']
            ]);

            $markUsed = $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE password_reset_id = :id');
            $markUsed->execute([':id' => $reset['password_reset_id']]);

            Database::commit();

            AuditService::log((int)$reset['user_id'], 'PASSWORD_RESET_COMPLETED', "Password reset successfully completed");

            Response::success(null, 'Your password has been successfully reset. You can now log in.');
        } catch (Throwable $e) {
            Database::rollBack();
            Response::error('Failed to reset password: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/auth/change-password
     */
    public function changePassword(): void
    {
        $user = AuthMiddleware::handle();

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('current_password', 'Current Password')
            ->required('new_password', 'New Password')
            ->minLength('new_password', 8, 'New Password')
            ->matches('new_password', 'new_password_confirmation', 'New Password confirmation');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $currentPassword = (string)$body['current_password'];
        $newPassword = (string)$body['new_password'];

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE user_id = :id');
        $stmt->execute([':id' => $user['user_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
            Response::error('Incorrect current password.', 422, ['current_password' => ['Incorrect current password']]);
        }

        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $updateStmt = $db->prepare('UPDATE users SET password_hash = :hash, remember_token_hash = NULL WHERE user_id = :id');
        $updateStmt->execute([
            ':hash' => $newHash,
            ':id' => $user['user_id']
        ]);

        AuditService::log((int)$user['user_id'], 'PASSWORD_CHANGED', "Password changed by user");

        Response::success(null, 'Password updated successfully.');
    }
}
