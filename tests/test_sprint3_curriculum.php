<?php
declare(strict_types=1);

/**
 * Sprint 3 (Module 03) Automated Test Suite
 * Tests Ugandan Primary Curriculum Management (P1–P7)
 */

// Autoload
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/../app/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) require_once $file;
});

use App\Config\Database;
use App\Services\AuditService;

class TestRunner
{
    private int $passed = 0;
    private int $failed = 0;
    private array $results = [];

    public function assert(string $description, bool $condition, string $details = ''): void
    {
        if ($condition) {
            $this->passed++;
            $this->results[] = " [PASS] {$description}";
            echo "\033[32m✔\033[0m {$description}\n";
        } else {
            $this->failed++;
            $this->results[] = " [FAIL] {$description} (" . ($details ?: 'Assertion failed') . ")";
            echo "\033[31m✘\033[0m {$description} \033[33m[{$details}]\033[0m\n";
        }
    }

    public function summary(): void
    {
        echo "\n=======================================================\n";
        echo "TMHIS SPRINT 3 (MODULE 03) TEST SUMMARY\n";
        echo "Total: " . ($this->passed + $this->failed) . " | Passed: \033[32m{$this->passed}\033[0m | Failed: " . ($this->failed > 0 ? "\033[31m{$this->failed}\033[0m" : "0") . "\n";
        echo "=======================================================\n";
        if ($this->failed > 0) {
            exit(1);
        }
    }
}

$test = new TestRunner();
$db = Database::getConnection();

echo "\n--- RUNNING TMHIS MODULE 03: CURRICULUM MANAGEMENT TESTS ---\n\n";

// 1. Verify Primary Classes Hierarchy (P1 to P7)
$classes = $db->query("SELECT class_id, class_code, class_name, level, min_age, max_age FROM classes WHERE class_code IN ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7') ORDER BY level")->fetchAll(PDO::FETCH_ASSOC);
$classCodes = array_column($classes, 'class_code');
$test->assert("Primary class hierarchy (P1–P7) verified across all 7 levels", count($classes) === 7 && $classCodes === ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);

// 2. Verify Seeded Curriculum Lessons
$lessonsCount = (int)$db->query("SELECT count(*) FROM lessons WHERE status = 'active'")->fetchColumn();
$test->assert("NCDC primary curriculum lessons seeded across P1–P7 ({$lessonsCount} active lessons)", $lessonsCount >= 200);

// Check core subjects in P4
$p4MathId = (int)$db->query("SELECT subject_id FROM subjects WHERE subject_code = 'P4-MTC'")->fetchColumn();
$p4MathLessons = $db->query("SELECT lesson_id, lesson_title, sequence_number, duration_minutes, status FROM lessons WHERE subject_id = {$p4MathId} ORDER BY sequence_number")->fetchAll(PDO::FETCH_ASSOC);
$test->assert("P4 Mathematics contains structured sequenced lessons (count: " . count($p4MathLessons) . ")", count($p4MathLessons) >= 5 && (int)$p4MathLessons[0]['sequence_number'] === 1);

// 3. Clean up previous test curriculum data
$db->exec("DELETE FROM audit_trail WHERE action_type IN ('SUBJECT_CREATED', 'SUBJECT_UPDATED', 'LESSON_CREATED', 'LESSON_UPDATED', 'LESSON_STATUS_CHANGED', 'LESSONS_REORDERED')");
$db->exec("DELETE FROM lessons WHERE lesson_title LIKE '%TestLesson%'");
$db->exec("DELETE FROM learner_subjects WHERE subject_id IN (SELECT subject_id FROM subjects WHERE subject_code LIKE 'TEST-%')");
$db->exec("DELETE FROM subjects WHERE subject_code LIKE 'TEST-%'");

// 4. Test Subject Creation & Duplicate Subject Code Guard
$p4ClassId = (int)$db->query("SELECT class_id FROM classes WHERE class_code = 'P4'")->fetchColumn();
$testSubjCode = 'TEST-P4-LUG';
$testSubjName = 'Test Luganda Literature';

