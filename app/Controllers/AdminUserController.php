<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

class AdminUserController
{
    /**
     * GET /api/admin/users
     * Requires Administrator role
     */
    public function index(): void
    {
        $admin = RoleMiddleware::requireAdmin();

        $db = Database::getConnection();
        $roleFilter = $_GET['role'] ?? null;
        $statusFilter = $_GET['status'] ?? null;
        $search = $_GET['search'] ?? null;
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(50, max(5, (int)($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $where = ['1=1'];
        $params = [];

        if ($roleFilter) {
            $where[] = 'r.role_code = :role';
            $params[':role'] = $roleFilter;
        }

        if ($statusFilter) {
            $where[] = 'u.account_status = :status';
            $params[':status'] = $statusFilter;
        }

        if ($search) {
            $where[] = '(u.full_name LIKE :search OR u.email LIKE :search OR u.username LIKE :search)';
            $params[':search'] = "%{$search}%";
        }

        $whereSql = implode(' AND ', $where);

        // Count total
        $countStmt = $db->prepare("
            SELECT COUNT(*) 
            FROM users u 
            JOIN roles r ON u.role_id = r.role_id 
            WHERE {$whereSql}
        ");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Query records
        $stmt = $db->prepare("
            SELECT 
                u.user_id,
                u.role_id,
                u.full_name,
                r.role_code,
                r.role_name,
                u.username,
                u.email,
                u.avatar_url,
                u.account_status,
                u.failed_login_attempts,
                u.locked_until,
                u.last_login_at,
                u.created_at,
                u.updated_at
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE {$whereSql}
            ORDER BY u.user_id DESC
            LIMIT {$limit} OFFSET {$offset}
        ");
        $stmt->execute($params);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'users' => $users,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    /**
     * POST /api/admin/users
     * Admin creates teacher, curriculum officer, or admin account
     */
    public function create(): void
    {
        $admin = RoleMiddleware::requireAdmin();

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('role_code', 'Role')
            ->in('role_code', ['teacher', 'curriculum_officer', 'administrator', 'parent'], 'Role')
            ->required('full_name', 'Full Name')
            ->required('email', 'Email Address')
            ->email('email')
            ->required('phone', 'Phone')
            ->required('password', 'Temporary Password')
            ->minLength('password', 8, 'Password');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $roleCode = (string)$body['role_code'];
        $fullName = trim((string)$body['full_name']);
        $email = strtolower(trim((string)$body['email']));
        $phone = trim((string)$body['phone']);
        $password = (string)$body['password'];

        $db = Database::getConnection();

        // Check if email already exists
        $check = $db->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
        $check->execute([':email' => $email]);
        if ($check->fetch()) {
            Response::error('Email is already registered.', 409, ['email' => ['Email already in use']]);
        }

        // Get role_id
        $roleStmt = $db->prepare('SELECT role_id FROM roles WHERE role_code = :rc LIMIT 1');
        $roleStmt->execute([':rc' => $roleCode]);
        $roleId = $roleStmt->fetchColumn();

        if (!$roleId) {
            Response::error('Invalid role selected.', 400);
        }

        try {
            Database::beginTransaction();

            $username = explode('@', $email)[0] . '_' . rand(100, 999);
            $pwdHash = password_hash($password, PASSWORD_BCRYPT);

            $insertUser = $db->prepare('
                INSERT INTO users (role_id, full_name, username, email, password_hash, account_status, email_verified_at, created_at)
                VALUES (:rid, :fname, :uname, :email, :phash, "active", NOW(), NOW())
            ');
            $insertUser->execute([
                ':rid' => $roleId,
                ':fname' => $fullName,
                ':uname' => $username,
                ':email' => $email,
                ':phash' => $pwdHash
            ]);
            $userId = (int)$db->lastInsertId();

            // Insert into corresponding actor table
            if ($roleCode === 'teacher') {
                $teacherStmt = $db->prepare('
                    INSERT INTO teachers (user_id, full_name, subject_specialty, phone, email, school, registration_date, status, created_at)
                    VALUES (:uid, :name, :spec, :phone, :email, :school, CURDATE(), "active", NOW())
                ');
                $teacherStmt->execute([
                    ':uid' => $userId,
                    ':name' => $fullName,
                    ':spec' => $body['subject_specialty'] ?? 'Primary Curriculum',
                    ':phone' => $phone,
                    ':email' => $email,
                    ':school' => $body['school'] ?? 'TMHIS Partner School'
                ]);
            } elseif ($roleCode === 'curriculum_officer') {
                $officerStmt = $db->prepare('
                    INSERT INTO curriculum_officers (user_id, full_name, department, officer_role, phone, email, institution, registration_date, status, created_at)
                    VALUES (:uid, :name, :dept, :role, :phone, :email, :inst, CURDATE(), "active", NOW())
                ');
                $officerStmt->execute([
                    ':uid' => $userId,
                    ':name' => $fullName,
                    ':dept' => $body['department'] ?? 'Primary Education',
                    ':role' => $body['officer_role'] ?? 'Curriculum Specialist',
                    ':phone' => $phone,
                    ':email' => $email,
                    ':inst' => $body['institution'] ?? 'NCDC / MoES'
                ]);
            } elseif ($roleCode === 'parent') {
                $parentStmt = $db->prepare('
                    INSERT INTO parents (user_id, full_name, phone, email, registration_date, status, created_at)
                    VALUES (:uid, :name, :phone, :email, CURDATE(), "active", NOW())
                ');
                $parentStmt->execute([
                    ':uid' => $userId,
                    ':name' => $fullName,
                    ':phone' => $phone,
                    ':email' => $email
                ]);
            }

            Database::commit();

            AuditService::log((int)$admin['user_id'], 'ADMIN_CREATE_USER', "Admin created user {$email} with role {$roleCode}", 'users', $userId);

            Response::success([
                'user_id' => $userId,
                'email' => $email,
                'role_code' => $roleCode,
                'full_name' => $fullName
            ], 'User account created successfully.', 201);

        } catch (Throwable $e) {
            Database::rollBack();
            Response::error('Failed to create user: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PATCH /api/admin/users/{id}/status
     * Admin updates account status: active, suspended, inactive
     */
    public function updateStatus(int $userId): void
    {
        $admin = RoleMiddleware::requireAdmin();

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('status', 'Status')
            ->in('status', ['active', 'suspended', 'inactive', 'pending'], 'Status');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $newStatus = (string)$body['status'];
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT user_id, email, account_status, role_id FROM users WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetUser) {
            Response::notFound('User not found.');
        }

        // Prevent self-deactivation of admin
        if ((int)$admin['user_id'] === $userId && $newStatus !== 'active') {
            Response::error('You cannot deactivate or suspend your own administrator account.', 400);
        }

        $updateStmt = $db->prepare('
            UPDATE users 
            SET account_status = :st, 
                remember_token_hash = IF(:st = "active", remember_token_hash, NULL),
                locked_until = IF(:st = "active", NULL, locked_until)
            WHERE user_id = :id
        ');
        $updateStmt->execute([
            ':st' => $newStatus,
            ':id' => $userId
        ]);

        AuditService::log(
            (int)$admin['user_id'],
            'USER_STATUS_CHANGE',
            "Admin changed status of user #{$userId} ({$targetUser['email']}) from {$targetUser['account_status']} to {$newStatus}",
            'users',
            $userId,
            ['status' => $targetUser['account_status']],
            ['status' => $newStatus]
        );

        Response::success([
            'user_id' => $userId,
            'previous_status' => $targetUser['account_status'],
            'new_status' => $newStatus
        ], "User account status updated to {$newStatus}.");
    }

    /**
     * GET /api/admin/users/{id}
     * Admin fetches single user details and role profile
     */
    public function show(int|string $userId): void
    {
        $userId = (int)$userId;
        RoleMiddleware::requireAdmin();
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                u.user_id,
                u.role_id,
                u.full_name,
                r.role_code,
                r.role_name,
                u.username,
                u.email,
                u.avatar_url,
                u.account_status,
                u.failed_login_attempts,
                u.locked_until,
                u.last_login_at,
                u.created_at,
                u.updated_at
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Response::notFound('User not found.');
        }

        $user['profile'] = AuthMiddleware::fetchUserProfile($userId, $user['role_code']);

        Response::success($user);
    }

    /**
     * PUT /api/admin/users/{id}
     * Admin updates user info & role profile fields
     */
    public function update(int|string $userId): void
    {
        $userId = (int)$userId;
        $admin = RoleMiddleware::requireAdmin();

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('full_name', 'Full Name')
            ->required('email', 'Email Address')
            ->email('email');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $fullName = trim((string)$body['full_name']);
        $email = strtolower(trim((string)$body['email']));
        $username = !empty($body['username']) ? trim((string)$body['username']) : null;
        $status = !empty($body['account_status']) ? trim((string)$body['account_status']) : null;

        $db = Database::getConnection();

        // 1. Check if user exists
        $fetchStmt = $db->prepare('
            SELECT u.*, r.role_code 
            FROM users u 
            JOIN roles r ON u.role_id = r.role_id 
            WHERE u.user_id = :id
        ');
        $fetchStmt->execute([':id' => $userId]);
        $targetUser = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetUser) {
            Response::notFound('User not found.');
        }

        // 2. Check email uniqueness if email changed
        if ($email !== strtolower($targetUser['email'])) {
            $checkEmail = $db->prepare('SELECT user_id FROM users WHERE email = :email AND user_id != :id LIMIT 1');
            $checkEmail->execute([':email' => $email, ':id' => $userId]);
            if ($checkEmail->fetch()) {
                Response::error('Email is already in use by another account.', 409, ['email' => ['Email is already in use']]);
            }
        }

        // 3. Prevent self-deactivation of admin
        if ((int)$admin['user_id'] === $userId && $status && $status !== 'active') {
            Response::error('You cannot deactivate or suspend your own administrator account.', 400);
        }

        try {
            Database::beginTransaction();

            $newStatus = $status ?: $targetUser['account_status'];
            $newUsername = $username ?: $targetUser['username'];

            // Update users table
            $updateUser = $db->prepare('
                UPDATE users 
                SET full_name = :fname,
                    email = :email,
                    username = :uname,
                    account_status = :status,
                    updated_at = NOW()
                WHERE user_id = :id
            ');
            $updateUser->execute([
                ':fname' => $fullName,
                ':email' => $email,
                ':uname' => $newUsername,
                ':status' => $newStatus,
                ':id' => $userId
            ]);

            // Sync with actor profile table
            switch ($targetUser['role_code']) {
                case 'parent':
                    $phone = !empty($body['phone']) ? trim((string)$body['phone']) : null;
                    $nid = !empty($body['national_id']) ? trim((string)$body['national_id']) : null;
                    $district = !empty($body['district']) ? trim((string)$body['district']) : null;
                    $address = !empty($body['physical_address']) ? trim((string)$body['physical_address']) : null;

                    $pStmt = $db->prepare('
                        UPDATE parents 
                        SET full_name = :fname,
                            email = :email,
                            phone = COALESCE(:phone, phone),
                            national_id = COALESCE(:nid, national_id),
                            district = COALESCE(:district, district),
                            physical_address = COALESCE(:address, physical_address),
                            status = :status
                        WHERE user_id = :id
                    ');
                    $pStmt->execute([
                        ':fname' => $fullName,
                        ':email' => $email,
                        ':phone' => $phone,
                        ':nid' => $nid,
                        ':district' => $district,
                        ':address' => $address,
                        ':status' => $newStatus,
                        ':id' => $userId
                    ]);
                    break;

                case 'teacher':
                    $phone = !empty($body['phone']) ? trim((string)$body['phone']) : null;
                    $specialty = !empty($body['subject_specialty']) ? trim((string)$body['subject_specialty']) : null;
                    $school = !empty($body['school']) ? trim((string)$body['school']) : null;

                    $tStmt = $db->prepare('
                        UPDATE teachers 
                        SET full_name = :fname,
                            email = :email,
                            phone = COALESCE(:phone, phone),
                            subject_specialty = COALESCE(:spec, subject_specialty),
                            school = COALESCE(:school, school),
                            status = :status
                        WHERE user_id = :id
                    ');
                    $tStmt->execute([
                        ':fname' => $fullName,
                        ':email' => $email,
                        ':phone' => $phone,
                        ':spec' => $specialty,
                        ':school' => $school,
                        ':status' => $newStatus,
                        ':id' => $userId
                    ]);
                    break;

                case 'curriculum_officer':
                    $phone = !empty($body['phone']) ? trim((string)$body['phone']) : null;
                    $dept = !empty($body['department']) ? trim((string)$body['department']) : null;
                    $role = !empty($body['officer_role']) ? trim((string)$body['officer_role']) : null;
                    $institution = !empty($body['institution']) ? trim((string)$body['institution']) : null;

                    $cStmt = $db->prepare('
                        UPDATE curriculum_officers 
                        SET full_name = :fname,
                            email = :email,
                            phone = COALESCE(:phone, phone),
                            department = COALESCE(:dept, department),
                            officer_role = COALESCE(:role, officer_role),
                            institution = COALESCE(:inst, institution),
                            status = :status
                        WHERE user_id = :id
                    ');
                    $cStmt->execute([
                        ':fname' => $fullName,
                        ':email' => $email,
                        ':phone' => $phone,
                        ':dept' => $dept,
                        ':role' => $role,
                        ':inst' => $institution,
                        ':status' => $newStatus,
                        ':id' => $userId
                    ]);
                    break;

                case 'learner':
                    $lStmt = $db->prepare('UPDATE learners SET full_name = :fname, status = :status WHERE user_id = :id');
                    $lStmt->execute([':fname' => $fullName, ':status' => $newStatus, ':id' => $userId]);
                    break;
            }

            Database::commit();

            AuditService::log(
                (int)$admin['user_id'],
                'ADMIN_EDIT_USER',
                "Admin updated details for user #{$userId} ({$email})",
                'users',
                $userId,
                ['full_name' => $targetUser['full_name'], 'email' => $targetUser['email'], 'status' => $targetUser['account_status']],
                ['full_name' => $fullName, 'email' => $email, 'status' => $newStatus]
            );

            Response::success([
                'user_id' => $userId,
                'full_name' => $fullName,
                'email' => $email,
                'account_status' => $newStatus
            ], 'User account updated successfully.');

        } catch (Throwable $e) {
            Database::rollBack();
            Response::error('Failed to update user: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/admin/users/{id}/reset-password
     * Admin immediately resets a user password
     */
    public function resetPassword(int|string $userId): void
    {
        $userId = (int)$userId;
        $admin = RoleMiddleware::requireAdmin();

        $body = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $validator = Validator::make($body)
            ->required('new_password', 'New Password')
            ->minLength('new_password', 8, 'New Password');

        if ($validator->fails()) {
            Response::validationError($validator->getErrors());
        }

        $newPassword = (string)$body['new_password'];
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT user_id, email, username FROM users WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetUser) {
            Response::notFound('User not found.');
        }

        $pwdHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $updateStmt = $db->prepare('
            UPDATE users 
            SET password_hash = :ph,
                remember_token_hash = NULL,
                failed_login_attempts = 0,
                locked_until = NULL,
                updated_at = NOW()
            WHERE user_id = :id
        ');
        $updateStmt->execute([':ph' => $pwdHash, ':id' => $userId]);

        AuditService::log(
            (int)$admin['user_id'],
            'ADMIN_RESET_PASSWORD',
            "Admin reset password for user #{$userId} ({$targetUser['email']})",
            'users',
            $userId
        );

        Response::success([
            'user_id' => $userId,
            'email' => $targetUser['email']
        ], "Password for user {$targetUser['email']} has been reset successfully.");
    }

    /**
     * POST /api/admin/users/{id}/unlock
     * Admin unlocks an account locked by failed attempts
     */
    public function unlock(int|string $userId): void
    {
        $userId = (int)$userId;
        $admin = RoleMiddleware::requireAdmin();
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT user_id, email FROM users WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetUser) {
            Response::notFound('User not found.');
        }

        $db->prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = :id')
           ->execute([':id' => $userId]);

        AuditService::log(
            (int)$admin['user_id'],
            'ADMIN_UNLOCK_USER',
            "Admin unlocked account for user #{$userId} ({$targetUser['email']})",
            'users',
            $userId
        );

        Response::success(null, "User #{$userId} account has been unlocked.");
    }
}
