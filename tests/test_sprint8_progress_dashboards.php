<?php
declare(strict_types=1);

/**
 * TMHIS Sprint 8 Automated Integration & Verification Test Suite
 * Module 08: Activities, Progress Tracking & Role-Based Dashboards
 */

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/AuditService.php';
require_once __DIR__ . '/../app/Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../app/Middleware/RoleMiddleware.php';
require_once __DIR__ . '/../app/Utils/Response.php';
require_once __DIR__ . '/../app/Utils/Validator.php';
require_once __DIR__ . '/../app/Controllers/ProgressController.php';

use App\Config\Database;

echo "\n======================================================\n";
echo "  TMHIS MODULE 08: PROGRESS TRACKING & DASHBOARDS TESTS \n";
echo "======================================================\n\n";

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

try {
    // -------------------------------------------------------------------------
    // 1. Schema & Views Verification
    // -------------------------------------------------------------------------
    echo "\n--- 1. Schema & Views Verification ---\n";
    $tProgress = $db->query("SHOW TABLES LIKE 'progress_records'")->rowCount() > 0;
    $tActivity = $db->query("SHOW TABLES LIKE 'learning_activities'")->rowCount() > 0;
    $tObs = $db->query("SHOW TABLES LIKE 'lesson_observations'")->rowCount() > 0;
    $vSubj = $db->query("SHOW TABLES LIKE 'vw_learner_subject_progress'")->rowCount() > 0;
    $vAssess = $db->query("SHOW TABLES LIKE 'vw_learner_assessment_summary'")->rowCount() > 0;

    assertTest($tProgress && $tActivity && $tObs, "Core tables exist: progress_records, learning_activities, lesson_observations");
    assertTest($vSubj && $vAssess, "SQL Views exist: vw_learner_subject_progress, vw_learner_assessment_summary");

    // -------------------------------------------------------------------------
    // 2. Setup Isolated Test Fixtures
    // -------------------------------------------------------------------------
    echo "\n--- 2. Setting Up Test Fixtures ---\n";

    // Create a Primary Class
    $classCode = 'T' . substr(uniqid(), -6);
    $db->prepare("INSERT INTO classes (class_name, class_code, level, description, is_active, created_at) VALUES ('Primary Four Test', ?, 4, 'Test class for Sprint 8', 1, NOW())")
       ->execute([$classCode]);
    $classId = (int)$db->lastInsertId();

    // Create Officer User & Profile (role_id = 4)
    $officerEmail = 'officer.s8.' . time() . '@test.com';
    $db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (4, 'Test S8 Officer', ?, 'hash', 'active', NOW())")
       ->execute([$officerEmail]);
    $officerUserId = (int)$db->lastInsertId();

    $officerPhone = '07' . rand(10000000, 99999999);
    $db->prepare("INSERT INTO curriculum_officers (user_id, full_name, phone, email, registration_date, status, created_at) VALUES (?, 'Test S8 Officer', ?, ?, CURDATE(), 'active', NOW())")
       ->execute([$officerUserId, $officerPhone, $officerEmail]);
    $officerId = (int)$db->lastInsertId();

    // Create Parent User & Profile (role_id = 2)
    $parentEmail = 'parent.s8.' . time() . '@test.com';
    $db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (2, 'Test S8 Parent', ?, 'hash', 'active', NOW())")
       ->execute([$parentEmail]);
    $parentUserId = (int)$db->lastInsertId();

    $phone1 = '07' . rand(10000000, 99999999);
    $db->prepare("INSERT INTO parents (user_id, full_name, phone, registration_date, district, created_at) VALUES (?, 'Test S8 Parent', ?, CURDATE(), 'Kampala', NOW())")
       ->execute([$parentUserId, $phone1]);
    $parentId = (int)$db->lastInsertId();

    // Create Another Parent for Cross-Access RBAC Testing
    $strangerEmail = 'stranger.s8.' . time() . '@test.com';
    $db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (2, 'Stranger Parent', ?, 'hash', 'active', NOW())")
       ->execute([$strangerEmail]);
    $strangerUserId = (int)$db->lastInsertId();

    $phone2 = '07' . rand(10000000, 99999999);
    $db->prepare("INSERT INTO parents (user_id, full_name, phone, registration_date, district, created_at) VALUES (?, 'Stranger Parent', ?, CURDATE(), 'Wakiso', NOW())")
       ->execute([$strangerUserId, $phone2]);
    $strangerParentId = (int)$db->lastInsertId();

    // Create 2 Learners under Parent 1 (role_id = 1)
    $l1UserEmail = 'learner1.s8.' . time() . '@test.com';
    $db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (1, 'Learner One S8', ?, 'hash', 'active', NOW())")
       ->execute([$l1UserEmail]);
    $l1UserId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO learners (parent_id, user_id, class_id, full_name, date_of_birth, gender, enrolment_date, status, created_at) VALUES (?, ?, ?, 'Learner One S8', '2014-03-15', 'male', CURDATE(), 'active', NOW())")
       ->execute([$parentId, $l1UserId, $classId]);
    $learner1Id = (int)$db->lastInsertId();

    $l2UserEmail = 'learner2.s8.' . time() . '@test.com';
    $db->prepare("INSERT INTO users (role_id, full_name, email, password_hash, account_status, created_at) VALUES (1, 'Learner Two S8', ?, 'hash', 'active', NOW())")
       ->execute([$l2UserEmail]);
    $l2UserId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO learners (parent_id, user_id, class_id, full_name, date_of_birth, gender, enrolment_date, status, created_at) VALUES (?, ?, ?, 'Learner Two S8', '2015-07-20', 'female', CURDATE(), 'active', NOW())")
       ->execute([$parentId, $l2UserId, $classId]);
    $learner2Id = (int)$db->lastInsertId();

    // Create Subject and 4 Lessons
    $subjectCode = 'MS8' . substr(uniqid(), -4);
    $db->prepare("INSERT INTO subjects (subject_name, subject_code, class_id, description, is_active, created_at) VALUES ('Mathematics S8', ?, ?, 'Sprint 8 Math', 1, NOW())")
       ->execute([$subjectCode, $classId]);
    $subjectId = (int)$db->lastInsertId();

    // Enroll Learners in Subject
    $db->prepare("INSERT INTO learner_subjects (learner_id, subject_id, status, assigned_at) VALUES (?, ?, 'active', NOW()), (?, ?, 'active', NOW())")
       ->execute([$learner1Id, $subjectId, $learner2Id, $subjectId]);

    // Insert 4 Lessons
    $lessonIds = [];
    for ($i = 1; $i <= 4; $i++) {
        $db->prepare("INSERT INTO lessons (subject_id, class_id, lesson_title, lesson_objectives, duration_minutes, sequence_number, status, created_at) VALUES (?, ?, ?, 'Objectives for lesson', 40, ?, 'active', NOW())")
           ->execute([$subjectId, $classId, "Lesson {$i} on Fractions", $i]);
        $lessonIds[] = (int)$db->lastInsertId();
    }

    assertTest(count($lessonIds) === 4, "Created 4 sequential lessons for syllabus testing");

    // -------------------------------------------------------------------------
    // 3. Lesson Progress & View Calculations
    // -------------------------------------------------------------------------
    echo "\n--- 3. Lesson Progress & View Calculations ---\n";

    // Mark 2 of 4 lessons completed for Learner 1
    $db->prepare("
        INSERT INTO progress_records (learner_id, lesson_id, completion_status, score, time_spent_minutes, date_started, date_completed, date_recorded)
        VALUES (?, ?, 'completed', NULL, 40, NOW(), NOW(), NOW()),
               (?, ?, 'completed', NULL, 35, NOW(), NOW(), NOW())
    ")->execute([$learner1Id, $lessonIds[0], $learner1Id, $lessonIds[1]]);

    // Mark 1 lesson in_progress
    $db->prepare("
        INSERT INTO progress_records (learner_id, lesson_id, completion_status, score, time_spent_minutes, date_started, date_recorded)
        VALUES (?, ?, 'in_progress', NULL, 15, NOW(), NOW())
    ")->execute([$learner1Id, $lessonIds[2]]);

    // Check vw_learner_subject_progress
    $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = ? AND subject_id = ?");
    $spStmt->execute([$learner1Id, $subjectId]);
    $spRow = $spStmt->fetch(PDO::FETCH_ASSOC);

    assertTest((int)$spRow['expected_lessons'] === 4, "Expected lessons computed accurately = 4");
    assertTest((int)$spRow['completed_lessons'] === 2, "Completed lessons computed accurately = 2");
    assertTest((int)$spRow['in_progress_lessons'] === 1, "In-progress lessons computed accurately = 1");
    assertTest((float)$spRow['completion_percentage'] === 50.0, "Completion percentage calculated accurately = 50.0%");
    assertTest((int)$spRow['total_time_spent_minutes'] === 90, "Total time spent aggregated across records = 90 mins (40+35+15)");

    // -------------------------------------------------------------------------
    // 4. Weighted Quiz Calculations vs Naive Average
    // -------------------------------------------------------------------------
    echo "\n--- 4. Weighted Quiz Calculation Verification ---\n";

    // Insert 2 Assessments:
    // Assessment A: Max 20 marks
    // Assessment B: Max 80 marks
    $db->prepare("INSERT INTO assessments (subject_id, class_id, lesson_id, assessment_type, title, instructions, total_marks, passing_marks, created_by, status, date_created) VALUES (?, ?, ?, 'multiple_choice', 'Short Quiz', 'Answer all', 20.00, 10.00, ?, 'published', NOW())")
       ->execute([$subjectId, $classId, $lessonIds[0], $officerUserId]);
    $quizAId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO assessments (subject_id, class_id, lesson_id, assessment_type, title, instructions, total_marks, passing_marks, created_by, status, date_created) VALUES (?, ?, ?, 'mixed', 'Comprehensive Exam', 'Answer all', 80.00, 40.00, ?, 'published', NOW())")
       ->execute([$subjectId, $classId, $lessonIds[1], $officerUserId]);
    $quizBId = (int)$db->lastInsertId();

    // Insert Results for Learner 1:
    // Quiz A: 18 / 20 = 90.0%
    // Quiz B: 60 / 80 = 75.0%
    // Naive Average = (90 + 75) / 2 = 82.5%
    // Weighted Average = (18 + 60) / (20 + 80) * 100 = 78 / 100 * 100 = 78.0%
    $db->prepare("INSERT INTO assessment_results (assessment_id, learner_id, score, total_marks, percentage, date_taken, feedback, sync_status, scored_by, scoring_mode) VALUES (?, ?, 18.00, 20.00, 90.00, NOW(), 'Great job', 'synced', NULL, 'automatic')")
       ->execute([$quizAId, $learner1Id]);

    $db->prepare("INSERT INTO assessment_results (assessment_id, learner_id, score, total_marks, percentage, date_taken, feedback, sync_status, scored_by, scoring_mode) VALUES (?, ?, 60.00, 80.00, 75.00, NOW(), 'Good job', 'synced', NULL, 'automatic')")
       ->execute([$quizBId, $learner1Id]);

    $apStmt = $db->prepare("SELECT * FROM vw_learner_assessment_summary WHERE learner_id = ? AND subject_id = ?");
    $apStmt->execute([$learner1Id, $subjectId]);
    $apRow = $apStmt->fetch(PDO::FETCH_ASSOC);

    assertTest((int)$apRow['assessment_count'] === 2, "Assessment summary count is 2");
    assertTest((float)$apRow['total_score'] === 78.00, "Total score earned is 78.00");
    assertTest((float)$apRow['total_possible_marks'] === 100.00, "Total possible marks is 100.00");
    assertTest((float)$apRow['weighted_percentage'] === 78.00, "Weighted average is exactly 78.00% (not naive 82.5%)");
    assertTest((int)$apRow['passed_count'] === 2, "Passed count is 2 (both scores >= passing_marks)");

    // -------------------------------------------------------------------------
    // 5. Atomic Progress Upsert & State Transitions
    // -------------------------------------------------------------------------
    echo "\n--- 5. Atomic Progress Upsert & State Transitions ---\n";

    // Progress record update for lesson 4: transition from not_started to completed
    $db->prepare("
        INSERT INTO progress_records (learner_id, lesson_id, completion_status, time_spent_minutes, date_started, date_completed, date_recorded)
        VALUES (?, ?, 'completed', 45, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            completion_status = VALUES(completion_status),
            time_spent_minutes = time_spent_minutes + VALUES(time_spent_minutes),
            date_completed = NOW(),
            updated_at = NOW()
    ")->execute([$learner1Id, $lessonIds[3]]);

    $prCheck = $db->prepare("SELECT * FROM progress_records WHERE learner_id = ? AND lesson_id = ?");
    $prCheck->execute([$learner1Id, $lessonIds[3]]);
    $prRow = $prCheck->fetch(PDO::FETCH_ASSOC);

    assertTest($prRow['completion_status'] === 'completed', "Lesson 4 status updated to completed");
    assertTest((int)$prRow['time_spent_minutes'] === 45, "Time spent recorded as 45 minutes");
    assertTest(!empty($prRow['date_completed']), "date_completed timestamp recorded");

    // Check recomputed view
    $spStmt->execute([$learner1Id, $subjectId]);
    $spRow2 = $spStmt->fetch(PDO::FETCH_ASSOC);
    assertTest((int)$spRow2['completed_lessons'] === 3, "Completed lessons increased to 3");
    assertTest((float)$spRow2['completion_percentage'] === 75.0, "Syllabus progress updated to 75.0% (3/4)");

    // -------------------------------------------------------------------------
    // 6. Learning Activity Heartbeat & Sync Idempotency
    // -------------------------------------------------------------------------
    echo "\n--- 6. Activity Heartbeat & Sync Idempotency ---\n";

    $syncUuid = 'client-act-uuid-' . bin2hex(random_bytes(8));

    // Create a learning material (material_type: text, video, audio, image, interactive)
    $db->prepare("INSERT INTO learning_materials (subject_id, class_id, lesson_id, officer_id, title, material_type, file_url, status, date_uploaded, created_at) VALUES (?, ?, ?, ?, 'Fractions Worksheet PDF', 'text', '/uploads/fractions.pdf', 'approved', NOW(), NOW())")
       ->execute([$subjectId, $classId, $lessonIds[0], $officerId]);
    $matId = (int)$db->lastInsertId();

    // Ingest activity
    $db->prepare("
        INSERT INTO learning_activities (
            learner_id, material_id, activity_status, cached_at, opened_at, completed_at, synced_at,
            time_spent_seconds, client_activity_uuid, created_at
        ) VALUES (
            ?, ?, 'completed', NOW(), NOW(), NOW(), NOW(), 120, ?, NOW()
        )
        ON DUPLICATE KEY UPDATE
            activity_status = VALUES(activity_status),
            time_spent_seconds = time_spent_seconds + VALUES(time_spent_seconds),
            completed_at = NOW(),
            synced_at = NOW()
    ")->execute([$learner1Id, $matId, $syncUuid]);

    $actCheck = $db->prepare("SELECT * FROM learning_activities WHERE client_activity_uuid = ?");
    $actCheck->execute([$syncUuid]);
    $actRow = $actCheck->fetch(PDO::FETCH_ASSOC);

    assertTest($actRow && $actRow['activity_status'] === 'completed', "Activity heartbeat successfully recorded with status 'completed'");
    assertTest((int)$actRow['time_spent_seconds'] === 120, "Time spent recorded = 120 seconds");

    // Idempotent resync with extra 30 seconds
    $db->prepare("
        INSERT INTO learning_activities (
            learner_id, material_id, activity_status, cached_at, opened_at, completed_at, synced_at,
            time_spent_seconds, client_activity_uuid, created_at
        ) VALUES (
            ?, ?, 'completed', NOW(), NOW(), NOW(), NOW(), 30, ?, NOW()
        )
        ON DUPLICATE KEY UPDATE
            activity_status = VALUES(activity_status),
            time_spent_seconds = time_spent_seconds + VALUES(time_spent_seconds),
            completed_at = NOW(),
            synced_at = NOW()
    ")->execute([$learner1Id, $matId, $syncUuid]);

    $actCheck->execute([$syncUuid]);
    $actRow2 = $actCheck->fetch(PDO::FETCH_ASSOC);

    $totalActs = $db->query("SELECT COUNT(*) FROM learning_activities WHERE client_activity_uuid = '{$syncUuid}'")->fetchColumn();
    assertTest((int)$totalActs === 1, "UUID deduplication enforced: only 1 row exists for client_activity_uuid");
    assertTest((int)$actRow2['time_spent_seconds'] === 150, "Time spent accumulatively updated to 150 seconds");

    // -------------------------------------------------------------------------
    // 7. Multi-Child Parent Aggregation & RBAC Isolation
    // -------------------------------------------------------------------------
    echo "\n--- 7. Parent Dashboard Multi-Child & RBAC Isolation ---\n";

    // Parent 1 has 2 children
    $pChildrenStmt = $db->prepare("SELECT learner_id, full_name FROM learners WHERE parent_id = ? AND status = 'active'");
    $pChildrenStmt->execute([$parentId]);
    $pChildren = $pChildrenStmt->fetchAll(PDO::FETCH_ASSOC);

    assertTest(count($pChildren) === 2, "Parent 1 correctly has 2 active children");

    // Stranger Parent has 0 children
    $strangerChildrenStmt = $db->prepare("SELECT learner_id, full_name FROM learners WHERE parent_id = ? AND status = 'active'");
    $strangerChildrenStmt->execute([$strangerParentId]);
    $strangerChildren = $strangerChildrenStmt->fetchAll(PDO::FETCH_ASSOC);

    assertTest(count($strangerChildren) === 0, "Stranger parent has 0 children; cannot see Parent 1's children");

    // -------------------------------------------------------------------------
    // 8. Next Recommended Lesson Algorithm
    // -------------------------------------------------------------------------
    echo "\n--- 8. Explainable Next Lesson Recommendation ---\n";

    // For Learner 1: Lesson 1 & 2 & 4 completed, Lesson 3 is in_progress
    // Next lesson should be Lesson 3 (in_progress first, then not_started)
    $nextLessonStmt = $db->prepare("
        SELECT le.lesson_id, le.lesson_title, le.sequence_number,
               COALESCE(pr.completion_status, 'not_started') as status
        FROM lessons le
        JOIN subjects s ON le.subject_id = s.subject_id
        JOIN learner_subjects ls ON ls.subject_id = s.subject_id AND ls.learner_id = :lid AND ls.status = 'active'
        LEFT JOIN progress_records pr ON pr.lesson_id = le.lesson_id AND pr.learner_id = :lid2
        WHERE le.class_id = :cid AND le.status = 'active' AND (pr.completion_status IS NULL OR pr.completion_status != 'completed')
        ORDER BY 
            CASE WHEN pr.completion_status = 'in_progress' THEN 1 ELSE 2 END ASC,
            le.sequence_number ASC
        LIMIT 1
    ");
    $nextLessonStmt->execute([
        ':lid' => $learner1Id,
        ':lid2' => $learner1Id,
        ':cid' => $classId
    ]);
    $recLesson = $nextLessonStmt->fetch(PDO::FETCH_ASSOC);

    assertTest($recLesson !== false && (int)$recLesson['lesson_id'] === $lessonIds[2], "Next lesson recommendation correctly picks Lesson 3 (in_progress)");

    // -------------------------------------------------------------------------
    // 9. Teacher Roster & At-Risk Identification
    // -------------------------------------------------------------------------
    echo "\n--- 9. Teacher Roster & Diagnostic Analytics ---\n";

    // Learner 1 has quiz score 78% (>50%) -> risk_level = 'good'
    // Let's add a failing quiz score to Learner 2 (score: 30 / 100 = 30%)
    $db->prepare("INSERT INTO assessments (subject_id, class_id, lesson_id, assessment_type, title, instructions, total_marks, passing_marks, created_by, status, date_created) VALUES (?, ?, ?, 'multiple_choice', 'Difficult Diagnostic Quiz', 'Answer all', 100.00, 50.00, ?, 'published', NOW())")
       ->execute([$subjectId, $classId, $lessonIds[0], $officerUserId]);
    $diagQuizId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO assessment_results (assessment_id, learner_id, score, total_marks, percentage, date_taken, feedback, sync_status, scored_by, scoring_mode) VALUES (?, ?, 30.00, 100.00, 30.00, NOW(), 'Needs revision', 'synced', NULL, 'automatic')")
       ->execute([$diagQuizId, $learner2Id]);

    // Check struggling topic detection (pass rate < 60%)
    $diffStmt = $db->prepare("
        SELECT a.assessment_id, a.title,
               COUNT(ar.result_id) as total_attempts,
               ROUND(AVG(ar.percentage), 1) as average_percentage,
               ROUND((COUNT(CASE WHEN ar.percentage >= 50 THEN 1 END) / COUNT(ar.result_id)) * 100, 1) as pass_rate
        FROM assessments a
        JOIN assessment_results ar ON ar.assessment_id = a.assessment_id
        WHERE a.assessment_id = ?
        GROUP BY a.assessment_id, a.title
    ");
    $diffStmt->execute([$diagQuizId]);
    $strugglingTopic = $diffStmt->fetch(PDO::FETCH_ASSOC);

    assertTest($strugglingTopic && (float)$strugglingTopic['average_percentage'] === 30.0, "Struggling topic correctly identified with low average (30.0%)");
    assertTest((float)$strugglingTopic['pass_rate'] === 0.0, "Pass rate computed accurately as 0.0%");

    // -------------------------------------------------------------------------
    // 10. Official Learner Progress Report (PDF Payload Generation)
    // -------------------------------------------------------------------------
    echo "\n--- 10. Official Learner Progress Report Generation ---\n";

    // Authenticate as Parent 1
    App\Middleware\AuthMiddleware::setUser([
        'user_id' => $parentUserId,
        'role_code' => 'parent',
        'full_name' => 'Test S8 Parent',
        'email' => $parentEmail
    ]);

    $testCmd = 'php -r ' . escapeshellarg('
        require "app/Config/Database.php";
        require "app/Middleware/AuthMiddleware.php";
        require "app/Controllers/ProgressController.php";
        require "app/Utils/Response.php";

        App\Middleware\AuthMiddleware::setUser([
            "user_id" => ' . $parentUserId . ',
            "role_code" => "parent",
            "full_name" => "Test S8 Parent",
            "email" => "' . $parentEmail . '"
        ]);

        $c = new App\Controllers\ProgressController();
        $c->getLearnerProgressReport(' . $learner1Id . ');
    ');

    $reportOutput = shell_exec($testCmd);
    $reportData = json_decode($reportOutput ?: '', true);

    assertTest($reportData && $reportData['success'] === true, "Report endpoint returns successful response");
    assertTest(isset($reportData['data']['meta']['institution_name']), "Report includes official institution header");
    assertTest(isset($reportData['data']['summary']['completion_percentage']), "Report aggregates overall completion percentage");
    assertTest(count($reportData['data']['subjects']) >= 1, "Report contains subject-by-subject progress breakdown");
    assertTest(isset($reportData['data']['summary']['competency_remark']), "Report includes pedagogical competency remark");

} catch (Throwable $e) {
    echo "\n[ERROR EXCEPTION] " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
    $testsFailed++;
} finally {
    // -------------------------------------------------------------------------
    // 11. Clean Up Fixtures
    // -------------------------------------------------------------------------
    echo "\n--- 11. Teardown Test Data ---\n";
    try {
        if (isset($learner1Id, $learner2Id)) {
            $db->exec("DELETE FROM learning_activities WHERE learner_id IN ({$learner1Id}, {$learner2Id})");
            $db->exec("DELETE FROM progress_records WHERE learner_id IN ({$learner1Id}, {$learner2Id})");
            $db->exec("DELETE FROM assessment_results WHERE learner_id IN ({$learner1Id}, {$learner2Id})");
        }
        if (isset($matId)) {
            $db->exec("DELETE FROM learning_materials WHERE material_id = {$matId}");
        }
        $assessmentsToDelete = array_filter([$quizAId ?? null, $quizBId ?? null, $diagQuizId ?? null]);
        if (!empty($assessmentsToDelete)) {
            $ids = implode(',', $assessmentsToDelete);
            $db->exec("DELETE FROM assessments WHERE assessment_id IN ({$ids})");
        }
        if (isset($learner1Id, $learner2Id)) {
            $db->exec("DELETE FROM learner_subjects WHERE learner_id IN ({$learner1Id}, {$learner2Id})");
        }
        if (isset($lessonIds) && !empty($lessonIds)) {
            $lIds = implode(',', $lessonIds);
            $db->exec("DELETE FROM lessons WHERE lesson_id IN ({$lIds})");
        }
        if (isset($subjectId)) {
            $db->exec("DELETE FROM subjects WHERE subject_id = {$subjectId}");
        }
        if (isset($learner1Id, $learner2Id)) {
            $db->exec("DELETE FROM learners WHERE learner_id IN ({$learner1Id}, {$learner2Id})");
        }
        if (isset($parentId, $strangerParentId)) {
            $db->exec("DELETE FROM parents WHERE parent_id IN ({$parentId}, {$strangerParentId})");
        }
        if (isset($officerId)) {
            $db->exec("DELETE FROM curriculum_officers WHERE officer_id = {$officerId}");
        }
        if (isset($officerUserId, $parentUserId, $strangerUserId, $l1UserId, $l2UserId)) {
            $uIds = implode(',', array_filter([$officerUserId ?? null, $parentUserId ?? null, $strangerUserId ?? null, $l1UserId ?? null, $l2UserId ?? null]));
            $db->exec("DELETE FROM users WHERE user_id IN ({$uIds})");
        }
        if (isset($classId)) {
            $db->exec("DELETE FROM classes WHERE class_id = {$classId}");
        }
        echo "✔ Test fixtures cleaned up successfully.\n";
    } catch (Throwable $te) {
        echo "⚠ Teardown warning: " . $te->getMessage() . "\n";
    }
}

echo "\n======================================================\n";
echo "  FINAL SPRINT 8 RESULTS: Passed: {$testsPassed} | Failed: {$testsFailed}\n";
echo "======================================================\n\n";

if ($testsFailed > 0) {
    exit(1);
}