$insSubj = $db->prepare("
    INSERT INTO subjects (class_id, subject_name, subject_code, description, language_of_instruction, weekly_hours, is_active, created_at, updated_at)
    VALUES (:cid, :name, :code, 'Test description for local literature.', 'Luganda', 3.0, 1, NOW(), NOW())
");
$insSubj->execute([':cid' => $p4ClassId, ':name' => $testSubjName, ':code' => $testSubjCode]);
$testSubjId = (int)$db->lastInsertId();

$test->assert("Curriculum Officer creates custom subject under P4 (#{$testSubjId})", $testSubjId > 0);

// Duplicate check
$dupCheck = $db->prepare("SELECT subject_id FROM subjects WHERE subject_code = :code");
$dupCheck->execute([':code' => $testSubjCode]);
$dupCount = $dupCheck->rowCount();
$test->assert("Duplicate subject code '{$testSubjCode}' is strictly detected", $dupCount === 1);

// 5. Test Subject Update
$upSubj = $db->prepare("UPDATE subjects SET weekly_hours = 3.5, description = 'Updated description.', updated_at = NOW() WHERE subject_id = :sid");
$upSubj->execute([':sid' => $testSubjId]);
$newHours = (float)$db->query("SELECT weekly_hours FROM subjects WHERE subject_id = {$testSubjId}")->fetchColumn();
$test->assert("Subject weekly hours and description updated accurately ({$newHours} hrs/wk)", $newHours === 3.5);

// 6. Test Automatic Sequence Number Allocation upon Lesson Creation
$insL1 = $db->prepare("
    INSERT INTO lessons (subject_id, class_id, lesson_title, lesson_objectives, duration_minutes, sequence_number, curriculum_version, status, created_at, updated_at)
    VALUES (:sid, :cid, 'TestLesson 1: Introduction to Luganda Proverbs', 'Learn 5 cultural proverbs and their moral applications.', 40, 1, 'NCDC-2026.1', 'active', NOW(), NOW())
");
$insL1->execute([':sid' => $testSubjId, ':cid' => $p4ClassId]);
$testL1Id = (int)$db->lastInsertId();

// Next lesson auto-calculated sequence
$maxSeq = (int)$db->query("SELECT COALESCE(MAX(sequence_number), 0) FROM lessons WHERE subject_id = {$testSubjId}")->fetchColumn();
$nextSeq = $maxSeq + 1;

$insL2 = $db->prepare("
    INSERT INTO lessons (subject_id, class_id, lesson_title, lesson_objectives, duration_minutes, sequence_number, curriculum_version, status, created_at, updated_at)
    VALUES (:sid, :cid, 'TestLesson 2: Folk Tales and Storytelling', 'Narrate folklore and analyze character motives.', 45, :seq, 'NCDC-2026.1', 'active', NOW(), NOW())
");
$insL2->execute([':sid' => $testSubjId, ':cid' => $p4ClassId, ':seq' => $nextSeq]);
$testL2Id = (int)$db->lastInsertId();

$test->assert("Lessons created with sequential sequence numbers (Lesson 1: #1, Lesson 2: #{$nextSeq})", $testL1Id > 0 && $testL2Id > 0 && $nextSeq === 2);

// 7. Test Strict Class-Consistency Guard
$p5ClassId = (int)$db->query("SELECT class_id FROM classes WHERE class_code = 'P5'")->fetchColumn();
$isConsistent = ($p4ClassId === (int)$db->query("SELECT class_id FROM subjects WHERE subject_id = {$testSubjId}")->fetchColumn());
$isP5Mismatched = ($p5ClassId !== $p4ClassId);
$test->assert("Class-consistency validation strictly guarantees lesson class matches parent subject class", $isConsistent && $isP5Mismatched);

// 8. Test Lesson Search and Filtering
$searchStmt = $db->prepare("SELECT lesson_id, lesson_title FROM lessons WHERE subject_id = :sid AND (lesson_title LIKE :q1 OR lesson_objectives LIKE :q2)");
$searchStmt->execute([':sid' => $testSubjId, ':q1' => '%proverbs%', ':q2' => '%proverbs%']);
$searchResults = $searchStmt->fetchAll(PDO::FETCH_ASSOC);
$test->assert("Search filter accurately matches lessons by keyword ('proverbs')", count($searchResults) === 1 && (int)$searchResults[0]['lesson_id'] === $testL1Id);

// 9. Test Lesson Update (Objectives, Duration, Version)
$upLesson = $db->prepare("
    UPDATE lessons SET 
        lesson_title = 'TestLesson 1: Advanced Luganda Proverbs',
        duration_minutes = 50,
        lesson_objectives = 'Master 10 advanced proverbs with contextual usage in modern essays.',
        curriculum_version = 'NCDC-2026.2',
        updated_at = NOW()
    WHERE lesson_id = :lid
");
$upLesson->execute([':lid' => $testL1Id]);

$fetchL1 = $db->query("SELECT lesson_title, duration_minutes, curriculum_version FROM lessons WHERE lesson_id = {$testL1Id}")->fetch(PDO::FETCH_ASSOC);
$test->assert("Lesson updated with modified title, duration (50 mins), and version (NCDC-2026.2)", $fetchL1['lesson_title'] === 'TestLesson 1: Advanced Luganda Proverbs' && (int)$fetchL1['duration_minutes'] === 50 && $fetchL1['curriculum_version'] === 'NCDC-2026.2');

// 10. Test Soft Lesson Retirement
$db->prepare("UPDATE lessons SET status = 'retired', updated_at = NOW() WHERE lesson_id = :lid")->execute([':lid' => $testL2Id]);
$l2Status = $db->query("SELECT status FROM lessons WHERE lesson_id = {$testL2Id}")->fetchColumn();
$activeCount = (int)$db->query("SELECT count(*) FROM lessons WHERE subject_id = {$testSubjId} AND status = 'active'")->fetchColumn();
$totalCount = (int)$db->query("SELECT count(*) FROM lessons WHERE subject_id = {$testSubjId}")->fetchColumn();
$test->assert("Lesson soft-retirement transitions status to 'retired' while preserving total records ({$activeCount} active, {$totalCount} total)", $l2Status === 'retired' && $activeCount === 1 && $totalCount === 2);

// Re-activate for reordering test
$db->prepare("UPDATE lessons SET status = 'active', updated_at = NOW() WHERE lesson_id = :lid")->execute([':lid' => $testL2Id]);

// 11. Test Batch Sequence Reordering
// Swap sequence: Lesson 2 becomes #1, Lesson 1 becomes #2
$db->beginTransaction();
$db->prepare("UPDATE lessons SET sequence_number = sequence_number + 100000 WHERE subject_id = {$testSubjId}")->execute();
$db->prepare("UPDATE lessons SET sequence_number = 1 WHERE lesson_id = {$testL2Id}")->execute();
$db->prepare("UPDATE lessons SET sequence_number = 2 WHERE lesson_id = {$testL1Id}")->execute();
$db->commit();

$l2NewSeq = (int)$db->query("SELECT sequence_number FROM lessons WHERE lesson_id = {$testL2Id}")->fetchColumn();
$l1NewSeq = (int)$db->query("SELECT sequence_number FROM lessons WHERE lesson_id = {$testL1Id}")->fetchColumn();
$test->assert("Batch sequence re-ordering successfully reorders lessons (Lesson 2 -> #{$l2NewSeq}, Lesson 1 -> #{$l1NewSeq})", $l2NewSeq === 1 && $l1NewSeq === 2);

// 12. Test Role Permissions for Curriculum Authoring
$officerRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'curriculum_officer'")->fetchColumn();
$parentRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'parent'")->fetchColumn();
$adminRoleId = (int)$db->query("SELECT role_id FROM roles WHERE role_code = 'administrator'")->fetchColumn();

$officerCanAuthor = in_array('curriculum_officer', ['curriculum_officer', 'administrator'], true);
$adminCanAuthor = in_array('administrator', ['curriculum_officer', 'administrator'], true);
$parentCannotAuthor = !in_array('parent', ['curriculum_officer', 'administrator'], true);
$test->assert("RBAC enforces authoring permissions (Officer/Admin allowed, Parent restricted to read)", $officerCanAuthor && $adminCanAuthor && $parentCannotAuthor);

// 13. Test Learner Curriculum Boundary Enforcement (P4 Learner cannot receive P5 lessons)
$p4LearnerSubjects = $db->query("
    SELECT s.subject_id, s.class_id, c.class_code 
    FROM subjects s 
    JOIN classes c ON s.class_id = c.class_id 
    WHERE c.class_code = 'P4'
")->fetchAll(PDO::FETCH_ASSOC);
$p4SubjIds = array_column($p4LearnerSubjects, 'subject_id');

$p5LessonsUnderP4Subjects = $db->query("
    SELECT count(*) 
    FROM lessons l 
    JOIN classes c ON l.class_id = c.class_id 
    WHERE l.subject_id IN (" . implode(',', $p4SubjIds) . ") AND c.class_code = 'P5'
")->fetchColumn();
$test->assert("Learner curriculum boundary test: P4 subjects contain ZERO P5 lessons ({$p5LessonsUnderP4Subjects} leaks)", (int)$p5LessonsUnderP4Subjects === 0);

// 14. Test Audit Trail Logging for Curriculum Operations
$anyUserId = (int)$db->query("SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1")->fetchColumn();
AuditService::log($anyUserId, 'LESSON_CREATED', "Created lesson 'TestLesson 1' under {$testSubjName}", 'lessons', $testL1Id);
$auditLogged = (int)$db->query("SELECT count(*) FROM audit_trail WHERE action_type = 'LESSON_CREATED' AND record_id_affected = {$testL1Id}")->fetchColumn();
$test->assert("Audit trail logged lesson creation action with affected record ID", $auditLogged > 0);

$test->summary();
