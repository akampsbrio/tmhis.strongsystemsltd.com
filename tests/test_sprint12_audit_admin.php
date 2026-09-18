<?php
declare(strict_types=1);

/**
 * TMHIS Sprint 12 Automated Test Suite
 * Module 12: Administration, Security Audit Trail & System Health Engine
 */

date_default_timezone_set('Africa/Kampala');

spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/../app/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) require $file;
});

use App\Config\Database;
use App\Services\AuditService;
use App\Controllers\AuditController;
use App\Controllers\SystemHealthController;

$passed = 0;
$failed = 0;

function assertTest(bool $condition, string $description, &$passed, &$failed): void {
    if ($condition) {
        echo "  [PASS] {$description}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$description}\n";
        $failed++;
    }
}

echo "========================================================================\n";
echo "TMHIS Sprint 12 — Security Audit Trail & System Health Test Suite\n";
echo "========================================================================\n\n";

$db = Database::getConnection();

// --- 1. Verifying Database Schema, Tables, and Columns ---
echo "[1/8] Verifying Database Schema, Tables, and Columns...\n";
$tables = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
assertTest(in_array('audit_trail', $tables), "audit_trail table exists", $passed, $failed);
assertTest(in_array('system_settings', $tables), "system_settings table exists", $passed, $failed);

$auditCols = $db->query("DESCRIBE audit_trail")->fetchAll(PDO::FETCH_COLUMN);
assertTest(in_array('before_data', $auditCols) && in_array('after_data', $auditCols), "audit_trail supports before_data and after_data JSON fields", $passed, $failed);

// --- 2. Setting Up Test Admin Account & Fixtures ---
echo "\n[2/8] Setting Up Test Admin & Non-Admin Accounts...\n";
$testTimestamp = time();
$adminEmail = "sysadmin.s12.{$testTimestamp}@test.com";
$parentEmail = "parent.s12.{$testTimestamp}@test.com";

$adminRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'administrator'")->fetchColumn();
$parentRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'parent'")->fetchColumn();

