<?php
declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;
use Throwable;
use Exception;

class SyncService
{
    /**
     * Process a batch of sync items from a client.
     */
    public static function processBatch(int $userId, array $items, ?string $deviceUuid = null): array
    {
        $results = [];
        $deviceId = null;

        if ($deviceUuid) {
            $device = DeviceService::registerDevice($deviceUuid, $userId);
            $deviceId = $device['device_id'] ?? null;
        }

        foreach ($items as $item) {
            $results[] = self::processSingleItem($userId, $item, $deviceId);
        }

        return $results;
    }

    /**
     * Process a single sync queue item with guaranteed idempotency.
     */
    public static function processSingleItem(int $userId, array $item, ?int $deviceId = null): array
    {
        $db = Database::getConnection();

        $uuid = trim($item['client_transaction_uuid'] ?? '');
        if (empty($uuid)) {
            return [
                'client_transaction_uuid' => $uuid,
                'status' => 'dead_letter',
                'success' => false,
                'error' => 'Missing client_transaction_uuid.'
            ];
        }

        $entityType = trim($item['entity_type'] ?? '');
        $entityId = isset($item['entity_id']) ? (int)$item['entity_id'] : null;
        $operation = trim($item['operation'] ?? 'create');
        $payload = $item['payload'] ?? [];
        if (is_string($payload)) {
            $payload = json_decode($payload, true) ?: [];
        }
        $learnerId = isset($item['learner_id']) ? (int)$item['learner_id'] : ($payload['learner_id'] ?? null);

        // 1. Idempotency Check: check if transaction was already processed
        $stmt = $db->prepare('SELECT * FROM sync_queue WHERE client_transaction_uuid = :uuid LIMIT 1');
        $stmt->execute([':uuid' => $uuid]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing && $existing['status'] === 'synced') {
            return [
                'client_transaction_uuid' => $uuid,
                'status' => 'synced',
                'success' => true,
                'message' => 'Transaction already processed (Idempotent replay).',
                'processed_at' => $existing['processed_at']
            ];
        }

        // Prepare or insert queue record
        if (!$existing) {
            $stmt = $db->prepare('
                INSERT INTO sync_queue (
                    user_id,
                    learner_id,
                    device_id,
                    client_transaction_uuid,
                    entity_type,
                    entity_id,
                    operation,
                    payload_json,
                    status,
                    retry_count,
                    created_at
                ) VALUES (
                    :user_id,
                    :learner_id,
                    :device_id,
                    :uuid,
                    :entity_type,
                    :entity_id,
                    :operation,
                    :payload,
                    "processing",
                    0,
                    NOW()
                )
            ');
            $stmt->execute([
                ':user_id' => $userId,
                ':learner_id' => $learnerId,
                ':device_id' => $deviceId,
                ':uuid' => $uuid,
                ':entity_type' => $entityType,
                ':entity_id' => $entityId,
                ':operation' => in_array($operation, ['create', 'update', 'submit', 'complete']) ? $operation : 'create',
                ':payload' => json_encode($payload)
            ]);
            $queueId = (int)$db->lastInsertId();
        } else {
            $queueId = (int)$existing['queue_id'];
            $db->prepare('UPDATE sync_queue SET status = "processing" WHERE queue_id = :id')
               ->execute([':id' => $queueId]);
        }

        // 2. Dispatch and Execute in Database Transaction
        try {
            $db->beginTransaction();

            $syncResult = [];
            switch ($entityType) {
                case 'assessment_submission':
                    $syncResult = self::handleAssessmentSubmission($userId, $learnerId, $payload);
                    $syncTypeLog = 'assessment';
                    break;

                case 'schedule_progress':
                    $syncResult = self::handleScheduleProgress($userId, $learnerId, $payload);
                    $syncTypeLog = 'progress';
                    break;

                case 'lesson_observation':
                    $syncResult = self::handleLessonObservation($userId, $learnerId, $payload);
                    $syncTypeLog = 'lesson';
                    break;

                case 'learning_activity':
                    $syncResult = self::handleLearningActivity($userId, $learnerId, $payload);
                    $syncTypeLog = 'activity';
                    break;

                case 'exam_submission':
                    $syncResult = self::handleExamSubmission($userId, $learnerId, $payload);
                    $syncTypeLog = 'assessment';
                    break;

                default:
                    throw new Exception("Unsupported entity_type: '{$entityType}'");
            }

            // Mark sync_queue item as synced
            $stmt = $db->prepare('
                UPDATE sync_queue 
                SET status = "synced",
                    processed_at = NOW(),
                    last_error = NULL
                WHERE queue_id = :id
            ');
            $stmt->execute([':id' => $queueId]);

            // Write to sync_log
            if ($learnerId) {
                $stmt = $db->prepare('
                    INSERT INTO sync_log (
                        learner_id,
                        activity_id,
                        sync_type,
                        direction,
                        records_affected,
                        sync_status,
                        synced_at,
                        device_id,
                        error_message
                    ) VALUES (
                        :learner_id,
                        :activity_id,
                        :sync_type,
                        "upload",
                        1,
                        "success",
                        NOW(),
                        :device_id,
                        NULL
                    )
                ');
                $stmt->execute([
                    ':learner_id' => $learnerId,
                    ':activity_id' => $syncResult['activity_id'] ?? null,
                    ':sync_type' => $syncTypeLog,
                    ':device_id' => $deviceId
                ]);
            }

            $db->commit();

            return [
                'client_transaction_uuid' => $uuid,
                'status' => 'synced',
                'success' => true,
                'entity_type' => $entityType,
                'data' => $syncResult
            ];
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }

            $errorMsg = $e->getMessage();
            $isPermanent = str_contains($errorMsg, 'Unsupported') || 
                           str_contains($errorMsg, 'not found') || 
                           str_contains($errorMsg, 'Unauthorized') ||
                           str_contains($errorMsg, 'Immutable');

            $newStatus = $isPermanent ? 'dead_letter' : 'failed';

            $stmt = $db->prepare('
                UPDATE sync_queue 
                SET status = :status,
                    retry_count = retry_count + 1,
                    last_error = :error,
                    processed_at = NOW()
                WHERE queue_id = :id
            ');
            $stmt->execute([
                ':status' => $newStatus,
                ':error' => substr($errorMsg, 0, 1000),
                ':id' => $queueId
            ]);

            // Log failure to sync_log if learnerId available
            if ($learnerId) {
                try {
                    $stmt = $db->prepare('
                        INSERT INTO sync_log (
                            learner_id,
                            sync_type,
                            direction,
                            records_affected,
                            sync_status,
                            synced_at,
                            device_id,
                            error_message
                        ) VALUES (
                            :learner_id,
                            :sync_type,
                            "upload",
                            0,
                            "failed",
                            NOW(),
                            :device_id,
                            :error
                        )
                    ');
                    $stmt->execute([
                        ':learner_id' => $learnerId,
                        ':sync_type' => 'activity',
                        ':device_id' => $deviceId,
                        ':error' => substr($errorMsg, 0, 500)
                    ]);
                } catch (Throwable $ignored) {}
            }

            return [
                'client_transaction_uuid' => $uuid,
                'status' => $newStatus,
                'success' => false,
                'error' => $errorMsg
            ];
        }
    }

    /**
     * Handler: Offline Assessment Submission
     */
    private static function handleAssessmentSubmission(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();

        $assessmentId = (int)($payload['assessment_id'] ?? 0);
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);
        $timeSpent = (int)($payload['time_spent_seconds'] ?? 0);
        $startedAt = $payload['started_at'] ?? date('Y-m-d H:i:s');
        $submittedAt = $payload['submitted_at'] ?? date('Y-m-d H:i:s');
        $answers = $payload['answers'] ?? [];

        if (!$assessmentId || !$learnerId) {
            throw new Exception("Assessment ID and Learner ID are required.");
        }

        // Verify learner ownership if parent
        self::verifyLearnerAccess($userId, $learnerId);

        // Verify assessment exists
        $stmt = $db->prepare('SELECT * FROM assessments WHERE assessment_id = :id LIMIT 1');
        $stmt->execute([':id' => $assessmentId]);
        $assessment = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$assessment) {
            throw new Exception("Assessment #{$assessmentId} not found.");
        }

        // Create attempt record
        $stmt = $db->prepare('
            INSERT INTO assessment_attempts (
                assessment_id,
                learner_id,
                client_attempt_uuid,
                started_at,
                submitted_at,
                attempt_mode,
                attempt_status,
                created_at
            ) VALUES (
                :aid,
                :lid,
                :uuid,
                :started_at,
                :submitted_at,
                "offline",
                "synced",
                NOW()
            )
        ');
        $stmt->execute([
            ':aid' => $assessmentId,
            ':lid' => $learnerId,
            ':uuid' => $payload['client_transaction_uuid'] ?? bin2hex(random_bytes(16)),
            ':started_at' => $startedAt,
            ':submitted_at' => $submittedAt
        ]);
        $attemptId = (int)$db->lastInsertId();

        // Load all questions and options for this assessment
        $stmt = $db->prepare('SELECT * FROM assessment_questions WHERE assessment_id = :aid');
        $stmt->execute([':aid' => $assessmentId]);
        $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $questionMap = [];
        $totalPossibleMarks = 0;
        foreach ($questions as $q) {
            $questionMap[$q['question_id']] = $q;
            $totalPossibleMarks += (int)($q['marks'] ?? 1);
        }

        $stmt = $db->prepare('
            SELECT o.* 
            FROM assessment_options o
            JOIN assessment_questions q ON o.question_id = q.question_id
            WHERE q.assessment_id = :aid
        ');
        $stmt->execute([':aid' => $assessmentId]);
        $options = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $optionMap = [];
        foreach ($options as $opt) {
            $optionMap[$opt['option_id']] = $opt;
        }

        $totalEarnedMarks = 0;

        foreach ($answers as $ans) {
            $qId = (int)($ans['question_id'] ?? 0);
            $optId = isset($ans['selected_option_id']) && $ans['selected_option_id'] !== '' ? (int)$ans['selected_option_id'] : (isset($ans['option_id']) ? (int)$ans['option_id'] : null);
            $ansText = $ans['answer_text'] ?? null;

            if (!isset($questionMap[$qId])) {
                continue;
            }

            $q = $questionMap[$qId];
            $qMarks = (int)($q['marks'] ?? 1);
            $isCorrect = null;
            $pointsEarned = 0;

            if ($q['question_type'] === 'multiple_choice' || $q['question_type'] === 'true_false') {
                if ($optId && isset($optionMap[$optId])) {
                    $opt = $optionMap[$optId];
                    $isCorrect = !empty($opt['is_correct']) ? 1 : 0;
                    if ($isCorrect === 1) {
                        $pointsEarned = $qMarks;
                        $totalEarnedMarks += $qMarks;
                    }
                } else {
                    $isCorrect = 0;
                }
            }

            $stmt = $db->prepare('
                INSERT INTO assessment_answers (
                    attempt_id,
                    question_id,
                    option_id,
                    answer_text,
                    is_correct,
                    marks_awarded,
                    answered_at
                ) VALUES (
                    :attempt_id,
                    :question_id,
                    :option_id,
                    :answer_text,
                    :is_correct,
                    :marks_awarded,
                    NOW()
                )
            ');
            $stmt->execute([
                ':attempt_id' => $attemptId,
                ':question_id' => $qId,
                ':option_id' => $optId,
                ':answer_text' => $ansText,
                ':is_correct' => $isCorrect,
                ':marks_awarded' => $pointsEarned
            ]);
        }

        // Percentage score calculation
        $possibleForScore = $totalPossibleMarks > 0 ? $totalPossibleMarks : 1;
        $percentage = round(($totalEarnedMarks / $possibleForScore) * 100, 2);

        // Store result
        $stmt = $db->prepare('
            INSERT INTO assessment_results (
                assessment_id,
                learner_id,
                attempt_id,
                score,
                total_marks,
                percentage,
                date_taken,
                taken_offline,
                sync_status,
                scored_by,
                scoring_mode,
                created_at
            ) VALUES (
                :assessment_id,
                :learner_id,
                :attempt_id,
                :score,
                :total_marks,
                :percentage,
                :date_taken,
                1,
                "synced",
                :scored_by,
                "automatic",
                NOW()
            )
        ');
        $stmt->execute([
            ':assessment_id' => $assessmentId,
            ':learner_id' => $learnerId,
            ':attempt_id' => $attemptId,
            ':score' => $totalEarnedMarks,
            ':total_marks' => $totalPossibleMarks,
            ':percentage' => $percentage,
            ':date_taken' => $submittedAt,
            ':scored_by' => $userId
        ]);
        $resultId = (int)$db->lastInsertId();

        return [
            'attempt_id' => $attemptId,
            'result_id' => $resultId,
            'score_percentage' => $percentage,
            'raw_score' => $totalEarnedMarks,
            'total_possible' => $totalPossibleMarks
        ];
    }

    /**
     * Handler: Offline Schedule & Progress Completion
     */
    private static function handleScheduleProgress(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();

        $scheduleId = (int)($payload['schedule_id'] ?? 0);
        $lessonId = (int)($payload['lesson_id'] ?? 0);
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);
        $status = $payload['status'] ?? 'completed';
        $completedDate = $payload['completed_date'] ?? date('Y-m-d');
        $notes = $payload['notes'] ?? null;

        if (!$learnerId) {
            throw new Exception("Learner ID is required for schedule progress.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        if ($scheduleId > 0) {
            $stmt = $db->prepare('SELECT * FROM learning_schedules WHERE schedule_id = :id LIMIT 1');
            $stmt->execute([':id' => $scheduleId]);
            $schedule = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($schedule) {
                // Conflict Policy: Do not downgrade a previously completed item
                if ($schedule['status'] === 'completed' && $status !== 'completed') {
                    return [
                        'schedule_id' => $scheduleId,
                        'status' => 'completed',
                        'message' => 'Preserved newer server completion status.'
                    ];
                }

                $scheduleStatus = in_array($status, ['planned', 'completed', 'skipped', 'cancelled']) ? $status : 'completed';

                $stmt = $db->prepare('
                    UPDATE learning_schedules 
                    SET status = :status,
                        notes = COALESCE(:notes, notes),
                        updated_at = NOW()
                    WHERE schedule_id = :id
                ');
                $stmt->execute([
                    ':status' => $scheduleStatus,
                    ':notes' => $notes,
                    ':id' => $scheduleId
                ]);
                if (!$lessonId) {
                    $lessonId = (int)$schedule['lesson_id'];
                }
            }
        }

        // Record or update Progress Record
        if ($lessonId > 0) {
            $stmt = $db->prepare('
                INSERT INTO progress_records (
                    learner_id,
                    lesson_id,
                    completion_status,
                    date_started,
                    date_completed,
                    date_recorded,
                    updated_at
                ) VALUES (
                    :lid,
                    :lesson_id,
                    :status,
                    NOW(),
                    :cdate,
                    NOW(),
                    NOW()
                )
                ON DUPLICATE KEY UPDATE
                    completion_status = IF(completion_status = "completed", "completed", VALUES(completion_status)),
                    date_completed = IF(completion_status = "completed", date_completed, VALUES(date_completed)),
                    updated_at = NOW()
            ');
            $stmt->execute([
                ':lid' => $learnerId,
                ':lesson_id' => $lessonId,
                ':status' => $status === 'completed' ? 'completed' : 'in_progress',
                ':cdate' => $status === 'completed' ? date('Y-m-d H:i:s') : null
            ]);
        }

        return [
            'schedule_id' => $scheduleId,
            'lesson_id' => $lessonId,
            'status' => $status
        ];
    }

    /**
     * Handler: Offline Lesson Observation
     */
    private static function handleLessonObservation(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();

        $lessonId = (int)($payload['lesson_id'] ?? 0);
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);
        $notes = trim((string)($payload['observation_notes'] ?? $payload['observation'] ?? $payload['notes'] ?? ''));

        if (!$lessonId || !$learnerId) {
            throw new Exception("Lesson ID and Learner ID are required.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        // Find parent_id if parent
        $stmt = $db->prepare('SELECT parent_id FROM parents WHERE user_id = :uid LIMIT 1');
        $stmt->execute([':uid' => $userId]);
        $parentId = $stmt->fetchColumn() ?: null;

        $stmt = $db->prepare('
            INSERT INTO lesson_observations (
                learner_id,
                lesson_id,
                parent_id,
                observation,
                rating,
                observed_at,
                created_at
            ) VALUES (
                :lid,
                :lesson_id,
                :pid,
                :obs,
                5.00,
                NOW(),
                NOW()
            )
        ');
        $stmt->execute([
            ':lid' => $learnerId,
            ':lesson_id' => $lessonId,
            ':pid' => $parentId,
            ':obs' => $notes ?: 'Lesson observed and validated offline.'
        ]);
        $observationId = (int)$db->lastInsertId();

        return [
            'observation_id' => $observationId,
            'lesson_id' => $lessonId,
            'learner_id' => $learnerId
        ];
    }

    /**
     * Handler: Generic Learning Activity Event
     */
    private static function handleLearningActivity(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);

        if (!$learnerId) {
            throw new Exception("Learner ID is required for learning activity.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        $materialId = (int)($payload['material_id'] ?? 0);
        if (!$materialId) {
            $materialId = (int)$db->query('SELECT material_id FROM learning_materials LIMIT 1')->fetchColumn();
        }

        $stmt = $db->prepare('
            INSERT INTO learning_activities (
                learner_id,
                material_id,
                activity_status,
                cached_at,
                completed_at,
                synced_at,
                time_spent_seconds,
                client_activity_uuid,
                created_at
            ) VALUES (
                :lid,
                :mid,
                "synced",
                NOW(),
                NOW(),
                NOW(),
                :time_spent,
                :uuid,
                NOW()
            )
        ');
        $stmt->execute([
            ':lid' => $learnerId,
            ':mid' => $materialId ?: 3,
            ':time_spent' => (int)($payload['time_spent_seconds'] ?? 60),
            ':uuid' => $payload['client_transaction_uuid'] ?? bin2hex(random_bytes(16))
        ]);
        $activityId = (int)$db->lastInsertId();

        return [
            'activity_id' => $activityId,
            'learner_id' => $learnerId
        ];
    }

    /**
     * Handler: Offline Exam Submission
     */
    private static function handleExamSubmission(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();
        $examSetId = (int)($payload['exam_set_id'] ?? 0);
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);
        $paperMarks = $payload['paper_marks'] ?? [];

        if (!$examSetId || !$learnerId) {
            throw new Exception("Exam Set ID and Learner ID are required.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        // Check if submission already exists
        $stmt = $db->prepare('SELECT * FROM exam_submissions WHERE exam_set_id = :set_id AND learner_id = :lid LIMIT 1');
        $stmt->execute([':set_id' => $examSetId, ':lid' => $learnerId]);
        $sub = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$sub) {
            $stmt = $db->prepare('
                INSERT INTO exam_submissions (
                    exam_set_id,
                    learner_id,
                    submitted_by_user_id,
                    status,
                    submitted_at,
                    created_at
                ) VALUES (
                    :set_id,
                    :lid,
                    :uid,
                    "submitted",
                    NOW(),
                    NOW()
                )
            ');
            $stmt->execute([
                ':set_id' => $examSetId,
                ':lid' => $learnerId,
                ':uid' => $userId
            ]);
            $submissionId = (int)$db->lastInsertId();
        } else {
            $submissionId = (int)$sub['submission_id'];
        }

        // Insert or update marks
        foreach ($paperMarks as $pm) {
            $paperId = (int)($pm['paper_id'] ?? 0);
            $marks = (float)($pm['marks_obtained'] ?? $pm['raw_score'] ?? 0);
            if ($paperId > 0) {
                $stmt = $db->prepare('
                    INSERT INTO exam_marks (
                        submission_id,
                        paper_id,
                        marks_obtained,
                        created_at
                    ) VALUES (
                        :sub_id,
                        :paper_id,
                        :marks,
                        NOW()
                    )
                    ON DUPLICATE KEY UPDATE 
                        marks_obtained = VALUES(marks_obtained)
                ');
                $stmt->execute([
                    ':sub_id' => $submissionId,
                    ':paper_id' => $paperId,
                    ':marks' => $marks
                ]);
            }
        }

        return [
            'submission_id' => $submissionId,
            'exam_set_id' => $examSetId,
            'learner_id' => $learnerId
        ];
    }

    /**
     * Verify that the current user owns or is authorized to act for the specified learner.
     */
    private static function verifyLearnerAccess(int $userId, int $learnerId): void
    {
        $db = Database::getConnection();

        // Check user role
        $stmt = $db->prepare('
            SELECT r.role_code 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = :uid
            LIMIT 1
        ');
        $stmt->execute([':uid' => $userId]);
        $role = $stmt->fetchColumn();

        if (in_array($role, ['administrator', 'curriculum_officer', 'teacher', 'admin'])) {
            return;
        }

        // If parent, check ownership via parents -> learners link
        $stmt = $db->prepare('
            SELECT l.learner_id 
            FROM learners l
            JOIN parents p ON l.parent_id = p.parent_id
            WHERE p.user_id = :uid AND l.learner_id = :lid
            LIMIT 1
        ');
        $stmt->execute([':uid' => $userId, ':lid' => $learnerId]);
        if (!$stmt->fetch()) {
            // Also check direct learner user account
            $stmt = $db->prepare('SELECT learner_id FROM learners WHERE user_id = :uid AND learner_id = :lid LIMIT 1');
            $stmt->execute([':uid' => $userId, ':lid' => $learnerId]);
            if (!$stmt->fetch()) {
                throw new Exception("Unauthorized access to learner #{$learnerId}.");
            }
        }
    }

    /**
     * Generate an offline download package (curriculum metadata, lessons, guides, assessments) for a learner / class level.
     */
    public static function generateOfflinePackage(int $userId, ?int $learnerId = null, ?int $classId = null): array
    {
        $db = Database::getConnection();

        // If learner specified, find their class_id
        if ($learnerId) {
            self::verifyLearnerAccess($userId, $learnerId);
            $stmt = $db->prepare('SELECT * FROM learners WHERE learner_id = :lid LIMIT 1');
            $stmt->execute([':lid' => $learnerId]);
            $learner = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($learner) {
                $classId = (int)$learner['class_id'];
            }
        }

        // 1. Classes & Terms Metadata
        $classes = $db->query('SELECT * FROM classes WHERE is_active = 1 ORDER BY level ASC')->fetchAll(PDO::FETCH_ASSOC);
        $terms = $db->query('SELECT * FROM curriculum_terms ORDER BY term_number ASC')->fetchAll(PDO::FETCH_ASSOC);

        // 2. Subjects
        if ($classId) {
            $stmt = $db->prepare('SELECT * FROM subjects WHERE class_id = :cid AND is_active = 1');
            $stmt->execute([':cid' => $classId]);
            $subjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $subjects = $db->query('SELECT * FROM subjects WHERE is_active = 1')->fetchAll(PDO::FETCH_ASSOC);
        }

        $subjectIds = array_column($subjects, 'subject_id');

        // 3. Lessons
        $lessons = [];
        if (!empty($subjectIds)) {
            $inClause = implode(',', array_fill(0, count($subjectIds), '?'));
            $stmt = $db->prepare("SELECT * FROM lessons WHERE subject_id IN ({$inClause}) AND status = 'active' ORDER BY sequence_number ASC");
            $stmt->execute($subjectIds);
            $lessons = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        $lessonIds = array_column($lessons, 'lesson_id');

        // 4. Parental Guides
        $guides = [];
        if (!empty($lessonIds)) {
            $inClause = implode(',', array_fill(0, count($lessonIds), '?'));
            $stmt = $db->prepare("SELECT * FROM parental_guides WHERE lesson_id IN ({$inClause}) AND status = 'published'");
            $stmt->execute($lessonIds);
            $guides = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        // 5. Assessments & Questions/Options
        $assessments = [];
        $questions = [];
        $options = [];
        if (!empty($lessonIds)) {
            $inClause = implode(',', array_fill(0, count($lessonIds), '?'));
            $stmt = $db->prepare("SELECT * FROM assessments WHERE lesson_id IN ({$inClause}) AND status = 'published'");
            $stmt->execute($lessonIds);
            $assessments = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $assessmentIds = array_column($assessments, 'assessment_id');
            if (!empty($assessmentIds)) {
                $aInClause = implode(',', array_fill(0, count($assessmentIds), '?'));
                $stmt = $db->prepare("SELECT * FROM assessment_questions WHERE assessment_id IN ({$aInClause}) ORDER BY question_order ASC");
                $stmt->execute($assessmentIds);
                $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $qIds = array_column($questions, 'question_id');
                if (!empty($qIds)) {
                    $qInClause = implode(',', array_fill(0, count($qIds), '?'));
                    $stmt = $db->prepare("SELECT * FROM assessment_options WHERE question_id IN ({$qInClause}) ORDER BY option_order ASC");
                    $stmt->execute($qIds);
                    $options = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
            }
        }

        // 6. Learner Profile & Schedules (if learner specified)
        $schedules = [];
        if ($learnerId) {
            $stmt = $db->prepare('SELECT * FROM learning_schedules WHERE learner_id = :lid ORDER BY scheduled_date ASC');
            $stmt->execute([':lid' => $learnerId]);
            $schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        return [
            'package_version' => '1.0.0',
            'generated_at' => date('c'),
            'class_id' => $classId,
            'learner_id' => $learnerId,
            'metadata' => [
                'classes' => $classes,
                'terms' => $terms
            ],
            'subjects' => $subjects,
            'lessons' => $lessons,
            'guides' => $guides,
            'assessments' => $assessments,
            'questions' => $questions,
            'options' => $options,
            'schedules' => $schedules,
            'counts' => [
                'subjects' => count($subjects),
                'lessons' => count($lessons),
                'guides' => count($guides),
                'assessments' => count($assessments),
                'questions' => count($questions),
                'schedules' => count($schedules)
            ]
        ];
    }

    /**
     * Get Sync Status summary for a user / learner.
     */
    public static function getSyncStatus(int $userId, ?int $learnerId = null): array
    {
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                status,
                COUNT(*) as count
            FROM sync_queue
            WHERE user_id = :uid ' . ($learnerId ? 'AND learner_id = :lid' : '') . '
            GROUP BY status
        ');
        $params = [':uid' => $userId];
        if ($learnerId) {
            $params[':lid'] = $learnerId;
        }
        $stmt->execute($params);
        $statusCounts = $stmt->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

        // Recent sync logs
        $stmt = $db->prepare('
            SELECT sl.*, d.device_name, d.platform
            FROM sync_log sl
            LEFT JOIN devices d ON sl.device_id = d.device_id
            WHERE sl.learner_id IN (
                SELECT l.learner_id FROM learners l
                JOIN parents p ON l.parent_id = p.parent_id
                WHERE p.user_id = :uid
            ) ' . ($learnerId ? 'AND sl.learner_id = :lid' : '') . '
            ORDER BY sl.synced_at DESC
            LIMIT 20
        ');
        $stmt->execute($params);
        $recentLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Recent failed / dead-letter items in queue
        $stmt = $db->prepare('
            SELECT *
            FROM sync_queue
            WHERE user_id = :uid AND status IN ("failed", "dead_letter")
            ORDER BY created_at DESC
            LIMIT 20
        ');
        $stmt->execute([':uid' => $userId]);
        $failedItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'queue_summary' => [
                'pending' => (int)($statusCounts['pending'] ?? 0),
                'processing' => (int)($statusCounts['processing'] ?? 0),
                'synced' => (int)($statusCounts['synced'] ?? 0),
                'failed' => (int)($statusCounts['failed'] ?? 0),
                'dead_letter' => (int)($statusCounts['dead_letter'] ?? 0),
            ],
            'recent_logs' => $recentLogs,
            'failed_items' => $failedItems,
            'last_sync_timestamp' => $recentLogs[0]['synced_at'] ?? null
        ];
    }
}
