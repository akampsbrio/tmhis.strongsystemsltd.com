<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

class ScheduleController
{
    /**
     * GET /api/parent/terms OR GET /api/curriculum/terms
     * Retrieve academic terms with current term week calculation.
     */
    public function getTerms(): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->query("
            SELECT term_id, academic_year, term_number, term_name, start_date, end_date, is_current
            FROM curriculum_terms
            ORDER BY academic_year DESC, term_number ASC
        ");
        $terms = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $today = date('Y-m-d');
        foreach ($terms as &$t) {
            $t['term_id'] = (int)$t['term_id'];
            $t['academic_year'] = (int)$t['academic_year'];
            $t['term_number'] = (int)$t['term_number'];
            $t['is_current'] = (bool)$t['is_current'];

            $start = strtotime($t['start_date']);
            $end = strtotime($t['end_date']);
            $now = strtotime($today);

            if ($now >= $start && $now <= $end) {
                $daysDiff = floor(($now - $start) / 86400);
                $t['current_week'] = min(12, max(1, (int)floor($daysDiff / 7) + 1));
                $t['is_active_now'] = true;
            } else {
                $t['current_week'] = null;
                $t['is_active_now'] = false;
            }
            $t['total_weeks'] = 12;
        }

        Response::success($terms, 'Curriculum academic terms retrieved successfully.');
    }

    /**
     * Helper to resolve parent ID or verify learner access
     */
    private function resolveParentOrLearnerAccess(array $user, ?int $requestedLearnerId, PDO $db): ?int
    {
        $role = strtolower($user['role_name'] ?? '');

        // If admin or curriculum officer, allow any learner
        if (in_array($role, ['administrator', 'curriculum officer', 'super administrator'], true)) {
            return null; // No restriction
        }

        // If Parent
        if (in_array($role, ['parent/guardian', 'parent'], true)) {
            $parent = $db->query("SELECT parent_id FROM parents WHERE user_id = " . (int)$user['user_id'] . " LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            if (!$parent) {
                Response::error('Parent record not found for this account.', 403);
                exit;
            }
            $parentId = (int)$parent['parent_id'];

            if ($requestedLearnerId !== null) {
                $owns = (int)$db->query("SELECT COUNT(*) FROM learners WHERE learner_id = {$requestedLearnerId} AND parent_id = {$parentId}")->fetchColumn();
                if ($owns === 0) {
                    Response::error('Access denied: You do not have permission to manage this learner.', 403);
                    exit;
                }
            }
            return $parentId;
        }

        // If Learner user
        if ($role === 'learner') {
            $learner = $db->query("SELECT learner_id FROM learners WHERE user_id = " . (int)$user['user_id'] . " LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            if (!$learner) {
                Response::error('Learner record not found for this account.', 403);
                exit;
            }
            if ($requestedLearnerId !== null && (int)$learner['learner_id'] !== $requestedLearnerId) {
                Response::error('Access denied: Learners can only view their own schedule.', 403);
                exit;
            }
            return null;
        }

        return null;
    }

