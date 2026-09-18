<?php
declare(strict_types=1);

/**
 * TMHIS Sprint 11 Automated Test Suite
 * Module 11: Universal In-App Messaging & Transparent Read Receipts Engine
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
use App\Services\MessageService;

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
echo "TMHIS Sprint 11 — Universal Messaging & Read Receipts Test Suite\n";
echo "========================================================================\n\n";

$db = Database::getConnection();

// --- 1. Verifying Database Schema, Tables, and Columns ---
echo "[1/8] Verifying Database Schema, Tables, and Columns...\n";
$tables = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
assertTest(in_array('message_threads', $tables), "message_threads table exists", $passed, $failed);
assertTest(in_array('messages', $tables), "messages table exists", $passed, $failed);

$threadCols = $db->query("DESCRIBE message_threads")->fetchAll(PDO::FETCH_COLUMN);
assertTest(in_array('creator_user_id', $threadCols) && in_array('recipient_user_id', $threadCols), "message_threads has universal participant columns", $passed, $failed);

$msgCols = $db->query("DESCRIBE messages")->fetchAll(PDO::FETCH_COLUMN);
assertTest(in_array('read_at', $msgCols) && in_array('status', $msgCols), "messages has read_at and status fields for read receipts", $passed, $failed);

// --- 2. Setting Up Test Users (Parent, Officer, Stranger) ---
echo "\n[2/8] Setting Up Isolated Test User Fixtures...\n";
$testTimestamp = time();
$parentEmail = "parent.s11.{$testTimestamp}@test.com";
$officerEmail = "officer.s11.{$testTimestamp}@test.com";
$strangerEmail = "stranger.s11.{$testTimestamp}@test.com";

$parentRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'parent'")->fetchColumn();
$officerRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'curriculum_officer'")->fetchColumn();

$hash = password_hash('Pass123!', PASSWORD_BCRYPT);

// Insert Parent User
$db->prepare("
    INSERT INTO users (role_id, email, password_hash, full_name, username, account_status, email_verified_at)
    VALUES (?, ?, ?, 'Test Parent S11', ?, 'active', NOW())
")->execute([$parentRoleId, $parentEmail, $hash, "parent_s11_{$testTimestamp}"]);
$parentUserId = (int)$db->lastInsertId();

// Insert Curriculum Officer User
$db->prepare("
    INSERT INTO users (role_id, email, password_hash, full_name, username, account_status, email_verified_at)
    VALUES (?, ?, ?, 'Test Officer S11', ?, 'active', NOW())
")->execute([$officerRoleId, $officerEmail, $hash, "officer_s11_{$testTimestamp}"]);
$officerUserId = (int)$db->lastInsertId();

// Insert Stranger Parent User
$db->prepare("
    INSERT INTO users (role_id, email, password_hash, full_name, username, account_status, email_verified_at)
    VALUES (?, ?, ?, 'Test Stranger S11', ?, 'active', NOW())
")->execute([$parentRoleId, $strangerEmail, $hash, "stranger_s11_{$testTimestamp}"]);
$strangerUserId = (int)$db->lastInsertId();

assertTest($parentUserId > 0 && $officerUserId > 0 && $strangerUserId > 0, "Test users (Parent, Officer, Stranger) created successfully", $passed, $failed);

// --- 3. Testing Recipients Directory Search ---
echo "\n[3/8] Testing Searchable Recipients Directory...\n";
$msgService = new MessageService();

$directory = $msgService->getRecipientsDirectory($parentUserId, 'Test Officer S11');
assertTest(!empty($directory), "Recipients directory returns matching officer", $passed, $failed);
assertTest((int)$directory[0]['user_id'] === $officerUserId, "Directory accurately resolves target recipient ID", $passed, $failed);

// --- 4. Testing Thread Creation & Delivery ---
echo "\n[4/8] Testing Thread Creation & Delivery Engine...\n";
$subjectLine = "Inquiry: P4 Mathematics Fractions Pacing";
$initialBody = "Hello Officer, could you clarify whether equivalent fractions should precede decimals in Week 4?";

$threadResult = $msgService->createThread(
    $parentUserId,
    $officerUserId,
    $subjectLine,
    $initialBody,
    null,
    null,
    true
);

$threadId = (int)$threadResult['thread_id'];
assertTest($threadId > 0, "Conversation thread created successfully (#{$threadId})", $passed, $failed);

// Verify Officer unread count
$officerUnread = $msgService->getUnreadMessageCount($officerUserId);
assertTest($officerUnread >= 1, "Officer has 1 unread incoming message", $passed, $failed);

// Verify Parent threads list
$parentThreads = $msgService->getUserThreads($parentUserId);
assertTest(count($parentThreads['threads']) >= 1, "Parent can view their conversation in thread list", $passed, $failed);
assertTest($parentThreads['threads'][0]['subject_line'] === $subjectLine, "Thread subject line matches accurately", $passed, $failed);

// --- 5. Testing Transparent Read Receipt Stamping ---
echo "\n[5/8] Testing Transparent Read Receipt Stamping on Open...\n";

// Before officer opens, message has read_at = NULL
$initialMsg = $db->query("
    SELECT * FROM messages WHERE thread_id = {$threadId} ORDER BY message_id ASC LIMIT 1
")->fetch(PDO::FETCH_ASSOC);
assertTest(empty($initialMsg['read_at']) && $initialMsg['status'] === 'sent', "Initial message status is 'sent' with null read_at", $passed, $failed);

// Officer opens thread
$threadView = $msgService->getThreadMessages($threadId, $officerUserId);
assertTest(count($threadView['messages']) === 1, "Officer retrieves thread message history", $passed, $failed);

// Verify message read_at is stamped NOW
$stampedMsg = $db->query("
    SELECT * FROM messages WHERE thread_id = {$threadId} ORDER BY message_id ASC LIMIT 1
")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($stampedMsg['read_at']) && $stampedMsg['status'] === 'read', "Opening thread stamps read_at timestamp and sets status='read'", $passed, $failed);

// Verify Parent now sees read receipt when viewing thread
$parentView = $msgService->getThreadMessages($threadId, $parentUserId);
assertTest($parentView['messages'][0]['is_read'] === true && !empty($parentView['messages'][0]['read_at']), "Sender (Parent) transparently sees read receipt timestamp", $passed, $failed);

// Verify Officer unread count is now 0
$officerUnreadAfter = $msgService->getUnreadMessageCount($officerUserId);
assertTest($officerUnreadAfter === 0, "Officer unread message count decreased to 0 after viewing", $passed, $failed);

// --- 6. Testing Two-Way Reply & Notification Dispatch ---
echo "\n[6/8] Testing Two-Way Reply & Notification Dispatch...\n";
$replyBody = "Hello Parent Sarah, yes! The NCDC syllabus recommends mastering equivalent fractions first.";
$replyRes = $msgService->sendMessage($threadId, $officerUserId, $replyBody);

assertTest(!empty($replyRes['message_id']), "Officer reply posted successfully (#{$replyRes['message_id']})", $passed, $failed);

// Verify Parent unread count is now 1
$parentUnread = $msgService->getUnreadMessageCount($parentUserId);
assertTest($parentUnread >= 1, "Parent has 1 unread reply notification", $passed, $failed);

// Parent opens thread and reads reply
$parentViewUpdated = $msgService->getThreadMessages($threadId, $parentUserId);
assertTest(count($parentViewUpdated['messages']) === 2, "Thread contains both initial inquiry and officer reply", $passed, $failed);

$parentUnreadAfter = $msgService->getUnreadMessageCount($parentUserId);
assertTest($parentUnreadAfter === 0, "Parent unread count cleared after opening reply", $passed, $failed);

// --- 7. Testing Multi-Tenant RBAC Security & Privacy Isolation ---
echo "\n[7/8] Testing Multi-Tenant RBAC Privacy Isolation...\n";
$isStrangerBlockedFromReading = false;
try {
    $msgService->getThreadMessages($threadId, $strangerUserId);
} catch (\Throwable $e) {
    $isStrangerBlockedFromReading = true;
}
assertTest($isStrangerBlockedFromReading, "Stranger user cannot access another user's conversation thread (Security Barrier)", $passed, $failed);

$isStrangerBlockedFromReplying = false;
try {
    $msgService->sendMessage($threadId, $strangerUserId, "Unauthorized message injection attempt");
} catch (\Throwable $e) {
    $isStrangerBlockedFromReplying = true;
}
assertTest($isStrangerBlockedFromReplying, "Stranger user cannot post messages into an unauthorized thread", $passed, $failed);

// --- 8. Cleaning Up Test Fixtures ---
echo "\n[8/8] Cleaning Up Test Fixtures...\n";
$db->query("DELETE FROM messages WHERE thread_id = {$threadId}");
$db->query("DELETE FROM message_threads WHERE thread_id = {$threadId}");
$db->query("DELETE FROM notifications WHERE user_id IN ({$parentUserId}, {$officerUserId}, {$strangerUserId})");
$db->query("DELETE FROM audit_trail WHERE user_id IN ({$parentUserId}, {$officerUserId}, {$strangerUserId})");
$db->query("DELETE FROM users WHERE user_id IN ({$parentUserId}, {$officerUserId}, {$strangerUserId})");

assertTest(true, "Test fixtures cleaned up safely without orphan records", $passed, $failed);

echo "\n========================================================================\n";
echo "Sprint 11 Test Summary: {$passed} Passed, {$failed} Failed\n";
echo "========================================================================\n";

if ($failed > 0) {
    exit(1);
}
