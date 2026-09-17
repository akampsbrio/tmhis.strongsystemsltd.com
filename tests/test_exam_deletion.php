<?php
/**
 * Test Suite: Delete Exam Set & Subject Examination Papers
 */

require_once __DIR__ . '/../app/Config/Database.php';

use App\Config\Database;

$db = Database::getConnection();

echo "=================================================================\n";
echo "=== TESTING DELETE EXAM SET & SUBJECT PAPERS FEATURE          ===\n";
echo "=================================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest(bool $condition, string $desc): void {
    global $passCount, $failCount;
    if ($condition) {
        echo "[PASS] $desc\n";
        $passCount++;
    } else {
        echo "[FAIL] $desc\n";
        $failCount++;
    }
}

// 1. Generate Auth Token Helper
function generateToken(int $userId): string {
    $timestamp = time();
    $config = require __DIR__ . '/../app/Config/config.php';
    $secret = $config['security']['token_secret'];
    $hmac = hash_hmac('sha256', "{$userId}:{$timestamp}", $secret);
    return base64_encode("{$userId}:{$hmac}:{$timestamp}");
}

// 2. Fetch Users
$teacher = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'teacher' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$officer = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'curriculum_officer' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$parent = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'parent' LIMIT 1")->fetch(PDO::FETCH_ASSOC);

assertTest(!empty($teacher), "Teacher user exists: {$teacher['email']}");
assertTest(!empty($parent), "Parent user exists: {$parent['email']}");

$teacherToken = generateToken((int)$teacher['user_id']);
$parentToken = generateToken((int)$parent['user_id']);

function executeApi(string $url, string $method, array $data, string $token): array {
    $ch = curl_init("https://tmhis.strongsystemsltd.com" . $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $headers = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if (!empty($data)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [
        'code' => $code,
        'body' => json_decode($raw, true),
        'raw' => $raw
    ];
}

// 3. Create a temporary Exam Set via API as Teacher
$setPayload = [
    'class_id' => 1,
    'academic_year' => '2026',
    'exam_type' => 'mid_term',
    'title' => 'Deletion Test Exam Set 2026',
    'description' => 'Temporary test set for verifying single paper and set deletion',
    'release_date' => '2026-09-17',
    'status' => 'draft'
];

$createSetRes = executeApi('/api/officer/exams/sets', 'POST', $setPayload, $teacherToken);
assertTest($createSetRes['code'] === 201 || $createSetRes['code'] === 200, "Teacher created test exam set (HTTP {$createSetRes['code']})");

$testSetId = $createSetRes['body']['exam_set_id'] ?? $createSetRes['body']['data']['exam_set_id'] ?? null;
assertTest(!empty($testSetId), "Exam Set ID resolved: $testSetId");

// 4. Attach 2 Subject Papers to this Exam Set
$paper1Payload = [
    'subject_id' => 1,
    'paper_code' => 'DEL-ENG',
    'title' => 'Deletion Test English Paper 1',
    'duration_minutes' => 120,
    'total_marks' => 100,
    'paper_order' => 1,
    'is_aggregate_contributor' => 1,
    'pdf_file_path' => 'storage/uploads/del_eng.pdf'
];
$p1Res = executeApi("/api/officer/exams/sets/{$testSetId}/papers", 'POST', $paper1Payload, $teacherToken);
$p1Id = $p1Res['body']['exam_paper_id'] ?? $p1Res['body']['data']['exam_paper_id'] ?? null;
assertTest(!empty($p1Id), "Paper 1 attached with ID: $p1Id");

$paper2Payload = [
    'subject_id' => 2,
    'paper_code' => 'DEL-MTC',
    'title' => 'Deletion Test Mathematics Paper 2',
    'duration_minutes' => 135,
    'total_marks' => 100,
    'paper_order' => 2,
    'is_aggregate_contributor' => 1,
    'pdf_file_path' => 'storage/uploads/del_mtc.pdf'
];
$p2Res = executeApi("/api/officer/exams/sets/{$testSetId}/papers", 'POST', $paper2Payload, $teacherToken);
$p2Id = $p2Res['body']['exam_paper_id'] ?? $p2Res['body']['data']['exam_paper_id'] ?? null;
assertTest(!empty($p2Id), "Paper 2 attached with ID: $p2Id");

// 5. Test Parent Unauthorized Deletion Attempt (Expect 403)
$parentDelPaperRes = executeApi("/api/officer/exams/papers/{$p1Id}", 'DELETE', [], $parentToken);
assertTest($parentDelPaperRes['code'] === 403, "Parent blocked from deleting exam paper (HTTP 403 Forbidden)");

$parentDelSetRes = executeApi("/api/officer/exams/sets/{$testSetId}", 'DELETE', [], $parentToken);
assertTest($parentDelSetRes['code'] === 403, "Parent blocked from deleting exam set (HTTP 403 Forbidden)");

// 6. Teacher Deletes Paper 1
$teacherDelP1Res = executeApi("/api/officer/exams/papers/{$p1Id}", 'DELETE', [], $teacherToken);
assertTest($teacherDelP1Res['code'] === 200, "Teacher successfully deleted Paper 1 via DELETE API (HTTP 200)");

// Verify in Database that Paper 1 is gone and Paper 2 remains
$stmt = $db->prepare("SELECT COUNT(*) FROM exam_papers WHERE exam_paper_id = :id");
$stmt->execute([':id' => $p1Id]);
$p1Count = (int)$stmt->fetchColumn();

$stmt = $db->prepare("SELECT COUNT(*) FROM exam_papers WHERE exam_paper_id = :id");
$stmt->execute([':id' => $p2Id]);
$p2Count = (int)$stmt->fetchColumn();

assertTest($p1Count === 0, "Paper 1 (ID: $p1Id) removed from database");
assertTest($p2Count === 1, "Paper 2 (ID: $p2Id) remains intact");

// 7. Teacher Deletes Exam Set
$teacherDelSetRes = executeApi("/api/officer/exams/sets/{$testSetId}", 'DELETE', [], $teacherToken);
assertTest($teacherDelSetRes['code'] === 200, "Teacher successfully deleted Exam Set via DELETE API (HTTP 200)");

// Verify in Database that Exam Set and cascaded Paper 2 are gone
$stmt = $db->prepare("SELECT COUNT(*) FROM exam_sets WHERE exam_set_id = :id");
$stmt->execute([':id' => $testSetId]);
$setCount = (int)$stmt->fetchColumn();

$stmt = $db->prepare("SELECT COUNT(*) FROM exam_papers WHERE exam_set_id = :set_id");
$stmt->execute([':set_id' => $testSetId]);
$cascadedPapers = (int)$stmt->fetchColumn();

assertTest($setCount === 0, "Exam Set (ID: $testSetId) removed from database");
assertTest($cascadedPapers === 0, "Cascaded papers for deleted set completely cleaned up");

// 8. Attempt to delete non-existent set returns 404
$delNonExistent = executeApi("/api/officer/exams/sets/999999", 'DELETE', [], $teacherToken);
assertTest($delNonExistent['code'] === 404, "Attempting to delete non-existent set returns HTTP 404 Not Found");

echo "\n=================================================================\n";
echo "RESULTS: $passCount Passed, $failCount Failed\n";
echo "=================================================================\n";

if ($failCount > 0) {
    exit(1);
}
