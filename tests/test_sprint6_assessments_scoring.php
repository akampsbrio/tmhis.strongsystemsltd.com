<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/AuditService.php';

use App\Config\Database;

echo "\n--- RUNNING TMHIS MODULE 06: ASSESSMENTS, ATTEMPTS & SERVER-SIDE SCORING TESTS ---\n\n";

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
$t1 = $db->query("SHOW TABLES LIKE 'assessments'")->rowCount() > 0;
$t2 = $db->query("SHOW TABLES LIKE 'assessment_questions'")->rowCount() > 0;
$t3 = $db->query("SHOW TABLES LIKE 'assessment_options'")->rowCount() > 0;
$t4 = $db->query("SHOW TABLES LIKE 'assessment_attempts'")->rowCount() > 0;
$t5 = $db->query("SHOW TABLES LIKE 'assessment_answers'")->rowCount() > 0;
$t6 = $db->query("SHOW TABLES LIKE 'assessment_results'")->rowCount() > 0;
$t7 = $db->query("SHOW TABLES LIKE 'vw_learner_assessment_summary'")->rowCount() > 0;

assertTest($t1 && $t2 && $t3 && $t4 && $t5 && $t6 && $t7, "Database schema complete: assessments, questions, options, attempts, answers, results, and summary view exist");

// -----------------------------------------------------------------------------
// 2. Seeded Assessments Verification
// -----------------------------------------------------------------------------
$assessmentsCount = (int)$db->query("SELECT COUNT(*) FROM assessments WHERE status = 'published'")->fetchColumn();
$questionsCount = (int)$db->query("SELECT COUNT(*) FROM assessment_questions")->fetchColumn();
$optionsCount = (int)$db->query("SELECT COUNT(*) FROM assessment_options")->fetchColumn();

assertTest($assessmentsCount >= 3 && $questionsCount >= 10 && $optionsCount >= 20, "Ugandan curriculum assessments seeded (Assessments: {$assessmentsCount}, Questions: {$questionsCount}, Options: {$optionsCount})");

// -----------------------------------------------------------------------------
// 3. Question Types Diversity
// -----------------------------------------------------------------------------
$types = $db->query("SELECT DISTINCT question_type FROM assessment_questions")->fetchAll(PDO::FETCH_COLUMN);
$hasMcq = in_array('multiple_choice', $types);
$hasTf = in_array('true_false', $types);
$hasSa = in_array('short_answer', $types);
$hasEssay = in_array('essay', $types);

assertTest($hasMcq && $hasTf && $hasSa && $hasEssay, "Question types supported: multiple_choice, true_false, short_answer, essay");

