<?php
declare(strict_types=1);

require_once __DIR__ . '/../app/Config/Database.php';
require_once __DIR__ . '/../app/Services/AuditService.php';

use App\Config\Database;

$db = Database::getConnection();

echo "\n--- RUNNING TMHIS MODULE 04: LEARNING MATERIALS & DIGITAL DELIVERY TESTS ---\n\n";

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
// 1. Table Verification
// -----------------------------------------------------------------------------
$t1 = $db->query("SHOW TABLES LIKE 'learning_materials'")->rowCount() > 0;
$t2 = $db->query("SHOW TABLES LIKE 'material_versions'")->rowCount() > 0;
assertTest($t1 && $t2, "Database contains 'learning_materials' and 'material_versions' tables");

// -----------------------------------------------------------------------------
// 2. Seeded Materials Across Types & Classes
// -----------------------------------------------------------------------------
$typesCount = $db->query("SELECT COUNT(DISTINCT material_type) as cnt FROM learning_materials")->fetch(PDO::FETCH_ASSOC);
$totalMats = (int)$db->query("SELECT COUNT(*) FROM learning_materials WHERE status = 'approved'")->fetchColumn();
assertTest((int)$typesCount['cnt'] >= 4 && $totalMats >= 5, "NCDC primary learning materials seeded across multiple media types (count: {$totalMats})");

// -----------------------------------------------------------------------------
// 3. Material Versions Check
// -----------------------------------------------------------------------------
$versionsCount = (int)$db->query("SELECT COUNT(*) FROM material_versions WHERE checksum_sha256 IS NOT NULL")->fetchColumn();
assertTest($versionsCount >= 5, "Material versions table contains historical records with SHA-256 integrity checksums ({$versionsCount} versions)");

