<?php
declare(strict_types=1);

/**
 * TMHIS Sprint 10 — Notifications, Alerts & MoES Statutory Circulars Test Suite
 * 
 * Tests:
 * 1. Database schema, tables, and columns (notifications, notification_broadcasts)
 * 2. User notification querying & unread count calculation
 * 3. Marking individual and all notifications as read
 * 4. Dismissing notifications
 * 5. Multi-tenant RBAC isolation (cross-user notification tampering prevention)
 * 6. Curriculum Officer / Admin broadcast publishing engine with targeted roles & classes
 * 7. Broadcast history and delivery metrics
 * 8. Automated lesson pacing evaluation & reminder generator
 */

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/NotificationService.php';
require_once __DIR__ . '/../app/Controllers/NotificationController.php';

use App\Config\Database;
use App\Services\NotificationService;
use App\Controllers\NotificationController;

$db = Database::getConnection();

echo "========================================================================\n";
echo "TMHIS Sprint 10 — Notifications & MoES Statutory Circulars Test Suite\n";
echo "========================================================================\n\n";

$passed = 0;
$failed = 0;

function assertTest(string $title, bool $condition, string $detail = ''): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [PASS] $title\n";
    } else {
        $failed++;
        echo "  [FAIL] $title" . ($detail ? " - $detail" : "") . "\n";
    }
}

// Helper to run controller action in subprocess with simulated auth
function runControllerSubprocess(string $action, array $authUser, array $queryParams = [], array $body = []): array {
    $script = tempnam(sys_get_temp_dir(), 's10_test_');
    $payload = [
        'user' => $authUser,
        'query' => $queryParams,
        'body' => $body
    ];
    
    file_put_contents($script, '<?php
    declare(strict_types=1);
    require_once "' . __DIR__ . '/../app/Config/Database.php";
    require_once "' . __DIR__ . '/../app/Utils/Response.php";
    require_once "' . __DIR__ . '/../app/Utils/Router.php";
    require_once "' . __DIR__ . '/../app/Middleware/AuthMiddleware.php";
    require_once "' . __DIR__ . '/../app/Middleware/RoleMiddleware.php";
    require_once "' . __DIR__ . '/../app/Services/NotificationService.php";
    require_once "' . __DIR__ . '/../app/Controllers/NotificationController.php";

    $raw = file_get_contents("php://stdin");
    $data = json_decode($raw, true);
    
    // Mock user
    \App\Middleware\AuthMiddleware::setUser($data["user"]);
    
    $_GET = $data["query"] ?? [];
    $_POST = $data["body"] ?? [];
    
    $ctrl = new \App\Controllers\NotificationController();
    $action = "' . $action . '";
    
    try {
        if ($action === "markRead" || $action === "dismiss") {
            $ctrl->$action($data["query"] ?? []);
        } else {
            $ctrl->$action();
        }
    } catch (Throwable $e) {
        \App\Utils\Response::error($e->getMessage(), 500);
    }
    ');
    
    $descriptors = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ];
    
    $proc = proc_open("php " . escapeshellarg($script), $descriptors, $pipes);
    fwrite($pipes[0], json_encode($payload));
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    proc_close($proc);
    @unlink($script);
    
    $json = json_decode($out, true);
    return ['raw' => $out, 'json' => $json, 'err' => $err];
}

// --- TEST 1: Schema & DB Structure ---
echo "[1/7] Verifying Database Schema, Tables, and Columns...\n";
$tNotif = $db->query("SHOW TABLES LIKE 'notifications'")->fetchColumn();
assertTest("notifications table exists", $tNotif === 'notifications');

$tBroad = $db->query("SHOW TABLES LIKE 'notification_broadcasts'")->fetchColumn();
assertTest("notification_broadcasts table exists", $tBroad === 'notification_broadcasts');

$cols = $db->query("DESCRIBE notifications")->fetchAll(PDO::FETCH_COLUMN);
assertTest("notifications has action_url column", in_array('action_url', $cols, true));
assertTest("notifications has priority column", in_array('priority', $cols, true));

// --- TEST 2: Setup Test Accounts & Fixtures ---
echo "\n[2/7] Setting Up Test Accounts, Classes & Learners...\n";

// Parent 1
$db->exec("INSERT INTO users (role_id, email, password_hash, full_name, account_status) VALUES (2, 's10_parent1@tmhis.org', 'hash', 'Test S10 Parent 1', 'active') ON DUPLICATE KEY UPDATE full_name='Test S10 Parent 1'");
$parent1UserId = (int)$db->query("SELECT user_id FROM users WHERE email = 's10_parent1@tmhis.org'")->fetchColumn();
$db->exec("INSERT INTO parents (user_id, full_name, email, phone, district, registration_date) VALUES ($parent1UserId, 'Test S10 Parent 1', 's10_parent1@tmhis.org', '+256700010001', 'Wakiso', CURDATE()) ON DUPLICATE KEY UPDATE district='Wakiso'");
$parent1Id = (int)$db->query("SELECT parent_id FROM parents WHERE user_id = $parent1UserId")->fetchColumn();

