<?php
declare(strict_types=1);

/**
 * Sprint 2 (Module 02) Automated Test Suite
 * Tests Parent, Family & Learner Management
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
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
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
        echo "TMHIS SPRINT 2 (MODULE 02) TEST SUMMARY\n";
        echo "Total: " . ($this->passed + $this->failed) . " | Passed: \033[32m{$this->passed}\033[0m | Failed: " . ($this->failed > 0 ? "\033[31m{$this->failed}\033[0m" : "0") . "\n";
        echo "=======================================================\n";
        if ($this->failed > 0) {
            exit(1);
        }
    }
}

$test = new TestRunner();
$db = Database::getConnection();

echo "\n--- RUNNING TMHIS MODULE 02: PARENT & LEARNER TESTS ---\n\n";

// 1. Verify Primary Classes (P1 to P7)
$classes = $db->query("SELECT class_id, class_code, class_name, level, min_age, max_age FROM classes WHERE class_code IN ('P1','P2','P3','P4','P5','P6','P7') ORDER BY level")->fetchAll(PDO::FETCH_ASSOC);
$classCodes = array_column($classes, 'class_code');
$test->assert("All 7 Primary classes (P1 to P7) exist with age guidelines", count($classes) === 7 && in_array('P1', $classCodes) && in_array('P7', $classCodes));

// 2. Verify Seeded Curriculum Subjects
$subjectsCount = (int)$db->query("SELECT count(*) FROM subjects WHERE is_active = 1")->fetchColumn();
$test->assert("NCDC primary curriculum subjects seeded across P1-P7 ({$subjectsCount} subjects)", $subjectsCount >= 40);

// Check specific core subjects in P4
$p4Subjects = $db->query("
    SELECT s.subject_code, s.subject_name 
    FROM subjects s 
    JOIN classes c ON s.class_id = c.class_id 
    WHERE c.class_code = 'P4'
")->fetchAll(PDO::FETCH_ASSOC);
$p4Codes = array_column($p4Subjects, 'subject_code');
$test->assert("P4 contains Core English, Math, Science, and SST", in_array('P4-ENG', $p4Codes) && in_array('P4-MTC', $p4Codes) && in_array('P4-SCI', $p4Codes) && in_array('P4-SST', $p4Codes));

// Clean up previous sprint 2 test records
$db->exec("DELETE FROM audit_trail WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@testparent.tmhis.org' OR username LIKE 'student_brian_%')");
$db->exec("DELETE FROM sync_queue WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@testparent.tmhis.org' OR username LIKE 'student_brian_%') OR learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM sync_log WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM devices WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@testparent.tmhis.org' OR username LIKE 'student_brian_%') OR learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM assessment_answers WHERE attempt_id IN (SELECT attempt_id FROM assessment_attempts WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%'))");
$db->exec("DELETE FROM assessment_results WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%') OR scored_by IN (SELECT user_id FROM users WHERE email LIKE '%@testparent.tmhis.org' OR username LIKE 'student_brian_%')");
$db->exec("DELETE FROM assessment_attempts WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM learning_schedules WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM learner_subjects WHERE learner_id IN (SELECT learner_id FROM learners WHERE full_name LIKE '%TestChild%')");
$db->exec("DELETE FROM learners WHERE full_name LIKE '%TestChild%'");
$db->exec("DELETE FROM parents WHERE email LIKE '%@testparent.tmhis.org'");
$db->exec("DELETE FROM users WHERE email LIKE '%@testparent.tmhis.org' OR username LIKE 'student_brian_%'");

// 3. Create Test Parents: Parent A & Parent B
$pwdHash = password_hash('ParentPass123!', PASSWORD_BCRYPT);

// Parent A
$db->prepare("INSERT INTO users (role_id, username, email, full_name, password_hash, account_status, created_at) VALUES (2, 'parent_alice', 'alice@testparent.tmhis.org', 'Alice Mukasa', :pwd, 'active', NOW())")->execute([':pwd' => $pwdHash]);
$parentAUserId = (int)$db->lastInsertId();
$db->prepare("INSERT INTO parents (user_id, full_name, phone, email, district, status, registration_date, created_at) VALUES (:uid, 'Alice Mukasa', '+256701111222', 'alice@testparent.tmhis.org', 'Wakiso', 'active', CURDATE(), NOW())")->execute([':uid' => $parentAUserId]);
$parentAId = (int)$db->lastInsertId();

// Parent B
$db->prepare("INSERT INTO users (role_id, username, email, full_name, password_hash, account_status, created_at) VALUES (2, 'parent_bob', 'bob@testparent.tmhis.org', 'Bob Kato', :pwd, 'active', NOW())")->execute([':pwd' => $pwdHash]);
$parentBUserId = (int)$db->lastInsertId();
$db->prepare("INSERT INTO parents (user_id, full_name, phone, email, district, status, registration_date, created_at) VALUES (:uid, 'Bob Kato', '+256702222333', 'bob@testparent.tmhis.org', 'Kampala', 'active', CURDATE(), NOW())")->execute([':uid' => $parentBUserId]);
$parentBId = (int)$db->lastInsertId();

$test->assert("Test parents created with separate parent IDs (Parent A: #{$parentAId}, Parent B: #{$parentBId})", $parentAId > 0 && $parentBId > 0 && $parentAId !== $parentBId);

// 4. Test Learner Registration with Automatic Subject Allocation (Parent A registers Child in P4)
$p4ClassId = (int)$db->query("SELECT class_id FROM classes WHERE class_code = 'P4'")->fetchColumn();
$child1Name = 'TestChild John Mukasa';
$child1Dob = '2016-04-12';

$db->beginTransaction();
$insL = $db->prepare("
    INSERT INTO learners (parent_id, class_id, full_name, date_of_birth, gender, special_learning_needs, enrolment_date, status, created_at, updated_at)
    VALUES (:pid, :cid, :name, :dob, 'male', 0, CURDATE(), 'active', NOW(), NOW())
");
$insL->execute([':pid' => $parentAId, ':cid' => $p4ClassId, ':name' => $child1Name, ':dob' => $child1Dob]);
$child1Id = (int)$db->lastInsertId();

// Automatic Subject Allocation for P4 with CRE track
$subjStmt = $db->prepare("SELECT subject_id, subject_code FROM subjects WHERE class_id = :cid AND is_active = 1");
$subjStmt->execute([':cid' => $p4ClassId]);
$p4Subjs = $subjStmt->fetchAll(PDO::FETCH_ASSOC);

$insLs = $db->prepare("INSERT INTO learner_subjects (learner_id, subject_id, assigned_at, status) VALUES (:lid, :sid, NOW(), 'active')");
$assignedCount = 0;
foreach ($p4Subjs as $s) {
    if (str_contains(strtoupper($s['subject_code']), '-IRE')) continue; // CRE track skips IRE
    $insLs->execute([':lid' => $child1Id, ':sid' => $s['subject_id']]);
    $assignedCount++;
}
$db->commit();

$test->assert("Learner registered under Parent A with automatic P4 subjects assigned ({$assignedCount} subjects)", $child1Id > 0 && $assignedCount >= 5);

// 5. Test Duplicate Learner Guard (Same parent + full_name + DOB)
$dupCheck = $db->prepare("SELECT learner_id FROM learners WHERE parent_id = :pid AND LOWER(TRIM(full_name)) = LOWER(TRIM(:name)) AND date_of_birth = :dob");
$dupCheck->execute([':pid' => $parentAId, ':name' => $child1Name, ':dob' => $child1Dob]);
$existingLid = $dupCheck->fetchColumn();
$test->assert("Duplicate check identifies existing learner with same (parent_id, full_name, DOB)", $existingLid == $child1Id);

// Verify same name under DIFFERENT parent is permitted (e.g. cousins with same name in different families)
$dupCheckOtherParent = $db->prepare("SELECT learner_id FROM learners WHERE parent_id = :pid AND LOWER(TRIM(full_name)) = LOWER(TRIM(:name)) AND date_of_birth = :dob");
$dupCheckOtherParent->execute([':pid' => $parentBId, ':name' => $child1Name, ':dob' => $child1Dob]);
$otherParentResult = $dupCheckOtherParent->fetchColumn();
$test->assert("Same learner name under a different parent is permitted", $otherParentResult === false);

// 6. Test Multi-Tenant Parent Isolation Enforcement
// Parent B queries their learners -> should NOT see Child 1 (Parent A)
$parentBLearners = $db->prepare("SELECT learner_id, full_name FROM learners WHERE parent_id = :pid");
$parentBLearners->execute([':pid' => $parentBId]);
$bList = $parentBLearners->fetchAll(PDO::FETCH_ASSOC);
$bLearnerIds = array_column($bList, 'learner_id');
$test->assert("Parent B cannot view Parent A's children (Multi-Tenant Isolation)", !in_array($child1Id, $bLearnerIds));

// 7. Test Special Learning Needs & Accommodations Recording
$p2ClassId = (int)$db->query("SELECT class_id FROM classes WHERE class_code = 'P2'")->fetchColumn();
$child2Name = 'TestChild Mary Mukasa';
$specialNeedsDesc = 'Requires 25% extra assessment duration, larger print text, and audio cues.';

$insL2 = $db->prepare("
    INSERT INTO learners (parent_id, class_id, full_name, date_of_birth, gender, special_learning_needs, special_needs_description, enrolment_date, status, created_at, updated_at)
    VALUES (:pid, :cid, :name, '2018-09-15', 'female', 1, :desc, CURDATE(), 'active', NOW(), NOW())
");
$insL2->execute([':pid' => $parentAId, ':cid' => $p2ClassId, ':name' => $child2Name, ':desc' => $specialNeedsDesc]);
$child2Id = (int)$db->lastInsertId();

$fetchL2 = $db->prepare("SELECT special_learning_needs, special_needs_description FROM learners WHERE learner_id = :lid");
$fetchL2->execute([':lid' => $child2Id]);
$l2Row = $fetchL2->fetch(PDO::FETCH_ASSOC);
$test->assert("Special learning needs flag and accommodations description persisted accurately", (int)$l2Row['special_learning_needs'] === 1 && $l2Row['special_needs_description'] === $specialNeedsDesc);

// 8. Test Class Level Transition & Subject Re-alignment (P2 -> P3)
$p3ClassId = (int)$db->query("SELECT class_id FROM classes WHERE class_code = 'P3'")->fetchColumn();

$db->beginTransaction();
// Update class
$db->prepare("UPDATE learners SET class_id = :cid, updated_at = NOW() WHERE learner_id = :lid")->execute([':cid' => $p3ClassId, ':lid' => $child2Id]);
// Deactivate old subjects
$db->prepare("UPDATE learner_subjects SET status = 'inactive' WHERE learner_id = :lid")->execute([':lid' => $child2Id]);
// Assign new P3 subjects
$p3Subjs = $db->prepare("SELECT subject_id FROM subjects WHERE class_id = :cid AND is_active = 1");
$p3Subjs->execute([':cid' => $p3ClassId]);
$p3List = $p3Subjs->fetchAll(PDO::FETCH_ASSOC);
$insP3Subj = $db->prepare("INSERT INTO learner_subjects (learner_id, subject_id, assigned_at, status) VALUES (:lid, :sid, NOW(), 'active')");
foreach ($p3List as $s) {
    $insP3Subj->execute([':lid' => $child2Id, ':sid' => $s['subject_id']]);
}
$db->commit();

// Check active subjects for Child 2
$activeSubjs = $db->prepare("
    SELECT s.subject_code 
    FROM learner_subjects ls 
    JOIN subjects s ON ls.subject_id = s.subject_id 
    WHERE ls.learner_id = :lid AND ls.status = 'active'
");
$activeSubjs->execute([':lid' => $child2Id]);
$child2Codes = $activeSubjs->fetchAll(PDO::FETCH_COLUMN);
$allP3 = true;
foreach ($child2Codes as $c) {
    if (!str_starts_with($c, 'P3-')) $allP3 = false;
}
$test->assert("Learner promoted to P3 and active subjects realigned to P3 curriculum", $allP3 && count($child2Codes) > 0);

// 9. Test Soft Deactivation Preserves Historical Academic Data
$db->prepare("UPDATE learners SET status = 'inactive', updated_at = NOW() WHERE learner_id = :lid")->execute([':lid' => $child2Id]);
$statusVal = $db->query("SELECT status FROM learners WHERE learner_id = {$child2Id}")->fetchColumn();
$historyCount = $db->query("SELECT count(*) FROM learner_subjects WHERE learner_id = {$child2Id}")->fetchColumn();
$test->assert("Learner soft-deactivation updates status to inactive while preserving subject history ({$historyCount} total records)", $statusVal === 'inactive' && $historyCount > 0);

// Reactivate
$db->prepare("UPDATE learners SET status = 'active', updated_at = NOW() WHERE learner_id = :lid")->execute([':lid' => $child2Id]);

// 10. Test Optional Standalone Learner Login Account Creation
$child3Name = 'TestChild Brian Mukasa';
$learnerUsername = 'student_brian_' . rand(100, 999);
$learnerPwd = 'StudentPass2026!';

$db->beginTransaction();
$insUser = $db->prepare("
    INSERT INTO users (role_id, username, email, full_name, password_hash, account_status, created_at, updated_at)
    VALUES (1, :u, :email, :fname, :pwd, 'active', NOW(), NOW())
");
$insUser->execute([
    ':u' => $learnerUsername,
    ':email' => $learnerUsername . '@tmhis.local',
    ':fname' => $child3Name,
    ':pwd' => password_hash($learnerPwd, PASSWORD_BCRYPT)
]);
$learnerUserId = (int)$db->lastInsertId();

$insL3 = $db->prepare("
    INSERT INTO learners (parent_id, user_id, class_id, full_name, date_of_birth, gender, special_learning_needs, enrolment_date, status, created_at, updated_at)
    VALUES (:pid, :uid, :cid, :name, '2014-03-22', 'male', 0, CURDATE(), 'active', NOW(), NOW())
");
$insL3->execute([':pid' => $parentAId, ':uid' => $learnerUserId, ':cid' => $p4ClassId, ':name' => $child3Name]);
$child3Id = (int)$db->lastInsertId();
$db->commit();

// Verify student login resolution
$fetchStudent = $db->prepare("SELECT u.username, u.full_name, r.role_code FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = :uid");
$fetchStudent->execute([':uid' => $learnerUserId]);
$studentRow = $fetchStudent->fetch(PDO::FETCH_ASSOC);
$test->assert("Optional standalone student account created with role 'learner' linked to learner record", $studentRow['role_code'] === 'learner' && $studentRow['username'] === $learnerUsername);

// 11. Test Parent Profile Extended Homeschooling Demographics
$upParent = $db->prepare("
    UPDATE parents SET 
        national_id = 'CM95014102KLA',
        physical_address = 'Plot 18 Muyenga Road',
        district = 'Kampala',
        household_size = 5,
        preferred_language = 'English & Luganda',
        education_level = 'Postgraduate Diploma',
        homeschooling_experience = 1,
        updated_at = NOW()
    WHERE parent_id = :pid
");
$upParent->execute([':pid' => $parentAId]);

$fetchParent = $db->prepare("SELECT * FROM parents WHERE parent_id = :pid");
$fetchParent->execute([':pid' => $parentAId]);
$pRow = $fetchParent->fetch(PDO::FETCH_ASSOC);
$test->assert("Parent homeschooling demographics (NIN, District, Household size, Experience) updated and verified", $pRow['national_id'] === 'CM95014102KLA' && $pRow['district'] === 'Kampala' && (int)$pRow['household_size'] === 5 && (int)$pRow['homeschooling_experience'] === 1);

// 12. Audit Trail Verification for Learner Operations
AuditService::log($parentAUserId, 'LEARNER_REGISTERED', "Registered learner '{$child1Name}' into P4", 'learners', $child1Id);
$auditCheck = $db->prepare("SELECT COUNT(*) FROM audit_trail WHERE user_id = :uid AND action_type = 'LEARNER_REGISTERED'");
$auditCheck->execute([':uid' => $parentAUserId]);
$auditCount = (int)$auditCheck->fetchColumn();
$test->assert("Audit trail logged learner registration action", $auditCount > 0);

// 13. Test Learner Photo (Avatar) Persistence & Synchronization
$testAvatarUrl = '/storage/uploads/avatars/learner_' . $child3Id . '_test.jpg';
$db->prepare("UPDATE learners SET avatar_url = :avatar, updated_at = NOW() WHERE learner_id = :lid")
    ->execute([':avatar' => $testAvatarUrl, ':lid' => $child3Id]);

// If learner is linked to a user account, sync avatar_url
$db->prepare("UPDATE users SET avatar_url = :avatar, updated_at = NOW() WHERE user_id = :uid")
    ->execute([':avatar' => $testAvatarUrl, ':uid' => $learnerUserId]);

$savedLearnerAvatar = $db->query("SELECT avatar_url FROM learners WHERE learner_id = {$child3Id}")->fetchColumn();
$savedUserAvatar = $db->query("SELECT avatar_url FROM users WHERE user_id = {$learnerUserId}")->fetchColumn();
$test->assert("Learner student photo persisted and synced to linked student user profile", $savedLearnerAvatar === $testAvatarUrl && $savedUserAvatar === $testAvatarUrl);

$test->summary();