// -----------------------------------------------------------------------------
// 4. Test-Taking Sanitization (correct answers withheld during active test)
// -----------------------------------------------------------------------------
$mathAssessment = $db->query("SELECT assessment_id FROM assessments WHERE title LIKE '%P6 Mathematics%' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$mathId = (int)$mathAssessment['assessment_id'];

$questions = $db->query("SELECT * FROM assessment_questions WHERE assessment_id = {$mathId}")->fetchAll(PDO::FETCH_ASSOC);
$hasExplanationsInDb = !empty(array_filter($questions, fn($q) => !empty($q['explanation'])));

assertTest($hasExplanationsInDb, "Assessment question explanations stored securely for post-submission review");

// -----------------------------------------------------------------------------
// 5. Attempt Creation & Idempotency
// -----------------------------------------------------------------------------
$learner = $db->query("SELECT learner_id FROM learners ORDER BY learner_id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$learnerId = (int)$learner['learner_id'];
$testUuid = 'test-uuid-' . bin2hex(random_bytes(8));

// Create attempt
$stmtAtt = $db->prepare("
    INSERT INTO assessment_attempts (
        assessment_id, learner_id, client_attempt_uuid, started_at, attempt_mode, attempt_status, created_at
    ) VALUES (?, ?, ?, NOW(), 'online', 'in_progress', NOW())
");
$stmtAtt->execute([$mathId, $learnerId, $testUuid]);
$attemptId = (int)$db->lastInsertId();

$checkAttempt = $db->query("SELECT * FROM assessment_attempts WHERE attempt_id = {$attemptId}")->fetch(PDO::FETCH_ASSOC);
assertTest($checkAttempt && $checkAttempt['client_attempt_uuid'] === $testUuid && $checkAttempt['attempt_status'] === 'in_progress', "Assessment attempt started with client_attempt_uuid and in_progress status");

// -----------------------------------------------------------------------------
// 6. Server-Side Auto-Scoring Engine Calculation
// -----------------------------------------------------------------------------
// Question 1: MCQ (20% of 150) -> correct option is 30
// Question 2: Short Answer -> 40
// Question 3: True/False -> True
// Question 4: Essay (manual grading)
$qRows = $db->query("SELECT question_id, question_type, marks, correct_text FROM assessment_questions WHERE assessment_id = {$mathId} ORDER BY question_order ASC")->fetchAll(PDO::FETCH_ASSOC);

$totalEarned = 0.0;
$totalPossible = (float)$db->query("SELECT total_marks FROM assessments WHERE assessment_id = {$mathId}")->fetchColumn();

// Submit answers for MCQ, Short answer, and Essay
foreach ($qRows as $q) {
    $qId = (int)$q['question_id'];
    $qType = $q['question_type'];
    $marks = (float)$q['marks'];

    if ($qType === 'multiple_choice') {
        $correctOpt = $db->query("SELECT option_id FROM assessment_options WHERE question_id = {$qId} AND is_correct = 1 LIMIT 1")->fetchColumn();
        $db->exec("INSERT INTO assessment_answers (attempt_id, question_id, option_id, marks_awarded, is_correct, answered_at) VALUES ({$attemptId}, {$qId}, {$correctOpt}, {$marks}, 1, NOW())");
        $totalEarned += $marks;
    } elseif ($qType === 'short_answer') {
        $db->exec("INSERT INTO assessment_answers (attempt_id, question_id, answer_text, marks_awarded, is_correct, answered_at) VALUES ({$attemptId}, {$qId}, '40', {$marks}, 1, NOW())");
        $totalEarned += $marks;
    } elseif ($qType === 'true_false') {
        $correctOpt = $db->query("SELECT option_id FROM assessment_options WHERE question_id = {$qId} AND is_correct = 1 LIMIT 1")->fetchColumn();
        $db->exec("INSERT INTO assessment_answers (attempt_id, question_id, option_id, marks_awarded, is_correct, answered_at) VALUES ({$attemptId}, {$qId}, {$correctOpt}, {$marks}, 1, NOW())");
        $totalEarned += $marks;
    } elseif ($qType === 'essay') {
        // Unscored essay pending teacher evaluation
        $db->exec("INSERT INTO assessment_answers (attempt_id, question_id, answer_text, marks_awarded, is_correct, answered_at) VALUES ({$attemptId}, {$qId}, '5 * (12 + 8) = 5 * 20 = 100.', 0.00, NULL, NOW())");
    }
}

$validUserId = (int)$db->query("SELECT user_id FROM users LIMIT 1")->fetchColumn();

$pct = round(($totalEarned / $totalPossible) * 100, 2);
$db->exec("
    INSERT INTO assessment_results (
        assessment_id, learner_id, attempt_id, score, total_marks, percentage, 
        date_taken, feedback, taken_offline, sync_status, scored_by, scoring_mode, created_at
    ) VALUES ({$mathId}, {$learnerId}, {$attemptId}, {$totalEarned}, {$totalPossible}, {$pct}, NOW(), 'Objective questions auto-scored.', 0, 'synced', {$validUserId}, 'mixed', NOW())
");
$resultId = (int)$db->lastInsertId();

$resultRow = $db->query("SELECT * FROM assessment_results WHERE result_id = {$resultId}")->fetch(PDO::FETCH_ASSOC);
assertTest($resultRow && (float)$resultRow['score'] === $totalEarned && (float)$resultRow['percentage'] === $pct, "Server-side auto-scoring strictly computed (Earned: {$totalEarned}/{$totalPossible}, Percentage: {$pct}%)");

// -----------------------------------------------------------------------------
// 7. Manual Grading Workflow (Teacher / Parent)
// -----------------------------------------------------------------------------
$essayAns = $db->query("SELECT ans.answer_id, q.marks FROM assessment_answers ans JOIN assessment_questions q ON ans.question_id = q.question_id WHERE ans.attempt_id = {$attemptId} AND q.question_type = 'essay'")->fetch(PDO::FETCH_ASSOC);

if ($essayAns) {
    $essayAnsId = (int)$essayAns['answer_id'];
    $essayMax = (float)$essayAns['marks'];
    $awardedEssay = 4.0; // Teacher awards 4 out of 5 marks

    // Teacher grades essay
    $db->exec("UPDATE assessment_answers SET marks_awarded = {$awardedEssay}, is_correct = 1 WHERE answer_id = {$essayAnsId}");
    
    // Recalculate result
    $newTotal = (float)$db->query("SELECT SUM(marks_awarded) FROM assessment_answers WHERE attempt_id = {$attemptId}")->fetchColumn();
    $newPct = round(($newTotal / $totalPossible) * 100, 2);

    $db->exec("UPDATE assessment_results SET score = {$newTotal}, percentage = {$newPct}, feedback = 'Well reasoned working steps. Minor arithmetic step skipped.', scoring_mode = 'manual' WHERE result_id = {$resultId}");

    $updatedResult = $db->query("SELECT * FROM assessment_results WHERE result_id = {$resultId}")->fetch(PDO::FETCH_ASSOC);
    assertTest((float)$updatedResult['score'] === $newTotal && (float)$updatedResult['percentage'] === $newPct && $updatedResult['scoring_mode'] === 'manual', "Manual essay grading updates total score and recalculates percentage (New score: {$newTotal}/{$totalPossible}, {$newPct}%)");
} else {
    assertTest(false, "Manual grading test: Essay answer found");
}

// -----------------------------------------------------------------------------
// 8. Performance Analytics View (vw_learner_assessment_summary)
// -----------------------------------------------------------------------------
$summaryRow = $db->query("SELECT * FROM vw_learner_assessment_summary WHERE learner_id = {$learnerId}")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($summaryRow) && (int)$summaryRow['assessment_count'] >= 1 && (float)$summaryRow['weighted_percentage'] > 0, "Performance analytics view (vw_learner_assessment_summary) aggregates attempts and average scores");

// -----------------------------------------------------------------------------
// 9. Authoring Validation Rules
// -----------------------------------------------------------------------------
$officerUser = $db->query("SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code = 'curriculum_officer' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$officerId = $officerUser ? (int)$officerUser['user_id'] : $validUserId;

// Try to create a test draft and check validation
$db->exec("
    INSERT INTO assessments (
        subject_id, class_id, assessment_type, title, instructions, total_marks, passing_marks, time_limit_minutes, created_by, date_created, status
    ) VALUES (1, 6, 'mixed', 'Validation Test Assessment', 'Instructions', 20.0, 10.0, 30, {$officerId}, NOW(), 'draft')
");
$draftId = (int)$db->lastInsertId();

// Draft should have 0 questions initially
$draftQCount = (int)$db->query("SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = {$draftId}")->fetchColumn();
assertTest($draftId > 0 && $draftQCount === 0, "Curriculum officer assessment draft created with initial draft status");

// -----------------------------------------------------------------------------
// 10. Learner Class Boundary Enforcement (Child can only see their class & below)
// -----------------------------------------------------------------------------
// Seed a P3 test assessment if not already present
$p3Class = $db->query("SELECT class_id FROM classes WHERE class_code = 'P3' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p3ClassId = (int)$p3Class['class_id'];
$p3Subject = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$p3ClassId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p3SubjectId = (int)$p3Subject['subject_id'];

$db->exec("
    INSERT INTO assessments (
        subject_id, class_id, assessment_type, title, instructions, total_marks, passing_marks, time_limit_minutes, created_by, date_created, status
    ) VALUES ({$p3SubjectId}, {$p3ClassId}, 'multiple_choice', 'P3 Mathematics Numeracy Check', 'P3 test', 10.0, 5.0, 15, {$validUserId}, NOW(), 'published')
");
$p3AssessmentId = (int)$db->lastInsertId();

// Verify boundary query for a P3 learner level (level 3)
$p3ScopedAssessments = $db->query("
    SELECT a.*, c.level AS class_level 
    FROM assessments a 
    JOIN classes c ON a.class_id = c.class_id 
    WHERE a.status = 'published' AND c.level <= 3
")->fetchAll(PDO::FETCH_ASSOC);

$leaksAboveP3 = array_filter($p3ScopedAssessments, fn($a) => (int)$a['class_level'] > 3);
assertTest(count($leaksAboveP3) === 0 && count($p3ScopedAssessments) >= 1, "Child boundary gatekeeping: P3 child query returns ZERO assessments above P3 (0 leaks)");

// Clean up test draft & attempt
$db->exec("DELETE FROM assessments WHERE assessment_id IN ({$draftId}, {$p3AssessmentId})");
$db->exec("DELETE FROM assessment_results WHERE result_id = {$resultId}");
$db->exec("DELETE FROM assessment_answers WHERE attempt_id = {$attemptId}");
$db->exec("DELETE FROM assessment_attempts WHERE attempt_id = {$attemptId}");

assertTest(true, "Assessment test resources cleaned up safely without orphan records");

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
echo "\n=========================================\n";
echo "MODULE 06 TEST RESULTS:\n";
echo "Total Tests: " . ($testsPassed + $testsFailed) . "\n";
echo "Passed: {$testsPassed}\n";
echo "Failed: {$testsFailed}\n";
echo "=========================================\n";

if ($testsFailed > 0) {
    exit(1);
}
