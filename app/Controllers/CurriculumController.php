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

class CurriculumController
{
    /**
     * GET /api/curriculum/classes
     * List all primary school classes (P1–P7) with subject counts, lesson counts, and total weekly hours
     */
    public function getClasses(): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->query('
            SELECT 
                c.class_id,
                c.class_name,
                c.class_code,
                c.level,
                c.description,
                c.min_age,
                c.max_age,
                c.is_active,
                COUNT(DISTINCT s.subject_id) as total_subjects,
                COUNT(DISTINCT l.lesson_id) as total_lessons,
                COALESCE(SUM(DISTINCT s.weekly_hours), 0) as total_weekly_hours
            FROM classes c
            LEFT JOIN subjects s ON c.class_id = s.class_id AND s.is_active = 1
            LEFT JOIN lessons l ON s.subject_id = l.subject_id AND l.status = "active"
            WHERE c.is_active = 1
            GROUP BY c.class_id
            ORDER BY c.level ASC
        ');
        $classes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($classes as &$cls) {
            $cls['total_subjects'] = (int)$cls['total_subjects'];
            $cls['total_lessons'] = (int)$cls['total_lessons'];
            $cls['total_weekly_hours'] = (float)$cls['total_weekly_hours'];
        }

        Response::success($classes, 'Curriculum primary classes retrieved successfully.');
    }

    /**
     * GET /api/curriculum/subjects
     * List all active curriculum subjects across all primary classes
     */
    public function getAllSubjects(): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->query('
            SELECT 
                s.subject_id,
                s.class_id,
                s.subject_name,
                s.subject_code,
                s.description,
                s.language_of_instruction,
                s.weekly_hours,
                s.is_active,
                c.class_name,
                c.class_code,
                c.level as class_level
            FROM subjects s
            JOIN classes c ON s.class_id = c.class_id
            WHERE s.is_active = 1 AND c.is_active = 1
            ORDER BY c.level ASC, s.subject_name ASC
        ');
        $subjects = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($subjects as &$subj) {
            $subj['subject_id'] = (int)$subj['subject_id'];
            $subj['class_id'] = (int)$subj['class_id'];
            $subj['weekly_hours'] = (float)$subj['weekly_hours'];
            $subj['class_level'] = (int)$subj['class_level'];
        }

        Response::success($subjects, 'All curriculum subjects retrieved successfully.');
    }

    /**
     * GET /api/curriculum/classes/{id}/subjects
     * List all active subjects under a specific primary class
     */
    public function getSubjects(int $id): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $classId = (int)$id;

        // Verify class exists
        $clsStmt = $db->prepare('SELECT class_id, class_name, class_code, level FROM classes WHERE class_id = :cid AND is_active = 1 LIMIT 1');
        $clsStmt->execute([':cid' => $classId]);
        $class = $clsStmt->fetch(PDO::FETCH_ASSOC);

        if (!$class) {
            Response::notFound('Primary class not found or inactive.');
        }

        $stmt = $db->prepare('
            SELECT 
                s.subject_id,
                s.class_id,
                s.subject_name,
                s.subject_code,
                s.description,
                s.language_of_instruction,
                s.weekly_hours,
                s.is_active,
                c.class_name,
                c.class_code,
                (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = "active") as active_lessons_count,
                (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id) as total_lessons_count
            FROM subjects s
            JOIN classes c ON s.class_id = c.class_id
            WHERE s.class_id = :cid AND s.is_active = 1
            ORDER BY s.subject_name ASC
        ');
        $stmt->execute([':cid' => $classId]);
        $subjects = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($subjects as &$subj) {
            $subj['active_lessons_count'] = (int)$subj['active_lessons_count'];
            $subj['total_lessons_count'] = (int)$subj['total_lessons_count'];
            $subj['weekly_hours'] = (float)$subj['weekly_hours'];
        }

        Response::success([
            'class' => $class,
            'subjects' => $subjects
        ], 'Curriculum subjects retrieved successfully.');
    }