    /**
     * GET /api/parent/schedule
     * List learning schedule entries with filtering by learner, term, date range, and status.
     */
    public function getSchedule(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $requestedLearnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;
        $parentId = $this->resolveParentOrLearnerAccess($user, $requestedLearnerId, $db);

        $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
        $startDate = isset($_GET['start_date']) ? trim((string)$_GET['start_date']) : null;
        $endDate = isset($_GET['end_date']) ? trim((string)$_GET['end_date']) : null;
        $status = isset($_GET['status']) ? trim((string)$_GET['status']) : null;

        $where = ['1=1'];
        $params = [];

        if ($parentId !== null) {
            $where[] = "l.parent_id = :parent_id";
            $params[':parent_id'] = $parentId;
        }

        if ($requestedLearnerId !== null) {
            $where[] = "s.learner_id = :learner_id";
            $params[':learner_id'] = $requestedLearnerId;
        }

        if ($termId !== null) {
            $where[] = "s.term_id = :term_id";
            $params[':term_id'] = $termId;
        }

        if ($startDate !== null && $endDate !== null) {
            $where[] = "s.scheduled_date BETWEEN :start_date AND :end_date";
            $params[':start_date'] = $startDate;
            $params[':end_date'] = $endDate;
        } elseif ($startDate !== null) {
            $where[] = "s.scheduled_date >= :start_date";
            $params[':start_date'] = $startDate;
        }

        if ($status && in_array($status, ['planned', 'completed', 'skipped', 'cancelled'], true)) {
            $where[] = "s.status = :status";
            $params[':status'] = $status;
        }

        $whereClause = implode(' AND ', $where);

        $stmt = $db->prepare("
            SELECT 
                s.schedule_id,
                s.learner_id,
                s.lesson_id,
                s.subject_id,
                s.term_id,
                s.scheduled_date,
                s.start_time,
                s.end_time,
                s.status,
                s.notes,
                s.created_at,
                s.updated_at,
                l.full_name as learner_name,
                l.avatar_url as learner_avatar,
                c.class_name,
                c.class_code,
                c.level as class_level,
                subj.subject_name,
                subj.subject_code,
                les.lesson_title,
                les.sequence_number as lesson_sequence,
                les.duration_minutes as standard_duration,
                t.term_name,
                t.term_number,
                t.academic_year,
                g.guide_id,
                g.title as guide_title,
                g.education_level_target as guide_level_target,
                g.expected_duration_minutes as guide_duration
            FROM learning_schedules s
            JOIN learners l ON s.learner_id = l.learner_id
            JOIN classes c ON l.class_id = c.class_id
            LEFT JOIN subjects subj ON s.subject_id = subj.subject_id
            LEFT JOIN lessons les ON s.lesson_id = les.lesson_id
            LEFT JOIN curriculum_terms t ON s.term_id = t.term_id
            LEFT JOIN parental_guides g ON les.lesson_id = g.lesson_id AND g.status = 'published'
            WHERE {$whereClause}
            ORDER BY s.scheduled_date ASC, s.start_time ASC, s.schedule_id ASC
        ");
        $stmt->execute($params);
        $schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($schedules as &$item) {
            $item['schedule_id'] = (int)$item['schedule_id'];
            $item['learner_id'] = (int)$item['learner_id'];
            $item['lesson_id'] = $item['lesson_id'] !== null ? (int)$item['lesson_id'] : null;
            $item['subject_id'] = $item['subject_id'] !== null ? (int)$item['subject_id'] : null;
            $item['term_id'] = $item['term_id'] !== null ? (int)$item['term_id'] : null;
            $item['guide_id'] = $item['guide_id'] !== null ? (int)$item['guide_id'] : null;
            $item['class_level'] = (int)$item['class_level'];
        }

        Response::success($schedules, 'Learning schedules retrieved successfully.');
    }

    /**
     * POST /api/parent/schedule
     * Create a scheduled session for a learner.
     */
    public function createSchedule(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($input);
        $validator->required(['learner_id', 'scheduled_date']);

        if (!$validator->isValid()) {
            Response::error('Validation failed: ' . implode(', ', $validator->getErrors()), 422, $validator->getErrors());
            return;
        }

        $learnerId = (int)$input['learner_id'];
        $this->resolveParentOrLearnerAccess($user, $learnerId, $db);

        $scheduledDate = trim((string)$input['scheduled_date']);
        $startTime = !empty($input['start_time']) ? trim((string)$input['start_time']) : null;
        $endTime = !empty($input['end_time']) ? trim((string)$input['end_time']) : null;
        $subjectId = !empty($input['subject_id']) ? (int)$input['subject_id'] : null;
        $lessonId = !empty($input['lesson_id']) ? (int)$input['lesson_id'] : null;
        $notes = isset($input['notes']) ? trim((string)$input['notes']) : null;
        $termId = !empty($input['term_id']) ? (int)$input['term_id'] : null;

        // If lesson provided, resolve subject automatically if missing
        if ($lessonId !== null && $subjectId === null) {
            $lessonInfo = $db->query("SELECT subject_id FROM lessons WHERE lesson_id = {$lessonId}")->fetch(PDO::FETCH_ASSOC);
            if ($lessonInfo) {
                $subjectId = (int)$lessonInfo['subject_id'];
            }
        }

        // Auto-resolve term if not specified
        if ($termId === null) {
            $termRow = $db->query("
                SELECT term_id FROM curriculum_terms 
                WHERE '{$scheduledDate}' BETWEEN start_date AND end_date 
                ORDER BY is_current DESC LIMIT 1
            ")->fetch(PDO::FETCH_ASSOC);
            if ($termRow) {
                $termId = (int)$termRow['term_id'];
            } else {
                // Fallback to active current term
                $currentTerm = $db->query("SELECT term_id FROM curriculum_terms WHERE is_current = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
                $termId = $currentTerm ? (int)$currentTerm['term_id'] : null;
            }
        }

        try {
            $stmt = $db->prepare("
                INSERT INTO learning_schedules (
                    learner_id, lesson_id, subject_id, term_id, scheduled_date,
                    start_time, end_time, status, notes, created_by
                ) VALUES (
                    :learner_id, :lesson_id, :subject_id, :term_id, :scheduled_date,
                    :start_time, :end_time, 'planned', :notes, :created_by
                )
            ");
            $stmt->execute([
                ':learner_id' => $learnerId,
                ':lesson_id' => $lessonId,
                ':subject_id' => $subjectId,
                ':term_id' => $termId,
                ':scheduled_date' => $scheduledDate,
                ':start_time' => $startTime,
                ':end_time' => $endTime,
                ':notes' => $notes,
                ':created_by' => (int)$user['user_id']
            ]);

            $scheduleId = (int)$db->lastInsertId();

            AuditService::log((int)$user['user_id'], 'CREATE_SCHEDULE', "Scheduled learning session #{$scheduleId} for learner #{$learnerId} on {$scheduledDate}");

            Response::success([
                'schedule_id' => $scheduleId,
                'learner_id' => $learnerId,
                'scheduled_date' => $scheduledDate,
                'term_id' => $termId,
                'status' => 'planned'
            ], 'Learning session scheduled successfully.', 201);
        } catch (Throwable $e) {
            Response::error('Failed to create schedule: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/parent/schedule/{id}
     * Update an existing schedule entry.
     */
    public function updateSchedule(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $schedule = $db->query("SELECT * FROM learning_schedules WHERE schedule_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$schedule) {
            Response::error('Schedule entry not found.', 404);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, (int)$schedule['learner_id'], $db);

        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $scheduledDate = isset($input['scheduled_date']) ? trim((string)$input['scheduled_date']) : $schedule['scheduled_date'];
        $startTime = array_key_exists('start_time', $input) ? (!empty($input['start_time']) ? trim((string)$input['start_time']) : null) : $schedule['start_time'];
        $endTime = array_key_exists('end_time', $input) ? (!empty($input['end_time']) ? trim((string)$input['end_time']) : null) : $schedule['end_time'];
        $subjectId = array_key_exists('subject_id', $input) ? (!empty($input['subject_id']) ? (int)$input['subject_id'] : null) : $schedule['subject_id'];
        $lessonId = array_key_exists('lesson_id', $input) ? (!empty($input['lesson_id']) ? (int)$input['lesson_id'] : null) : $schedule['lesson_id'];
        $notes = array_key_exists('notes', $input) ? trim((string)$input['notes']) : $schedule['notes'];
        $termId = array_key_exists('term_id', $input) ? (!empty($input['term_id']) ? (int)$input['term_id'] : null) : $schedule['term_id'];

        $stmt = $db->prepare("
            UPDATE learning_schedules SET
                scheduled_date = :scheduled_date,
                start_time = :start_time,
                end_time = :end_time,
                subject_id = :subject_id,
                lesson_id = :lesson_id,
                term_id = :term_id,
                notes = :notes,
                updated_at = NOW()
            WHERE schedule_id = :id
        ");
        $stmt->execute([
            ':scheduled_date' => $scheduledDate,
            ':start_time' => $startTime,
            ':end_time' => $endTime,
            ':subject_id' => $subjectId,
            ':lesson_id' => $lessonId,
            ':term_id' => $termId,
            ':notes' => $notes,
            ':id' => $id
        ]);

        AuditService::log((int)$user['user_id'], 'UPDATE_SCHEDULE', "Updated schedule entry #{$id}");

        Response::success(['schedule_id' => $id, 'scheduled_date' => $scheduledDate], 'Schedule updated successfully.');
    }

    /**
     * PATCH /api/parent/schedule/{id}/status
     * Transition status (planned, completed, skipped, cancelled).
     */
    public function updateStatus(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $schedule = $db->query("SELECT * FROM learning_schedules WHERE schedule_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$schedule) {
            Response::error('Schedule entry not found.', 404);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, (int)$schedule['learner_id'], $db);

        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = isset($input['status']) ? trim((string)$input['status']) : '';

        if (!in_array($status, ['planned', 'completed', 'skipped', 'cancelled'], true)) {
            Response::error("Invalid status. Allowed values: 'planned', 'completed', 'skipped', 'cancelled'.", 422);
            return;
        }

        $notes = isset($input['notes']) ? trim((string)$input['notes']) : $schedule['notes'];

        $stmt = $db->prepare("UPDATE learning_schedules SET status = :status, notes = :notes, updated_at = NOW() WHERE schedule_id = :id");
        $stmt->execute([':status' => $status, ':notes' => $notes, ':id' => $id]);

        AuditService::log((int)$user['user_id'], 'UPDATE_SCHEDULE_STATUS', "Changed status of schedule #{$id} to '{$status}'");

        Response::success(['schedule_id' => $id, 'status' => $status], "Session marked as {$status}.");
    }

    /**
     * DELETE /api/parent/schedule/{id}
     * Delete a scheduled entry.
     */
    public function deleteSchedule(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $schedule = $db->query("SELECT * FROM learning_schedules WHERE schedule_id = {$id} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$schedule) {
            Response::error('Schedule entry not found.', 404);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, (int)$schedule['learner_id'], $db);

        $db->exec("DELETE FROM learning_schedules WHERE schedule_id = {$id}");
        AuditService::log((int)$user['user_id'], 'DELETE_SCHEDULE', "Deleted schedule entry #{$id}");

        Response::success(['schedule_id' => $id], 'Schedule entry deleted.');
    }

    /**
     * GET /api/parent/schedule/term-summary
     * Calculate term progress, hours logged, and completion percentages for a learner.
     */
    public function getTermSummary(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $learnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;
        if (!$learnerId) {
            Response::error('Learner ID is required.', 422);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, $learnerId, $db);

        // Term resolution
        $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
        if (!$termId) {
            $currentTerm = $db->query("SELECT term_id FROM curriculum_terms WHERE is_current = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            $termId = $currentTerm ? (int)$currentTerm['term_id'] : 1;
        }

        $termInfo = $db->query("SELECT * FROM curriculum_terms WHERE term_id = {$termId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);

        // Aggregate statistics for this learner and term
        $statsStmt = $db->prepare("
            SELECT 
                COUNT(*) as total_scheduled,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned_count,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(MINUTE, start_time, end_time) ELSE 0 END), 0) as completed_minutes
            FROM learning_schedules
            WHERE learner_id = :learner_id AND (term_id = :term_id OR (scheduled_date BETWEEN :start_date AND :end_date))
        ");
        $statsStmt->execute([
            ':learner_id' => $learnerId,
            ':term_id' => $termId,
            ':start_date' => $termInfo['start_date'] ?? '2026-01-01',
            ':end_date' => $termInfo['end_date'] ?? '2026-12-31'
        ]);
        $stats = $statsStmt->fetch(PDO::FETCH_ASSOC);

        $total = (int)$stats['total_scheduled'];
        $completed = (int)$stats['completed_count'];
        $completionPct = $total > 0 ? round(($completed / $total) * 100, 1) : 0;
        $completedHours = round((int)$stats['completed_minutes'] / 60, 1);

        // Enrolled subjects progress
        $subjStmt = $db->prepare("
            SELECT 
                s.subject_id, s.subject_name, s.subject_code, s.weekly_hours,
                COUNT(sch.schedule_id) as subject_total,
                SUM(CASE WHEN sch.status = 'completed' THEN 1 ELSE 0 END) as subject_completed
            FROM learner_subjects ls
            JOIN subjects s ON ls.subject_id = s.subject_id
            LEFT JOIN learning_schedules sch ON sch.learner_id = ls.learner_id AND sch.subject_id = s.subject_id AND (sch.term_id = :term_id OR (sch.scheduled_date BETWEEN :start_date AND :end_date))
            WHERE ls.learner_id = :learner_id AND ls.status = 'active'
            GROUP BY s.subject_id
            ORDER BY s.subject_name ASC
        ");
        $subjStmt->execute([
            ':learner_id' => $learnerId,
            ':term_id' => $termId,
            ':start_date' => $termInfo['start_date'] ?? '2026-01-01',
            ':end_date' => $termInfo['end_date'] ?? '2026-12-31'
        ]);
        $subjectProgress = $subjStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success([
            'term' => $termInfo,
            'summary' => [
                'total_scheduled' => $total,
                'completed' => $completed,
                'planned' => (int)$stats['planned_count'],
                'skipped' => (int)$stats['skipped_count'],
                'cancelled' => (int)$stats['cancelled_count'],
                'completion_rate_percent' => $completionPct,
                'completed_hours' => $completedHours
            ],
            'subjects' => $subjectProgress
        ], 'Term progress summary calculated.');
    }

    /**
     * GET /api/parent/schedule/suggested-next
     * Explainable, rule-based recommendation signals:
     * 1. Next sequential lesson in syllabus for enrolled subjects.
     * 2. Incomplete or skipped lessons backlog.
     * 3. Attached parental guides for instant 1-click scheduling.
     */
    public function getSuggestedNext(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $learnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;
        if (!$learnerId) {
            Response::error('Learner ID is required.', 422);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, $learnerId, $db);

        $learner = $db->query("SELECT learner_id, full_name, class_id FROM learners WHERE learner_id = {$learnerId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$learner) {
            Response::error('Learner not found.', 404);
            return;
        }

        $classId = (int)$learner['class_id'];

        // 1. Get current active term
        $currentTerm = $db->query("SELECT * FROM curriculum_terms WHERE is_current = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $termName = $currentTerm ? $currentTerm['term_name'] : 'Current Term';

        // 2. Fetch enrolled subjects
        $subjects = $db->query("
            SELECT s.subject_id, s.subject_name, s.subject_code, s.weekly_hours
            FROM learner_subjects ls
            JOIN subjects s ON ls.subject_id = s.subject_id
            WHERE ls.learner_id = {$learnerId} AND ls.status = 'active'
            ORDER BY s.weekly_hours DESC, s.subject_name ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $suggestions = [];

        // Check for any skipped lessons first (Catch-up priority)
        $skipped = $db->query("
            SELECT 
                sch.schedule_id, sch.scheduled_date, les.lesson_id, les.lesson_title, les.sequence_number,
                s.subject_id, s.subject_name,
                g.guide_id, g.title as guide_title, g.education_level_target, g.expected_duration_minutes
            FROM learning_schedules sch
            JOIN lessons les ON sch.lesson_id = les.lesson_id
            JOIN subjects s ON sch.subject_id = s.subject_id
            LEFT JOIN parental_guides g ON les.lesson_id = g.lesson_id AND g.status = 'published'
            WHERE sch.learner_id = {$learnerId} AND sch.status = 'skipped'
            ORDER BY sch.scheduled_date DESC
            LIMIT 2
        ")->fetchAll(PDO::FETCH_ASSOC);

        foreach ($skipped as $sk) {
            $suggestions[] = [
                'type' => 'catch_up_revision',
                'priority' => 'high',
                'reason' => "Catch-up recommended: This lesson was skipped on {$sk['scheduled_date']}.",
                'subject_id' => (int)$sk['subject_id'],
                'subject_name' => $sk['subject_name'],
                'lesson_id' => (int)$sk['lesson_id'],
                'lesson_title' => $sk['lesson_title'],
                'lesson_sequence' => (int)$sk['sequence_number'],
                'guide' => $sk['guide_id'] ? [
                    'guide_id' => (int)$sk['guide_id'],
                    'title' => $sk['guide_title'],
                    'level' => $sk['education_level_target'],
                    'duration_minutes' => (int)($sk['expected_duration_minutes'] ?? 40)
                ] : null
            ];
        }

        // Sequential syllabus progression for enrolled subjects
        foreach ($subjects as $s) {
            $subjectId = (int)$s['subject_id'];

            // Find highest sequence completed for this subject
            $lastCompleted = $db->query("
                SELECT MAX(les.sequence_number) as max_seq
                FROM learning_schedules sch
                JOIN lessons les ON sch.lesson_id = les.lesson_id
                WHERE sch.learner_id = {$learnerId} AND sch.subject_id = {$subjectId} AND sch.status = 'completed'
            ")->fetchColumn();

            $nextSeq = $lastCompleted !== null && $lastCompleted !== false ? ((int)$lastCompleted + 1) : 1;

            // Find the next lesson in sequence
            $nextLesson = $db->query("
                SELECT 
                    l.lesson_id, l.lesson_title, l.sequence_number, l.duration_minutes,
                    g.guide_id, g.title as guide_title, g.education_level_target, g.expected_duration_minutes
                FROM lessons l
                LEFT JOIN parental_guides g ON l.lesson_id = g.lesson_id AND g.status = 'published'
                WHERE l.subject_id = {$subjectId} AND l.class_id = {$classId} AND l.sequence_number = {$nextSeq} AND l.status = 'active'
                LIMIT 1
            ")->fetch(PDO::FETCH_ASSOC);

            if ($nextLesson) {
                $suggestions[] = [
                    'type' => 'sequential_progression',
                    'priority' => 'normal',
                    'reason' => "Next sequential syllabus milestone (#{$nextSeq}) for {$s['subject_name']} in {$termName}.",
                    'subject_id' => $subjectId,
                    'subject_name' => $s['subject_name'],
                    'lesson_id' => (int)$nextLesson['lesson_id'],
                    'lesson_title' => $nextLesson['lesson_title'],
                    'lesson_sequence' => (int)$nextLesson['sequence_number'],
                    'guide' => $nextLesson['guide_id'] ? [
                        'guide_id' => (int)$nextLesson['guide_id'],
                        'title' => $nextLesson['guide_title'],
                        'level' => $nextLesson['education_level_target'],
                        'duration_minutes' => (int)($nextLesson['expected_duration_minutes'] ?? 40)
                    ] : null
                ];
            }
        }

        Response::success([
            'learner_id' => $learnerId,
            'learner_name' => $learner['full_name'],
            'term' => $termName,
            'suggestions' => $suggestions
        ], 'Explainable next lesson recommendations generated.');
    }

    /**
     * GET /api/parent/schedule/term-roadmap
     * Retrieve complete term-wide syllabus pacing roadmap across all subjects and weeks.
     */
    public function getTermRoadmap(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $learnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;
        if (!$learnerId) {
            Response::error('Learner ID is required.', 422);
            return;
        }

        $this->resolveParentOrLearnerAccess($user, $learnerId, $db);

        $learner = $db->query("SELECT * FROM learners WHERE learner_id = {$learnerId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$learner) {
            Response::notFound('Learner not found.');
            return;
        }
        $classId = (int)$learner['class_id'];

        $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
        if ($termId) {
            $term = $db->query("SELECT * FROM curriculum_terms WHERE term_id = {$termId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        } else {
            $term = $db->query("SELECT * FROM curriculum_terms WHERE is_current = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC)
                ?: $db->query("SELECT * FROM curriculum_terms ORDER BY term_id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        }

        if (!$term) {
            Response::error('No academic term found.', 404);
            return;
        }

        $termId = (int)$term['term_id'];

        // Get all active subjects for this class
        $subjects = $db->query("
            SELECT s.subject_id, s.subject_name, s.subject_code, s.weekly_hours
            FROM subjects s
            WHERE s.class_id = {$classId} AND s.is_active = 1
            ORDER BY s.subject_name ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        // Get all schedules for this learner in this term
        $schedules = $db->query("
            SELECT 
                sch.schedule_id, sch.lesson_id, sch.subject_id, sch.scheduled_date,
                sch.start_time, sch.end_time, sch.status, sch.notes
            FROM learning_schedules sch
            WHERE sch.learner_id = {$learnerId} AND (sch.term_id = {$termId} OR sch.scheduled_date BETWEEN '{$term['start_date']}' AND '{$term['end_date']}')
        ")->fetchAll(PDO::FETCH_ASSOC);

        $scheduleMap = [];
        foreach ($schedules as $s) {
            if ($s['lesson_id']) {
                $scheduleMap[(int)$s['lesson_id']] = $s;
            }
        }

        $subjectsRoadmap = [];
        $totalMilestones = 0;
        $totalScheduled = 0;
        $totalCompleted = 0;

        foreach ($subjects as $subj) {
            $subjId = (int)$subj['subject_id'];
            $lessons = $db->query("
                SELECT 
                    l.lesson_id, l.lesson_title, l.sequence_number, l.duration_minutes,
                    g.guide_id, g.title as guide_title, g.education_level_target, g.expected_duration_minutes
                FROM lessons l
                LEFT JOIN parental_guides g ON l.lesson_id = g.lesson_id AND g.status = 'published'
                WHERE l.subject_id = {$subjId} AND l.class_id = {$classId} AND l.status = 'active'
                ORDER BY l.sequence_number ASC, l.lesson_id ASC
            ")->fetchAll(PDO::FETCH_ASSOC);

            $lessonsData = [];
            $subjCompleted = 0;
            $subjPlanned = 0;

            foreach ($lessons as $l) {
                $totalMilestones++;
                $lesId = (int)$l['lesson_id'];
                $sched = $scheduleMap[$lesId] ?? null;
                $schedStatus = $sched ? $sched['status'] : 'unscheduled';

                if ($schedStatus === 'completed') {
                    $subjCompleted++;
                    $totalCompleted++;
                } elseif ($schedStatus === 'planned') {
                    $subjPlanned++;
                    $totalScheduled++;
                }

                $lessonsData[] = [
                    'lesson_id' => $lesId,
                    'sequence_number' => (int)$l['sequence_number'],
                    'lesson_title' => $l['lesson_title'],
                    'duration_minutes' => (int)$l['duration_minutes'],
                    'guide' => $l['guide_id'] ? [
                        'guide_id' => (int)$l['guide_id'],
                        'title' => $l['guide_title'],
                        'level' => $l['education_level_target'],
                        'duration_minutes' => (int)($l['expected_duration_minutes'] ?? 40)
                    ] : null,
                    'schedule' => $sched ? [
                        'schedule_id' => (int)$sched['schedule_id'],
                        'scheduled_date' => $sched['scheduled_date'],
                        'start_time' => $sched['start_time'],
                        'end_time' => $sched['end_time'],
                        'status' => $sched['status'],
                        'notes' => $sched['notes']
                    ] : null
                ];
            }

            $subjTotal = count($lessonsData);
            $completionRate = $subjTotal > 0 ? round(($subjCompleted / $subjTotal) * 100, 1) : 0;

            $subjectsRoadmap[] = [
                'subject_id' => $subjId,
                'subject_name' => $subj['subject_name'],
                'subject_code' => $subj['subject_code'],
                'weekly_hours' => (float)$subj['weekly_hours'],
                'total_lessons' => $subjTotal,
                'completed_lessons' => $subjCompleted,
                'planned_lessons' => $subjPlanned,
                'completion_rate_percent' => $completionRate,
                'lessons' => $lessonsData
            ];
        }

        $overallRate = $totalMilestones > 0 ? round(($totalCompleted / $totalMilestones) * 100, 1) : 0;

        Response::success([
            'learner' => [
                'learner_id' => (int)$learner['learner_id'],
                'full_name' => $learner['full_name'],
                'class_code' => $learner['class_code'] ?? ('P' . $classId)
            ],
            'term' => [
                'term_id' => $termId,
                'term_name' => $term['term_name'],
                'term_number' => (int)$term['term_number'],
                'academic_year' => (int)$term['academic_year'],
                'start_date' => $term['start_date'],
                'end_date' => $term['end_date'],
                'is_current' => (bool)$term['is_current']
            ],
            'metrics' => [
                'total_milestones' => $totalMilestones,
                'total_scheduled' => $totalScheduled,
                'total_completed' => $totalCompleted,
                'completion_rate_percent' => $overallRate
            ],
            'subjects' => $subjectsRoadmap
        ], 'Term roadmap retrieved successfully.');
    }

    /**
     * POST /api/parent/schedule/auto-distribute
     * Pre-plan term syllabus milestones across weekdays automatically.
     */
    public function autoDistributeTermSchedule(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($input);
        $validator->required(['learner_id', 'term_id']);

        if (!$validator->isValid()) {
            Response::error('Validation failed: ' . implode(', ', $validator->getErrors()), 422);
            return;
        }

        $learnerId = (int)$input['learner_id'];
        $this->resolveParentOrLearnerAccess($user, $learnerId, $db);

        $termId = (int)$input['term_id'];
        $term = $db->query("SELECT * FROM curriculum_terms WHERE term_id = {$termId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if (!$term) {
            Response::error('Term not found.', 404);
            return;
        }

        $learner = $db->query("SELECT * FROM learners WHERE learner_id = {$learnerId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $classId = (int)$learner['class_id'];

        $subjectIds = !empty($input['subject_ids']) && is_array($input['subject_ids']) 
            ? array_map('intval', $input['subject_ids']) 
            : [];

        // If no subjects specified, default to all active class subjects
        if (empty($subjectIds)) {
            $subjRows = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$classId} AND is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
            $subjectIds = array_map('intval', $subjRows);
        }

        // Days of week to schedule on: 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri
        $allowedDays = !empty($input['days_of_week']) && is_array($input['days_of_week'])
            ? array_map('intval', $input['days_of_week'])
            : [1, 2, 3, 4, 5];

        $defaultTime = !empty($input['preferred_time']) ? trim((string)$input['preferred_time']) : '09:00:00';
        $defaultEndTime = date('H:i:s', strtotime($defaultTime) + 45 * 60);

        // Find already scheduled lesson IDs for this learner
        $existingLessons = $db->query("
            SELECT lesson_id FROM learning_schedules 
            WHERE learner_id = {$learnerId} AND lesson_id IS NOT NULL AND status IN ('planned', 'completed')
        ")->fetchAll(PDO::FETCH_COLUMN);
        $existingLessonMap = array_flip(array_map('intval', $existingLessons));

        // Gather all unscheduled lessons
        $unscheduledLessons = [];
        foreach ($subjectIds as $sId) {
            $lessons = $db->query("
                SELECT lesson_id, subject_id, lesson_title, sequence_number 
                FROM lessons 
                WHERE subject_id = {$sId} AND class_id = {$classId} AND status = 'active'
                ORDER BY sequence_number ASC, lesson_id ASC
            ")->fetchAll(PDO::FETCH_ASSOC);

            foreach ($lessons as $l) {
                if (!isset($existingLessonMap[(int)$l['lesson_id']])) {
                    $unscheduledLessons[] = $l;
                }
            }
        }

        if (empty($unscheduledLessons)) {
            Response::success(['scheduled_count' => 0], 'All syllabus milestones are already scheduled or completed.');
            return;
        }

        // Iterate through term dates starting today or term start date
        $today = date('Y-m-d');
        $startDateStr = ($today > $term['start_date'] && $today < $term['end_date']) ? $today : $term['start_date'];
        
        $currentDate = new \DateTime($startDateStr);
        $endDate = new \DateTime($term['end_date']);

        $insertedCount = 0;
        $lessonIndex = 0;
        $totalToSchedule = count($unscheduledLessons);

        $stmt = $db->prepare("
            INSERT INTO learning_schedules (
                learner_id, lesson_id, subject_id, term_id, scheduled_date,
                start_time, end_time, status, notes, created_by
            ) VALUES (
                :learner_id, :lesson_id, :subject_id, :term_id, :scheduled_date,
                :start_time, :end_time, 'planned', :notes, :created_by
            )
        ");

        // Standard rotation slots across weekdays
        $timeSlots = [
            '08:30:00', '09:30:00', '10:45:00', '11:45:00', '14:00:00'
        ];

        while ($currentDate <= $endDate && $lessonIndex < $totalToSchedule) {
            $dayOfWeek = (int)$currentDate->format('N'); // 1 = Mon .. 7 = Sun
            if (in_array($dayOfWeek, $allowedDays, true)) {
                $dateStr = $currentDate->format('Y-m-d');

                // Determine slot index for the day
                $slotTime = $timeSlots[$insertedCount % count($timeSlots)];
                $slotEndTime = date('H:i:s', strtotime($slotTime) + 45 * 60);

                $targetLesson = $unscheduledLessons[$lessonIndex];

                $stmt->execute([
                    ':learner_id' => $learnerId,
                    ':lesson_id' => (int)$targetLesson['lesson_id'],
                    ':subject_id' => (int)$targetLesson['subject_id'],
                    ':term_id' => $termId,
                    ':scheduled_date' => $dateStr,
                    ':start_time' => $slotTime,
                    ':end_time' => $slotEndTime,
                    ':notes' => 'Pre-planned syllabus milestone: #' . $targetLesson['sequence_number'] . ' - ' . $targetLesson['lesson_title'],
                    ':created_by' => (int)$user['user_id']
                ]);

                $insertedCount++;
                $lessonIndex++;
            }
            $currentDate->modify('+1 day');
        }

        AuditService::log((int)$user['user_id'], 'AUTO_DISTRIBUTE_SCHEDULE', "Auto-distributed {$insertedCount} syllabus milestones across {$term['term_name']} for learner #{$learnerId}");

        Response::success([
            'scheduled_count' => $insertedCount,
            'term_id' => $termId,
            'start_date' => $startDateStr,
            'end_date' => $term['end_date']
        ], "Successfully pre-planned {$insertedCount} syllabus milestones across {$term['term_name']}.");
    }
}