// Parent 2 (Stranger)
$db->exec("INSERT INTO users (role_id, email, password_hash, full_name, account_status) VALUES (2, 's10_parent2@tmhis.org', 'hash', 'Test S10 Parent 2', 'active') ON DUPLICATE KEY UPDATE full_name='Test S10 Parent 2'");
$parent2UserId = (int)$db->query("SELECT user_id FROM users WHERE email = 's10_parent2@tmhis.org'")->fetchColumn();
$db->exec("INSERT INTO parents (user_id, full_name, email, phone, district, registration_date) VALUES ($parent2UserId, 'Test S10 Parent 2', 's10_parent2@tmhis.org', '+256700010002', 'Kampala', CURDATE()) ON DUPLICATE KEY UPDATE district='Kampala'");
$parent2Id = (int)$db->query("SELECT parent_id FROM parents WHERE user_id = $parent2UserId")->fetchColumn();

// Curriculum Officer
$db->exec("INSERT INTO users (role_id, email, password_hash, full_name, account_status) VALUES (4, 's10_officer@tmhis.org', 'hash', 'National Curriculum Officer S10', 'active') ON DUPLICATE KEY UPDATE full_name='National Curriculum Officer S10'");
$officerUserId = (int)$db->query("SELECT user_id FROM users WHERE email = 's10_officer@tmhis.org'")->fetchColumn();

// Class & Learner for Pacing Reminder Testing
$testClassId = (int)$db->query("SELECT class_id FROM classes LIMIT 1")->fetchColumn() ?: 1;
$db->exec("INSERT INTO learners (parent_id, class_id, full_name, date_of_birth, gender, enrolment_date, status) VALUES ($parent1Id, $testClassId, 'S10 Learner Child', '2016-05-10', 'female', CURDATE(), 'active')");
$testLearnerId = (int)$db->lastInsertId();

assertTest("Isolated test fixtures created successfully", $parent1UserId > 0 && $parent2UserId > 0 && $officerUserId > 0);

// --- TEST 3: Sending & Querying User Notifications ---
echo "\n[3/7] Testing Notification Dispatch & User Retrieval Engine...\n";
$service = new NotificationService($db);

$nId1 = $service->sendToUser($parent1UserId, 'reminder', 'Overdue Math Lesson', 'Please review Primary 4 Math Unit 2.', '#schedule', 'high', ['test' => 1]);
$nId2 = $service->sendToUser($parent1UserId, 'alert', 'Low Attendance Alert', 'Attendance is below expected target.', '#progress', 'urgent');
$nId3 = $service->sendToUser($parent1UserId, 'system', 'System Maintenance', 'System will be updated at midnight.', null, 'low');

assertTest("Notifications dispatched to User 1", $nId1 > 0 && $nId2 > 0 && $nId3 > 0);

$resList = runControllerSubprocess('getNotifications', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
]);

assertTest("Parent 1 can fetch their notifications", !empty($resList['json']['success']) && $resList['json']['success'] === true, $resList['raw']);
assertTest("Unread count accurately equals 3", ($resList['json']['data']['unread_count'] ?? 0) === 3);
assertTest("Total returned list contains 3 items", ($resList['json']['data']['total_returned'] ?? 0) === 3);

// --- TEST 4: Read State Transitions & Dismissal ---
echo "\n[4/7] Testing Read State Transitions & Dismissal...\n";

// 4.1 Mark single notification as read
$resRead = runControllerSubprocess('markRead', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
], ['id' => $nId1]);

assertTest("User can mark single notification as read", !empty($resRead['json']['success']) && $resRead['json']['success'] === true, $resRead['raw']);

// Check updated unread count
$resListAfter1 = runControllerSubprocess('getNotifications', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
]);
assertTest("Unread count decreased to 2", ($resListAfter1['json']['data']['unread_count'] ?? 0) === 2);

// 4.2 Mark all notifications as read
$resMarkAll = runControllerSubprocess('markAllRead', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
]);
assertTest("User can mark all notifications as read", !empty($resMarkAll['json']['success']) && $resMarkAll['json']['success'] === true);

$resListAfterAll = runControllerSubprocess('getNotifications', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
]);
assertTest("Unread count is now 0", ($resListAfterAll['json']['data']['unread_count'] ?? 0) === 0);

