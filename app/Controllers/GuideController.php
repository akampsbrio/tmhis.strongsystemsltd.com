<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

class GuideController
{
    /**
     * GET /api/parent/guides OR GET /api/guides
     * List published parental guides for parents/learners, or all guides for officers/admins with filtering.
     */
    public function getGuides(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $role = strtolower($user['role_name'] ?? '');
        $isOfficerOrAdmin = in_array($role, ['administrator', 'curriculum officer', 'super administrator'], true);

        $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;
        $subjectId = isset($_GET['subject_id']) && is_numeric($_GET['subject_id']) ? (int)$_GET['subject_id'] : null;
        $lessonId = isset($_GET['lesson_id']) && is_numeric($_GET['lesson_id']) ? (int)$_GET['lesson_id'] : null;
        $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
        $targetLevel = isset($_GET['education_level_target']) ? trim((string)$_GET['education_level_target']) : null;
        $status = isset($_GET['status']) ? trim((string)$_GET['status']) : null;
        $search = isset($_GET['search']) ? trim((string)$_GET['search']) : null;

        $page = max(1, isset($_GET['page']) ? (int)$_GET['page'] : 1);
        $limit = min(100, max(1, isset($_GET['limit']) ? (int)$_GET['limit'] : 20));
        $offset = ($page - 1) * $limit;

        $where = ['1=1'];
        $params = [];

        // Role boundary: parents, learners, teachers only see published guides
        if (!$isOfficerOrAdmin) {
            $where[] = "g.status = 'published'";
        } elseif ($status && in_array($status, ['draft', 'under_review', 'published', 'archived'], true)) {
            $where[] = "g.status = :status";
            $params[':status'] = $status;
        }

        if ($classId !== null) {
            $where[] = "g.class_id = :class_id";
            $params[':class_id'] = $classId;
        }

        if ($subjectId !== null) {
            $where[] = "g.subject_id = :subject_id";
            $params[':subject_id'] = $subjectId;
        }

        if ($lessonId !== null) {
            $where[] = "g.lesson_id = :lesson_id";
            $params[':lesson_id'] = $lessonId;
        }

        if ($termId !== null) {
            $where[] = "g.term_id = :term_id";
            $params[':term_id'] = $termId;
        }

        if ($targetLevel && in_array($targetLevel, ['basic', 'intermediate', 'advanced'], true)) {
            $where[] = "g.education_level_target = :target_level";
            $params[':target_level'] = $targetLevel;
        }

        if ($search) {
            $where[] = "(g.title LIKE :search OR g.learning_objectives LIKE :search OR g.suggested_steps LIKE :search OR s.subject_name LIKE :search)";
            $params[':search'] = '%' . $search . '%';
        }

        $whereClause = implode(' AND ', $where);

        // Count total
        $countStmt = $db->prepare("
            SELECT COUNT(*) FROM parental_guides g
            JOIN subjects s ON g.subject_id = s.subject_id
            WHERE {$whereClause}
        ");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Query data
        $stmt = $db->prepare("
            SELECT 
                g.guide_id,
                g.subject_id,
                g.class_id,
                g.lesson_id,
                g.term_id,
                g.title,
                g.education_level_target,
                g.expected_duration_minutes,
                g.status,
                g.date_created,
                g.date_updated,
                g.published_at,
                c.class_name,
                c.class_code,
                c.level as class_level,
                s.subject_name,
                s.subject_code,
                l.lesson_title,
                l.sequence_number as lesson_sequence,
                t.term_name,
                t.term_number,
                t.academic_year,
                t.is_current as is_current_term,
                u.full_name as author_name,
                (SELECT COUNT(*) FROM parental_guide_versions v WHERE v.guide_id = g.guide_id) as version_count
            FROM parental_guides g
            JOIN classes c ON g.class_id = c.class_id
            JOIN subjects s ON g.subject_id = s.subject_id
            LEFT JOIN lessons l ON g.lesson_id = l.lesson_id
            LEFT JOIN curriculum_terms t ON g.term_id = t.term_id
            JOIN users u ON g.created_by = u.user_id
            WHERE {$whereClause}
            ORDER BY c.level ASC, s.subject_name ASC, g.title ASC
            LIMIT {$limit} OFFSET {$offset}
        ");
        $stmt->execute($params);
        $guides = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($guides as &$g) {
            $g['guide_id'] = (int)$g['guide_id'];
            $g['subject_id'] = (int)$g['subject_id'];
            $g['class_id'] = (int)$g['class_id'];
            $g['lesson_id'] = $g['lesson_id'] !== null ? (int)$g['lesson_id'] : null;
            $g['term_id'] = $g['term_id'] !== null ? (int)$g['term_id'] : null;
            $g['class_level'] = (int)$g['class_level'];
            $g['expected_duration_minutes'] = $g['expected_duration_minutes'] !== null ? (int)$g['expected_duration_minutes'] : 45;
            $g['version_count'] = (int)$g['version_count'];
            $g['is_current_term'] = (bool)($g['is_current_term'] ?? false);
        }

        Response::success([
            'guides' => $guides,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => (int)ceil($total / $limit)
            ]
        ], 'Parental guides retrieved successfully.');
    }

    /**
     * GET /api/guides/{id}
     * Retrieve single detailed parental guide with all pedagogical steps, checklist, and related materials.
     */
    public function getGuide(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $role = strtolower($user['role_name'] ?? '');
        $isOfficerOrAdmin = in_array($role, ['administrator', 'curriculum officer', 'super administrator'], true);

        $stmt = $db->prepare("
            SELECT 
                g.*,
                c.class_name,
                c.class_code,
                c.level as class_level,
                s.subject_name,
                s.subject_code,
                l.lesson_title,
                l.lesson_objectives as curriculum_lesson_objectives,
                l.sequence_number as lesson_sequence,
                t.term_name,
                t.term_number,
                t.academic_year,
                t.is_current as is_current_term,
                u.full_name as author_name,
                u.email as author_email
            FROM parental_guides g
            JOIN classes c ON g.class_id = c.class_id
            JOIN subjects s ON g.subject_id = s.subject_id
            LEFT JOIN lessons l ON g.lesson_id = l.lesson_id
            LEFT JOIN curriculum_terms t ON g.term_id = t.term_id
            JOIN users u ON g.created_by = u.user_id
            WHERE g.guide_id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $guide = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$guide) {
            Response::error('Parental guide not found.', 404);
            return;
        }

        // Access boundary check
        if (!$isOfficerOrAdmin && $guide['status'] !== 'published') {
            Response::error('This parental guide is not published or accessible.', 403);
            return;
        }

        // Fetch version count and latest version number
        $vStmt = $db->prepare("SELECT version_number, change_notes, created_at FROM parental_guide_versions WHERE guide_id = :id ORDER BY version_number DESC");
        $vStmt->execute([':id' => $id]);
        $versions = $vStmt->fetchAll(PDO::FETCH_ASSOC);
        $guide['versions'] = $versions;
        $guide['current_version'] = !empty($versions) ? (int)$versions[0]['version_number'] : 1;

        // Fetch related learning materials if lesson attached
        $materials = [];
        if ($guide['lesson_id']) {
            $mStmt = $db->prepare("
                SELECT material_id, title, material_type, file_url, mime_type, file_size_kb, status
                FROM learning_materials
                WHERE lesson_id = :lesson_id AND status = 'approved'
                ORDER BY title ASC
            ");
            $mStmt->execute([':lesson_id' => $guide['lesson_id']]);
            $materials = $mStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        $guide['related_materials'] = $materials;

        Response::success($guide, 'Parental guide details retrieved successfully.');
    }

    /**
     * POST /api/officer/guides
     * Author a new parental guide draft (Curriculum Officer / Admin only).
     */
    public function createGuide(): void
    {
        $user = RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($input);
        $validator->required(['title', 'subject_id', 'class_id', 'guide_body']);

        if (!$validator->isValid()) {
            Response::error('Validation failed: ' . implode(', ', $validator->getErrors()), 422, $validator->getErrors());
            return;
        }

        $title = trim((string)$input['title']);
        $subjectId = (int)$input['subject_id'];
        $classId = (int)$input['class_id'];
        $lessonId = !empty($input['lesson_id']) ? (int)$input['lesson_id'] : null;
        $termId = !empty($input['term_id']) ? (int)$input['term_id'] : null;
        $guideBody = trim((string)$input['guide_body']);
        $learningObjectives = isset($input['learning_objectives']) ? trim((string)$input['learning_objectives']) : null;
        $suggestedSteps = isset($input['suggested_steps']) ? trim((string)$input['suggested_steps']) : null;
        $commonMistakes = isset($input['common_mistakes']) ? trim((string)$input['common_mistakes']) : null;
        $materialsNeeded = isset($input['materials_needed']) ? trim((string)$input['materials_needed']) : null;
        $expectedDuration = !empty($input['expected_duration_minutes']) ? (int)$input['expected_duration_minutes'] : 40;
        $assessmentChecklist = isset($input['assessment_checklist']) ? trim((string)$input['assessment_checklist']) : null;
        $targetLevel = isset($input['education_level_target']) && in_array($input['education_level_target'], ['basic', 'intermediate', 'advanced'], true)
            ? $input['education_level_target'] : 'intermediate';

        // Class-Subject consistency check
        $subj = $db->query("SELECT class_id FROM subjects WHERE subject_id = {$subjectId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$subj || (int)$subj['class_id'] !== $classId) {
            Response::error('Subject class mismatch: Selected subject does not belong to the selected class level.', 422);
            return;
        }

        // Lesson validation if specified
        if ($lessonId !== null) {
            $les = $db->query("SELECT subject_id, class_id FROM lessons WHERE lesson_id = {$lessonId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            if (!$les || (int)$les['subject_id'] !== $subjectId) {
                Response::error('Lesson mismatch: Selected lesson does not belong to the specified subject.', 422);
                return;
            }
        }

        // Term validation if specified
        if ($termId !== null) {
            $tExists = $db->query("SELECT term_id FROM curriculum_terms WHERE term_id = {$termId} LIMIT 1")->fetchColumn();
            if (!$tExists) {
                Response::error('Invalid curriculum term specified.', 422);
                return;
            }
        }

        // Officer ID lookup
        $officer = $db->query("SELECT officer_id FROM curriculum_officers WHERE user_id = " . (int)$user['user_id'] . " LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $officerId = $officer ? (int)$officer['officer_id'] : null;

        try {
            $db->beginTransaction();

            $stmt = $db->prepare("
                INSERT INTO parental_guides (
                    subject_id, class_id, lesson_id, term_id, officer_id, created_by,
                    title, guide_body, learning_objectives, suggested_steps, common_mistakes,
                    materials_needed, expected_duration_minutes, assessment_checklist,
                    education_level_target, status
                ) VALUES (
                    :subject_id, :class_id, :lesson_id, :term_id, :officer_id, :created_by,
                    :title, :guide_body, :learning_objectives, :suggested_steps, :common_mistakes,
                    :materials_needed, :expected_duration_minutes, :assessment_checklist,
                    :education_level_target, 'draft'
                )
            ");
            $stmt->execute([
                ':subject_id' => $subjectId,
                ':class_id' => $classId,
                ':lesson_id' => $lessonId,
                ':term_id' => $termId,
                ':officer_id' => $officerId,
                ':created_by' => (int)$user['user_id'],
                ':title' => $title,
                ':guide_body' => $guideBody,
                ':learning_objectives' => $learningObjectives,
                ':suggested_steps' => $suggestedSteps,
                ':common_mistakes' => $commonMistakes,
                ':materials_needed' => $materialsNeeded,
                ':expected_duration_minutes' => $expectedDuration,
                ':assessment_checklist' => $assessmentChecklist,
                ':education_level_target' => $targetLevel
            ]);
            $guideId = (int)$db->lastInsertId();

            // Record initial version
            $vStmt = $db->prepare("
                INSERT INTO parental_guide_versions (
                    guide_id, version_number, guide_body, created_by, change_notes, created_at
                ) VALUES (
                    :guide_id, 1, :guide_body, :created_by, 'Initial draft created', NOW()
                )
            ");
            $vStmt->execute([
                ':guide_id' => $guideId,
                ':guide_body' => $guideBody,
                ':created_by' => (int)$user['user_id']
            ]);

            AuditService::log((int)$user['user_id'], 'CREATE_PARENTAL_GUIDE', "Created parental guide draft ID #{$guideId}: '{$title}'");

            $db->commit();

            Response::success([
                'guide_id' => $guideId,
                'title' => $title,
                'status' => 'draft',
                'version' => 1
            ], 'Parental guide draft created successfully.', 201);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            Response::error('Failed to create parental guide: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/officer/guides/{id}
     * Update an existing parental guide. If already published, archives current version snapshot first.
     */
    public function updateGuide(int $id): void
    {
        $user = RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $guide = $db->query("SELECT * FROM parental_guides WHERE guide_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$guide) {
            Response::error('Parental guide not found.', 404);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $title = isset($input['title']) ? trim((string)$input['title']) : $guide['title'];
        $guideBody = isset($input['guide_body']) ? trim((string)$input['guide_body']) : $guide['guide_body'];
        $learningObjectives = isset($input['learning_objectives']) ? trim((string)$input['learning_objectives']) : $guide['learning_objectives'];
        $suggestedSteps = isset($input['suggested_steps']) ? trim((string)$input['suggested_steps']) : $guide['suggested_steps'];
        $commonMistakes = isset($input['common_mistakes']) ? trim((string)$input['common_mistakes']) : $guide['common_mistakes'];
        $materialsNeeded = isset($input['materials_needed']) ? trim((string)$input['materials_needed']) : $guide['materials_needed'];
        $expectedDuration = isset($input['expected_duration_minutes']) ? (int)$input['expected_duration_minutes'] : (int)$guide['expected_duration_minutes'];
        $assessmentChecklist = isset($input['assessment_checklist']) ? trim((string)$input['assessment_checklist']) : $guide['assessment_checklist'];
        $targetLevel = isset($input['education_level_target']) && in_array($input['education_level_target'], ['basic', 'intermediate', 'advanced'], true)
            ? $input['education_level_target'] : $guide['education_level_target'];
        $termId = isset($input['term_id']) ? (!empty($input['term_id']) ? (int)$input['term_id'] : null) : $guide['term_id'];
        $changeNotes = isset($input['change_notes']) ? trim((string)$input['change_notes']) : 'Updated guide details';

        try {
            $db->beginTransaction();

            // If updating a published guide with new content, snapshot a new version
            if ($guide['status'] === 'published' && $guideBody !== $guide['guide_body']) {
                $maxV = (int)$db->query("SELECT COALESCE(MAX(version_number), 1) FROM parental_guide_versions WHERE guide_id = {$id}")->fetchColumn();
                $newV = $maxV + 1;

                $vStmt = $db->prepare("
                    INSERT INTO parental_guide_versions (
                        guide_id, version_number, guide_body, created_by, change_notes, created_at
                    ) VALUES (
                        :guide_id, :v, :body, :created_by, :notes, NOW()
                    )
                ");
                $vStmt->execute([
                    ':guide_id' => $id,
                    ':v' => $newV,
                    ':body' => $guideBody,
                    ':created_by' => (int)$user['user_id'],
                    ':notes' => $changeNotes
                ]);
            }

            $stmt = $db->prepare("
                UPDATE parental_guides SET
                    title = :title,
                    guide_body = :guide_body,
                    learning_objectives = :learning_objectives,
                    suggested_steps = :suggested_steps,
                    common_mistakes = :common_mistakes,
                    materials_needed = :materials_needed,
                    expected_duration_minutes = :expected_duration_minutes,
                    assessment_checklist = :assessment_checklist,
                    education_level_target = :education_level_target,
                    term_id = :term_id,
                    date_updated = NOW()
                WHERE guide_id = :id
            ");
            $stmt->execute([
                ':title' => $title,
                ':guide_body' => $guideBody,
                ':learning_objectives' => $learningObjectives,
                ':suggested_steps' => $suggestedSteps,
                ':common_mistakes' => $commonMistakes,
                ':materials_needed' => $materialsNeeded,
                ':expected_duration_minutes' => $expectedDuration,
                ':assessment_checklist' => $assessmentChecklist,
                ':education_level_target' => $targetLevel,
                ':term_id' => $termId,
                ':id' => $id
            ]);

            AuditService::log((int)$user['user_id'], 'UPDATE_PARENTAL_GUIDE', "Updated parental guide ID #{$id}: '{$title}'");

            $db->commit();

            Response::success(['guide_id' => $id, 'title' => $title], 'Parental guide updated successfully.');
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            Response::error('Failed to update guide: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/officer/guides/{id}/submit
     * Submit draft guide for quality review (draft -> under_review).
     */
    public function submitForReview(int $id): void
    {
        $user = RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $guide = $db->query("SELECT guide_id, title, status FROM parental_guides WHERE guide_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$guide) {
            Response::error('Parental guide not found.', 404);
            return;
        }

        if ($guide['status'] !== 'draft') {
            Response::error("Guide cannot be submitted for review because it is currently in '{$guide['status']}' state.", 422);
            return;
        }

        $db->exec("UPDATE parental_guides SET status = 'under_review', date_updated = NOW() WHERE guide_id = {$id}");
        AuditService::log((int)$user['user_id'], 'SUBMIT_GUIDE_REVIEW', "Submitted guide #{$id} for review: '{$guide['title']}'");

        Response::success(['guide_id' => $id, 'status' => 'under_review'], 'Parental guide submitted for review.');
    }

    /**
     * POST /api/officer/guides/{id}/publish
     * Approve and publish parental guide.
     */
    public function publishGuide(int $id): void
    {
        $user = RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $guide = $db->query("SELECT guide_id, title, status FROM parental_guides WHERE guide_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$guide) {
            Response::error('Parental guide not found.', 404);
            return;
        }

        $db->exec("UPDATE parental_guides SET status = 'published', published_at = NOW(), date_updated = NOW() WHERE guide_id = {$id}");
        AuditService::log((int)$user['user_id'], 'PUBLISH_PARENTAL_GUIDE', "Published parental guide #{$id}: '{$guide['title']}'");

        Response::success(['guide_id' => $id, 'status' => 'published', 'published_at' => date('c')], 'Parental guide published successfully.');
    }

    /**
     * POST /api/officer/guides/{id}/archive
     * Retire or archive a parental guide.
     */
    public function archiveGuide(int $id): void
    {
        $user = RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $guide = $db->query("SELECT guide_id, title FROM parental_guides WHERE guide_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$guide) {
            Response::error('Parental guide not found.', 404);
            return;
        }

        $db->exec("UPDATE parental_guides SET status = 'archived', date_updated = NOW() WHERE guide_id = {$id}");
        AuditService::log((int)$user['user_id'], 'ARCHIVE_PARENTAL_GUIDE', "Archived parental guide #{$id}: '{$guide['title']}'");

        Response::success(['guide_id' => $id, 'status' => 'archived'], 'Parental guide archived successfully.');
    }

    /**
     * GET /api/officer/guides/{id}/versions
     * Fetch complete version audit history of a guide.
     */
    public function getVersions(int $id): void
    {
        RoleMiddleware::allow(['administrator', 'curriculum officer']);
        $db = Database::getConnection();

        $stmt = $db->prepare("
            SELECT v.guide_version_id, v.guide_id, v.version_number, v.change_notes, v.created_at, u.full_name as author_name
            FROM parental_guide_versions v
            JOIN users u ON v.created_by = u.user_id
            WHERE v.guide_id = :id
            ORDER BY v.version_number DESC
        ");
        $stmt->execute([':id' => $id]);
        $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success($versions, 'Guide version history retrieved.');
    }

    /**
     * GET /api/guides/{id}/export
     * Generate a printable / export layout for parents and teachers.
     */
    public function exportGuide(int $id): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->prepare("
            SELECT 
                g.*, c.class_name, s.subject_name, l.lesson_title,
                t.term_name, t.academic_year, u.full_name as officer_name
            FROM parental_guides g
            JOIN classes c ON g.class_id = c.class_id
            JOIN subjects s ON g.subject_id = s.subject_id
            LEFT JOIN lessons l ON g.lesson_id = l.lesson_id
            LEFT JOIN curriculum_terms t ON g.term_id = t.term_id
            JOIN users u ON g.created_by = u.user_id
            WHERE g.guide_id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $g = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$g) {
            Response::error('Guide not found.', 404);
            return;
        }

        Response::success([
            'guide_id' => (int)$g['guide_id'],
            'title' => $g['title'],
            'class_name' => $g['class_name'],
            'subject_name' => $g['subject_name'],
            'lesson_title' => $g['lesson_title'],
            'term' => ($g['term_name'] ?? 'Term 1') . ' (' . ($g['academic_year'] ?? '2026') . ')',
            'target_level' => ucfirst((string)$g['education_level_target']),
            'expected_duration' => ($g['expected_duration_minutes'] ?? 40) . ' Minutes',
            'learning_objectives' => $g['learning_objectives'],
            'materials_needed' => $g['materials_needed'],
            'suggested_steps' => $g['suggested_steps'],
            'common_mistakes' => $g['common_mistakes'],
            'assessment_checklist' => $g['assessment_checklist'],
            'guide_body' => $g['guide_body'],
            'published_at' => $g['published_at']
        ], 'Printable guide payload prepared.');
    }
}
