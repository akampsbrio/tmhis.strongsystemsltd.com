<?php
/**
 * Test Suite: Skip Already Added Subjects in Exam Paper Upload
 */

require_once __DIR__ . '/../app/Config/Database.php';

use App\Config\Database;

$db = Database::getConnection();

echo "=================================================================\n";
echo "=== TESTING SKIP & PREVENT DUPLICATE SUBJECT EXAM PAPERS     ===\n";
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

$teacher = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'teacher' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($teacher), "Teacher user exists: {$teacher['email']}");

$teacherToken = generateToken((int)$teacher['user_id']);

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

// 2. Create Exam Set
$setPayload = [
    'class_id' => 1,
    'academic_year' => '2026',
    'exam_type' => 'end_of_term',
    'title' => 'Duplicate Prevention Test Set 2026',
    'description' => 'Verifying subject skipping logic',
    'release_date' => '2026-09-17',
    'status' => 'draft'
];
$setRes = executeApi('/api/officer/exams/sets', 'POST', $setPayload, $teacherToken);
$setId = $setRes['body']['exam_set_id'] ?? $setRes['body']['data']['exam_set_id'] ?? null;
assertTest(!empty($setId), "Created test exam set with ID: $setId");

// 3. Add English Paper (Subject 1)
$p1Res = executeApi("/api/officer/exams/sets/{$setId}/papers", 'POST', [
    'subject_id' => 1,
    'paper_code' => 'ENG-TEST',
    'title' => 'English Language Paper',
    'duration_minutes' => 120,
    'total_marks' => 100,
    'is_aggregate_contributor' => 1,
    'pdf_file_path' => 'storage/uploads/test_eng.pdf'
], $teacherToken);
$p1Id = $p1Res['body']['exam_paper_id'] ?? $p1Res['body']['data']['exam_paper_id'] ?? null;
assertTest(!empty($p1Id), "Added English paper (Subject 1) with ID: $p1Id");

// 4. Attempt to add duplicate English Paper (Subject 1) -> Must fail with 422
$dupRes = executeApi("/api/officer/exams/sets/{$setId}/papers", 'POST', [
    'subject_id' => 1,
    'paper_code' => 'ENG-DUP',
    'title' => 'Duplicate English Paper',
    'duration_minutes' => 120,
    'total_marks' => 100,
    'is_aggregate_contributor' => 1,
    'pdf_file_path' => 'storage/uploads/test_eng_dup.pdf'
], $teacherToken);

assertTest($dupRes['code'] === 422, "Adding duplicate subject returned HTTP 422 (Got: {$dupRes['code']})");
assertTest(strpos($dupRes['body']['message'] ?? '', 'already been added') !== false, "Error message explains that subject is already added: '{$dupRes['body']['message']}'");

// 5. Add distinct Mathematics Paper (Subject 2) -> Must succeed
$p2Res = executeApi("/api/officer/exams/sets/{$setId}/papers", 'POST', [
    'subject_id' => 2,
    'paper_code' => 'MTC-TEST',
    'title' => 'Mathematics Paper',
    'duration_minutes' => 135,
    'total_marks' => 100,
    'is_aggregate_contributor' => 1,
    'pdf_file_path' => 'storage/uploads/test_mtc.pdf'
], $teacherToken);
$p2Id = $p2Res['body']['exam_paper_id'] ?? $p2Res['body']['data']['exam_paper_id'] ?? null;
assertTest(!empty($p2Id), "Added distinct Mathematics paper (Subject 2) with ID: $p2Id");

// 6. Clean up test set
$delRes = executeApi("/api/officer/exams/sets/{$setId}", 'DELETE', [], $teacherToken);
assertTest($delRes['code'] === 200, "Cleaned up temporary test set");

echo "\n=================================================================\n";
echo "RESULTS: $passCount Passed, $failCount Failed\n";
echo "=================================================================\n";

if ($failCount > 0) {
    exit(1);
}
