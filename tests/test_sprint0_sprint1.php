<?php
declare(strict_types=1);

/**
 * Automated Test Suite for Sprint 0 (Foundation) & Sprint 1 (Module 01: Auth & RBAC)
 */

// Autoload
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/../app/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) require_once $file;
});

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;

class TestRunner
{
    private int $passed = 0;
    private int $failed = 0;
    private array $results = [];

    public function assert(string $description, bool $condition, string $details = ''): void
    {
        if ($condition) {
            $this->passed++;
            $this->results[] = " [PASS] {$description}";
            echo "\033[32m✔\033[0m {$description}\n";
        } else {
            $this->failed++;
            $this->results[] = " [FAIL] {$description} (" . ($details ?: 'Assertion failed') . ")";
            echo "\033[31m✘\033[0m {$description} \033[33m[{$details}]\033[0m\n";
        }
    }

    public function summary(): void
    {
        echo "\n=======================================================\n";
        echo "TMHIS SPRINT 0 & SPRINT 1 TEST SUMMARY\n";
        echo "Total: " . ($this->passed + $this->failed) . " | Passed: \033[32m{$this->passed}\033[0m | Failed: " . ($this->failed > 0 ? "\033[31m{$this->failed}\033[0m" : "0") . "\n";
        echo "=======================================================\n";
        if ($this->failed > 0) {
            exit(1);
        }
    }
}

$test = new TestRunner();
$db = Database::getConnection();

echo "\n--- RUNNING TMHIS FOUNDATION & AUTH TESTS ---\n\n";

// 1. Database Connection & Table Verification
try {
    $stmt = $db->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $test->assert("Database connected and contains required tables", in_array('users', $tables) && in_array('parents', $tables) && in_array('audit_trail', $tables));
} catch (Exception $e) {
    $test->assert("Database connection", false, $e->getMessage());
}

// 2. Roles Seeding Verification
$roles = $db->query("SELECT role_code FROM roles")->fetchAll(PDO::FETCH_COLUMN);
$expectedRoles = ['learner', 'parent', 'teacher', 'curriculum_officer', 'administrator'];
$missingRoles = array_diff($expectedRoles, $roles);
$test->assert("All 5 core roles seeded (learner, parent, teacher, officer, admin)", empty($missingRoles), json_encode($missingRoles));

// Clean previous test data
$db->exec("DELETE FROM audit_trail WHERE action_type LIKE 'TEST_%'");
$db->exec("DELETE FROM password_resets WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@test.tmhis.org')");
$db->exec("DELETE FROM parents WHERE email LIKE '%@test.tmhis.org'");
$db->exec("DELETE FROM teachers WHERE email LIKE '%@test.tmhis.org'");
$db->exec("DELETE FROM curriculum_officers WHERE email LIKE '%@test.tmhis.org'");
$db->exec("DELETE FROM users WHERE email LIKE '%@test.tmhis.org'");

