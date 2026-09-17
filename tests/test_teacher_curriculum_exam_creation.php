<?php
/**
 * Test Suite: Teacher & Curriculum Officer Exam Set Creation & Management
 */

require_once __DIR__ . '/../app/Config/Database.php';

$db = App\Config\Database::getConnection();

echo "=================================================================\n";
echo "=== TESTING TEACHER & CURRICULUM OFFICER EXAM SET CREATION   ===\n";
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
$admin = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'administrator' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$parent = $db->query("SELECT u.user_id, u.email, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'parent' LIMIT 1")->fetch(PDO::FETCH_ASSOC);

assertTest(!empty($teacher), "Teacher user exists: {$teacher['email']}");
assertTest(!empty($officer), "Curriculum Officer user exists: {$officer['email']}");

// Test Teacher Token
$teacherToken = generateToken((int)$teacher['user_id']);
$officerToken = generateToken((int)$officer['user_id']);
$parentToken = generateToken((int)$parent['user_id']);

function executeApi(string $url, string $method, array $data, string $token): array {
    $ch = curl_init("https://tmhis.strongsystemsltd.com" . $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token
    ]);
    if (!empty($data) && $method !== 'GET') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode($res, true) ?: $res];
}

// Test 1: Teacher creates exam set
$teacherSetPayload = [
    'class_id' => 5, // P5
    'academic_year' => '2026',
    'exam_type' => 'mid_term',
    'title' => 'Teacher Created Primary 5 Term 3 Mid-Term Examination 2026',
    'description' => 'Created by Teacher for mid-term evaluation.',
    'instructions' => 'Complete all papers within allotted time limit.',
    'release_date' => date('Y-m-d'),
    'status' => 'draft'
];

$tRes = executeApi('/api/officer/exams/sets', 'POST', $teacherSetPayload, $teacherToken);
assertTest($tRes['status'] === 201 && !empty($tRes['body']['data']['exam_set_id']), "Teacher successfully created exam set via POST /api/officer/exams/sets");
$teacherSetId = $tRes['body']['data']['exam_set_id'] ?? 0;

// Test 2: Teacher uploads exam paper to set
if ($teacherSetId > 0) {
    $tPaperPayload = [
        'subject_id' => 1,
        'paper_code' => 'ENG-P5',
        'title' => 'Primary 5 English Language Exam Paper 1',
        'duration_minutes' => 135,
        'total_marks' => 100,
        'paper_order' => 1,
        'pdf_file_path' => 'storage/uploads/exams/paper_p6_eng_t3_2026.pdf',
        'marking_guide_pdf_path' => 'storage/uploads/exams/guide_p6_eng_t3_2026.pdf'
    ];

    $tpRes = executeApi("/api/officer/exams/sets/$teacherSetId/papers", 'POST', $tPaperPayload, $teacherToken);
    assertTest($tpRes['status'] === 201, "Teacher successfully uploaded exam paper PDF to set");

    // Test 3: Teacher publishes exam set
    $pubRes = executeApi("/api/officer/exams/sets/$teacherSetId/publish", 'POST', [], $teacherToken);
    assertTest($pubRes['status'] === 200, "Teacher successfully published exam set");
}

// Test 4: Officer creates exam set
$officerSetPayload = [
    'class_id' => 6, // P6
    'academic_year' => '2026',
    'exam_type' => 'end_of_term',
    'title' => 'NCDC Official Primary 6 End of Term 3 Assessment 2026',
    'description' => 'Official national curriculum examination release.',
    'release_date' => date('Y-m-d'),
    'status' => 'published'
];

$oRes = executeApi('/api/officer/exams/sets', 'POST', $officerSetPayload, $officerToken);
assertTest($oRes['status'] === 201 && !empty($oRes['body']['data']['exam_set_id']), "Curriculum Officer successfully created exam set");
$officerSetId = $oRes['body']['data']['exam_set_id'] ?? 0;

// Test 5: Parent cannot create exam set (Forbidden 403)
$pRes = executeApi('/api/officer/exams/sets', 'POST', $officerSetPayload, $parentToken);
assertTest($pRes['status'] === 403, "Parent is correctly forbidden (403) from creating exam sets");

// Clean up test created sets
if ($teacherSetId > 0) {
    $db->exec("DELETE FROM exam_papers WHERE exam_set_id = $teacherSetId");
    $db->exec("DELETE FROM exam_sets WHERE exam_set_id = $teacherSetId");
}
if ($officerSetId > 0) {
    $db->exec("DELETE FROM exam_papers WHERE exam_set_id = $officerSetId");
    $db->exec("DELETE FROM exam_sets WHERE exam_set_id = $officerSetId");
}

echo "\n=================================================================\n";
echo "SUMMARY: Passed: $passCount, Failed: $failCount\n";
echo "=================================================================\n";
