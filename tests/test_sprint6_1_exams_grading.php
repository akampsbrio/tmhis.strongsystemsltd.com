<?php
declare(strict_types=1);

/**
 * Sprint 6.1 Annex Test Suite: Termly Exam Sets, PDF Releases,
 * UNEB 9-Point Scale & Division 1–4 Auto-Grading Engine.
 */

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Controllers/ExamController.php';

use App\Config\Database;
use App\Controllers\ExamController;

$passed = 0;
$failed = 0;

function assertTest(string $desc, bool $condition): void
{
    global $passed, $failed;
    if ($condition) {
        echo "[PASS] $desc\n";
        $passed++;
    } else {
        echo "[FAIL] $desc\n";
        $failed++;
    }
}

echo "=================================================================\n";
echo "=== SPRINT 6.1: EXAMS, PDFS & UNEB DIVISION GRADING TEST SUITE ===\n";
echo "=================================================================\n\n";

$db = Database::getConnection();

// -------------------------------------------------------------
// 1. Test UNEB Grade Scale Boundaries (D1 to F9)
// -------------------------------------------------------------
echo "--- 1. Testing UNEB 9-Grade Scale (D1 to F9) ---\n";

$g1 = ExamController::calculateUnebGrade(95.0);
assertTest("95% maps to D1 (Point 1)", $g1['grade_point'] === 1 && $g1['grade_label'] === 'D1');

$g2 = ExamController::calculateUnebGrade(82.5);
assertTest("82.5% maps to D2 (Point 2)", $g2['grade_point'] === 2 && $g2['grade_label'] === 'D2');

$g3 = ExamController::calculateUnebGrade(74.0);
assertTest("74% maps to C3 (Point 3)", $g3['grade_point'] === 3 && $g3['grade_label'] === 'C3');

$g4 = ExamController::calculateUnebGrade(63.0);
assertTest("63% maps to C4 (Point 4)", $g4['grade_point'] === 4 && $g4['grade_label'] === 'C4');

$g5 = ExamController::calculateUnebGrade(57.0);
assertTest("57% maps to C5 (Point 5)", $g5['grade_point'] === 5 && $g5['grade_label'] === 'C5');

$g6 = ExamController::calculateUnebGrade(51.0);
assertTest("51% maps to C6 (Point 6)", $g6['grade_point'] === 6 && $g6['grade_label'] === 'C6');

$g7 = ExamController::calculateUnebGrade(46.5);
assertTest("46.5% maps to P7 (Point 7)", $g7['grade_point'] === 7 && $g7['grade_label'] === 'P7');

$g8 = ExamController::calculateUnebGrade(41.0);
assertTest("41% maps to P8 (Point 8)", $g8['grade_point'] === 8 && $g8['grade_label'] === 'P8');

$g9 = ExamController::calculateUnebGrade(38.0);
assertTest("38% maps to F9 (Point 9)", $g9['grade_point'] === 9 && $g9['grade_label'] === 'F9');

// -------------------------------------------------------------
// 2. Test Division Rules & Demotions (Crucial 1,1,1,9 -> Div 2 test)
// -------------------------------------------------------------
echo "\n--- 2. Testing UNEB Division Determination & F9 Demotion Rules ---\n";

// Scenario A: Clean Division 1 (Agg 4) [1, 1, 1, 1]
$marksDiv1 = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 95, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 92, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 90, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 94, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
];
$resDiv1 = ExamController::evaluateUnebDivision($marksDiv1);
assertTest("Aggregate 4 with [1,1,1,1] receives Division I", $resDiv1['division'] === 'I' && $resDiv1['total_aggregate'] === 4 && !$resDiv1['is_demoted']);

// Scenario B: Clean Division 1 Boundary (Agg 12) [3, 3, 3, 3]
$marksDiv1Bound = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 75, 'max_marks' => 100, 'grade_point' => 3, 'grade_label' => 'C3'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 75, 'max_marks' => 100, 'grade_point' => 3, 'grade_label' => 'C3'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 75, 'max_marks' => 100, 'grade_point' => 3, 'grade_label' => 'C3'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 75, 'max_marks' => 100, 'grade_point' => 3, 'grade_label' => 'C3'],
];
$resDiv1Bound = ExamController::evaluateUnebDivision($marksDiv1Bound);
assertTest("Aggregate 12 with [3,3,3,3] (zero F9s) receives Division I", $resDiv1Bound['division'] === 'I' && $resDiv1Bound['total_aggregate'] === 12 && !$resDiv1Bound['is_demoted']);

// Scenario C: USER SCENARIO - Aggregate 12 with [1, 1, 1, 9] (1 F9 in SST)
// MUST BE DEMOTED TO DIVISION II
$marksF9Demotion = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 96, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 98, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 92, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 32, 'max_marks' => 100, 'grade_point' => 9, 'grade_label' => 'F9'],
];
$resF9Demotion = ExamController::evaluateUnebDivision($marksF9Demotion);
assertTest("User Scenario: [1, 1, 1, 9] (Agg 12 with 1 F9) is DEMOTED to Division II", 
    $resF9Demotion['division'] === 'II' && 
    $resF9Demotion['total_aggregate'] === 12 && 
    $resF9Demotion['is_demoted'] === true &&
    str_contains($resF9Demotion['demotion_reason'], 'demoted from Division 1 to Division 2')
);

