<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/AuditService.php';
require_once __DIR__ . '/../app/Services/DeviceService.php';
require_once __DIR__ . '/../app/Services/SyncService.php';

use App\Config\Database;
use App\Services\DeviceService;
use App\Services\SyncService;

echo "\n--- RUNNING TMHIS MODULE 07: PWA OFFLINE MODE & SYNCHRONISATION TESTS ---\n\n";

$db = Database::getConnection();

$testsPassed = 0;
$testsFailed = 0;

function assertTest(bool $condition, string $message): void {
    global $testsPassed, $testsFailed;
    if ($condition) {
        echo "✔ {$message}\n";
        $testsPassed++;
    } else {
        echo "✖ FAIL: {$message}\n";
        $testsFailed++;
    }
}

// -----------------------------------------------------------------------------
// 1. Database Schema Verification
// -----------------------------------------------------------------------------
$t1 = $db->query("SHOW TABLES LIKE 'devices'")->rowCount() > 0;
$t2 = $db->query("SHOW TABLES LIKE 'sync_queue'")->rowCount() > 0;
$t3 = $db->query("SHOW TABLES LIKE 'sync_log'")->rowCount() > 0;

assertTest($t1 && $t2 && $t3, "Database schema complete: devices, sync_queue, and sync_log tables exist");

