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

                case 'schedule_create':
                    $syncResult = self::handleScheduleCreate($userId, $learnerId, $payload);
                    $syncTypeLog = 'progress';
                    break;

                case 'learner_create':
                    $syncResult = self::handleLearnerCreate($userId, $payload);
                    $learnerId = $syncResult['learner_id'] ?? $learnerId;
                    $syncTypeLog = 'activity';
                    break;

                case 'learner_update':
                    $syncResult = self::handleLearnerUpdate($userId, $learnerId, $payload);
                    $syncTypeLog = 'activity';
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
        $marksInput = $payload['marks'] ?? $payload['paper_marks'] ?? [];
        $sittingDate = !empty($payload['sitting_date']) ? $payload['sitting_date'] : date('Y-m-d');
        $parentRemarks = $payload['parent_remarks'] ?? null;
        $teacherRemarks = $payload['teacher_remarks'] ?? null;

        if (!$examSetId || !$learnerId) {
            throw new Exception("Exam Set ID and Learner ID are required for exam submission.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        // Fetch parent ID for user
        $pStmt = $db->prepare('SELECT parent_id FROM parents WHERE user_id = :uid LIMIT 1');
        $pStmt->execute([':uid' => $userId]);
        $parent = $pStmt->fetch(PDO::FETCH_ASSOC);
        $parentId = $parent ? (int)$parent['parent_id'] : 0;
        if (!$parentId) {
            $pStmt2 = $db->prepare('SELECT parent_id FROM learners WHERE learner_id = :lid LIMIT 1');
            $pStmt2->execute([':lid' => $learnerId]);
            $lRow = $pStmt2->fetch(PDO::FETCH_ASSOC);
            $parentId = $lRow ? (int)$lRow['parent_id'] : 1;
        }

        // Fetch exam papers metadata for grading
        $epStmt = $db->prepare('
            SELECT ep.exam_paper_id, ep.subject_id, ep.paper_code, ep.title, ep.total_marks, ep.is_aggregate_contributor,
                   s.subject_name, s.subject_code
            FROM exam_papers ep
            JOIN subjects s ON ep.subject_id = s.subject_id
            WHERE ep.exam_set_id = :set_id
        ');
        $epStmt->execute([':set_id' => $examSetId]);
        $papers = $epStmt->fetchAll(PDO::FETCH_ASSOC);
        $paperLookup = [];
        foreach ($papers as $p) {
            $paperLookup[(int)$p['exam_paper_id']] = $p;
        }

        $evaluatedMarks = [];
        foreach ($marksInput as $m) {
            $paperId = (int)($m['exam_paper_id'] ?? $m['paper_id'] ?? 0);
            if (!isset($paperLookup[$paperId])) continue;

            $pMeta = $paperLookup[$paperId];
            $maxMarks = (float)($pMeta['total_marks'] > 0 ? $pMeta['total_marks'] : 100.0);
            $isAbsent = !empty($m['is_absent']);
            $score = $isAbsent ? 0.0 : min($maxMarks, max(0.0, (float)($m['raw_score'] ?? $m['marks_obtained'] ?? 0.0)));
            $pct = $maxMarks > 0 ? round(($score / $maxMarks) * 100, 2) : 0.0;
            $isContributor = isset($pMeta['is_aggregate_contributor']) ? (int)$pMeta['is_aggregate_contributor'] : 1;

            // UNEB Grade determination
            if ($isAbsent) {
                $gradePoint = 9;
                $gradeLabel = 'F9';
            } else if ($pct >= 90.0) {
                $gradePoint = 1; $gradeLabel = 'D1';
            } else if ($pct >= 80.0) {
                $gradePoint = 2; $gradeLabel = 'D2';
            } else if ($pct >= 70.0) {
                $gradePoint = 3; $gradeLabel = 'C3';
            } else if ($pct >= 60.0) {
                $gradePoint = 4; $gradeLabel = 'C4';
            } else if ($pct >= 55.0) {
                $gradePoint = 5; $gradeLabel = 'C5';
            } else if ($pct >= 50.0) {
                $gradePoint = 6; $gradeLabel = 'C6';
            } else if ($pct >= 45.0) {
                $gradePoint = 7; $gradeLabel = 'P7';
            } else if ($pct >= 40.0) {
                $gradePoint = 8; $gradeLabel = 'P8';
            } else {
                $gradePoint = 9; $gradeLabel = 'F9';
            }

            $evaluatedMarks[] = [
                'exam_paper_id' => $paperId,
                'subject_id' => $pMeta['subject_id'],
                'raw_score' => $score,
                'max_marks' => $maxMarks,
                'percentage' => $pct,
                'grade_point' => $gradePoint,
                'grade_label' => $gradeLabel,
                'is_absent' => $isAbsent ? 1 : 0,
                'is_aggregate_contributor' => $isContributor,
                'remarks' => trim((string)($m['remarks'] ?? ''))
            ];
        }

        // Calculate division
        $coreContributors = array_filter($evaluatedMarks, fn($m) => !empty($m['is_aggregate_contributor']));
        $aggMarks = !empty($coreContributors) ? $coreContributors : $evaluatedMarks;

        $totalAgg = 0;
        $totalRaw = 0.0;
        $totalPossible = 0.0;
        $hasF9 = false;

        foreach ($aggMarks as $m) {
            $totalAgg += $m['grade_point'];
            $totalRaw += $m['raw_score'];
            $totalPossible += $m['max_marks'];
            if ($m['grade_point'] === 9) {
                $hasF9 = true;
            }
        }

        $avgPct = $totalPossible > 0 ? round(($totalRaw / $totalPossible) * 100, 2) : 0.0;

        if ($totalAgg >= 4 && $totalAgg <= 12) {
            $division = 'I';
        } else if ($totalAgg >= 13 && $totalAgg <= 24) {
            $division = 'II';
        } else if ($totalAgg >= 25 && $totalAgg <= 29) {
            $division = 'III';
        } else if ($totalAgg >= 30 && $totalAgg <= 34) {
            $division = 'IV';
        } else {
            $division = 'U';
        }

        // F9 demotion rule: candidate with F9 in any core subject cannot be Division I
        if ($division === 'I' && $hasF9) {
            $division = 'II';
            $demotionNotice = 'Demoted from Division I to Division II due to F9 grade in a core subject';
            $teacherRemarks = ($teacherRemarks ? $teacherRemarks . ' | ' : '') . '[UNEB Grading Notice: ' . $demotionNotice . ']';
        }

        // Check if submission already exists
        $stmt = $db->prepare('SELECT submission_id FROM exam_submissions WHERE exam_set_id = :set_id AND learner_id = :lid LIMIT 1');
        $stmt->execute([':set_id' => $examSetId, ':lid' => $learnerId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $submissionId = (int)$existing['submission_id'];
            $upStmt = $db->prepare('
                UPDATE exam_submissions SET
                    sitting_date = :s_date,
                    total_raw_marks = :raw,
                    total_possible_marks = :poss,
                    average_percentage = :pct,
                    total_aggregate = :agg,
                    division = :div,
                    status = "submitted",
                    parent_remarks = :prem,
                    teacher_remarks = :trem,
                    updated_at = NOW()
                WHERE submission_id = :sub_id
            ');
            $upStmt->execute([
                ':s_date' => $sittingDate,
                ':raw' => $totalRaw,
                ':poss' => $totalPossible,
                ':pct' => $avgPct,
                ':agg' => $totalAgg,
                ':div' => $division,
                ':prem' => $parentRemarks,
                ':trem' => $teacherRemarks,
                ':sub_id' => $submissionId
            ]);

            $db->exec("DELETE FROM exam_marks WHERE submission_id = {$submissionId}");
        } else {
            $inStmt = $db->prepare('
                INSERT INTO exam_submissions (
                    exam_set_id, learner_id, parent_id, sitting_date,
                    total_raw_marks, total_possible_marks, average_percentage,
                    total_aggregate, division, status, parent_remarks, teacher_remarks,
                    created_at, updated_at
                ) VALUES (
                    :set_id, :lid, :pid, :s_date,
                    :raw, :poss, :pct,
                    :agg, :div, "submitted", :prem, :trem,
                    NOW(), NOW()
                )
            ');
            $inStmt->execute([
                ':set_id' => $examSetId,
                ':lid' => $learnerId,
                ':pid' => $parentId,
                ':s_date' => $sittingDate,
                ':raw' => $totalRaw,
                ':poss' => $totalPossible,
                ':pct' => $avgPct,
                ':agg' => $totalAgg,
                ':div' => $division,
                ':prem' => $parentRemarks,
                ':trem' => $teacherRemarks
            ]);
            $submissionId = (int)$db->lastInsertId();
        }

        // Insert evaluated marks
        $mIn = $db->prepare('
            INSERT INTO exam_marks (
                submission_id, exam_paper_id, subject_id, raw_score, max_marks,
                percentage, grade_point, grade_label, is_absent, remarks, entered_by, created_at
            ) VALUES (
                :sub_id, :paper_id, :subj_id, :raw, :max_m,
                :pct, :gp, :gl, :absent, :rem, :uid, NOW()
            )
        ');
        foreach ($evaluatedMarks as $em) {
            $mIn->execute([
                ':sub_id' => $submissionId,
                ':paper_id' => $em['exam_paper_id'],
                ':subj_id' => $em['subject_id'],
                ':raw' => $em['raw_score'],
                ':max_m' => $em['max_marks'],
                ':pct' => $em['percentage'],
                ':gp' => $em['grade_point'],
                ':gl' => $em['grade_label'],
                ':absent' => $em['is_absent'],
                ':rem' => $em['remarks'],
                ':uid' => $userId
            ]);
        }

        return [
            'submission_id' => $submissionId,
            'exam_set_id' => $examSetId,
            'learner_id' => $learnerId,
            'total_aggregate' => $totalAgg,
            'division' => $division,
            'average_percentage' => $avgPct
        ];
    }

    /**
     * Handler: Offline Learner Creation
     */
    private static function handleLearnerCreate(int $userId, array $payload): array
    {
        $db = Database::getConnection();

        $fullName = trim((string)($payload['full_name'] ?? ''));
        $dobStr = trim((string)($payload['date_of_birth'] ?? ''));
        $gender = strtolower(trim((string)($payload['gender'] ?? 'male')));
        $classId = (int)($payload['class_id'] ?? 0);
        $specialNeeds = !empty($payload['special_learning_needs']) ? 1 : 0;
        $specialNeedsDesc = $specialNeeds ? trim((string)($payload['special_needs_description'] ?? '')) : null;
        $avatarUrl = !empty($payload['avatar_url']) ? trim((string)$payload['avatar_url']) : null;
        $religiousTrack = strtolower(trim((string)($payload['religious_track'] ?? 'cre')));

        if (empty($fullName) || empty($dobStr) || !$classId) {
            throw new Exception("Full name, date of birth, and class ID are required to register learner.");
        }

        // Resolve or create parent record
        $stmt = $db->prepare('SELECT parent_id FROM parents WHERE user_id = :uid LIMIT 1');
        $stmt->execute([':uid' => $userId]);
        $parentId = $stmt->fetchColumn();

        if (!$parentId) {
            $uStmt = $db->prepare('SELECT full_name, email, phone FROM users WHERE user_id = :uid LIMIT 1');
            $uStmt->execute([':uid' => $userId]);
            $uRow = $uStmt->fetch(PDO::FETCH_ASSOC) ?: [];

            $insParent = $db->prepare('
                INSERT INTO parents (user_id, full_name, email, phone, status, registration_date, created_at, updated_at)
                VALUES (:uid, :name, :email, :phone, "active", CURDATE(), NOW(), NOW())
            ');
            $insParent->execute([
                ':uid' => $userId,
                ':name' => $uRow['full_name'] ?? 'Parent',
                ':email' => $uRow['email'] ?? ($userId . '@tmhis.local'),
                ':phone' => $uRow['phone'] ?? '+256 700 000000'
            ]);
            $parentId = (int)$db->lastInsertId();
        }

        // Idempotency check: see if learner was already created (same parent + name + DOB)
        $dupStmt = $db->prepare('
            SELECT learner_id 
            FROM learners 
            WHERE parent_id = :pid 
              AND LOWER(TRIM(full_name)) = LOWER(TRIM(:name)) 
              AND date_of_birth = :dob 
            LIMIT 1
        ');
        $dupStmt->execute([
            ':pid' => $parentId,
            ':name' => $fullName,
            ':dob' => $dobStr
        ]);
        $existingLearnerId = $dupStmt->fetchColumn();

        if ($existingLearnerId) {
            return [
                'learner_id' => (int)$existingLearnerId,
                'client_transaction_uuid' => $payload['client_transaction_uuid'] ?? null,
                'temp_id' => $payload['temp_id'] ?? null,
                'message' => 'Learner already exists.'
            ];
        }

        // Insert new learner
        $insLearner = $db->prepare('
            INSERT INTO learners (
                parent_id,
                class_id,
                full_name,
                date_of_birth,
                gender,
                avatar_url,
                special_learning_needs,
                special_needs_description,
                enrolment_date,
                status,
                created_at,
                updated_at
            ) VALUES (
                :pid,
                :cid,
                :name,
                :dob,
                :gender,
                :avatar,
                :needs,
                :desc,
                CURDATE(),
                "active",
                NOW(),
                NOW()
            )
        ');
        $insLearner->execute([
            ':pid' => $parentId,
            ':cid' => $classId,
            ':name' => $fullName,
            ':dob' => $dobStr,
            ':gender' => $gender,
            ':avatar' => $avatarUrl,
            ':needs' => $specialNeeds,
            ':desc' => $specialNeedsDesc
        ]);
        $newLearnerId = (int)$db->lastInsertId();

        // Auto-allocate subjects for class
        $subStmt = $db->prepare('SELECT subject_id, subject_code FROM subjects WHERE class_id = :cid AND is_active = 1');
        $subStmt->execute([':cid' => $classId]);
        $subjects = $subStmt->fetchAll(PDO::FETCH_ASSOC);

        $insSub = $db->prepare('
            INSERT INTO learner_subjects (learner_id, subject_id, status, enrolled_date, created_at, updated_at)
            VALUES (:lid, :sid, "active", CURDATE(), NOW(), NOW())
            ON DUPLICATE KEY UPDATE status = "active"
        ');

        foreach ($subjects as $s) {
            $code = strtoupper($s['subject_code']);
            if ($religiousTrack === 'cre' && str_contains($code, 'IRE')) continue;
            if ($religiousTrack === 'ire' && str_contains($code, 'CRE')) continue;

            $insSub->execute([
                ':lid' => $newLearnerId,
                ':sid' => (int)$s['subject_id']
            ]);
        }

        return [
            'learner_id' => $newLearnerId,
            'client_transaction_uuid' => $payload['client_transaction_uuid'] ?? null,
            'temp_id' => $payload['temp_id'] ?? null,
            'full_name' => $fullName,
            'class_id' => $classId
        ];
    }

    /**
     * Handler: Offline Learner Update
     */
    private static function handleLearnerUpdate(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);

        if (!$learnerId) {
            throw new Exception("Learner ID is required for update.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        $fullName = trim((string)($payload['full_name'] ?? ''));
        $dobStr = trim((string)($payload['date_of_birth'] ?? ''));
        $gender = strtolower(trim((string)($payload['gender'] ?? '')));
        $classId = isset($payload['class_id']) ? (int)$payload['class_id'] : null;
        $specialNeeds = isset($payload['special_learning_needs']) ? (!empty($payload['special_learning_needs']) ? 1 : 0) : null;
        $specialNeedsDesc = isset($payload['special_needs_description']) ? trim((string)$payload['special_needs_description']) : null;
        $avatarUrl = isset($payload['avatar_url']) ? trim((string)$payload['avatar_url']) : null;

        $updateFields = [];
        $params = [':lid' => $learnerId];

        if (!empty($fullName)) {
            $updateFields[] = 'full_name = :name';
            $params[':name'] = $fullName;
        }
        if (!empty($dobStr)) {
            $updateFields[] = 'date_of_birth = :dob';
            $params[':dob'] = $dobStr;
        }
        if (!empty($gender)) {
            $updateFields[] = 'gender = :gender';
            $params[':gender'] = $gender;
        }
        if ($classId !== null && $classId > 0) {
            $updateFields[] = 'class_id = :cid';
            $params[':cid'] = $classId;
        }
        if ($specialNeeds !== null) {
            $updateFields[] = 'special_learning_needs = :needs';
            $params[':needs'] = $specialNeeds;
            $updateFields[] = 'special_needs_description = :needs_desc';
            $params[':needs_desc'] = $specialNeedsDesc;
        }
        if ($avatarUrl !== null) {
            $updateFields[] = 'avatar_url = :avatar';
            $params[':avatar'] = $avatarUrl;
        }

        if (!empty($updateFields)) {
            $updateFields[] = 'updated_at = NOW()';
            $sql = 'UPDATE learners SET ' . implode(', ', $updateFields) . ' WHERE learner_id = :lid';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
        }

        return [
            'learner_id' => $learnerId,
            'updated' => true
        ];
    }

    /**
     * Handler: Offline Schedule Create
     */
    private static function handleScheduleCreate(int $userId, ?int $learnerId, array $payload): array
    {
        $db = Database::getConnection();
        $learnerId = $learnerId ?: (int)($payload['learner_id'] ?? 0);
        $lessonId = (int)($payload['lesson_id'] ?? 0);
        $scheduledDate = $payload['scheduled_date'] ?? date('Y-m-d');
        $startTime = $payload['start_time'] ?? '09:00:00';
        $endTime = $payload['end_time'] ?? '10:00:00';
        $notes = $payload['notes'] ?? null;

        if (!$learnerId || !$lessonId) {
            throw new Exception("Learner ID and Lesson ID are required for schedule.");
        }

        self::verifyLearnerAccess($userId, $learnerId);

        $stmt = $db->prepare('
            INSERT INTO learning_schedules (
                learner_id,
                lesson_id,
                scheduled_date,
                start_time,
                end_time,
                status,
                notes,
                created_at,
                updated_at
            ) VALUES (
                :lid,
                :lesson_id,
                :sched_date,
                :start_time,
                :end_time,
                "planned",
                :notes,
                NOW(),
                NOW()
            )
        ');
        $stmt->execute([
            ':lid' => $learnerId,
            ':lesson_id' => $lessonId,
            ':sched_date' => $scheduledDate,
            ':start_time' => $startTime,
            ':end_time' => $endTime,
            ':notes' => $notes
        ]);
        $scheduleId = (int)$db->lastInsertId();

        return [
            'schedule_id' => $scheduleId,
            'learner_id' => $learnerId,
            'lesson_id' => $lessonId
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
        if (!empty($lessonIds) || !empty($subjectIds)) {
            $conditions = [];
            $params = [];
            if (!empty($lessonIds)) {
                $lesInClause = implode(',', array_fill(0, count($lessonIds), '?'));
                $conditions[] = "lesson_id IN ({$lesInClause})";
                $params = array_merge($params, $lessonIds);
            }
            if (!empty($subjectIds)) {
                $subInClause = implode(',', array_fill(0, count($subjectIds), '?'));
                $conditions[] = "subject_id IN ({$subInClause})";
                $params = array_merge($params, $subjectIds);
            }
            $whereClause = implode(' OR ', $conditions);
            $stmt = $db->prepare("SELECT * FROM assessments WHERE ({$whereClause}) AND status = 'published'");
            $stmt->execute($params);
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

        // 6. Learners Profile
        $stmt = $db->prepare('
            SELECT 
                l.learner_id,
                l.parent_id,
                l.class_id,
                l.full_name,
                l.date_of_birth,
                l.gender,
                l.avatar_url,
                l.special_learning_needs,
                l.special_needs_description,
                l.enrolment_date,
                l.status,
                l.created_at,
                c.class_name,
                c.class_code,
                c.level as class_level,
                (SELECT COUNT(*) FROM learner_subjects ls WHERE ls.learner_id = l.learner_id AND ls.status = "active") as active_subjects_count
            FROM learners l
            JOIN classes c ON l.class_id = c.class_id
            JOIN parents p ON l.parent_id = p.parent_id
            WHERE p.user_id = :uid
            ORDER BY l.created_at DESC
        ');
        $stmt->execute([':uid' => $userId]);
        $learners = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $now = new \DateTime();
        foreach ($learners as &$lrn) {
            $lrn['special_learning_needs'] = (bool)$lrn['special_learning_needs'];
            $lrn['active_subjects_count'] = (int)$lrn['active_subjects_count'];
            if (!empty($lrn['date_of_birth'])) {
                $dob = new \DateTime($lrn['date_of_birth']);
                $lrn['age'] = $dob->diff($now)->y;
            } else {
                $lrn['age'] = null;
            }
        }
        unset($lrn);

        // 7. Schedules
        $schedules = [];
        if ($learnerId) {
            $stmt = $db->prepare('SELECT * FROM learning_schedules WHERE learner_id = :lid ORDER BY scheduled_date ASC');
            $stmt->execute([':lid' => $learnerId]);
            $schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else if (!empty($learners)) {
            $lIds = array_column($learners, 'learner_id');
            $lInClause = implode(',', array_fill(0, count($lIds), '?'));
            $stmt = $db->prepare("SELECT * FROM learning_schedules WHERE learner_id IN ({$lInClause}) ORDER BY scheduled_date ASC");
            $stmt->execute($lIds);
            $schedules = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        // 8. Grading Schemes & Rules
        $gradingSchemes = $db->query('SELECT * FROM grading_schemes')->fetchAll(PDO::FETCH_ASSOC);

        // 9. Exams & Exam Papers
        $exams = [];
        $papers = [];
        if ($classId) {
            $stmt = $db->prepare("SELECT * FROM exam_sets WHERE class_id = :cid AND status = 'published' ORDER BY created_at DESC");
            $stmt->execute([':cid' => $classId]);
            $exams = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else if (!empty($learners)) {
            $cIds = array_unique(array_filter(array_column($learners, 'class_id')));
            if (!empty($cIds)) {
                $cInClause = implode(',', array_fill(0, count($cIds), '?'));
                $stmt = $db->prepare("SELECT * FROM exam_sets WHERE class_id IN ({$cInClause}) AND status = 'published' ORDER BY created_at DESC");
                $stmt->execute(array_values($cIds));
                $exams = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        } else {
            $exams = $db->query("SELECT * FROM exam_sets WHERE status = 'published' ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        }

        $examIds = array_column($exams, 'exam_set_id');
        if (!empty($examIds)) {
            $eInClause = implode(',', array_fill(0, count($examIds), '?'));
            $stmt = $db->prepare("
                SELECT ep.*, s.subject_name, s.subject_code 
                FROM exam_papers ep 
                JOIN subjects s ON ep.subject_id = s.subject_id 
                WHERE ep.exam_set_id IN ({$eInClause}) 
                ORDER BY ep.paper_order ASC
            ");
            $stmt->execute($examIds);
            $papers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        // 10. Exam Submissions & Marks for Learners
        $examSubmissions = [];
        $examMarks = [];
        $learnerIds = !empty($learners) ? array_column($learners, 'learner_id') : ($learnerId ? [$learnerId] : []);
        if (!empty($learnerIds)) {
            $lInClause = implode(',', array_fill(0, count($learnerIds), '?'));
            $stmt = $db->prepare("
                SELECT es.*, e.title AS exam_set_title, e.academic_year, e.exam_type 
                FROM exam_submissions es 
                JOIN exam_sets e ON es.exam_set_id = e.exam_set_id 
                WHERE es.learner_id IN ({$lInClause}) 
                ORDER BY es.sitting_date DESC
            ");
            $stmt->execute($learnerIds);
            $examSubmissions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $subIds = array_column($examSubmissions, 'submission_id');
            if (!empty($subIds)) {
                $sInClause = implode(',', array_fill(0, count($subIds), '?'));
                $stmt = $db->prepare("
                    SELECT em.*, ep.paper_code, ep.title as paper_title, s.subject_name, s.subject_code 
                    FROM exam_marks em 
                    JOIN exam_papers ep ON em.exam_paper_id = ep.exam_paper_id 
                    JOIN subjects s ON em.subject_id = s.subject_id 
                    WHERE em.submission_id IN ({$sInClause}) 
                    ORDER BY ep.paper_order ASC
                ");
                $stmt->execute($subIds);
                $examMarks = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        // 11. Learner Assessment Results & Answers (Recent History)
        $assessmentResults = [];
        $assessmentAnswers = [];
        if (!empty($learnerIds)) {
            $lInClause = implode(',', array_fill(0, count($learnerIds), '?'));
            $stmt = $db->prepare("
                SELECT ar.*, a.title AS assessment_title, a.passing_marks, a.total_marks,
                       l.full_name AS learner_name, 
                       COALESCE(sub.subject_name, sub_direct.subject_name) AS subject_name,
                       COALESCE(sub.class_id, sub_direct.class_id, a.class_id) AS class_id,
                       COALESCE(c.class_code, c_direct.class_code) AS class_code
                FROM assessment_results ar
                JOIN assessment_attempts att ON ar.attempt_id = att.attempt_id
                JOIN assessments a ON att.assessment_id = a.assessment_id
                LEFT JOIN lessons les ON a.lesson_id = les.lesson_id
                LEFT JOIN subjects sub ON les.subject_id = sub.subject_id
                LEFT JOIN subjects sub_direct ON a.subject_id = sub_direct.subject_id
                LEFT JOIN classes c ON sub.class_id = c.class_id
                LEFT JOIN classes c_direct ON a.class_id = c_direct.class_id
                JOIN learners l ON ar.learner_id = l.learner_id
                WHERE ar.learner_id IN ({$lInClause})
                ORDER BY ar.created_at DESC
                LIMIT 150
            ");
            $stmt->execute($learnerIds);
            $assessmentResults = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $attemptIds = array_unique(array_filter(array_column($assessmentResults, 'attempt_id')));
            if (!empty($attemptIds)) {
                $attInClause = implode(',', array_fill(0, count($attemptIds), '?'));
                $stmt = $db->prepare("
                    SELECT ans.*, q.question_text, q.question_type, q.marks AS max_marks 
                    FROM assessment_answers ans 
                    JOIN assessment_questions q ON ans.question_id = q.question_id 
                    WHERE ans.attempt_id IN ({$attInClause})
                ");
                $stmt->execute(array_values($attemptIds));
                $assessmentAnswers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        // 12. Digital Lesson Materials
        $materials = [];
        if (!empty($lessonIds)) {
            $lesInClause = implode(',', array_fill(0, count($lessonIds), '?'));
            $stmt = $db->prepare("SELECT * FROM learning_materials WHERE lesson_id IN ({$lesInClause}) AND status = 'approved'");
            $stmt->execute($lessonIds);
            $materials = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        // 13. Learner Subjects
        $learnerSubjects = [];
        if (!empty($learnerIds)) {
            $lInClause = implode(',', array_fill(0, count($learnerIds), '?'));
            $stmt = $db->prepare("
                SELECT ls.*, s.subject_name, s.subject_code, s.class_id 
                FROM learner_subjects ls 
                JOIN subjects s ON ls.subject_id = s.subject_id 
                WHERE ls.learner_id IN ({$lInClause}) AND ls.status = 'active'
            ");
            $stmt->execute($learnerIds);
            $learnerSubjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        return [
            'package_version' => '2.0.0',
            'generated_at' => date('c'),
            'class_id' => $classId,
            'learner_id' => $learnerId,
            'metadata' => [
                'classes' => $classes,
                'terms' => $terms,
                'grading_schemes' => $gradingSchemes
            ],
            'learners' => $learners,
            'learner_subjects' => $learnerSubjects,
            'subjects' => $subjects,
            'lessons' => $lessons,
            'guides' => $guides,
            'materials' => $materials,
            'assessments' => $assessments,
            'questions' => $questions,
            'options' => $options,
            'assessment_results' => $assessmentResults,
            'assessment_answers' => $assessmentAnswers,
            'schedules' => $schedules,
            'exams' => $exams,
            'exam_papers' => $papers,
            'exam_submissions' => $examSubmissions,
            'exam_marks' => $examMarks,
            'grading_schemes' => $gradingSchemes,
            'counts' => [
                'learners' => count($learners),
                'subjects' => count($subjects),
                'lessons' => count($lessons),
                'guides' => count($guides),
                'materials' => count($materials),
                'assessments' => count($assessments),
                'questions' => count($questions),
                'options' => count($options),
                'assessment_results' => count($assessmentResults),
                'schedules' => count($schedules),
                'exams' => count($exams),
                'exam_papers' => count($papers),
                'exam_submissions' => count($examSubmissions),
                'exam_marks' => count($examMarks),
                'grading_schemes' => count($gradingSchemes)
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