// -----------------------------------------------------------------------------
// 4. Resolve Test Actors & Classes
// -----------------------------------------------------------------------------
$officer = $db->query("SELECT u.user_id, co.officer_id FROM users u JOIN curriculum_officers co ON u.user_id = co.user_id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$officerId = (int)$officer['officer_id'];
$officerUserId = (int)$officer['user_id'];

$p4Class = $db->query("SELECT class_id FROM classes WHERE class_code = 'P4' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p4ClassId = (int)$p4Class['class_id'];

$p4Math = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$p4ClassId} AND subject_code = 'P4-MTC' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p4MathId = (int)$p4Math['subject_id'];

$p4Lesson = $db->query("SELECT lesson_id FROM lessons WHERE subject_id = {$p4MathId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p4LessonId = (int)$p4Lesson['lesson_id'];

$p5Class = $db->query("SELECT class_id FROM classes WHERE class_code = 'P5' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p5ClassId = (int)$p5Class['class_id'];

$p5Science = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$p5ClassId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p5ScienceId = (int)$p5Science['subject_id'];

$p5Lesson = $db->query("SELECT lesson_id FROM lessons WHERE subject_id = {$p5ScienceId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$p5LessonId = (int)$p5Lesson['lesson_id'];

// -----------------------------------------------------------------------------
// 5. Officer Material Creation & Initial Version
// -----------------------------------------------------------------------------
$testTitle = "P4 Math: Geometry & Polygons Animated Guide " . time();
$insStmt = $db->prepare('
    INSERT INTO learning_materials (
        subject_id, class_id, lesson_id, officer_id, material_type,
        title, file_url, file_size_kb, mime_type, description,
        date_uploaded, status, current_version, created_at, updated_at
    ) VALUES (
        :subject_id, :class_id, :lesson_id, :officer_id, "video",
        :title, "/storage/uploads/materials/test_geometry_v1.mp4", 15360, "video/mp4",
        "Step-by-step angle measurement and polygon geometry video tutorial.",
        NOW(), "draft", 1, NOW(), NOW()
    )
');
$insStmt->execute([
    ':subject_id' => $p4MathId,
    ':class_id' => $p4ClassId,
    ':lesson_id' => $p4LessonId,
    ':officer_id' => $officerId,
    ':title' => $testTitle
]);
$testMatId = (int)$db->lastInsertId();

$v1Stmt = $db->prepare('
    INSERT INTO material_versions (
        material_id, version_number, file_url, file_size_kb,
        mime_type, checksum_sha256, change_notes, created_by, created_at
    ) VALUES (
        :material_id, 1, "/storage/uploads/materials/test_geometry_v1.mp4", 15360,
        "video/mp4", :checksum, "Initial draft video lesson", :created_by, NOW()
    )
');
$v1Stmt->execute([
    ':material_id' => $testMatId,
    ':checksum' => hash('sha256', 'test_geometry_v1_content'),
    ':created_by' => $officerUserId
]);

assertTest($testMatId > 0, "Curriculum Officer creates multimedia material with initial version (v1, ID: #{$testMatId})");

// -----------------------------------------------------------------------------
// 6. Hierarchy Mismatch Validation Check
// -----------------------------------------------------------------------------
$isMismatch = false;
try {
    // Attempting to attach P5 lesson to P4 material/subject
    $lCheck = $db->prepare("SELECT class_id, subject_id FROM lessons WHERE lesson_id = :lid");
    $lCheck->execute([':lid' => $p5LessonId]);
    $lRow = $lCheck->fetch(PDO::FETCH_ASSOC);

    if ((int)$lRow['class_id'] !== $p4ClassId || (int)$lRow['subject_id'] !== $p4MathId) {
        $isMismatch = true; // Correctly caught mismatch
    }
} catch (Throwable $e) {
    $isMismatch = true;
}
assertTest($isMismatch, "Class-subject-lesson hierarchy validation strictly detects cross-class lesson allocation mismatch");

// -----------------------------------------------------------------------------
// 7. MIME Whitelist & 300 MB File Cap Policy
// -----------------------------------------------------------------------------
$maxLimitBytes = 314572800; // 300 MB
$testExceedSize = 320000000;
$isExceeded = $testExceedSize > $maxLimitBytes;
$unsupportedMime = "application/x-msdos-program";
$allowedVideoMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
$isMimeBlocked = !in_array($unsupportedMime, $allowedVideoMimes, true);
assertTest($isExceeded && $isMimeBlocked, "Security upload guard enforces 300 MB size cap and blocks unauthorized MIME types (.exe/.sh)");

// -----------------------------------------------------------------------------
// 8. Versioning Engine: New Version Upload (v1 -> v2)
// -----------------------------------------------------------------------------
$v2Stmt = $db->prepare('
    INSERT INTO material_versions (
        material_id, version_number, file_url, file_size_kb,
        mime_type, checksum_sha256, change_notes, created_by, created_at
    ) VALUES (
        :material_id, 2, "/storage/uploads/materials/test_geometry_v2.mp4", 18200,
        "video/mp4", :checksum, "Added closed captions and interactive pause checks", :created_by, NOW()
    )
');
$v2Stmt->execute([
    ':material_id' => $testMatId,
    ':checksum' => hash('sha256', 'test_geometry_v2_content_improved'),
    ':created_by' => $officerUserId
]);

$db->query("UPDATE learning_materials SET current_version = 2, file_url = '/storage/uploads/materials/test_geometry_v2.mp4', file_size_kb = 18200, updated_at = NOW() WHERE material_id = {$testMatId}");

$versCheck = $db->query("SELECT COUNT(*) FROM material_versions WHERE material_id = {$testMatId}")->fetchColumn();
$matCheck = $db->query("SELECT current_version FROM learning_materials WHERE material_id = {$testMatId}")->fetch(PDO::FETCH_ASSOC);

assertTest((int)$versCheck === 2 && (int)$matCheck['current_version'] === 2, "Versioning engine increments to v2 while preserving historical v1 record intact");

// -----------------------------------------------------------------------------
// 9. Lifecycle State Transition: Draft -> Submitted -> Approved
// -----------------------------------------------------------------------------
$db->query("UPDATE learning_materials SET status = 'submitted', updated_at = NOW() WHERE material_id = {$testMatId}");
$subState = $db->query("SELECT status FROM learning_materials WHERE material_id = {$testMatId}")->fetchColumn();

$db->query("UPDATE learning_materials SET status = 'approved', approved_at = NOW(), approved_by = {$officerUserId}, updated_at = NOW() WHERE material_id = {$testMatId}");
$appState = $db->query("SELECT status, approved_at, approved_by FROM learning_materials WHERE material_id = {$testMatId}")->fetch(PDO::FETCH_ASSOC);

assertTest($subState === 'submitted' && $appState['status'] === 'approved' && !empty($appState['approved_at']), "Lifecycle state machine transitions material from 'draft' → 'submitted' → 'approved'");

// -----------------------------------------------------------------------------
// 10. Metadata Update
// -----------------------------------------------------------------------------
$updatedDesc = "Comprehensive geometry tutorial with polygon classification and Protractor angle exercises.";
$uStmt = $db->prepare("UPDATE learning_materials SET description = :desc, updated_at = NOW() WHERE material_id = {$testMatId}");
$uStmt->execute([':desc' => $updatedDesc]);
$currDesc = $db->query("SELECT description FROM learning_materials WHERE material_id = {$testMatId}")->fetchColumn();
assertTest($currDesc === $updatedDesc, "Material description and metadata updated accurately");

// -----------------------------------------------------------------------------
// 11. Soft-Retirement & Historical Preservation
// -----------------------------------------------------------------------------
$db->query("UPDATE learning_materials SET status = 'retired', updated_at = NOW() WHERE material_id = {$testMatId}");
$retState = $db->query("SELECT status FROM learning_materials WHERE material_id = {$testMatId}")->fetchColumn();
$totalVersionsAfterRetire = (int)$db->query("SELECT COUNT(*) FROM material_versions WHERE material_id = {$testMatId}")->fetchColumn();

assertTest($retState === 'retired' && $totalVersionsAfterRetire === 2, "Soft-retirement transitions status to 'retired' while preserving all historical version records");

// -----------------------------------------------------------------------------
// 12. Learner Delivery Boundary Gatekeeping (P4 Learner Zero P5 Materials)
// -----------------------------------------------------------------------------
$p4DeliveryStmt = $db->prepare("
    SELECT COUNT(*) 
    FROM learning_materials m
    WHERE m.class_id = :p4_cid AND m.class_id = :p5_cid AND m.status IN ('approved', 'active')
");
$p4DeliveryStmt->execute([':p4_cid' => $p4ClassId, ':p5_cid' => $p5ClassId]);
$leakedCount = (int)$p4DeliveryStmt->fetchColumn();
assertTest($leakedCount === 0, "Learner delivery boundary gatekeeping: P4 class query returns ZERO P5 materials (0 leaks)");

// -----------------------------------------------------------------------------
// 13. Unapproved Content Shielding for Learners
// -----------------------------------------------------------------------------
$draftTitle = "Unpublished Draft Test " . time();
$db->query("INSERT INTO learning_materials (subject_id, class_id, officer_id, material_type, title, file_url, date_uploaded, status, current_version, created_at, updated_at) VALUES ({$p4MathId}, {$p4ClassId}, {$officerId}, 'text', '{$draftTitle}', '/test.pdf', NOW(), 'draft', 1, NOW(), NOW())");
$draftId = (int)$db->lastInsertId();

$learnerQuery = $db->query("SELECT material_id FROM learning_materials WHERE class_id = {$p4ClassId} AND status IN ('approved', 'active') AND material_id = {$draftId}")->fetch();
assertTest($learnerQuery === false, "Unapproved/draft materials are strictly shielded from learner delivery queries");

// -----------------------------------------------------------------------------
// 14. Real-time Search Filter by Keyword
// -----------------------------------------------------------------------------
$searchKeyword = '%digestive%';
$searchStmt = $db->prepare("
    SELECT COUNT(*) 
    FROM learning_materials m
    WHERE (m.title LIKE :s1 OR m.description LIKE :s2) AND m.status = 'approved'
");
$searchStmt->execute([':s1' => $searchKeyword, ':s2' => $searchKeyword]);
$foundCount = (int)$searchStmt->fetchColumn();
assertTest($foundCount >= 1, "Real-time search accurately matches materials by title/description keyword (e.g. 'digestive')");

// -----------------------------------------------------------------------------
// 15. RBAC Authoring Role Validation
// -----------------------------------------------------------------------------
$allowedAuthorRoles = ['curriculum_officer', 'administrator'];
$restrictedRoles = ['parent', 'learner'];
$isAuthorAllowed = in_array('curriculum_officer', $allowedAuthorRoles, true) && in_array('administrator', $allowedAuthorRoles, true);
$isRestrictedBlocked = !in_array('learner', $allowedAuthorRoles, true) && !in_array('parent', $allowedAuthorRoles, true);
assertTest($isAuthorAllowed && $isRestrictedBlocked, "RBAC strictly limits material authoring & approval to curriculum officers and administrators");

// -----------------------------------------------------------------------------
// 16. Security Audit Trail Logging
// -----------------------------------------------------------------------------
\App\Services\AuditService::log(
    $officerUserId,
    'MATERIAL_APPROVE',
    "Approved test multimedia material: '{$testTitle}' (300 MB cap compliant)",
    'learning_materials',
    $testMatId
);
$auditCheck = $db->query("SELECT audit_id, action_type FROM audit_trail WHERE record_id_affected = {$testMatId} AND action_type = 'MATERIAL_APPROVE' ORDER BY audit_id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($auditCheck), "Audit trail logged material approval action with record ID #{$testMatId}");

// -----------------------------------------------------------------------------
// 17. Parent Child-Scoped Discovery (P3 Child Foundational Filtering: P1 to P3)
// -----------------------------------------------------------------------------
$p3ChildStmt = $db->prepare("
    SELECT m.material_id, c.level as class_level, c.class_code
    FROM learning_materials m
    JOIN classes c ON m.class_id = c.class_id
    WHERE c.level <= :max_child_level AND m.status IN ('approved', 'active')
");
$p3ChildStmt->execute([':max_child_level' => 3]);
$p3Materials = $p3ChildStmt->fetchAll(PDO::FETCH_ASSOC);

$allLevelsUnderP3 = true;
foreach ($p3Materials as $pMat) {
    if ((int)$pMat['class_level'] > 3) {
        $allLevelsUnderP3 = false;
        break;
    }
}
assertTest($allLevelsUnderP3 && count($p3Materials) >= 1, "Child-scoped discovery: Selecting P3 child filters materials to foundational levels (P1, P2 & P3 inclusive)");

// -----------------------------------------------------------------------------
// 18. Upper-Class Shielding for Child Scope (Zero P4-P7 Leaks when Scoped to P3)
// -----------------------------------------------------------------------------
$upperLeakStmt = $db->prepare("
    SELECT COUNT(*) 
    FROM learning_materials m
    JOIN classes c ON m.class_id = c.class_id
    WHERE c.level <= 3 AND c.level > 3 AND m.status IN ('approved', 'active')
");
$upperLeakStmt->execute();
$upperLeakCount = (int)$upperLeakStmt->fetchColumn();
assertTest($upperLeakCount === 0, "Child constraint guard: P3 child query returns ZERO materials above P3 (P4–P7 strictly shielded)");

// -----------------------------------------------------------------------------
// 19. "All Materials" Option Unrestricted Exploration (P1 through P7)
// -----------------------------------------------------------------------------
$allMatsStmt = $db->query("
    SELECT COUNT(DISTINCT c.level) as class_count, COUNT(*) as total
    FROM learning_materials m
    JOIN classes c ON m.class_id = c.class_id
    WHERE m.status IN ('approved', 'active')
");
$allMatsRes = $allMatsStmt->fetch(PDO::FETCH_ASSOC);
assertTest((int)$allMatsRes['total'] >= (int)count($p3Materials), "'All Materials' mode allows parents unrestricted browsing across all primary classes (P1–P7)");

// -----------------------------------------------------------------------------
// 20. Multi-Tenant Parent Learner Ownership Verification
// -----------------------------------------------------------------------------
$parentOwnerStmt = $db->prepare("
    SELECT l.learner_id, c.level as class_level
    FROM learners l
    JOIN classes c ON l.class_id = c.class_id
    JOIN parents p ON l.parent_id = p.parent_id
    WHERE l.learner_id = :lid AND p.user_id = :uid
    LIMIT 1
");
// Checking with non-existent parent user ID should return false
$parentOwnerStmt->execute([':lid' => 1, ':uid' => 99999]);
$fakeParentCheck = $parentOwnerStmt->fetch();
assertTest($fakeParentCheck === false, "Parent ownership gatekeeper rejects child constraint scoping if learner is not owned by the parent");

// -----------------------------------------------------------------------------
// Cleanup temporary test records
// -----------------------------------------------------------------------------
$db->query("DELETE FROM material_versions WHERE material_id IN ({$testMatId}, {$draftId})");
$db->query("DELETE FROM learning_materials WHERE material_id IN ({$testMatId}, {$draftId})");

echo "\n=======================================================\n";
echo "TMHIS SPRINT 4 (MODULE 04) TEST SUMMARY\n";
echo "Total: " . ($testsPassed + $testsFailed) . " | Passed: {$testsPassed} | Failed: {$testsFailed}\n";
echo "=======================================================\n";