// 4.3 Dismiss notification
$resDismiss = runControllerSubprocess('dismiss', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
], ['id' => $nId3]);
assertTest("User can dismiss notification", !empty($resDismiss['json']['success']) && $resDismiss['json']['success'] === true);

// Verify dismissed item is excluded when status != 'all'
$resListActive = runControllerSubprocess('getNotifications', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
], ['status' => 'active']);
assertTest("Dismissed notification hidden from active list", ($resListActive['json']['data']['total_returned'] ?? 0) === 2);

// --- TEST 5: Multi-Tenant RBAC Isolation ---
echo "\n[5/7] Testing Multi-Tenant RBAC Security & Tampering Prevention...\n";

// Stranger parent attempts to mark User 1's notification as read
$resTamperRead = runControllerSubprocess('markRead', [
    'user_id' => $parent2UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 2'
], ['id' => $nId1]);
assertTest("Stranger parent cannot mark another user's notification as read (404/403)", empty($resTamperRead['json']['success']));

// Stranger parent attempts to dismiss User 1's notification
$resTamperDismiss = runControllerSubprocess('dismiss', [
    'user_id' => $parent2UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 2'
], ['id' => $nId2]);
assertTest("Stranger parent cannot dismiss another user's notification (404/403)", empty($resTamperDismiss['json']['success']));

// --- TEST 6: Curriculum Officer MoES Statutory Circular Broadcast Engine ---
echo "\n[6/7] Testing Curriculum Officer MoES Broadcast Engine...\n";

// 6.1 Broadcast circular to all parents
$resBroadcast = runControllerSubprocess('broadcast', [
    'user_id' => $officerUserId,
    'role_code' => 'curriculum_officer',
    'full_name' => 'National Curriculum Officer S10'
], [], [
    'title' => 'MoES National Term 1 Syllabus Circular',
    'message' => 'All homeschooling parents are advised to complete Term 1 assessments before week 12.',
    'broadcast_type' => 'circular',
    'target_role' => 'parent',
    'priority' => 'high',
    'action_url' => '#schedule'
]);

assertTest("Curriculum Officer can publish statutory broadcast", !empty($resBroadcast['json']['success']) && $resBroadcast['json']['success'] === true, $resBroadcast['raw']);
assertTest("Broadcast records recipients count (>0)", ($resBroadcast['json']['data']['recipients_count'] ?? 0) > 0);

// Verify Parent 1 received the circular
$resParent1Notifs = runControllerSubprocess('getNotifications', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
], ['type' => 'circular']);
assertTest("Targeted parent received the broadcast circular", !empty($resParent1Notifs['json']['data']['notifications']));

// 6.2 Fetch Broadcast History
$resHistory = runControllerSubprocess('getBroadcasts', [
    'user_id' => $officerUserId,
    'role_code' => 'curriculum_officer',
    'full_name' => 'National Curriculum Officer S10'
]);
assertTest("Curriculum Officer can retrieve broadcast history", !empty($resHistory['json']['success']) && is_array($resHistory['json']['data']));

// 6.3 Parent is forbidden from publishing broadcasts (RBAC 403)
$resParentBroadcast = runControllerSubprocess('broadcast', [
    'user_id' => $parent1UserId,
    'role_code' => 'parent',
    'full_name' => 'Test S10 Parent 1'
], [], [
    'title' => 'Unauthorized Circular',
    'message' => 'Should fail'
]);
assertTest("Parent is correctly forbidden (403) from broadcasting", empty($resParentBroadcast['json']['success']));

// --- TEST 7: Automated Lesson Pacing Reminders & Teardown ---
echo "\n[7/7] Testing Automated Pacing Evaluator & Cleaning Fixtures...\n";

$resPacing = runControllerSubprocess('evaluatePacing', [
    'user_id' => $officerUserId,
    'role_code' => 'curriculum_officer',
    'full_name' => 'National Curriculum Officer S10'
]);
assertTest("Automated pacing evaluation endpoint executes cleanly", !empty($resPacing['json']['success']) && $resPacing['json']['success'] === true, $resPacing['raw']);

// Teardown
$db->exec("DELETE FROM notifications WHERE user_id IN ($parent1UserId, $parent2UserId, $officerUserId)");
$db->exec("DELETE FROM notification_broadcasts WHERE sender_id = $officerUserId");
$db->exec("DELETE FROM learners WHERE learner_id = $testLearnerId");
$db->exec("DELETE FROM parents WHERE parent_id IN ($parent1Id, $parent2Id)");
$db->exec("DELETE FROM users WHERE user_id IN ($parent1UserId, $parent2UserId, $officerUserId)");

echo "\n========================================================================\n";
echo "Sprint 10 Test Summary: $passed Passed, $failed Failed\n";
echo "========================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
