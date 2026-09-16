<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

/**
 * Controller for Curriculum Assessments, Attempts, Auto-Scoring & Grading
 */
class AssessmentController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Helper to get JSON input
     */
    private function getJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            return $_POST ?: [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    /**
     * List Published Assessments (Filtered by class, subject, lesson)
     * GET /api/assessments
     */
    public function getAssessments(): void
    {
        try {
            $user = AuthMiddleware::handle();

            $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;
            $subjectId = isset($_GET['subject_id']) && is_numeric($_GET['subject_id']) ? (int)$_GET['subject_id'] : null;
            $lessonId = isset($_GET['lesson_id']) && is_numeric($_GET['lesson_id']) ? (int)$_GET['lesson_id'] : null;
            $type = isset($_GET['assessment_type']) ? trim($_GET['assessment_type']) : null;
            $search = isset($_GET['search']) ? trim($_GET['search']) : null;

            $role = $user['role_code'] ?? '';
            $isStaff = in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true);

            $status = isset($_GET['status']) ? trim($_GET['status']) : ($isStaff ? null : 'published');

            // Child Class Level Scoping (Children can only see assessments for their class and below)
            $maxClassLevel = null;
            $childContext = null;

            if (!empty($_GET['learner_id']) && is_numeric($_GET['learner_id'])) {
                $learnerId = (int)$_GET['learner_id'];
                if ($role === 'parent') {
                    $cStmt = $this->db->prepare('
                        SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                        FROM learners l
                        JOIN classes c ON l.class_id = c.class_id
                        JOIN parents p ON l.parent_id = p.parent_id
                        WHERE l.learner_id = ? AND p.user_id = ?
                        LIMIT 1
                    ');
                    $cStmt->execute([$learnerId, $user['user_id']]);
                    $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                    if ($childContext) {
                        $maxClassLevel = (int)$childContext['class_level'];
                    } else {
                        Response::forbidden('You do not have access to view assessments scoped to this learner.');
                        return;
                    }
                } elseif ($role === 'learner') {
                    $cStmt = $this->db->prepare('
                        SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                        FROM learners l
                        JOIN classes c ON l.class_id = c.class_id
                        WHERE l.learner_id = ? AND l.user_id = ?
                        LIMIT 1
                    ');
                    $cStmt->execute([$learnerId, $user['user_id']]);
                    $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                    if ($childContext) {
                        $maxClassLevel = (int)$childContext['class_level'];
                    }
                } else {
                    $cStmt = $this->db->prepare('
                        SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                        FROM learners l
                        JOIN classes c ON l.class_id = c.class_id
                        WHERE l.learner_id = ?
                        LIMIT 1
                    ');
                    $cStmt->execute([$learnerId]);
                    $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                    if ($childContext) {
                        $maxClassLevel = (int)$childContext['class_level'];
                    }
                }
            } elseif (!empty($_GET['max_class_level']) && is_numeric($_GET['max_class_level'])) {
                $reqLevel = (int)$_GET['max_class_level'];
                if ($reqLevel >= 1 && $reqLevel <= 7) {
                    $maxClassLevel = $reqLevel;
                }
            } elseif ($role === 'learner') {
                // Default learner query strictly scopes to learner's own class and foundational classes below
                $cStmt = $this->db->prepare('
                    SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    WHERE l.user_id = ?
                    LIMIT 1
                ');
                $cStmt->execute([$user['user_id']]);
                $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($childContext) {
                    $maxClassLevel = (int)$childContext['class_level'];
                }
            }

            $sql = "
                SELECT 
                    a.assessment_id,
                    a.title,
                    a.class_id,
                    c.class_name,
                    c.class_code,
                    c.level AS class_level,
                    a.subject_id,
                    s.subject_name,
                    s.subject_code,
                    a.lesson_id,
                    l.lesson_title,
                    a.assessment_type,
                    a.instructions,
                    a.total_marks,
                    a.passing_marks,
                    a.time_limit_minutes,
                    a.status,
                    a.published_at,
                    COUNT(q.question_id) AS question_count
                FROM assessments a
                JOIN classes c ON a.class_id = c.class_id
                JOIN subjects s ON a.subject_id = s.subject_id
                LEFT JOIN lessons l ON a.lesson_id = l.lesson_id
                LEFT JOIN assessment_questions q ON a.assessment_id = q.assessment_id
                WHERE 1=1
            ";

            $params = [];

            if ($status) {
                $sql .= " AND a.status = ?";
                $params[] = $status;
            } elseif (!$isStaff) {
                $sql .= " AND a.status = 'published'";
            }

            if ($maxClassLevel !== null) {
                $sql .= " AND c.level <= ?";
                $params[] = $maxClassLevel;
            }

            if ($classId) {
                $sql .= " AND a.class_id = ?";
                $params[] = $classId;
            }
            if ($subjectId) {
                $sql .= " AND a.subject_id = ?";
                $params[] = $subjectId;
            }
            if ($lessonId) {
                $sql .= " AND a.lesson_id = ?";
                $params[] = $lessonId;
            }
            if ($type) {
                $sql .= " AND a.assessment_type = ?";
                $params[] = $type;
            }
            if ($search) {
                $sql .= " AND (a.title LIKE ? OR a.instructions LIKE ? OR s.subject_name LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $sql .= " GROUP BY a.assessment_id ORDER BY c.level DESC, a.assessment_id DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $assessments = $stmt->fetchAll(PDO::FETCH_ASSOC);

            Response::success([
                'assessments' => $assessments,
                'total_count' => count($assessments),
                'scoped_learner' => $childContext,
                'max_class_level' => $maxClassLevel
            ], 'Assessments retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch assessments: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Assessment Details with Questions & Options
     * GET /api/assessments/{id}
     */
    public function getAssessmentDetails(int $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            $isStaff = in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true);
            $hideAnswers = isset($_GET['for_attempt']) && $_GET['for_attempt'] === 'true' && !$isStaff;

            $stmt = $this->db->prepare("
                SELECT 
                    a.*,
                    c.class_name,
                    c.class_code,
                    s.subject_name,
                    s.subject_code,
                    l.lesson_title
                FROM assessments a
                JOIN classes c ON a.class_id = c.class_id
                JOIN subjects s ON a.subject_id = s.subject_id
                LEFT JOIN lessons l ON a.lesson_id = l.lesson_id
                WHERE a.assessment_id = ?
            ");
            $stmt->execute([$id]);
            $assessment = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$assessment) {
                Response::error('Assessment not found.', 404);
                return;
            }

            // Fetch Questions
            $stmtQ = $this->db->prepare("
                SELECT 
                    question_id,
                    assessment_id,
                    question_type,
                    question_text,
                    marks,
                    question_order,
                    media_url,
                    audio_url" . ($hideAnswers ? "" : ", correct_text, explanation") . "
                FROM assessment_questions
                WHERE assessment_id = ?
                ORDER BY question_order ASC, question_id ASC
            ");
            $stmtQ->execute([$id]);
            $questions = $stmtQ->fetchAll(PDO::FETCH_ASSOC);

            // Fetch Options
            $questionIds = array_column($questions, 'question_id');
            $optionsByQ = [];
            if (!empty($questionIds)) {
                $inClause = implode(',', array_fill(0, count($questionIds), '?'));
                $stmtOpt = $this->db->prepare("
                    SELECT 
                        option_id,
                        question_id,
                        option_label,
                        option_text,
                        option_order" . ($hideAnswers ? "" : ", is_correct") . "
                    FROM assessment_options
                    WHERE question_id IN ($inClause)
                    ORDER BY option_order ASC, option_id ASC
                ");
                $stmtOpt->execute($questionIds);
                $options = $stmtOpt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($options as $opt) {
                    $optionsByQ[$opt['question_id']][] = $opt;
                }
            }

            foreach ($questions as &$q) {
                $q['options'] = $optionsByQ[$q['question_id']] ?? [];
            }
            unset($q);

            Response::success([
                'assessment' => $assessment,
                'questions' => $questions
            ], 'Assessment details retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to retrieve assessment details: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Create Assessment Draft (Curriculum Officer / Admin)
     * POST /api/officer/assessments
     */
    public function createAssessment(): void
    {
        try {
            $user = AuthMiddleware::requireRole(['curriculum_officer', 'administrator', 'teacher']);
            $input = $this->getJsonInput();

            $v = new Validator($input);
            $v->required(['title', 'class_id', 'subject_id', 'total_marks', 'passing_marks', 'time_limit_minutes']);

            if (!$v->isValid()) {
                Response::error('Validation errors occurred.', 422, $v->getErrors());
                return;
            }

            $this->db->beginTransaction();

            $stmt = $this->db->prepare("
                INSERT INTO assessments (
                    subject_id, class_id, lesson_id, assessment_type, title, instructions, 
                    total_marks, passing_marks, time_limit_minutes, created_by, date_created, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'draft')
            ");

            $stmt->execute([
                (int)$input['subject_id'],
                (int)$input['class_id'],
                !empty($input['lesson_id']) ? (int)$input['lesson_id'] : null,
                $input['assessment_type'] ?? 'mixed',
                trim($input['title']),
                $input['instructions'] ?? 'Answer all questions carefully.',
                (float)$input['total_marks'],
                (float)$input['passing_marks'],
                (int)$input['time_limit_minutes'],
                (int)$user['user_id']
            ]);

            $assessmentId = (int)$this->db->lastInsertId();

            // Insert questions if provided
            if (!empty($input['questions']) && is_array($input['questions'])) {
                $this->saveQuestions($assessmentId, $input['questions']);
            }

            $this->db->commit();

            Response::success([
                'assessment_id' => $assessmentId,
                'title' => $input['title'],
                'status' => 'draft'
            ], 'Assessment draft created successfully.', 201);
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Response::error('Failed to create assessment: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Update Assessment
     * PUT /api/officer/assessments/{id}
     */
    public function updateAssessment(int $id): void
    {
        try {
            $user = AuthMiddleware::requireRole(['curriculum_officer', 'administrator', 'teacher']);
            $input = $this->getJsonInput();

            $this->db->beginTransaction();

            $stmt = $this->db->prepare("
                UPDATE assessments 
                SET title = ?,
                    class_id = ?,
                    subject_id = ?,
                    lesson_id = ?,
                    assessment_type = ?,
                    instructions = ?,
                    total_marks = ?,
                    passing_marks = ?,
                    time_limit_minutes = ?
                WHERE assessment_id = ?
            ");

            $stmt->execute([
                trim($input['title']),
                (int)$input['class_id'],
                (int)$input['subject_id'],
                !empty($input['lesson_id']) ? (int)$input['lesson_id'] : null,
                $input['assessment_type'] ?? 'mixed',
                $input['instructions'] ?? '',
                (float)$input['total_marks'],
                (float)$input['passing_marks'],
                (int)$input['time_limit_minutes'],
                $id
            ]);

            if (isset($input['questions']) && is_array($input['questions'])) {
                // Remove old questions & options and re-save
                $oldQ = $this->db->prepare("SELECT question_id FROM assessment_questions WHERE assessment_id = ?");
                $oldQ->execute([$id]);
                $oldQIds = $oldQ->fetchAll(PDO::FETCH_COLUMN);
                if (!empty($oldQIds)) {
                    $in = implode(',', array_fill(0, count($oldQIds), '?'));
                    $delOpt = $this->db->prepare("DELETE FROM assessment_options WHERE question_id IN ($in)");
                    $delOpt->execute($oldQIds);
                }
                $delQ = $this->db->prepare("DELETE FROM assessment_questions WHERE assessment_id = ?");
                $delQ->execute([$id]);

                $this->saveQuestions($id, $input['questions']);
            }

            $this->db->commit();

            Response::success(['assessment_id' => $id], 'Assessment updated successfully.');
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Response::error('Failed to update assessment: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Validate & Publish Assessment
     * POST /api/officer/assessments/{id}/publish
     */
    public function publishAssessment(int $id): void
    {
        try {
            $user = AuthMiddleware::requireRole(['curriculum_officer', 'administrator']);

            // Validate questions existence and rules
            $stmt = $this->db->prepare("SELECT * FROM assessment_questions WHERE assessment_id = ? ORDER BY question_order");
            $stmt->execute([$id]);
            $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($questions)) {
                Response::error('Cannot publish an assessment with zero questions. Add at least one question first.', 422);
                return;
            }

            // Check objective questions option requirements
            foreach ($questions as $q) {
                if (in_array($q['question_type'], ['multiple_choice', 'true_false'], true)) {
                    $stmtOpt = $this->db->prepare("SELECT * FROM assessment_options WHERE question_id = ?");
                    $stmtOpt->execute([$q['question_id']]);
                    $opts = $stmtOpt->fetchAll(PDO::FETCH_ASSOC);

                    if (count($opts) < 2) {
                        Response::error("Question #{$q['question_order']} ({$q['question_type']}) must have at least 2 options.", 422);
                        return;
                    }

                    $hasCorrect = array_filter($opts, fn($o) => (int)$o['is_correct'] === 1);
                    if (empty($hasCorrect)) {
                        Response::error("Question #{$q['question_order']} does not have a designated correct answer option.", 422);
                        return;
                    }
                }
            }

            $pubStmt = $this->db->prepare("UPDATE assessments SET status = 'published', published_at = NOW() WHERE assessment_id = ?");
            $pubStmt->execute([$id]);

            Response::success([
                'assessment_id' => $id,
                'status' => 'published',
                'published_at' => date('Y-m-d H:i:s')
            ], 'Assessment validated and published successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to publish assessment: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Start a Test Attempt
     * POST /api/assessments/{id}/attempts
     */
    public function startAttempt(int $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $input = $this->getJsonInput();

            $learnerId = (int)($input['learner_id'] ?? 0);
            if (!$learnerId) {
                // Try to find if user is a learner
                $learnerStmt = $this->db->prepare("SELECT learner_id FROM learners WHERE user_id = ? LIMIT 1");
                $learnerStmt->execute([$user['user_id']]);
                $lRow = $learnerStmt->fetch(PDO::FETCH_ASSOC);
                $learnerId = $lRow ? (int)$lRow['learner_id'] : 0;
            }

            if (!$learnerId) {
                Response::error('Valid learner_id is required to start an assessment attempt.', 422);
                return;
            }

            // Verify assessment exists and is published
            $stmtA = $this->db->prepare("SELECT * FROM assessments WHERE assessment_id = ?");
            $stmtA->execute([$id]);
            $assessment = $stmtA->fetch(PDO::FETCH_ASSOC);

            if (!$assessment || $assessment['status'] !== 'published') {
                Response::error('Assessment is not available or not published.', 404);
                return;
            }

            // Class Level Gatekeeping: Ensure learner cannot attempt tests above their primary class level
            $lStmt = $this->db->prepare("SELECT l.class_id, c.level AS learner_level FROM learners l JOIN classes c ON l.class_id = c.class_id WHERE l.learner_id = ?");
            $lStmt->execute([$learnerId]);
            $lData = $lStmt->fetch(PDO::FETCH_ASSOC);

            $aClassStmt = $this->db->prepare("SELECT level FROM classes WHERE class_id = ?");
            $aClassStmt->execute([(int)$assessment['class_id']]);
            $aLevel = (int)$aClassStmt->fetchColumn();

            if ($lData && $aLevel > (int)$lData['learner_level']) {
                Response::forbidden('Learners cannot attempt assessments above their registered primary class level.');
                return;
            }

            $clientUuid = trim($input['client_attempt_uuid'] ?? '') ?: $this->generateUuid();

            // Idempotency: Check if an active in_progress attempt already exists for this client UUID
            $stmtCheck = $this->db->prepare("
                SELECT * FROM assessment_attempts 
                WHERE assessment_id = ? AND learner_id = ? AND client_attempt_uuid = ?
                LIMIT 1
            ");
            $stmtCheck->execute([$id, $learnerId, $clientUuid]);
            $existing = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                Response::success([
                    'attempt' => $existing,
                    'is_resumed' => true
                ], 'Existing attempt session resumed.');
                return;
            }

            // Create new attempt
            $stmtIns = $this->db->prepare("
                INSERT INTO assessment_attempts (
                    assessment_id, learner_id, device_id, client_attempt_uuid, started_at, attempt_mode, attempt_status, created_at
                ) VALUES (?, ?, ?, ?, NOW(), ?, 'in_progress', NOW())
            ");

            $stmtIns->execute([
                $id,
                $learnerId,
                !empty($input['device_id']) ? (int)$input['device_id'] : null,
                $clientUuid,
                $input['attempt_mode'] ?? 'online'
            ]);

            $attemptId = (int)$this->db->lastInsertId();

            $stmtAtt = $this->db->prepare("SELECT * FROM assessment_attempts WHERE attempt_id = ?");
            $stmtAtt->execute([$attemptId]);
            $attempt = $stmtAtt->fetch(PDO::FETCH_ASSOC);

            Response::success([
                'attempt' => $attempt,
                'is_resumed' => false
            ], 'Assessment attempt started successfully.', 201);
        } catch (Throwable $e) {
            Response::error('Failed to start assessment attempt: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Submit Attempt & Execute Server-Side Auto-Scoring Engine
     * POST /api/attempts/{id}/submit
     */
    public function submitAttempt(int $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $input = $this->getJsonInput();

            $stmtAtt = $this->db->prepare("
                SELECT att.*, a.total_marks, a.passing_marks, a.title AS assessment_title 
                FROM assessment_attempts att
                JOIN assessments a ON att.assessment_id = a.assessment_id
                WHERE att.attempt_id = ?
            ");
            $stmtAtt->execute([$id]);
            $attempt = $stmtAtt->fetch(PDO::FETCH_ASSOC);

            if (!$attempt) {
                Response::error('Assessment attempt not found.', 404);
                return;
            }

            // Idempotency: If attempt has already been submitted or synced, return existing result!
            if (in_array($attempt['attempt_status'], ['submitted', 'synced'], true)) {
                $stmtRes = $this->db->prepare("SELECT * FROM assessment_results WHERE attempt_id = ? LIMIT 1");
                $stmtRes->execute([$id]);
                $existingResult = $stmtRes->fetch(PDO::FETCH_ASSOC);

                if ($existingResult) {
                    Response::success([
                        'result' => $existingResult,
                        'is_duplicate' => true,
                        'attempt_status' => $attempt['attempt_status']
                    ], 'Attempt was already submitted and scored.');
                    return;
                }
            }

            $assessmentId = (int)$attempt['assessment_id'];
            $learnerId = (int)$attempt['learner_id'];
            $totalMarks = (float)$attempt['total_marks'];
            $passingMarks = (float)$attempt['passing_marks'];

            // Fetch canonical questions & options for server-side score calculation
            $stmtQ = $this->db->prepare("
                SELECT question_id, question_type, marks, correct_text 
                FROM assessment_questions 
                WHERE assessment_id = ?
            ");
            $stmtQ->execute([$assessmentId]);
            $canonicalQuestions = [];
            foreach ($stmtQ->fetchAll(PDO::FETCH_ASSOC) as $qRow) {
                $canonicalQuestions[$qRow['question_id']] = $qRow;
            }

            $stmtOpt = $this->db->prepare("
                SELECT option_id, question_id, is_correct 
                FROM assessment_options 
                WHERE question_id IN (" . (empty($canonicalQuestions) ? '0' : implode(',', array_keys($canonicalQuestions))) . ")
            ");
            $stmtOpt->execute();
            $canonicalOptions = [];
            foreach ($stmtOpt->fetchAll(PDO::FETCH_ASSOC) as $oRow) {
                $canonicalOptions[$oRow['option_id']] = $oRow;
            }

            $submittedAnswers = $input['answers'] ?? [];
            if (!is_array($submittedAnswers)) {
                $submittedAnswers = [];
            }

            $this->db->beginTransaction();

            $totalEarnedScore = 0.00;
            $hasManualGradingQuestions = false;

            $stmtInsAns = $this->db->prepare("
                INSERT INTO assessment_answers (
                    attempt_id, question_id, option_id, answer_text, marks_awarded, is_correct, answered_at
                ) VALUES (?, ?, ?, ?, ?, ?, NOW())
            ");

            // Process each submitted answer with server-side scoring verification
            foreach ($submittedAnswers as $ans) {
                $qId = (int)($ans['question_id'] ?? 0);
                $optId = !empty($ans['option_id']) ? (int)$ans['option_id'] : null;
                $ansText = trim($ans['answer_text'] ?? '');

                if (!isset($canonicalQuestions[$qId])) {
                    continue;
                }

                $q = $canonicalQuestions[$qId];
                $qType = $q['question_type'];
                $qMarks = (float)$q['marks'];

                $marksAwarded = 0.00;
                $isCorrect = null;

                if (in_array($qType, ['multiple_choice', 'true_false'], true)) {
                    if ($optId && isset($canonicalOptions[$optId]) && (int)$canonicalOptions[$optId]['is_correct'] === 1) {
                        $marksAwarded = $qMarks;
                        $isCorrect = 1;
                    } else {
                        $marksAwarded = 0.00;
                        $isCorrect = 0;
                    }
                } elseif ($qType === 'short_answer') {
                    $expected = trim((string)$q['correct_text']);
                    if ($expected !== '' && strcasecmp($ansText, $expected) === 0) {
                        $marksAwarded = $qMarks;
                        $isCorrect = 1;
                    } else {
                        $marksAwarded = 0.00;
                        $isCorrect = 0;
                    }
                } elseif ($qType === 'essay' || $qType === 'matching') {
                    $hasManualGradingQuestions = true;
                    $marksAwarded = 0.00;
                    $isCorrect = null; // Requires teacher/parent evaluation
                }

                $totalEarnedScore += $marksAwarded;

                $stmtInsAns->execute([
                    $id,
                    $qId,
                    $optId,
                    $ansText ?: null,
                    $marksAwarded,
                    $isCorrect
                ]);
            }

            // Calculate percentage
            $percentage = $totalMarks > 0 ? round(($totalEarnedScore / $totalMarks) * 100, 2) : 0.00;
            $scoringMode = $hasManualGradingQuestions ? ($totalEarnedScore > 0 ? 'mixed' : 'manual') : 'automatic';
            $passed = $totalEarnedScore >= $passingMarks;

            // Insert into assessment_results
            $stmtRes = $this->db->prepare("
                INSERT INTO assessment_results (
                    assessment_id, learner_id, attempt_id, score, total_marks, percentage, 
                    date_taken, feedback, taken_offline, sync_status, scored_by, scoring_mode, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'synced', ?, ?, NOW())
            ");

            $stmtRes->execute([
                $assessmentId,
                $learnerId,
                $id,
                $totalEarnedScore,
                $totalMarks,
                $percentage,
                $passed ? 'Congratulations! You achieved the passing grade for this assessment.' : 'Keep practicing this topic with the lesson materials and parental guides.',
                ($input['taken_offline'] ?? false) ? 1 : 0,
                $user['user_id'],
                $scoringMode
            ]);

            $resultId = (int)$this->db->lastInsertId();

            // Update attempt status to submitted
            $stmtUpdAtt = $this->db->prepare("
                UPDATE assessment_attempts 
                SET attempt_status = 'submitted', submitted_at = NOW() 
                WHERE attempt_id = ?
            ");
            $stmtUpdAtt->execute([$id]);

            $this->db->commit();

            Response::success([
                'result_id' => $resultId,
                'attempt_id' => $id,
                'score' => $totalEarnedScore,
                'total_marks' => $totalMarks,
                'percentage' => $percentage,
                'passed' => $passed,
                'scoring_mode' => $scoringMode,
                'has_manual_questions' => $hasManualGradingQuestions
            ], 'Assessment submitted and scored successfully.');
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Response::error('Failed to submit assessment: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Scored Result Details & Review Breakdown
     * GET /api/attempts/{id}/result
     */
    public function getAttemptResult(int $id): void
    {
        try {
            $user = AuthMiddleware::handle();

            $stmt = $this->db->prepare("
                SELECT 
                    r.*,
                    att.started_at,
                    att.submitted_at,
                    att.client_attempt_uuid,
                    a.title AS assessment_title,
                    a.passing_marks,
                    s.subject_name,
                    c.class_code,
                    l.full_name AS learner_name
                FROM assessment_results r
                JOIN assessment_attempts att ON r.attempt_id = att.attempt_id
                JOIN assessments a ON r.assessment_id = a.assessment_id
                JOIN subjects s ON a.subject_id = s.subject_id
                JOIN classes c ON a.class_id = c.class_id
                JOIN learners l ON r.learner_id = l.learner_id
                WHERE r.attempt_id = ?
            ");
            $stmt->execute([$id]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$result) {
                Response::error('Assessment result not found for this attempt.', 404);
                return;
            }

            // Fetch answers breakdown with questions and explanations
            $stmtAns = $this->db->prepare("
                SELECT 
                    ans.*,
                    q.question_text,
                    q.question_type,
                    q.marks AS max_marks,
                    q.question_order,
                    q.correct_text,
                    q.explanation,
                    opt.option_text AS selected_option_text,
                    opt.option_label AS selected_option_label
                FROM assessment_answers ans
                JOIN assessment_questions q ON ans.question_id = q.question_id
                LEFT JOIN assessment_options opt ON ans.option_id = opt.option_id
                WHERE ans.attempt_id = ?
                ORDER BY q.question_order ASC
            ");
            $stmtAns->execute([$id]);
            $answers = $stmtAns->fetchAll(PDO::FETCH_ASSOC);

            // Fetch all options for questions
            $qIds = array_column($answers, 'question_id');
            $allOptions = [];
            if (!empty($qIds)) {
                $in = implode(',', array_fill(0, count($qIds), '?'));
                $stmtOpt = $this->db->prepare("SELECT * FROM assessment_options WHERE question_id IN ($in) ORDER BY option_order ASC");
                $stmtOpt->execute($qIds);
                foreach ($stmtOpt->fetchAll(PDO::FETCH_ASSOC) as $opt) {
                    $allOptions[$opt['question_id']][] = $opt;
                }
            }

            foreach ($answers as &$a) {
                $a['options'] = $allOptions[$a['question_id']] ?? [];
            }
            unset($a);

            Response::success([
                'result' => $result,
                'answers' => $answers
            ], 'Assessment scorecard retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch result: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Learner Assessment History & Performance Analytics
     * GET /api/parent/assessments/results
     */
    public function getLearnerResults(): void
    {
        try {
            $user = AuthMiddleware::handle();

            $learnerId = isset($_GET['learner_id']) ? (int)$_GET['learner_id'] : 0;
            $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0;
            $subjectId = isset($_GET['subject_id']) ? (int)$_GET['subject_id'] : 0;

            $sql = "
                SELECT 
                    r.result_id,
                    r.assessment_id,
                    r.learner_id,
                    r.attempt_id,
                    r.score,
                    r.total_marks,
                    r.percentage,
                    r.date_taken,
                    r.feedback,
                    r.scoring_mode,
                    a.title AS assessment_title,
                    a.passing_marks,
                    s.subject_id,
                    s.subject_name,
                    c.class_code,
                    l.full_name AS learner_name,
                    (r.score >= a.passing_marks) AS passed
                FROM assessment_results r
                JOIN assessments a ON r.assessment_id = a.assessment_id
                JOIN subjects s ON a.subject_id = s.subject_id
                JOIN classes c ON a.class_id = c.class_id
                JOIN learners l ON r.learner_id = l.learner_id
                WHERE 1=1
            ";

            $params = [];

            if ($learnerId > 0) {
                $sql .= " AND r.learner_id = ?";
                $params[] = $learnerId;
            }

            if ($classId > 0) {
                $sql .= " AND a.class_id = ?";
                $params[] = $classId;
            }

            if ($subjectId > 0) {
                $sql .= " AND a.subject_id = ?";
                $params[] = $subjectId;
            }

            $sql .= " ORDER BY r.date_taken DESC, r.result_id DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Compute summary metrics
            $totalAttempts = count($results);
            $avgPercentage = $totalAttempts > 0 ? round(array_sum(array_column($results, 'percentage')) / $totalAttempts, 1) : 0.0;
            $passedCount = count(array_filter($results, fn($r) => (bool)$r['passed']));

            Response::success([
                'results' => $results,
                'metrics' => [
                    'total_attempts' => $totalAttempts,
                    'average_percentage' => $avgPercentage,
                    'passed_count' => $passedCount,
                    'pass_rate' => $totalAttempts > 0 ? round(($passedCount / $totalAttempts) * 100, 1) : 0.0
                ]
            ], 'Learner results history retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch learner results: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Teacher / Parent Manual Essay Grading
     * POST /api/results/{id}/manual-score
     */
    public function manualScoreEssay(int $resultId): void
    {
        try {
            $user = AuthMiddleware::requireRole(['teacher', 'parent', 'curriculum_officer', 'administrator']);
            $input = $this->getJsonInput();

            $stmtRes = $this->db->prepare("SELECT * FROM assessment_results WHERE result_id = ?");
            $stmtRes->execute([$resultId]);
            $result = $stmtRes->fetch(PDO::FETCH_ASSOC);

            if (!$result) {
                Response::error('Assessment result record not found.', 404);
                return;
            }

            $attemptId = (int)$result['attempt_id'];
            $gradedAnswers = $input['answers'] ?? [];

            if (!is_array($gradedAnswers) || empty($gradedAnswers)) {
                Response::error('No answers provided for manual grading.', 422);
                return;
            }

            $this->db->beginTransaction();

            $stmtUpdAns = $this->db->prepare("
                UPDATE assessment_answers 
                SET marks_awarded = ?, is_correct = ? 
                WHERE answer_id = ? AND attempt_id = ?
            ");

            foreach ($gradedAnswers as $ga) {
                $ansId = (int)($ga['answer_id'] ?? 0);
                $awarded = (float)($ga['marks_awarded'] ?? 0);
                $isCorrect = $awarded > 0 ? 1 : 0;
                $stmtUpdAns->execute([$awarded, $isCorrect, $ansId, $attemptId]);
            }

            // Recalculate total score
            $stmtTotal = $this->db->prepare("SELECT SUM(marks_awarded) FROM assessment_answers WHERE attempt_id = ?");
            $stmtTotal->execute([$attemptId]);
            $newTotalScore = (float)$stmtTotal->fetchColumn();

            $totalMarks = (float)$result['total_marks'];
            $newPct = $totalMarks > 0 ? round(($newTotalScore / $totalMarks) * 100, 2) : 0.00;

            $stmtUpdRes = $this->db->prepare("
                UPDATE assessment_results 
                SET score = ?, percentage = ?, feedback = ?, scored_by = ?, scoring_mode = 'manual' 
                WHERE result_id = ?
            ");

            $stmtUpdRes->execute([
                $newTotalScore,
                $newPct,
                !empty($input['feedback']) ? trim($input['feedback']) : $result['feedback'],
                $user['user_id'],
                $resultId
            ]);

            $this->db->commit();

            Response::success([
                'result_id' => $resultId,
                'new_score' => $newTotalScore,
                'new_percentage' => $newPct
            ], 'Manual grading saved and total score recalculated successfully.');
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Response::error('Failed to save manual grade: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Helper to save questions and options
     */
    private function saveQuestions(int $assessmentId, array $questions): void
    {
        $stmtQ = $this->db->prepare("
            INSERT INTO assessment_questions (
                assessment_id, question_type, question_text, marks, question_order, 
                media_url, audio_url, correct_text, explanation, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ");

        $stmtOpt = $this->db->prepare("
            INSERT INTO assessment_options (
                question_id, option_label, option_text, is_correct, option_order
            ) VALUES (?, ?, ?, ?, ?)
        ");

        $order = 1;
        foreach ($questions as $q) {
            $stmtQ->execute([
                $assessmentId,
                $q['question_type'] ?? 'multiple_choice',
                trim($q['question_text']),
                (float)($q['marks'] ?? 1),
                $order++,
                $q['media_url'] ?? null,
                $q['audio_url'] ?? null,
                $q['correct_text'] ?? null,
                $q['explanation'] ?? null
            ]);
            $qId = (int)$this->db->lastInsertId();

            if (!empty($q['options']) && is_array($q['options'])) {
                $optOrder = 1;
                foreach ($q['options'] as $opt) {
                    $stmtOpt->execute([
                        $qId,
                        $opt['option_label'] ?? chr(64 + $optOrder),
                        trim($opt['option_text']),
                        !empty($opt['is_correct']) ? 1 : 0,
                        $optOrder++
                    ]);
                }
            }
        }
    }

    /**
     * Generate v4 UUID
     */
    private function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