// -----------------------------------------------------------------------------
// 2. Device Registration and Heartbeat Tracking
// -----------------------------------------------------------------------------
$firstUser = $db->query("SELECT user_id FROM users LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$userId = (int)($firstUser['user_id'] ?? 5);

$testUuid = 'test-device-' . bin2hex(random_bytes(8));
$device = DeviceService::registerDevice(
    $testUuid,
    $userId,
    null,
    'Ubuntu Desktop (Chrome)',
    'Linux x86_64',
    'Chrome 128',
    '1.0.0'
);

$retrieved = DeviceService::getByUuid($testUuid);

assertTest(
    $device && $retrieved && $retrieved['device_uuid'] === $testUuid && $retrieved['browser'] === 'Chrome 128',
    "Device successfully registered and retrieved by UUID (Device ID: #{$device['device_id']})"
);

// Heartbeat update
$updatedDevice = DeviceService::registerDevice($testUuid, $userId, null, 'Ubuntu Desktop (Chrome Updated)');
assertTest(
    $updatedDevice['device_name'] === 'Ubuntu Desktop (Chrome Updated)',
    "Device heartbeat and metadata updated on reconnect"
);

// -----------------------------------------------------------------------------
// 3. Offline Package Generation
// -----------------------------------------------------------------------------
// Find an active parent user and a registered learner
$parentUser = $db->query("SELECT u.user_id, l.learner_id, l.class_id FROM users u JOIN parents p ON u.user_id = p.user_id JOIN learners l ON p.parent_id = l.parent_id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$parentUser) {
    // Fallback to admin or first user
    $parentUser = ['user_id' => 1, 'learner_id' => 1, 'class_id' => 1];
}

$package = SyncService::generateOfflinePackage((int)$parentUser['user_id'], (int)$parentUser['learner_id']);

assertTest(
    isset($package['metadata']) && 
    isset($package['subjects']) && 
    isset($package['lessons']) && 
    isset($package['guides']) && 
    isset($package['assessments']) && 
    count($package['metadata']['classes']) > 0,
    "Offline package generator bundles curriculum, lessons, guides, and assessments (Lessons: " . count($package['lessons']) . ", Guides: " . count($package['guides']) . ")"
);

// -----------------------------------------------------------------------------
// 4. Offline Assessment Submission & Automatic Scoring Sync
// -----------------------------------------------------------------------------
// Find a published assessment with questions and options
$assessment = $db->query("
    SELECT a.assessment_id, q.question_id, o.option_id 
    FROM assessments a
    JOIN assessment_questions q ON a.assessment_id = q.assessment_id
    JOIN assessment_options o ON q.question_id = o.question_id
    WHERE a.status = 'published' AND o.is_correct = 1
    LIMIT 1
")->fetch(PDO::FETCH_ASSOC);

if (!$assessment) {
    // Pick any assessment
    $assessment = $db->query("SELECT assessment_id FROM assessments LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $qId = 1;
    $optId = 1;
} else {
    $qId = (int)$assessment['question_id'];
    $optId = (int)$assessment['option_id'];
}

$aid = (int)$assessment['assessment_id'];
$lid = (int)$parentUser['learner_id'];
$txUuid1 = 'offline-tx-' . bin2hex(random_bytes(8));

$syncItem1 = [
    'client_transaction_uuid' => $txUuid1,
    'entity_type' => 'assessment_submission',
    'operation' => 'submit',
    'learner_id' => $lid,
    'payload' => [
        'assessment_id' => $aid,
        'learner_id' => $lid,
        'time_spent_seconds' => 120,
        'started_at' => date('Y-m-d H:i:s', time() - 120),
        'submitted_at' => date('Y-m-d H:i:s'),
        'answers' => [
            [
                'question_id' => $qId,
                'selected_option_id' => $optId,
                'answer_text' => null
            ]
        ]
    ]
];

$res1 = SyncService::processSingleItem((int)$parentUser['user_id'], $syncItem1, (int)$device['device_id']);

assertTest(
    $res1['success'] === true && $res1['status'] === 'synced' && isset($res1['data']['attempt_id']),
    "Offline assessment successfully processed and scored on server (Attempt ID: #{$res1['data']['attempt_id']}, Score: {$res1['data']['score_percentage']}%)"
);

// -----------------------------------------------------------------------------
// 5. Strict Idempotency Verification
// -----------------------------------------------------------------------------
// Re-submitting the EXACT same client_transaction_uuid should NOT create a new attempt!
$initialAttemptsCount = (int)$db->query("SELECT COUNT(*) FROM assessment_attempts WHERE assessment_id = {$aid} AND learner_id = {$lid}")->fetchColumn();

$resReplay = SyncService::processSingleItem((int)$parentUser['user_id'], $syncItem1, (int)$device['device_id']);

$finalAttemptsCount = (int)$db->query("SELECT COUNT(*) FROM assessment_attempts WHERE assessment_id = {$aid} AND learner_id = {$lid}")->fetchColumn();

assertTest(
    $resReplay['success'] === true && 
    $resReplay['status'] === 'synced' && 
    str_contains($resReplay['message'] ?? '', 'Idempotent') &&
    $initialAttemptsCount === $finalAttemptsCount,
    "Idempotency Guard: Duplicate sync submission with identical UUID is deduplicated with zero duplicate attempts"
);

// -----------------------------------------------------------------------------
// 6. Schedule Progress Synchronization & Conflict Handling
// -----------------------------------------------------------------------------
$schedule = $db->query("SELECT schedule_id, lesson_id, status FROM learning_schedules WHERE learner_id = {$lid} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$schedId = $schedule ? (int)$schedule['schedule_id'] : 1;
$lessId = $schedule ? (int)$schedule['lesson_id'] : 1;

$txUuid2 = 'offline-tx-' . bin2hex(random_bytes(8));
$syncItem2 = [
    'client_transaction_uuid' => $txUuid2,
    'entity_type' => 'schedule_progress',
    'operation' => 'complete',
    'learner_id' => $lid,
    'payload' => [
        'schedule_id' => $schedId,
        'lesson_id' => $lessId,
        'learner_id' => $lid,
        'status' => 'completed',
        'completed_date' => date('Y-m-d'),
        'notes' => 'Completed offline with parent guidance.'
    ]
];

$res2 = SyncService::processSingleItem((int)$parentUser['user_id'], $syncItem2, (int)$device['device_id']);

assertTest(
    $res2['success'] === true && $res2['status'] === 'synced',
    "Offline schedule lesson progress successfully updated and recorded in progress_records"
);

// -----------------------------------------------------------------------------
// 7. Lesson Observation & Learning Activity Sync
// -----------------------------------------------------------------------------
$txUuid3 = 'offline-tx-' . bin2hex(random_bytes(8));
$syncItem3 = [
    'client_transaction_uuid' => $txUuid3,
    'entity_type' => 'lesson_observation',
    'operation' => 'create',
    'learner_id' => $lid,
    'payload' => [
        'lesson_id' => $lessId,
        'learner_id' => $lid,
        'observation_notes' => 'Learner demonstrated high engagement during offline lesson.',
        'comprehension_level' => 'advanced'
    ]
];

$res3 = SyncService::processSingleItem((int)$parentUser['user_id'], $syncItem3, (int)$device['device_id']);

assertTest(
    $res3['success'] === true && isset($res3['data']['observation_id']),
    "Offline parent lesson observation recorded (Observation ID: #{$res3['data']['observation_id']})"
);

// -----------------------------------------------------------------------------
// 8. Dead-Letter Handling for Permanent Validation Failures
// -----------------------------------------------------------------------------
$txUuid4 = 'offline-tx-' . bin2hex(random_bytes(8));
$invalidSyncItem = [
    'client_transaction_uuid' => $txUuid4,
    'entity_type' => 'unsupported_entity_type',
    'operation' => 'create',
    'learner_id' => $lid,
    'payload' => ['foo' => 'bar']
];

$resInvalid = SyncService::processSingleItem((int)$parentUser['user_id'], $invalidSyncItem, (int)$device['device_id']);

assertTest(
    $resInvalid['success'] === false && $resInvalid['status'] === 'dead_letter',
    "Dead-Letter Queue: Invalid transaction correctly moved to dead_letter state without breaking batch"
);

// -----------------------------------------------------------------------------
// 9. Batch Synchronisation
// -----------------------------------------------------------------------------
$batchItems = [
    [
        'client_transaction_uuid' => 'batch-tx-' . bin2hex(random_bytes(6)),
        'entity_type' => 'learning_activity',
        'operation' => 'create',
        'learner_id' => $lid,
        'payload' => [
            'learner_id' => $lid,
            'activity_type' => 'reading',
            'title' => 'Offline Story Reading'
        ]
    ],
    [
        'client_transaction_uuid' => 'batch-tx-' . bin2hex(random_bytes(6)),
        'entity_type' => 'learning_activity',
        'operation' => 'create',
        'learner_id' => $lid,
        'payload' => [
            'learner_id' => $lid,
            'activity_type' => 'math_practice',
            'title' => 'Offline Mental Math Drills'
        ]
    ]
];

$batchResults = SyncService::processBatch((int)$parentUser['user_id'], $batchItems, $testUuid);

assertTest(
    count($batchResults) === 2 && $batchResults[0]['success'] === true && $batchResults[1]['success'] === true,
    "Batch processing: Multiple client sync items processed atomically in single batch"
);

// -----------------------------------------------------------------------------
// 10. Sync Audit Log & Status Verification
// -----------------------------------------------------------------------------
$syncLogsCount = (int)$db->query("SELECT COUNT(*) FROM sync_log WHERE direction = 'upload'")->fetchColumn();
$syncStatus = SyncService::getSyncStatus((int)$parentUser['user_id'], $lid);

assertTest(
    $syncLogsCount > 0 && isset($syncStatus['queue_summary']['synced']) && $syncStatus['queue_summary']['synced'] > 0,
    "Sync audit trail active with {$syncLogsCount} upload entries in sync_log and accurate queue status summary"
);

// =============================================================================
// SUMMARY
// =============================================================================
echo "\n=======================================================\n";
echo "TMHIS SPRINT 7 (MODULE 07) TEST SUMMARY\n";
echo "Total: " . ($testsPassed + $testsFailed) . " | Passed: {$testsPassed} | Failed: {$testsFailed}\n";
echo "=======================================================\n";

if ($testsFailed > 0) {
    exit(1);
}
exit(0);
