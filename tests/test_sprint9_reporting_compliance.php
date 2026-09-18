<?php
/**
 * Sprint 9 Comprehensive Automated Integration & Verification Test Suite
 * Module 09: Reports, Analytics & MoES Curriculum Compliance Engine
 * 
 * Verifies:
 * 1. Database schema, tables, and views (compliance_benchmarks, report_snapshots, vw_district_compliance_summary)
 * 2. Learner Terminal Report Card API & Aggregation
 * 3. UNEB Division 1-4 & U Calculation & Strict F9 Demotion Logic
 * 4. Multi-Child Parent Consolidated Progress & Term Auditing
 * 5. Teacher Class Diagnostic Summary & Difficulty Heatmap
 * 6. MoES National/District Attainment Audit with Threshold Flags
 * 7. Benchmark Configuration Update API
 * 8. Reproducible Report Snapshot Storage & Retrieval (UUID)
 * 9. CSV Export Stream Output Validation
 * 10. Multi-Tenant Role-Based Access Isolation (RBAC)
 */

declare(strict_types=1);

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/AuditService.php';
require_once __DIR__ . '/../app/Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../app/Middleware/RoleMiddleware.php';
require_once __DIR__ . '/../app/Utils/Response.php';
require_once __DIR__ . '/../app/Utils/Validator.php';
require_once __DIR__ . '/../app/Controllers/ReportController.php';

use App\Config\Database;
use App\Controllers\ReportController;

$passed = 0;
$failed = 0;

function assertTest(string $title, bool $condition, string $details = ''): void {
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] {$title}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$title} - {$details}\n";
        $failed++;
    }
}

echo "========================================================================\n";
echo "TMHIS Sprint 9 — Reporting, Analytics & MoES Compliance Test Suite\n";
echo "========================================================================\n\n";

$db = Database::getConnection();

// --- TEST 1: Schema & Views Verification ---
echo "[1/8] Verifying Database Schema, Tables, and SQL Views...\n";
$tblBenchmarks = $db->query("SHOW TABLES LIKE 'compliance_benchmarks'")->fetchColumn();
assertTest("compliance_benchmarks table exists", $tblBenchmarks === 'compliance_benchmarks');

$tblSnapshots = $db->query("SHOW TABLES LIKE 'report_snapshots'")->fetchColumn();
assertTest("report_snapshots table exists", $tblSnapshots === 'report_snapshots');

$viewCheck = $db->query("SHOW TABLES LIKE 'vw_district_compliance_summary'")->fetchColumn();
assertTest("vw_district_compliance_summary view exists", $viewCheck === 'vw_district_compliance_summary');