    /**
     * GET /api/curriculum/subjects/{id}
     * Retrieve single subject details
     */
    public function getSubject(int $id): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                s.*,
                c.class_name,
                c.class_code,
                c.level as class_level,
                (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id AND l.status = "active") as active_lessons_count,
                (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.subject_id) as total_lessons_count
            FROM subjects s
            JOIN classes c ON s.class_id = c.class_id
            WHERE s.subject_id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $subject = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$subject) {
            Response::notFound('Subject not found.');
        }

        $subject['active_lessons_count'] = (int)$subject['active_lessons_count'];
        $subject['total_lessons_count'] = (int)$subject['total_lessons_count'];
        $subject['weekly_hours'] = (float)$subject['weekly_hours'];

        Response::success($subject, 'Subject retrieved successfully.');
    }

    /**
     * GET /api/curriculum/subjects/{id}/lessons
     * Retrieve sequenced lessons for a subject with search and status filtering
     */
    public function getLessons(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();
        $subjectId = (int)$id;

        // Check subject existence
        $sStmt = $db->prepare('
            SELECT s.*, c.class_name, c.class_code, c.level as class_level 
            FROM subjects s
            JOIN classes c ON s.class_id = c.class_id
            WHERE s.subject_id = :sid LIMIT 1
        ');
        $sStmt->execute([':sid' => $subjectId]);
        $subject = $sStmt->fetch(PDO::FETCH_ASSOC);

        if (!$subject) {
            Response::notFound('Subject not found.');
        }

        $isStaff = in_array($user['role_code'], ['curriculum_officer', 'administrator', 'teacher'], true);

        $where = ['l.subject_id = :sid'];
        $params = [':sid' => $subjectId];

        // Status filter
        if (!empty($_GET['status']) && $isStaff) {
            $status = strtolower(trim((string)$_GET['status']));
            if ($status !== 'all') {
                $where[] = 'l.status = :status';
                $params[':status'] = $status;
            }
        } else {
            // Non-staff or default: active lessons only
            $where[] = 'l.status = "active"';
        }

        // Search query
        if (!empty($_GET['search'])) {
            $search = '%' . trim((string)$_GET['search']) . '%';
            $where[] = '(l.lesson_title LIKE :search1 OR l.lesson_objectives LIKE :search2)';
            $params[':search1'] = $search;
            $params[':search2'] = $search;
        }

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        $sql = "
            SELECT 
                l.lesson_id,
                l.subject_id,
                l.class_id,
                l.lesson_title,
                l.lesson_objectives,
                l.duration_minutes,
                l.sequence_number,
                l.curriculum_version,
                l.status,
                l.created_at,
                l.updated_at,
                s.subject_name,
                s.subject_code,
                c.class_name,
                c.class_code
            FROM lessons l
            JOIN subjects s ON l.subject_id = s.subject_id
            JOIN classes c ON l.class_id = c.class_id
            {$whereClause}
            ORDER BY l.sequence_number ASC, l.lesson_id ASC
        ";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $lessons = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($lessons as &$lesson) {
            $lesson['duration_minutes'] = (int)$lesson['duration_minutes'];
            $lesson['sequence_number'] = (int)$lesson['sequence_number'];
        }

        Response::success([
            'subject' => $subject,
            'lessons' => $lessons,
            'total_lessons' => count($lessons)
        ], 'Curriculum lessons retrieved successfully.');
    }

    /**
     * GET /api/curriculum/lessons/{id}
     * Retrieve single lesson with complete metadata
     */
    public function getLesson(int $id): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                l.*,
                s.subject_name,
                s.subject_code,
                s.language_of_instruction,
                c.class_name,
                c.class_code,
                c.level as class_level
            FROM lessons l
            JOIN subjects s ON l.subject_id = s.subject_id
            JOIN classes c ON l.class_id = c.class_id
            WHERE l.lesson_id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $lesson = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$lesson) {
            Response::notFound('Lesson not found.');
        }

        $lesson['duration_minutes'] = (int)$lesson['duration_minutes'];
        $lesson['sequence_number'] = (int)$lesson['sequence_number'];

        Response::success($lesson, 'Lesson details retrieved successfully.');
    }

    /**
     * POST /api/officer/subjects
     * Author a new curriculum subject (Officer & Admin only)
     */
    public function createSubject(): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'class_id' => 'required',
            'subject_name' => 'required|min:2|max:100',
            'subject_code' => 'required|min:2|max:30',
            'weekly_hours' => 'required'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $classId = (int)$data['class_id'];
        $name = trim((string)$data['subject_name']);
        $code = strtoupper(trim((string)$data['subject_code']));
        $desc = trim((string)($data['description'] ?? ''));
        $lang = trim((string)($data['language_of_instruction'] ?? 'English'));
        $hours = max(0.5, (float)$data['weekly_hours']);

        // Check class
        $cCheck = $db->prepare('SELECT class_id, class_name FROM classes WHERE class_id = :cid AND is_active = 1 LIMIT 1');
        $cCheck->execute([':cid' => $classId]);
        $classRecord = $cCheck->fetch(PDO::FETCH_ASSOC);
        if (!$classRecord) {
            Response::validationError(['class_id' => ['Selected class is invalid or inactive.']]);
        }

        // Check unique code
        $codeCheck = $db->prepare('SELECT subject_id FROM subjects WHERE subject_code = :code LIMIT 1');
        $codeCheck->execute([':code' => $code]);
        if ($codeCheck->fetchColumn()) {
            Response::error("Subject code '{$code}' already exists. Please choose a unique code.", 409);
        }

        $stmt = $db->prepare('
            INSERT INTO subjects (
                class_id, subject_name, subject_code, description,
                language_of_instruction, weekly_hours, is_active, created_at, updated_at
            ) VALUES (
                :cid, :name, :code, :desc,
                :lang, :hours, 1, NOW(), NOW()
            )
        ');
        $stmt->execute([
            ':cid' => $classId,
            ':name' => $name,
            ':code' => $code,
            ':desc' => $desc,
            ':lang' => $lang,
            ':hours' => $hours
        ]);
        $subjectId = (int)$db->lastInsertId();

        AuditService::log(
            (int)$user['user_id'],
            'SUBJECT_CREATED',
            "Created curriculum subject '{$name}' ({$code}) under {$classRecord['class_name']}",
            'subjects',
            $subjectId,
            null,
            $data
        );

        Response::success([
            'subject_id' => $subjectId,
            'subject_name' => $name,
            'subject_code' => $code,
            'class_id' => $classId
        ], "Subject '{$name}' created successfully.", 201);
    }

    /**
     * PUT /api/officer/subjects/{id}
     * Update subject properties (Officer & Admin only)
     */
    public function updateSubject(int $id): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'subject_name' => 'required|min:2|max:100',
            'weekly_hours' => 'required'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $curStmt = $db->prepare('SELECT * FROM subjects WHERE subject_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $current = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::notFound('Subject not found.');
        }

        $name = trim((string)$data['subject_name']);
        $desc = trim((string)($data['description'] ?? $current['description']));
        $lang = trim((string)($data['language_of_instruction'] ?? $current['language_of_instruction']));
        $hours = max(0.5, (float)$data['weekly_hours']);
        $isActive = isset($data['is_active']) ? ((int)$data['is_active'] ? 1 : 0) : (int)$current['is_active'];

        $upStmt = $db->prepare('
            UPDATE subjects SET 
                subject_name = :name,
                description = :desc,
                language_of_instruction = :lang,
                weekly_hours = :hours,
                is_active = :active,
                updated_at = NOW()
            WHERE subject_id = :id
        ');
        $upStmt->execute([
            ':name' => $name,
            ':desc' => $desc,
            ':lang' => $lang,
            ':hours' => $hours,
            ':active' => $isActive,
            ':id' => $id
        ]);

        AuditService::log(
            (int)$user['user_id'],
            'SUBJECT_UPDATED',
            "Updated curriculum subject #{$id} ({$name})",
            'subjects',
            $id,
            $current,
            $data
        );

        Response::success([
            'subject_id' => $id,
            'subject_name' => $name,
            'weekly_hours' => $hours,
            'is_active' => $isActive
        ], "Subject '{$name}' updated successfully.");
    }

    /**
     * POST /api/officer/lessons
     * Create a new lesson under a subject (Officer & Admin only)
     */
    public function createLesson(): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'subject_id' => 'required',
            'lesson_title' => 'required|min:3|max:200',
            'lesson_objectives' => 'required|min:5'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $subjectId = (int)$data['subject_id'];
        $title = trim((string)$data['lesson_title']);
        $objectives = trim((string)$data['lesson_objectives']);
        $duration = max(10, min(180, (int)($data['duration_minutes'] ?? 40)));
        $version = trim((string)($data['curriculum_version'] ?? 'NCDC-2026.1'));
        $status = in_array($data['status'] ?? 'active', ['draft', 'active', 'retired'], true) ? $data['status'] : 'active';

        // Check subject & resolve class_id
        $sStmt = $db->prepare('SELECT subject_id, class_id, subject_name, subject_code FROM subjects WHERE subject_id = :sid LIMIT 1');
        $sStmt->execute([':sid' => $subjectId]);
        $subject = $sStmt->fetch(PDO::FETCH_ASSOC);

        if (!$subject) {
            Response::validationError(['subject_id' => ['Target subject not found.']]);
        }

        $classId = (int)$subject['class_id'];

        // Strict Class Consistency Validation: If class_id passed explicitly, must match subject class_id
        if (!empty($data['class_id']) && (int)$data['class_id'] !== $classId) {
            Response::error("Class mismatch error: Lesson class (#{$data['class_id']}) does not match the parent subject's class (#{$classId}).", 422);
        }

        // Automatic Sequence Number Allocation if not provided or 0
        $seq = (int)($data['sequence_number'] ?? 0);
        if ($seq <= 0) {
            $maxSeq = (int)$db->query("SELECT COALESCE(MAX(sequence_number), 0) FROM lessons WHERE subject_id = {$subjectId}")->fetchColumn();
            $seq = $maxSeq + 1;
        }

        $ins = $db->prepare('
            INSERT INTO lessons (
                subject_id, class_id, lesson_title, lesson_objectives,
                duration_minutes, sequence_number, curriculum_version, status, created_at, updated_at
            ) VALUES (
                :sid, :cid, :title, :obj,
                :dur, :seq, :ver, :stat, NOW(), NOW()
            )
        ');
        $ins->execute([
            ':sid' => $subjectId,
            ':cid' => $classId,
            ':title' => $title,
            ':obj' => $objectives,
            ':dur' => $duration,
            ':seq' => $seq,
            ':ver' => $version,
            ':stat' => $status
        ]);
        $lessonId = (int)$db->lastInsertId();

        AuditService::log(
            (int)$user['user_id'],
            'LESSON_CREATED',
            "Created lesson #{$lessonId} '{$title}' (Seq #{$seq}) under {$subject['subject_name']}",
            'lessons',
            $lessonId,
            null,
            $data
        );

        Response::success([
            'lesson_id' => $lessonId,
            'subject_id' => $subjectId,
            'class_id' => $classId,
            'lesson_title' => $title,
            'sequence_number' => $seq,
            'duration_minutes' => $duration,
            'status' => $status
        ], "Lesson '{$title}' created successfully in sequence #{$seq}.", 201);
    }

    /**
     * PUT /api/officer/lessons/{id}
     * Update lesson title, objectives, duration, sequence, or version (Officer & Admin only)
     */
    public function updateLesson(int $id): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'lesson_title' => 'required|min:3|max:200',
            'lesson_objectives' => 'required|min:5'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $curStmt = $db->prepare('SELECT * FROM lessons WHERE lesson_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $current = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::notFound('Lesson not found.');
        }

        $title = trim((string)$data['lesson_title']);
        $objectives = trim((string)$data['lesson_objectives']);
        $duration = max(10, min(180, (int)($data['duration_minutes'] ?? $current['duration_minutes'])));
        $seq = max(1, (int)($data['sequence_number'] ?? $current['sequence_number']));
        $version = trim((string)($data['curriculum_version'] ?? $current['curriculum_version']));
        $status = in_array($data['status'] ?? $current['status'], ['draft', 'active', 'retired'], true) ? $data['status'] : $current['status'];

        $up = $db->prepare('
            UPDATE lessons SET 
                lesson_title = :title,
                lesson_objectives = :obj,
                duration_minutes = :dur,
                sequence_number = :seq,
                curriculum_version = :ver,
                status = :stat,
                updated_at = NOW()
            WHERE lesson_id = :id
        ');
        $up->execute([
            ':title' => $title,
            ':obj' => $objectives,
            ':dur' => $duration,
            ':seq' => $seq,
            ':ver' => $version,
            ':stat' => $status,
            ':id' => $id
        ]);

        AuditService::log(
            (int)$user['user_id'],
            'LESSON_UPDATED',
            "Updated lesson #{$id} ({$title})",
            'lessons',
            $id,
            $current,
            $data
        );

        Response::success([
            'lesson_id' => $id,
            'lesson_title' => $title,
            'sequence_number' => $seq,
            'duration_minutes' => $duration,
            'status' => $status
        ], "Lesson updated successfully.");
    }

    /**
     * POST /api/officer/lessons/{id}/retire
     * Soft-retires a lesson preserving historical records for completed cohorts
     */
    public function retireLesson(int $id): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $curStmt = $db->prepare('SELECT * FROM lessons WHERE lesson_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $current = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::notFound('Lesson not found.');
        }

        $newStatus = ($current['status'] === 'retired') ? 'active' : 'retired';

        $up = $db->prepare('UPDATE lessons SET status = :stat, updated_at = NOW() WHERE lesson_id = :id');
        $up->execute([':stat' => $newStatus, ':id' => $id]);

        AuditService::log(
            (int)$user['user_id'],
            'LESSON_STATUS_CHANGED',
            "Changed lesson #{$id} ({$current['lesson_title']}) status to '{$newStatus}'",
            'lessons',
            $id,
            ['status' => $current['status']],
            ['status' => $newStatus]
        );

        $actionWord = ($newStatus === 'retired') ? 'retired' : 're-activated';
        Response::success([
            'lesson_id' => $id,
            'status' => $newStatus
        ], "Lesson '{$current['lesson_title']}' successfully {$actionWord}.");
    }

    /**
     * POST /api/officer/lessons/reorder
     * Batch reorders the sequence numbers of lessons within a subject
     */
    public function reorderLessons(): void
    {
        $user = RoleMiddleware::permit(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        if (empty($data['subject_id']) || empty($data['lesson_ids']) || !is_array($data['lesson_ids'])) {
            Response::badRequest('Valid subject_id and an ordered array of lesson_ids are required.');
        }

        $subjectId = (int)$data['subject_id'];
        $lessonIds = array_map('intval', $data['lesson_ids']);

        $db->beginTransaction();
        try {
            // Shift existing sequences temporarily to avoid unique (subject_id, sequence_number) constraint collision
            $shift = $db->prepare('UPDATE lessons SET sequence_number = sequence_number + 100000 WHERE subject_id = :sid');
            $shift->execute([':sid' => $subjectId]);

            $up = $db->prepare('UPDATE lessons SET sequence_number = :seq, updated_at = NOW() WHERE lesson_id = :lid AND subject_id = :sid');
            foreach ($lessonIds as $index => $lid) {
                $seq = $index + 1;
                $up->execute([
                    ':seq' => $seq,
                    ':lid' => $lid,
                    ':sid' => $subjectId
                ]);
            }
            $db->commit();

            AuditService::log(
                (int)$user['user_id'],
                'LESSONS_REORDERED',
                "Reordered " . count($lessonIds) . " lessons in subject #{$subjectId}",
                'lessons',
                $subjectId
            );

            Response::success([
                'subject_id' => $subjectId,
                'total_reordered' => count($lessonIds)
            ], 'Lessons successfully re-sequenced.');

        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Failed to reorder lessons: ' . $e->getMessage(), 500);
        }
    }
}