// Scenario D: Clean Division 2 (Agg 16) [4, 4, 4, 4]
$marksDiv2 = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 65, 'max_marks' => 100, 'grade_point' => 4, 'grade_label' => 'C4'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 65, 'max_marks' => 100, 'grade_point' => 4, 'grade_label' => 'C4'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 65, 'max_marks' => 100, 'grade_point' => 4, 'grade_label' => 'C4'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 65, 'max_marks' => 100, 'grade_point' => 4, 'grade_label' => 'C4'],
];
$resDiv2 = ExamController::evaluateUnebDivision($marksDiv2);
assertTest("Aggregate 16 with [4,4,4,4] receives Division II", $resDiv2['division'] === 'II' && $resDiv2['total_aggregate'] === 16);

// Scenario E: 2 F9s (Failing both English and Math) -> Only 2 passes -> Demoted to Division IV
$marksFailEngMtc = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 30, 'max_marks' => 100, 'grade_point' => 9, 'grade_label' => 'F9'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 35, 'max_marks' => 100, 'grade_point' => 9, 'grade_label' => 'F9'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 95, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 95, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
];
$resFailEngMtc = ExamController::evaluateUnebDivision($marksFailEngMtc);
assertTest("Candidate with 2 F9s (2 passes, Agg 20) is demoted from Div 2 to Division IV", 
    $resFailEngMtc['division'] === 'IV' && 
    $resFailEngMtc['total_aggregate'] === 20 && 
    $resFailEngMtc['is_demoted'] === true
);

// Scenario F: Absent Paper -> Division X
$marksAbsent = [
    ['subject_code' => 'P6-ENG', 'subject_name' => 'English', 'raw_score' => 90, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-MTC', 'subject_name' => 'Mathematics', 'raw_score' => 0, 'max_marks' => 100, 'is_absent' => 1, 'grade_point' => 9, 'grade_label' => 'F9'],
    ['subject_code' => 'P6-SCI', 'subject_name' => 'Science', 'raw_score' => 90, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
    ['subject_code' => 'P6-SST', 'subject_name' => 'Social Studies', 'raw_score' => 90, 'max_marks' => 100, 'grade_point' => 1, 'grade_label' => 'D1'],
];
$resAbsent = ExamController::evaluateUnebDivision($marksAbsent);
assertTest("Candidate with absent paper receives Division X", $resAbsent['division'] === 'X');

// -------------------------------------------------------------
// 3. Test Database Integrity, Seeded Exam Sets & PDF Assets
// -------------------------------------------------------------
echo "\n--- 3. Testing Database Exam Sets, Papers & PDF Files ---\n";

$setsCount = (int)$db->query("SELECT COUNT(*) FROM exam_sets")->fetchColumn();
assertTest("Exam Sets table populated (Count >= 3)", $setsCount >= 3);

$papersCount = (int)$db->query("SELECT COUNT(*) FROM exam_papers")->fetchColumn();
assertTest("Exam Papers table populated (Count >= 12)", $papersCount >= 12);

$schemesCount = (int)$db->query("SELECT COUNT(*) FROM grading_schemes WHERE is_default = 1")->fetchColumn();
assertTest("Default UNEB Grading Scheme present in database", $schemesCount >= 1);

// Verify PDF files exist on disk
$p6PaperPdfs = $db->query("SELECT pdf_file_path, marking_guide_pdf_path FROM exam_papers WHERE paper_code LIKE 'P6%'")->fetchAll(PDO::FETCH_ASSOC);
$pdfsExist = true;
foreach ($p6PaperPdfs as $row) {
    if (!file_exists(__DIR__ . '/../' . $row['pdf_file_path']) || !file_exists(__DIR__ . '/../' . $row['marking_guide_pdf_path'])) {
        $pdfsExist = false;
        break;
    }
}
assertTest("All P6 Question Paper & Marking Guide PDF files exist in storage", $pdfsExist);

// -------------------------------------------------------------
// 4. Test View vw_learner_exam_summary and Report Card Query
// -------------------------------------------------------------
echo "\n--- 4. Testing View and Report Card Generation ---\n";

$vwCount = (int)$db->query("SELECT COUNT(*) FROM vw_learner_exam_summary")->fetchColumn();
assertTest("View vw_learner_exam_summary returns results", $vwCount >= 1);

$subRow = $db->query("SELECT * FROM vw_learner_exam_summary LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest("vw_learner_exam_summary includes division and aggregate", 
    !empty($subRow['division']) && isset($subRow['total_aggregate'])
);

echo "\n=================================================================\n";
echo "SUMMARY: Passed: $passed, Failed: $failed\n";
echo "=================================================================\n";

if ($failed > 0) {
    exit(1);
}