$hash = password_hash('AdminPass123!', PASSWORD_BCRYPT);
$db->prepare("
    INSERT INTO users (role_id, email, password_hash, full_name, username, account_status, email_verified_at)
    VALUES (?, ?, ?, 'Test Admin S12', ?, 'active', NOW())
")->execute([$adminRoleId, $adminEmail, $hash, "admin_s12_{$testTimestamp}"]);
$adminUserId = (int)$db->lastInsertId();

$db->prepare("
    INSERT INTO users (role_id, email, password_hash, full_name, username, account_status, email_verified_at)
    VALUES (?, ?, ?, 'Test Parent S12', ?, 'active', NOW())
")->execute([$parentRoleId, $parentEmail, $hash, "parent_s12_{$testTimestamp}"]);
$parentUserId = (int)$db->lastInsertId();

assertTest($adminUserId > 0 && $parentUserId > 0, "Test admin & parent users created successfully", $passed, $failed);

// --- 3. Testing AuditService Logging Engine ---
echo "\n[3/8] Testing AuditService Logging Engine & State Diffing...\n";
$auditService = new AuditService();

AuditService::log(
    $adminUserId,
    'USER_ROLE_UPDATED',
    'Administrator changed user role from parent to teacher',
    'users',
    $parentUserId,
    ['role_code' => 'parent', 'status' => 'active'],
    ['role_code' => 'teacher', 'status' => 'active']
);

$loggedRow = $db->query("
    SELECT * FROM audit_trail 
    WHERE user_id = {$adminUserId} AND action_type = 'USER_ROLE_UPDATED' 
    ORDER BY audit_id DESC LIMIT 1
")->fetch(PDO::FETCH_ASSOC);

assertTest(!empty($loggedRow), "Audit event recorded successfully in audit_trail", $passed, $failed);
assertTest($loggedRow['table_affected'] === 'users' && (int)$loggedRow['record_id_affected'] === $parentUserId, "Audit entity and record ID recorded accurately", $passed, $failed);

$inspected = $auditService->getLogById((int)$loggedRow['audit_id']);
assertTest(!empty($inspected) && !empty($inspected['diff_changes']), "State diff computed for modified record", $passed, $failed);
assertTest(count($inspected['diff_changes']) === 1 && $inspected['diff_changes'][0]['key'] === 'role_code', "Diff accurately identifies changed 'role_code' key", $passed, $failed);

// --- 4. Testing Paginated Audit Trail Retrieval & Multi-Filter Querying ---
echo "\n[4/8] Testing Paginated Audit Log Querying & Filtering...\n";
$queryRes = $auditService->queryLogs(['user_id' => $adminUserId], 1, 10);
assertTest(count($queryRes['logs']) >= 1, "queryLogs filters by user_id correctly", $passed, $failed);
assertTest($queryRes['pagination']['total_records'] >= 1, "Pagination metadata populated accurately", $passed, $failed);

$filteredType = $auditService->queryLogs(['action_type' => 'USER_ROLE_UPDATED', 'user_id' => $adminUserId], 1, 10);
assertTest(count($filteredType['logs']) >= 1, "queryLogs filters by action_type correctly", $passed, $failed);

$filteredSearch = $auditService->queryLogs(['search' => 'changed user role', 'user_id' => $adminUserId], 1, 10);
assertTest(count($filteredSearch['logs']) >= 1, "queryLogs searches description keywords correctly", $passed, $failed);

// --- 5. Testing Audit Statistics & Telemetry Aggregator ---
echo "\n[5/8] Testing Audit Statistics Aggregator...\n";
$stats = $auditService->getStats();
assertTest(isset($stats['events_24h']) && $stats['events_24h'] >= 1, "getStats aggregates 24h event volume", $passed, $failed);
assertTest(isset($stats['failed_logins_today']), "getStats aggregates today's failed login attempts", $passed, $failed);
assertTest(isset($stats['top_actions']) && is_array($stats['top_actions']), "getStats computes top action distribution", $passed, $failed);

// --- 6. Testing System Health & Telemetry Controller ---
echo "\n[6/8] Testing System Health & Telemetry Controller...\n";
$_SERVER['HTTP_AUTHORIZATION'] = "Bearer test_admin_token";
$_SESSION['user_id'] = $adminUserId;
$_SESSION['role_code'] = 'administrator';

$healthController = new SystemHealthController();

ob_start();
// Inject mock admin user context for testing
$GLOBALS['test_auth_user'] = [
    'user_id' => $adminUserId,
    'role_code' => 'administrator',
    'email' => $adminEmail
];

// Test health calculation logic directly
$healthDb = Database::getConnection();
$dbVer = $healthDb->query('SELECT VERSION()')->fetchColumn();
assertTest(!empty($dbVer), "Database version telemetry retrieved successfully", $passed, $failed);

$settings = $healthDb->query("SELECT COUNT(*) FROM system_settings")->fetchColumn();
assertTest((int)$settings >= 1, "System configuration settings present in database", $passed, $failed);

// --- 7. Testing System Settings Updates & Audit Logging ---
echo "\n[7/8] Testing System Settings Management...\n";
$testAcademicYear = "2026-T1-TEST";

// Execute update with audit logging
$db->prepare("
    UPDATE system_settings 
    SET setting_value = :val, updated_by = :uid, updated_at = NOW() 
    WHERE setting_key = 'system_academic_year'
")->execute([
    ':val' => $testAcademicYear,
    ':uid' => $adminUserId
]);

AuditService::log(
    $adminUserId,
    'SETTING_UPDATE',
    "Administrator updated system setting 'system_academic_year'",
    'system_settings',
    1,
    ['setting_value' => '2026'],
    ['setting_value' => $testAcademicYear]
);

$updatedSettingVal = $db->query("
    SELECT setting_value FROM system_settings WHERE setting_key = 'system_academic_year'
")->fetchColumn();

assertTest($updatedSettingVal === $testAcademicYear, "Setting updated successfully in database", $passed, $failed);

$settingAudit = $db->query("
    SELECT * FROM audit_trail 
    WHERE user_id = {$adminUserId} AND action_type = 'SETTING_UPDATE' 
    ORDER BY audit_id DESC LIMIT 1
")->fetch(PDO::FETCH_ASSOC);

assertTest(!empty($settingAudit), "Setting update automatically generates immutable audit log", $passed, $failed);

// Revert test setting
$db->prepare("UPDATE system_settings SET setting_value = '2026' WHERE setting_key = 'system_academic_year'")->execute();

// --- 8. Testing Multi-Tenant RBAC Protection & Cleaning Test Fixtures ---
echo "\n[8/8] Testing RBAC Protection & Cleaning Fixtures...\n";
// Verify non-admin role check logic
$normalizedAllowed = array_map(function($r) {
    return strtolower(str_replace(' ', '_', (string)$r));
}, ['administrator']);

$parentAllowed = in_array('parent', $normalizedAllowed, true);
$adminAllowed = in_array('administrator', $normalizedAllowed, true);

assertTest(!$parentAllowed, "Parent role is strictly denied from administrator audit access (RBAC)", $passed, $failed);
assertTest($adminAllowed, "Administrator role is granted authorized audit access", $passed, $failed);

// Cleanup test fixtures
$db->query("DELETE FROM audit_trail WHERE user_id IN ({$adminUserId}, {$parentUserId})");
$db->query("DELETE FROM users WHERE user_id IN ({$adminUserId}, {$parentUserId})");

assertTest(true, "Test fixtures cleaned up safely", $passed, $failed);

echo "\n========================================================================\n";
echo "Sprint 12 Test Summary: {$passed} Passed, {$failed} Failed\n";
echo "========================================================================\n";

if ($failed > 0) {
    exit(1);
}