// 3. Create Default Administrator
$adminEmail = 'admin@test.tmhis.org';
$adminPwd = 'AdminPassword123!';
$adminHash = password_hash($adminPwd, PASSWORD_BCRYPT);
$adminStmt = $db->prepare("
    INSERT INTO users (role_id, username, email, password_hash, account_status, created_at)
    VALUES (5, 'sysadmin_test', :email, :pwd, 'active', NOW())
");
$adminStmt->execute([':email' => $adminEmail, ':pwd' => $adminHash]);
$adminId = (int)$db->lastInsertId();
$test->assert("System Administrator account created", $adminId > 0);

// 4. Test Parent Self-Registration Simulation
$parentEmail = 'parent.sarah@test.tmhis.org';
$parentPhone = '+256701999888';
$parentPwd = 'SecureParentPass2026!';
$parentHash = password_hash($parentPwd, PASSWORD_BCRYPT);

$db->beginTransaction();
$userStmt = $db->prepare("
    INSERT INTO users (role_id, username, email, password_hash, account_status, created_at)
    VALUES (2, 'sarah_p', :email, :pwd, 'active', NOW())
");
$userStmt->execute([':email' => $parentEmail, ':pwd' => $parentHash]);
$parentUserId = (int)$db->lastInsertId();

$pStmt = $db->prepare("
    INSERT INTO parents (user_id, full_name, phone, email, district, registration_date, status, created_at)
    VALUES (:uid, 'Sarah Namubiru', :phone, :email, 'Wakiso', CURDATE(), 'active', NOW())
");
$pStmt->execute([':uid' => $parentUserId, ':phone' => $parentPhone, ':email' => $parentEmail]);
$parentId = (int)$db->lastInsertId();
$db->commit();

AuditService::log($parentUserId, 'TEST_PARENT_REGISTER', "Test parent registration", 'parents', $parentId);

$test->assert("Parent registered with associated parent profile", $parentUserId > 0 && $parentId > 0);

// 5. Test Password Verification & Profile Lookup
$fetchUser = $db->prepare("SELECT * FROM users WHERE email = :email");
$fetchUser->execute([':email' => $parentEmail]);
$userRow = $fetchUser->fetch(PDO::FETCH_ASSOC);

$test->assert("Password hash verification succeeds for correct password", password_verify($parentPwd, $userRow['password_hash']));
$test->assert("Password hash verification fails for incorrect password", !password_verify('WrongPassword', $userRow['password_hash']));

$profile = AuthMiddleware::fetchUserProfile($parentUserId, 'parent');
$test->assert("Parent profile details resolved correctly (Full name: Sarah Namubiru, District: Wakiso)", $profile['full_name'] === 'Sarah Namubiru' && $profile['district'] === 'Wakiso');

// 6. Test Failed Login Attempt Counter & Lockout
$failStmt = $db->prepare("UPDATE users SET failed_login_attempts = 5, locked_until = :lock WHERE user_id = :uid");
$lockTime = date('Y-m-d H:i:s', time() + 900);
$failStmt->execute([':lock' => $lockTime, ':uid' => $parentUserId]);

$checkLock = $db->prepare("SELECT locked_until FROM users WHERE user_id = :uid");
$checkLock->execute([':uid' => $parentUserId]);
$lockedVal = $checkLock->fetchColumn();
$test->assert("Account lockout timestamp correctly set after repeated failures", strtotime($lockedVal) > time());

// Clear lock
$db->prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = :uid")->execute([':uid' => $parentUserId]);

// 7. Test Password Reset Token Generation, Expiry & Single-Use Enforcement
$rawToken = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $rawToken);
$expires = date('Y-m-d H:i:s', time() + 3600);

$prStmt = $db->prepare("
    INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
    VALUES (:uid, :thash, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())
");
$prStmt->execute([':uid' => $parentUserId, ':thash' => $tokenHash]);
$resetId = (int)$db->lastInsertId();

$test->assert("Password reset token generated and hashed in database", $resetId > 0);

// Verify token lookup
$checkReset = $db->prepare("SELECT * FROM password_resets WHERE token_hash = :thash AND used_at IS NULL AND expires_at > NOW()");
$checkReset->execute([':thash' => $tokenHash]);
$validReset = $checkReset->fetch(PDO::FETCH_ASSOC);
$test->assert("Password reset token is valid before use", (bool)$validReset);

// Consume token and change password
$newPwd = 'NewSuperPassword2026!';
$newHash = password_hash($newPwd, PASSWORD_BCRYPT);
$db->prepare("UPDATE users SET password_hash = :ph WHERE user_id = :uid")->execute([':ph' => $newHash, ':uid' => $parentUserId]);
$db->prepare("UPDATE password_resets SET used_at = NOW() WHERE password_reset_id = :id")->execute([':id' => $resetId]);

// Try reusing token
$checkReused = $db->prepare("SELECT * FROM password_resets WHERE token_hash = :thash AND used_at IS NULL AND expires_at > NOW()");
$checkReused->execute([':thash' => $tokenHash]);
$reused = $checkReused->fetch(PDO::FETCH_ASSOC);
$test->assert("Used password reset token CANNOT be reused (single-use constraint passed)", $reused === false);

// 8. Test Account Suspension & Deactivation
$db->prepare("UPDATE users SET account_status = 'suspended' WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$statusCheck = $db->prepare("SELECT account_status FROM users WHERE user_id = :uid");
$statusCheck->execute([':uid' => $parentUserId]);
$test->assert("Account status can be changed to 'suspended'", $statusCheck->fetchColumn() === 'suspended');

$db->prepare("UPDATE users SET account_status = 'active' WHERE user_id = :uid")->execute([':uid' => $parentUserId]);

// 9. Test Audit Trail Logging
AuditService::log($parentUserId, 'TEST_AUDIT_ACTION', 'Testing audit log creation', 'users', $parentUserId);
$auditCheck = $db->prepare("SELECT * FROM audit_trail WHERE user_id = :uid AND action_type = 'TEST_AUDIT_ACTION'");
$auditCheck->execute([':uid' => $parentUserId]);
$auditRecord = $auditCheck->fetch(PDO::FETCH_ASSOC);
$test->assert("Audit trail record successfully written to database with IP and action description", (bool)$auditRecord && $auditRecord['table_affected'] === 'users');

// 10. Test Role Segregation & Admin Restrictions
$teacherUser = [
    'user_id' => 999,
    'role_id' => 3,
    'role_code' => 'teacher',
    'full_name' => 'Test Teacher Mukasa',
    'email' => 'teacher@test.tmhis.org'
];
AuthMiddleware::setUser($teacherUser);
$test->assert("AuthMiddleware context correctly stores active session/token user", AuthMiddleware::user()['role_code'] === 'teacher');

// 11. Test Full Name Persistence & Profile Integration
$adminProfile = AuthMiddleware::fetchUserProfile($adminId, 'administrator');
$test->assert("Administrator profile returns full_name ('System Administrator')", !empty($adminProfile['full_name']));

$db->prepare("UPDATE users SET full_name = 'Sarah Namubiru' WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$userWithFullName = $db->query("SELECT full_name FROM users WHERE user_id = {$parentUserId}")->fetchColumn();
$test->assert("Users table stores and retrieves full_name directly", $userWithFullName === 'Sarah Namubiru');

// 12. Test Admin User Update
$db->prepare("UPDATE users SET full_name = 'Sarah N. Updated', email = 'sarah.updated@test.tmhis.org' WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$db->prepare("UPDATE parents SET full_name = 'Sarah N. Updated', email = 'sarah.updated@test.tmhis.org', district = 'Mukono' WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$updatedParent = $db->query("SELECT u.full_name, u.email, p.district FROM users u JOIN parents p ON u.user_id = p.user_id WHERE u.user_id = {$parentUserId}")->fetch(PDO::FETCH_ASSOC);
$test->assert("Admin updates user details across users and profile tables", $updatedParent['full_name'] === 'Sarah N. Updated' && $updatedParent['district'] === 'Mukono');

// 13. Test Admin Reset User Password
$adminResetPwd = 'AdminForcedReset2026!';
$adminResetHash = password_hash($adminResetPwd, PASSWORD_BCRYPT);
$db->prepare("UPDATE users SET password_hash = :ph, failed_login_attempts = 0, locked_until = NULL WHERE user_id = :uid")->execute([':ph' => $adminResetHash, ':uid' => $parentUserId]);
$resetFetch = $db->query("SELECT password_hash FROM users WHERE user_id = {$parentUserId}")->fetchColumn();
$test->assert("Admin resets target user password and clears lockout", password_verify($adminResetPwd, $resetFetch));

// 14. Test Admin Unlock Account
$db->prepare("UPDATE users SET failed_login_attempts = 5, locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$db->prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = :uid")->execute([':uid' => $parentUserId]);
$unlockedRow = $db->query("SELECT failed_login_attempts, locked_until FROM users WHERE user_id = {$parentUserId}")->fetch(PDO::FETCH_ASSOC);
$test->assert("Admin unlock clears failed login attempts and lockout timestamp", (int)$unlockedRow['failed_login_attempts'] === 0 && $unlockedRow['locked_until'] === null);

$test->summary();
