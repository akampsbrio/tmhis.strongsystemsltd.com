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
            $where[] = '(u.email LIKE :search OR u.username LIKE :search)';
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
                INSERT INTO users (role_id, username, email, password_hash, account_status, email_verified_at, created_at)
                VALUES (:rid, :uname, :email, :phash, "active", NOW(), NOW())
            ');
            $insertUser->execute([
                ':rid' => $roleId,
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
}