$benchmarks = $db->query("SELECT * FROM compliance_benchmarks LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest("Default compliance benchmark exists", !empty($benchmarks) && isset($benchmarks['min_coverage_percentage']));

// --- TEST 2: Seed Test Data & Users ---
echo "\n[2/8] Setting Up Isolated Test Accounts, Classes & Learners...\n";

// 2.1 Create Class
$classCode = 'S9' . substr(uniqid(), -5);
$db->prepare("INSERT INTO classes (class_name, class_code, level, description, is_active, created_at) VALUES ('Primary Six Test', ?, 6, 'Test class for Sprint 9', 1, NOW())")
   ->execute([$classCode]);
$testClassId = (int)$db->lastInsertId();

// 2.2 Create Curriculum Officer User (role_id = 4)
$officerEmail = 'officer.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (4, 'Test S9 Officer', ?, 'hash', 'active', NOW())")
   ->execute([$officerEmail]);
$officerUserId = (int)$db->lastInsertId();

$officerPhone = '07' . rand(10000000, 99999999);
$db->prepare("INSERT INTO curriculum_officers (user_id, full_name, phone, email, registration_date, status, created_at) VALUES (?, 'Test S9 Officer', ?, ?, CURDATE(), 'active', NOW())")
   ->execute([$officerUserId, $officerPhone, $officerEmail]);
$officerId = (int)$db->lastInsertId();

// 2.3 Create Teacher User (role_id = 3)
$teacherEmail = 'teacher.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (3, 'Test S9 Teacher', ?, 'hash', 'active', NOW())")
   ->execute([$teacherEmail]);
$teacherUserId = (int)$db->lastInsertId();

$teacherPhone = '07' . rand(10000000, 99999999);
$db->prepare("INSERT INTO teachers (user_id, full_name, phone, email, registration_date, status, created_at) VALUES (?, 'Test S9 Teacher', ?, ?, CURDATE(), 'active', NOW())")
   ->execute([$teacherUserId, $teacherPhone, $teacherEmail]);
$teacherId = (int)$db->lastInsertId();

// 2.4 Create Parent User (role_id = 2)
$parentEmail = 'parent.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (2, 'Test S9 Parent', ?, 'hash', 'active', NOW())")
   ->execute([$parentEmail]);
$parentUserId = (int)$db->lastInsertId();

$parentPhone = '07' . rand(10000000, 99999999);
$db->prepare("INSERT INTO parents (user_id, full_name, phone, registration_date, district, created_at) VALUES (?, 'Test S9 Parent', ?, CURDATE(), 'Wakiso', NOW())")
   ->execute([$parentUserId, $parentPhone]);
$parentId = (int)$db->lastInsertId();

// 2.5 Create Learner 1 (role_id = 1)
$learner1Email = 'learner1.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (1, 'Kato Brian S9', ?, 'hash', 'active', NOW())")
   ->execute([$learner1Email]);
$learner1UserId = (int)$db->lastInsertId();

$db->prepare("INSERT INTO learners (parent_id, user_id, class_id, full_name, date_of_birth, gender, status, enrolment_date, created_at) VALUES (?, ?, ?, 'Kato Brian S9', '2014-05-12', 'male', 'active', CURDATE(), NOW())")
   ->execute([$parentId, $learner1UserId, $testClassId]);
$testLearnerId = (int)$db->lastInsertId();

// 2.6 Create Learner 2 (Child of same parent)
$learner2Email = 'learner2.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (1, 'Babirye Sarah S9', ?, 'hash', 'active', NOW())")
   ->execute([$learner2Email]);
$learner2UserId = (int)$db->lastInsertId();

$db->prepare("INSERT INTO learners (parent_id, user_id, class_id, full_name, date_of_birth, gender, status, enrolment_date, created_at) VALUES (?, ?, ?, 'Babirye Sarah S9', '2015-08-20', 'female', 'active', CURDATE(), NOW())")
   ->execute([$parentId, $learner2UserId, $testClassId]);
$learner2Id = (int)$db->lastInsertId();

// 2.7 Create Unrelated Parent for RBAC Testing
$strangerEmail = 'stranger.s9.' . time() . '@test.com';
$db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (2, 'Stranger Parent S9', ?, 'hash', 'active', NOW())")
   ->execute([$strangerEmail]);
$strangerUserId = (int)$db->lastInsertId();

$strangerPhone = '07' . rand(10000000, 99999999);
$db->prepare("INSERT INTO parents (user_id, full_name, phone, registration_date, district, created_at) VALUES (?, 'Stranger Parent S9', ?, CURDATE(), 'Gulu', NOW())")
   ->execute([$strangerUserId, $strangerPhone]);
$strangerParentId = (int)$db->lastInsertId();

assertTest("Isolated test fixtures created successfully", $testLearnerId > 0 && $parentId > 0 && $officerId > 0);

// --- TEST 3: Controller Invocation Subprocess Helper ---
echo "\n[3/8] Testing Learner Terminal Report API & UNEB Grading Engine...\n";

function runControllerSubprocess(string $method, array $sessionData, array $queryParams = [], array $postData = []): array {
    $script = __DIR__ . '/../scratch/test_report_runner.php';
    if (!is_dir(dirname($script))) {
        mkdir(dirname($script), 0777, true);
    }
    
    $payload = [
        'method' => $method,
        'session' => $sessionData,
        'query' => $queryParams,
        'post' => $postData
    ];
    
    file_put_contents($script, '<?php
    require_once __DIR__ . "/../app/Config/Database.php";
    require_once __DIR__ . "/../app/Services/AuditService.php";
    require_once __DIR__ . "/../app/Middleware/AuthMiddleware.php";
    require_once __DIR__ . "/../app/Middleware/RoleMiddleware.php";
    require_once __DIR__ . "/../app/Utils/Response.php";
    require_once __DIR__ . "/../app/Utils/Validator.php";
    require_once __DIR__ . "/../app/Controllers/ReportController.php";

    $input = json_decode(file_get_contents("php://stdin"), true);
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION = $input["session"] ?? [];
    if (!empty($input["session"])) {
        \App\Middleware\AuthMiddleware::setUser($input["session"]);
    }
    $_GET = $input["query"] ?? [];
    $_POST = $input["post"] ?? [];

    $ctrl = new \App\Controllers\ReportController();
    $method = $input["method"];
    
    // Call method
    if ($method === "getLearnerReport") {
        $id = isset($input["query"]["id"]) ? (int)$input["query"]["id"] : null;
        $ctrl->getLearnerReport($id);
    } elseif ($method === "getParentReport") {
        $ctrl->getParentReport();
    } elseif ($method === "getClassSummaryReport") {
        $ctrl->getClassSummaryReport();
    } elseif ($method === "getComplianceReport") {
        $ctrl->getComplianceReport();
    } elseif ($method === "getBenchmarks") {
        $ctrl->getBenchmarks();
    } elseif ($method === "updateBenchmarks") {
        $ctrl->updateBenchmarks();
    } elseif ($method === "exportReport") {
        $type = $input["query"]["type"] ?? "learner";
        $ctrl->exportReport($type);
    } elseif ($method === "getSnapshot") {
        $uuid = $input["query"]["uuid"] ?? "";
        $ctrl->getSnapshot($uuid);
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
    
    $json = json_decode($out, true);
    return ['raw' => $out, 'json' => $json, 'err' => $err];
}// 3.1 Parent viewing child terminal report
$resLearner = runControllerSubprocess('getLearnerReport', [
    'user_id' => $parentUserId,
    'role_code' => 'parent',
    'full_name' => 'Test S9 Parent'
], ['id' => $testLearnerId, 'term' => 1, 'year' => 2026]);

assertTest("Parent can fetch child terminal report card", !empty($resLearner['json']['success']) && $resLearner['json']['success'] === true, $resLearner['raw']);
assertTest("Report includes learner profile & class details", isset($resLearner['json']['data']['learner']['full_name']));
assertTest("Report includes subject breakdown", isset($resLearner['json']['data']['subjects']) && is_array($resLearner['json']['data']['subjects']));
assertTest("Report computes UNEB Division grade", isset($resLearner['json']['data']['summary']['uneb_division']));
assertTest("Report computes UNEB Total Aggregates", array_key_exists('total_exam_aggregates', $resLearner['json']['data']['summary'] ?? []));
assertTest("Report snapshot UUID is generated", !empty($resLearner['json']['data']['meta']['snapshot_uuid']));

$snapshotUuid = $resLearner['json']['data']['meta']['snapshot_uuid'] ?? '';

// --- TEST 4: UNEB Division Calculation Engine Validation ---
echo "\n[4/8] Validating UNEB Division Grade Rules & Demotion Engine...\n";

$reportCtrl = new ReportController();
$reflector = new ReflectionClass(ReportController::class);
$calcMethod = $reflector->getMethod('calculateUNEBDivision');
$calcMethod->setAccessible(true);

// Case 1: All D1s (Aggregate 4 => Division 1)
$subsDiv1 = [
    ['aggregates' => 1],
    ['aggregates' => 1],
    ['aggregates' => 1],
    ['aggregates' => 1]
];
$resDiv1 = $calcMethod->invoke($reportCtrl, $subsDiv1);
assertTest("Aggregates 4 (1,1,1,1) yields Division 1", $resDiv1['division'] === 'Division 1' && $resDiv1['total_aggregates'] === 4);

// Case 2: Aggregate 12 with pass grades => Division 1
$subsDiv1_b = [
    ['aggregates' => 2],
    ['aggregates' => 3],
    ['aggregates' => 3],
    ['aggregates' => 4]
];
$resDiv1_b = $calcMethod->invoke($reportCtrl, $subsDiv1_b);
assertTest("Aggregates 12 with good grades yields Division 1", $resDiv1_b['division'] === 'Division 1' && $resDiv1_b['total_aggregates'] === 12);

// Case 3: Aggregate 10 but with an F9 => Must be demoted (Strict UNEB F9 demotion rule)
$subsF9 = [
    ['aggregates' => 1],
    ['aggregates' => 1],
    ['aggregates' => 1],
    ['aggregates' => 9] // F9
];
$resF9 = $calcMethod->invoke($reportCtrl, $subsF9);
assertTest("F9 in any core subject demotes candidate from Division 1 to Division 3/4", $resF9['division'] !== 'Division 1' && $resF9['total_aggregates'] === 12, "Result: " . $resF9['division']);

// Case 4: Total aggregates > 32 => Division U
$subsFail = [
    ['aggregates' => 9],
    ['aggregates' => 9],
    ['aggregates' => 9],
    ['aggregates' => 9]
];
$resFail = $calcMethod->invoke($reportCtrl, $subsFail);
assertTest("Aggregates 36 (9,9,9,9) yields Division U", $resFail['division'] === 'Division U' && $resFail['total_aggregates'] === 36);

// --- TEST 5: Parent Multi-Child Consolidated Progress Report ---
echo "\n[5/8] Testing Parent Family Multi-Child Consolidated Progress Report...\n";
$resParent = runControllerSubprocess('getParentReport', [
    'user_id' => $parentUserId,
    'role_code' => 'parent',
    'full_name' => 'Test S9 Parent'
], ['term' => 1, 'year' => 2026]);

assertTest("Parent multi-child report endpoint responds successfully", !empty($resParent['json']['success']) && $resParent['json']['success'] === true, $resParent['raw']);
assertTest("Family report contains both children", isset($resParent['json']['data']['children']) && count($resParent['json']['data']['children']) >= 2, "Count: " . count($resParent['json']['data']['children'] ?? []));
assertTest("Family report contains summary metrics", isset($resParent['json']['data']['summary']['total_children']));

// --- TEST 6: Teacher Class Diagnostic & Difficulty Heatmap ---
echo "\n[6/8] Testing Teacher Class Diagnostic & Difficulty Heatmap...\n";
$resTeacher = runControllerSubprocess('getClassSummaryReport', [
    'user_id' => $teacherUserId,
    'role_code' => 'teacher',
    'full_name' => 'Test S9 Teacher'
], ['class_id' => $testClassId, 'term' => 1, 'year' => 2026]);

assertTest("Teacher class summary endpoint responds successfully", !empty($resTeacher['json']['success']) && $resTeacher['json']['success'] === true, $resTeacher['raw']);
assertTest("Teacher report includes class roster and metrics", isset($resTeacher['json']['data']['roster']));
assertTest("Teacher report includes struggling topic difficulty heatmap", isset($resTeacher['json']['data']['struggling_topics']));
assertTest("Teacher report includes at-risk learner count", isset($resTeacher['json']['data']['summary']['at_risk_count']));

// --- TEST 7: MoES Compliance & Attainment Engine ---
echo "\n[7/8] Testing MoES Compliance Engine & Benchmark Management...\n";

// 7.1 Curriculum Officer viewing national/district compliance
$resMoes = runControllerSubprocess('getComplianceReport', [
    'user_id' => $officerUserId,
    'role_code' => 'curriculum_officer',
    'full_name' => 'National Curriculum Officer'
], ['term' => 1, 'year' => 2026]);

assertTest("Curriculum Officer can access MoES compliance report", !empty($resMoes['json']['success']) && $resMoes['json']['success'] === true, $resMoes['raw']);
assertTest("MoES report includes national benchmarks", isset($resMoes['json']['data']['summary']['benchmark_targets']['min_coverage_percentage']));
assertTest("MoES report includes district/class sectors", isset($resMoes['json']['data']['district_sectors']));
assertTest("MoES report includes overall compliance status metric", isset($resMoes['json']['data']['summary']['overall_compliance_rate']));

// 7.2 Benchmark Configuration Updates
$resUpdateBench = runControllerSubprocess('updateBenchmarks', [
    'user_id' => $officerUserId,
    'role_code' => 'curriculum_officer',
    'full_name' => 'National Curriculum Officer'
], [], [
    'min_coverage_percentage' => 75.0,
    'min_pass_rate' => 55.0,
    'min_study_hours' => 30.0,
    'uneb_benchmarks' => ['p7_target_div1_percentage' => 40.0]
]);

assertTest("Curriculum Officer can update compliance quality benchmarks", !empty($resUpdateBench['json']['success']) && $resUpdateBench['json']['success'] === true, $resUpdateBench['raw']);

// Verify updated values in DB
$updatedBench = $db->query("SELECT * FROM compliance_benchmarks LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest("Updated benchmark persisted in database", (float)$updatedBench['min_coverage_percentage'] === 75.0 && (float)$updatedBench['min_pass_rate'] === 55.0);

// --- TEST 8: Reproducible Snapshots, CSV Export & Multi-Tenant RBAC Isolation ---
echo "\n[8/8] Testing Report Snapshots, CSV Exports & Multi-Tenant RBAC Security...\n";

// 8.1 Snapshot Retrieval by UUID
if (!empty($snapshotUuid)) {
    $resSnap = runControllerSubprocess('getSnapshot', [
        'user_id' => $parentUserId,
        'role_code' => 'parent',
        'full_name' => 'Test S9 Parent'
    ], ['uuid' => $snapshotUuid]);
    
    assertTest("Snapshot can be retrieved reproducibly by UUID", !empty($resSnap['json']['success']) && $resSnap['json']['data']['snapshot_uuid'] === $snapshotUuid, $resSnap['raw']);
} else {
    assertTest("Snapshot UUID was generated", false, "UUID was empty");
}

// 8.2 CSV Export
$resCsv = runControllerSubprocess('exportReport', [
    'user_id' => $parentUserId,
    'role_code' => 'parent',
    'full_name' => 'Test S9 Parent'
], ['type' => 'learner', 'id' => $testLearnerId, 'term' => 1, 'year' => 2026]);

assertTest("CSV export streams valid CSV headers and content", str_contains($resCsv['raw'], 'Subject') && str_contains($resCsv['raw'], 'Subject Code') && str_contains($resCsv['raw'], 'Progress %'), substr($resCsv['raw'], 0, 150));

// 8.3 Multi-Tenant RBAC Security: Learner attempting to view MoES compliance report
$resRbacLearner = runControllerSubprocess('getComplianceReport', [
    'user_id' => $learner1UserId,
    'role_code' => 'learner',
    'full_name' => 'Kato Brian S9'
], ['term' => 1, 'year' => 2026]);

assertTest("Learner cannot access MoES National Compliance Report (RBAC 403)", isset($resRbacLearner['json']['success']) && $resRbacLearner['json']['success'] === false, "Message: " . ($resRbacLearner['json']['message'] ?? 'none'));

// 8.4 Multi-Tenant RBAC Security: Stranger Parent attempting to view another parent's child report
$resRbacStranger = runControllerSubprocess('getLearnerReport', [
    'user_id' => $strangerUserId,
    'role_code' => 'parent',
    'full_name' => 'Stranger Parent S9'
], ['id' => $testLearnerId, 'term' => 1, 'year' => 2026]);

assertTest("Stranger parent cannot access unauthorized child terminal report (RBAC 404/403)", isset($resRbacStranger['json']['success']) && $resRbacStranger['json']['success'] === false, "Message: " . ($resRbacStranger['json']['message'] ?? 'none'));

// Clean up scratch runner
if (file_exists(__DIR__ . '/../scratch/test_report_runner.php')) {
    unlink(__DIR__ . '/../scratch/test_report_runner.php');
}

// Clean up test fixtures
$db->query("DELETE FROM report_snapshots WHERE generated_by IN ({$parentUserId}, {$officerUserId}, {$teacherUserId})");
$db->query("DELETE FROM audit_trail WHERE user_id IN ({$officerUserId}, {$teacherUserId}, {$parentUserId}, {$learner1UserId}, {$learner2UserId}, {$strangerUserId})");
$db->query("DELETE FROM learners WHERE learner_id IN ({$testLearnerId}, {$learner2Id})");
$db->query("DELETE FROM parents WHERE parent_id IN ({$parentId}, {$strangerParentId})");
$db->query("DELETE FROM teachers WHERE teacher_id = {$teacherId}");
$db->query("DELETE FROM curriculum_officers WHERE officer_id = {$officerId}");
$db->query("DELETE FROM users WHERE user_id IN ({$officerUserId}, {$teacherUserId}, {$parentUserId}, {$learner1UserId}, {$learner2UserId}, {$strangerUserId})");
$db->query("DELETE FROM classes WHERE class_id = {$testClassId}");

echo "\n========================================================================\n";
echo "Sprint 9 Test Summary: {$passed} Passed, {$failed} Failed\n";
echo "========================================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
