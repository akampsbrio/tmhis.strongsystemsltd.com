<?php
/**
 * Test Suite: Aggregate Contributor Flag on Exam Papers & Evaluation
 */

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Controllers/ExamController.php';

use App\Config\Database;
use App\Controllers\ExamController;

$db = Database::getConnection();

echo "=================================================================\n";
echo "=== TESTING IS_AGGREGATE_CONTRIBUTOR FLAG & GRADING ENGINE    ===\n";
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

// 1. Test evaluateUnebDivision with non-contributing F9 subsidiary subject
$sampleMarksWithSubsidiaryF9 = [
    [
        'subject_code' => 'P6-ENG',
        'subject_name' => 'English Language',
        'raw_score' => 95,
        'max_marks' => 100,
        'grade_point' => 1,
        'grade_label' => 'D1',
        'is_aggregate_contributor' => 1,
        'is_absent' => 0
    ],
    [
        'subject_code' => 'P6-MTC',
        'subject_name' => 'Mathematics',
        'raw_score' => 92,
        'max_marks' => 100,
        'grade_point' => 1,
        'grade_label' => 'D1',
        'is_aggregate_contributor' => 1,
        'is_absent' => 0
    ],
    [
        'subject_code' => 'P6-SCI',
        'subject_name' => 'Integrated Science',
        'raw_score' => 90,
        'max_marks' => 100,
        'grade_point' => 1,
        'grade_label' => 'D1',
        'is_aggregate_contributor' => 1,
        'is_absent' => 0
    ],
    [
        'subject_code' => 'P6-SST',
        'subject_name' => 'Social Studies',
        'raw_score' => 94,
        'max_marks' => 100,
        'grade_point' => 1,
        'grade_label' => 'D1',
        'is_aggregate_contributor' => 1,
        'is_absent' => 0
    ],
    [
        'subject_code' => 'P6-CAPE',
        'subject_name' => 'Creative Arts & Physical Ed',
        'raw_score' => 25,
        'max_marks' => 100,
        'grade_point' => 9,
        'grade_label' => 'F9',
        'is_aggregate_contributor' => 0, // EXCLUDED from aggregate
        'is_absent' => 0
    ]
];

$res = ExamController::evaluateUnebDivision($sampleMarksWithSubsidiaryF9);

assertTest($res['total_aggregate'] === 4, "Total Aggregate is 4 (4 core D1s summed, CAPE F9 excluded)");
assertTest($res['division'] === 'I', "Division is Division I (CAPE F9 does NOT trigger demotion)");
assertTest($res['count_f9'] === 0, "Core aggregate F9 count is 0");
assertTest($res['aggregate_contributor_count'] === 4, "Aggregate contributor count is 4");
assertTest($res['total_raw_marks'] === 396.0, "Total raw marks includes all 5 subjects (396)");
assertTest($res['total_possible_marks'] === 500.0, "Total possible marks includes all 5 subjects (500)");

// 2. Test evaluateUnebDivision where a core paper gets F9
$sampleMarksWithCoreF9 = $sampleMarksWithSubsidiaryF9;
$sampleMarksWithCoreF9[3]['grade_point'] = 9; // SST gets F9 (1, 1, 1, 9)
$sampleMarksWithCoreF9[3]['grade_label'] = 'F9';

$resCoreF9 = ExamController::evaluateUnebDivision($sampleMarksWithCoreF9);
assertTest($resCoreF9['total_aggregate'] === 12, "Core [1,1,1,9] aggregate is 12");
assertTest($resCoreF9['division'] === 'II', "Core [1,1,1,9] demoted to Division II");
assertTest($resCoreF9['is_demoted'] === true, "is_demoted flag is true for Core F9");

// 3. Test Database schema has is_aggregate_contributor in exam_papers and exam_marks
$paperCols = $db->query("SHOW COLUMNS FROM exam_papers LIKE 'is_aggregate_contributor'")->fetchAll();
assertTest(!empty($paperCols), "exam_papers table contains is_aggregate_contributor column");

$markCols = $db->query("SHOW COLUMNS FROM exam_marks LIKE 'is_aggregate_contributor'")->fetchAll();
assertTest(!empty($markCols), "exam_marks table contains is_aggregate_contributor column");

echo "\n=================================================================\n";
echo "SUMMARY: Passed: $passCount, Failed: $failCount\n";
echo "=================================================================\n";
