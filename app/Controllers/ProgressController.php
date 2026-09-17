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

/**
 * Controller for Progress Tracking, Activity Logging, and Role-Based Dashboards
 */
class ProgressController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Helper to read JSON request body
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
     * Resolve learner record for user or access check
     */
    private function resolveLearner(array $user, ?int $learnerId = null): ?array
    {
        $role = $user['role_code'] ?? '';

        if ($role === 'learner') {
            // Learner reading own profile
            $stmt = $this->db->prepare("
                SELECT l.*, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level 
                FROM learners l 
                LEFT JOIN classes c ON c.class_id = l.class_id 
                WHERE l.user_id = :uid 
                LIMIT 1
            ");
            $stmt->execute([':uid' => $user['user_id']]);
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        if ($role === 'parent') {
            $pStmt = $this->db->prepare("SELECT parent_id FROM parents WHERE user_id = :uid LIMIT 1");
            $pStmt->execute([':uid' => $user['user_id']]);
            $parentId = $pStmt->fetchColumn();

            if (!$parentId && !empty($user['email'])) {
                $pStmt = $this->db->prepare("SELECT parent_id FROM parents WHERE email = :email LIMIT 1");
                $pStmt->execute([':email' => $user['email']]);
                $parentId = $pStmt->fetchColumn();
                if ($parentId) {
                    $this->db->prepare("UPDATE parents SET user_id = :uid WHERE parent_id = :pid")->execute([':uid' => $user['user_id'], ':pid' => $parentId]);
                } else {
                    $ins = $this->db->prepare("INSERT INTO parents (user_id, full_name, email, status) VALUES (:uid, :name, :email, 'active')");
                    $ins->execute([
                        ':uid' => $user['user_id'],
                        ':name' => $user['full_name'] ?? 'Parent',
                        ':email' => $user['email']
                    ]);
                    $parentId = (int)$this->db->lastInsertId();
                }
            }

            if (!$parentId) {
                return null;
            }

            if ($learnerId === null) {
                // Default to first active child if available, or any child of this parent
                $stmt = $this->db->prepare("
                    SELECT l.*, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level 
                    FROM learners l 
                    LEFT JOIN classes c ON c.class_id = l.class_id 
                    WHERE l.parent_id = :pid 
                    ORDER BY (l.status = 'active') DESC, c.level ASC, l.full_name ASC 
                    LIMIT 1
                ");
                $stmt->execute([':pid' => $parentId]);
                return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
            }

            // Verify requested child belongs to this parent
            $stmt = $this->db->prepare("
                SELECT l.*, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level 
                FROM learners l 
                LEFT JOIN classes c ON c.class_id = l.class_id 
                WHERE l.learner_id = :lid 
                LIMIT 1
            ");
            $stmt->execute([':lid' => $learnerId]);
            $learner = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$learner || (int)$learner['parent_id'] !== (int)$parentId) {
                return null; // Restricted: cross-parent isolation
            }

            return $learner;
        }

        if ($learnerId === null) {
            // Staff / admin previewing first available learner
            $stmt = $this->db->prepare("
                SELECT l.*, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level 
                FROM learners l 
                LEFT JOIN classes c ON c.class_id = l.class_id 
                ORDER BY (l.status = 'active') DESC, l.learner_id ASC 
                LIMIT 1
            ");
            $stmt->execute();
            return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        $stmt = $this->db->prepare("
            SELECT l.*, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level 
            FROM learners l 
            LEFT JOIN classes c ON c.class_id = l.class_id 
            WHERE l.learner_id = :lid 
            LIMIT 1
        ");
        $stmt->execute([':lid' => $learnerId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /**
     * GET /api/progress/learner OR GET /api/progress/learner/{id}
     * Comprehensive learner progress metrics, subjects, next lesson, and timeline.
     */
    public function getLearnerDashboard(?int $id = null): void
    {
        try {
            $user = AuthMiddleware::handle();
            $learner = $this->resolveLearner($user, $id);

            if (!$learner) {
                $role = $user['role_code'] ?? '';
                if ($role === 'parent') {
                    Response::error('No learner profile found linked to your parent account. Please add your learner in Family Learners first.', 404);
                } elseif ($role === 'learner') {
                    Response::error('Your student profile was not found. Please contact administration.', 404);
                } else {
                    Response::error('Learner profile not found or access unauthorized.', 404);
                }
                return;
            }

            $learnerId = (int)$learner['learner_id'];

            // 1. Subject-level progress records from SQL View
            $spStmt = $this->db->prepare("
                SELECT * FROM vw_learner_subject_progress 
                WHERE learner_id = :lid 
                ORDER BY subject_name ASC
            ");
            $spStmt->execute([':lid' => $learnerId]);
            $subjectsProgress = $spStmt->fetchAll(PDO::FETCH_ASSOC);

            // 2. Assessment weighted performance from SQL View
            $apStmt = $this->db->prepare("
                SELECT * FROM vw_learner_assessment_summary 
                WHERE learner_id = :lid
            ");
            $apStmt->execute([':lid' => $learnerId]);
            $assessmentsMap = [];
            foreach ($apStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $assessmentsMap[(int)$row['subject_id']] = $row;
            }

            // Combine Subject Progress + Quiz performance
            $totalExpected = 0;
            $totalCompleted = 0;
            $totalInProg = 0;
            $totalTimeSpentMinutes = 0;
            $allScoresEarned = 0.0;
            $allScoresMax = 0.0;

            foreach ($subjectsProgress as &$sp) {
                $sp['subject_id'] = (int)$sp['subject_id'];
                $sp['expected_lessons'] = (int)$sp['expected_lessons'];
                $sp['completed_lessons'] = (int)$sp['completed_lessons'];
                $sp['in_progress_lessons'] = (int)$sp['in_progress_lessons'];
                $sp['completion_percentage'] = (float)$sp['completion_percentage'];
                $sp['total_time_spent_minutes'] = (int)$sp['total_time_spent_minutes'];

                $totalExpected += $sp['expected_lessons'];
                $totalCompleted += $sp['completed_lessons'];
                $totalInProg += $sp['in_progress_lessons'];
                $totalTimeSpentMinutes += $sp['total_time_spent_minutes'];

                $quiz = $assessmentsMap[$sp['subject_id']] ?? null;
                if ($quiz) {
                    $sp['quiz_stats'] = [
                        'assessment_count' => (int)$quiz['assessment_count'],
                        'total_score' => (float)$quiz['total_score'],
                        'total_possible_marks' => (float)$quiz['total_possible_marks'],
                        'weighted_percentage' => (float)$quiz['weighted_percentage'],
                        'passed_count' => (int)$quiz['passed_count']
                    ];
                    $allScoresEarned += (float)$quiz['total_score'];
                    $allScoresMax += (float)$quiz['total_possible_marks'];
                } else {
                    $sp['quiz_stats'] = [
                        'assessment_count' => 0,
                        'total_score' => 0.0,
                        'total_possible_marks' => 0.0,
                        'weighted_percentage' => null,
                        'passed_count' => 0
                    ];
                }
            }

            $overallCompletion = $totalExpected > 0 ? round(($totalCompleted / $totalExpected) * 100, 1) : 0.0;
            $overallWeightedQuiz = $allScoresMax > 0 ? round(($allScoresEarned / $allScoresMax) * 100, 1) : null;

            // 3. Explainable Next / In-Progress Lesson to continue
            $nextLessonStmt = $this->db->prepare("
                SELECT le.lesson_id, le.lesson_title, le.sequence_number, le.duration_minutes,
                       s.subject_id, s.subject_name, s.subject_code,
                       COALESCE(pr.completion_status, 'not_started') as status,
                       pr.time_spent_minutes
                FROM lessons le
                JOIN subjects s ON le.subject_id = s.subject_id
                JOIN learner_subjects ls ON ls.subject_id = s.subject_id AND ls.learner_id = :lid AND ls.status = 'active'
                LEFT JOIN progress_records pr ON pr.lesson_id = le.lesson_id AND pr.learner_id = :lid2
                WHERE le.class_id = :cid AND le.status = 'active'
                ORDER BY 
                    CASE WHEN pr.completion_status = 'in_progress' THEN 1 
                         WHEN pr.completion_status IS NULL OR pr.completion_status = 'not_started' THEN 2 
                         ELSE 3 END ASC,
                    s.subject_name ASC,
                    le.sequence_number ASC
                LIMIT 1
            ");
            $nextLessonStmt->execute([
                ':lid' => $learnerId,
                ':lid2' => $learnerId,
                ':cid' => (int)$learner['class_id']
            ]);
            $continueLesson = $nextLessonStmt->fetch(PDO::FETCH_ASSOC);

            // 4. Pending / Upcoming Assessments
            $pendStmt = $this->db->prepare("
                SELECT a.assessment_id, a.title, a.assessment_type, a.total_marks, a.passing_marks,
                       s.subject_name, s.subject_code, le.lesson_title
                FROM assessments a
                JOIN subjects s ON a.subject_id = s.subject_id
                JOIN learner_subjects ls ON ls.subject_id = s.subject_id AND ls.learner_id = :lid AND ls.status = 'active'
                LEFT JOIN lessons le ON a.lesson_id = le.lesson_id
                LEFT JOIN assessment_results ar ON ar.assessment_id = a.assessment_id AND ar.learner_id = :lid2
                WHERE a.class_id = :cid AND a.status = 'published' AND ar.result_id IS NULL
                ORDER BY a.date_created DESC
                LIMIT 5
            ");
            $pendStmt->execute([
                ':lid' => $learnerId,
                ':lid2' => $learnerId,
                ':cid' => (int)$learner['class_id']
            ]);
            $pendingAssessments = $pendStmt->fetchAll(PDO::FETCH_ASSOC);

            // 5. Recent Activity Timeline (Materials, Lessons, Quizzes)
            $timeline = [];

            // A. Recent lesson completions
            $lActStmt = $this->db->prepare("
                SELECT pr.lesson_id, pr.completion_status, pr.updated_at, pr.time_spent_minutes,
                       le.lesson_title, s.subject_name
                FROM progress_records pr
                JOIN lessons le ON pr.lesson_id = le.lesson_id
                JOIN subjects s ON le.subject_id = s.subject_id
                WHERE pr.learner_id = :lid AND pr.completion_status IN ('in_progress', 'completed')
                ORDER BY pr.updated_at DESC LIMIT 5
            ");
            $lActStmt->execute([':lid' => $learnerId]);
            foreach ($lActStmt->fetchAll(PDO::FETCH_ASSOC) as $act) {
                $timeline[] = [
                    'type' => 'lesson',
                    'icon' => $act['completion_status'] === 'completed' ? '✅' : '▶️',
                    'title' => $act['lesson_title'],
                    'subject' => $act['subject_name'],
                    'status' => $act['completion_status'],
                    'details' => ($act['time_spent_minutes'] > 0 ? $act['time_spent_minutes'] . ' mins logged' : 'In progress'),
                    'timestamp' => $act['updated_at']
                ];
            }

            // B. Recent quiz submissions
            $qActStmt = $this->db->prepare("
                SELECT ar.score, ar.total_marks, ar.percentage, ar.date_taken,
                       a.title as assessment_title, s.subject_name
                FROM assessment_results ar
                JOIN assessments a ON ar.assessment_id = a.assessment_id
                JOIN subjects s ON a.subject_id = s.subject_id
                WHERE ar.learner_id = :lid
                ORDER BY ar.date_taken DESC LIMIT 5
            ");
            $qActStmt->execute([':lid' => $learnerId]);
            foreach ($qActStmt->fetchAll(PDO::FETCH_ASSOC) as $act) {
                $pct = (float)$act['percentage'];
                $timeline[] = [
                    'type' => 'assessment',
                    'icon' => $pct >= 50 ? '🏆' : '📝',
                    'title' => $act['assessment_title'],
                    'subject' => $act['subject_name'],
                    'status' => 'scored',
                    'details' => "Score: {$act['score']}/{$act['total_marks']} ({$pct}%)",
                    'timestamp' => $act['date_taken']
                ];
            }

            // Sort timeline descending
            usort($timeline, fn($a, $b) => strcmp($b['timestamp'], $a['timestamp']));
            $timeline = array_slice($timeline, 0, 8);

            Response::success([
                'learner' => [
                    'learner_id' => $learnerId,
                    'full_name' => $learner['full_name'],
                    'class_name' => $learner['class_name'],
                    'class_code' => $learner['class_code'],
                    'class_level' => (int)$learner['class_level'],
                    'avatar_url' => $learner['avatar_url']
                ],
                'summary' => [
                    'expected_lessons' => $totalExpected,
                    'completed_lessons' => $totalCompleted,
                    'in_progress_lessons' => $totalInProg,
                    'completion_percentage' => $overallCompletion,
                    'weighted_quiz_percentage' => $overallWeightedQuiz,
                    'total_time_spent_minutes' => $totalTimeSpentMinutes,
                    'total_hours_spent' => round($totalTimeSpentMinutes / 60, 1)
                ],
                'subjects' => $subjectsProgress,
                'continue_lesson' => $continueLesson ?: null,
                'pending_assessments' => $pendingAssessments,
                'recent_activities' => $timeline
            ], 'Learner progress dashboard data retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load learner progress: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/progress/learner/{id}/report OR GET /api/progress/learner/report
     * Comprehensive official progress report export payload for printable PDF.
     */
    public function getLearnerProgressReport(?int $id = null): void
    {
        try {
            $user = AuthMiddleware::handle();
            $learner = $this->resolveLearner($user, $id);

            if (!$learner) {
                Response::error('Learner profile not found or access unauthorized.', 404);
                return;
            }

            $learnerId = (int)$learner['learner_id'];
            $db = $this->db;

            // 1. Parent Info
            $pStmt = $db->prepare("SELECT parent_id, full_name, email, phone, district FROM parents WHERE parent_id = :pid LIMIT 1");
            $pStmt->execute([':pid' => (int)($learner['parent_id'] ?? 0)]);
            $parent = $pStmt->fetch(PDO::FETCH_ASSOC) ?: [
                'full_name' => 'Homeschooling Guardian',
                'email' => 'N/A',
                'phone' => 'N/A',
                'district' => 'Uganda'
            ];

            // 2. Subject Progress from SQL View
            $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid ORDER BY subject_name ASC");
            $spStmt->execute([':lid' => $learnerId]);
            $subjectsProgress = $spStmt->fetchAll(PDO::FETCH_ASSOC);

            // 3. Quiz Summaries
            $apStmt = $db->prepare("SELECT * FROM vw_learner_assessment_summary WHERE learner_id = :lid");
            $apStmt->execute([':lid' => $learnerId]);
            $assessmentsMap = [];
            foreach ($apStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $assessmentsMap[(int)$row['subject_id']] = $row;
            }

            $totalExpected = 0;
            $totalCompleted = 0;
            $totalInProg = 0;
            $totalTimeSpentMinutes = 0;
            $allScoresEarned = 0.0;
            $allScoresMax = 0.0;
            $totalQuizzesTaken = 0;
            $totalPassedQuizzes = 0;

            foreach ($subjectsProgress as &$sp) {
                $sp['subject_id'] = (int)$sp['subject_id'];
                $sp['expected_lessons'] = (int)$sp['expected_lessons'];
                $sp['completed_lessons'] = (int)$sp['completed_lessons'];
                $sp['in_progress_lessons'] = (int)$sp['in_progress_lessons'];
                $sp['completion_percentage'] = (float)$sp['completion_percentage'];
                $sp['total_time_spent_minutes'] = (int)$sp['total_time_spent_minutes'];

                $totalExpected += $sp['expected_lessons'];
                $totalCompleted += $sp['completed_lessons'];
                $totalInProg += $sp['in_progress_lessons'];
                $totalTimeSpentMinutes += $sp['total_time_spent_minutes'];

                $quiz = $assessmentsMap[$sp['subject_id']] ?? null;
                if ($quiz) {
                    $sp['quiz_stats'] = [
                        'assessment_count' => (int)$quiz['assessment_count'],
                        'total_score' => (float)$quiz['total_score'],
                        'total_possible_marks' => (float)$quiz['total_possible_marks'],
                        'weighted_percentage' => (float)$quiz['weighted_percentage'],
                        'passed_count' => (int)$quiz['passed_count']
                    ];
                    $allScoresEarned += (float)$quiz['total_score'];
                    $allScoresMax += (float)$quiz['total_possible_marks'];
                    $totalQuizzesTaken += (int)$quiz['assessment_count'];
                    $totalPassedQuizzes += (int)$quiz['passed_count'];
                } else {
                    $sp['quiz_stats'] = [
                        'assessment_count' => 0,
                        'total_score' => 0.0,
                        'total_possible_marks' => 0.0,
                        'weighted_percentage' => null,
                        'passed_count' => 0
                    ];
                }
            }

            $overallCompletion = $totalExpected > 0 ? round(($totalCompleted / $totalExpected) * 100, 1) : 0.0;
            $overallWeightedQuiz = $allScoresMax > 0 ? round(($allScoresEarned / $allScoresMax) * 100, 1) : null;

            // 4. Completed Lesson Milestones (Recent 20)
            $compStmt = $db->prepare("
                SELECT pr.lesson_id, pr.completion_status, pr.time_spent_minutes, pr.date_completed, pr.updated_at,
                       le.lesson_title, le.sequence_number, s.subject_name, s.subject_code
                FROM progress_records pr
                JOIN lessons le ON pr.lesson_id = le.lesson_id
                JOIN subjects s ON le.subject_id = s.subject_id
                WHERE pr.learner_id = :lid AND pr.completion_status = 'completed'
                ORDER BY COALESCE(pr.date_completed, pr.updated_at) DESC
                LIMIT 20
            ");
            $compStmt->execute([':lid' => $learnerId]);
            $completedMilestones = $compStmt->fetchAll(PDO::FETCH_ASSOC);

            // 5. Recent Assessment / Quiz Results (Recent 20)
            $resStmt = $db->prepare("
                SELECT ar.result_id, ar.score, ar.total_marks as max_marks, ar.percentage, 
                       (ar.score >= COALESCE(a.passing_marks, 50)) as passed,
                       ar.date_taken as submitted_at,
                       a.title as assessment_title, a.assessment_type, s.subject_name, s.subject_code
                FROM assessment_results ar
                JOIN assessments a ON ar.assessment_id = a.assessment_id
                JOIN subjects s ON a.subject_id = s.subject_id
                WHERE ar.learner_id = :lid
                ORDER BY ar.date_taken DESC
                LIMIT 20
            ");
            $resStmt->execute([':lid' => $learnerId]);
            $assessmentResults = $resStmt->fetchAll(PDO::FETCH_ASSOC);

            // 6. Next Upcoming Syllabus Milestones
            $nextStmt = $db->prepare("
                SELECT le.lesson_id, le.lesson_title, le.sequence_number, le.duration_minutes,
                       s.subject_name, s.subject_code
                FROM lessons le
                JOIN subjects s ON le.subject_id = s.subject_id
                JOIN learner_subjects ls ON ls.subject_id = s.subject_id AND ls.learner_id = :lid AND ls.status = 'active'
                LEFT JOIN progress_records pr ON pr.lesson_id = le.lesson_id AND pr.learner_id = :lid2
                WHERE le.class_id = :cid AND le.status = 'active' 
                  AND (pr.completion_status IS NULL OR pr.completion_status != 'completed')
                ORDER BY CASE WHEN pr.completion_status = 'in_progress' THEN 1 ELSE 2 END, le.sequence_number ASC
                LIMIT 6
            ");
            $nextStmt->execute([
                ':lid' => $learnerId,
                ':lid2' => $learnerId,
                ':cid' => (int)$learner['class_id']
            ]);
            $nextMilestones = $nextStmt->fetchAll(PDO::FETCH_ASSOC);

            // Competency Remark
            $remark = 'Satisfactory Progress';
            if ($overallCompletion >= 75.0 && ($overallWeightedQuiz === null || $overallWeightedQuiz >= 75.0)) {
                $remark = 'Exemplary Syllabus Mastery & High Assessment Performance';
            } elseif ($overallCompletion >= 50.0) {
                $remark = 'Steady Syllabus Attainment; Active Lesson Completion';
            } elseif ($overallWeightedQuiz !== null && $overallWeightedQuiz < 50.0) {
                $remark = 'Needs Revision on Foundational Concepts & Quizzes';
            }

            Response::success([
                'meta' => [
                    'institution_name' => 'Technology-Based Homeschooling Information System (TMHIS)',
                    'ministry_affiliation' => 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard',
                    'academic_year' => date('Y'),
                    'report_title' => 'Official Learner Syllabus Progress & Competency Report',
                    'generated_at' => date('Y-m-d H:i:s'),
                    'generated_by' => $user['full_name'] ?? 'System Facilitator'
                ],
                'learner' => [
                    'learner_id' => $learnerId,
                    'full_name' => $learner['full_name'],
                    'date_of_birth' => $learner['date_of_birth'] ?? 'N/A',
                    'gender' => ucfirst((string)($learner['gender'] ?? 'N/A')),
                    'class_name' => $learner['class_name'] ?? 'Primary Class',
                    'class_code' => $learner['class_code'] ?? 'P1',
                    'class_level' => (int)($learner['class_level'] ?? 1),
                    'enrolment_date' => $learner['enrolment_date'] ?? date('Y-m-d'),
                    'avatar_url' => $learner['avatar_url']
                ],
                'parent' => $parent,
                'summary' => [
                    'expected_lessons' => $totalExpected,
                    'completed_lessons' => $totalCompleted,
                    'in_progress_lessons' => $totalInProg,
                    'completion_percentage' => $overallCompletion,
                    'weighted_quiz_percentage' => $overallWeightedQuiz,
                    'total_time_spent_minutes' => $totalTimeSpentMinutes,
                    'total_hours_spent' => round($totalTimeSpentMinutes / 60, 1),
                    'total_quizzes_taken' => $totalQuizzesTaken,
                    'total_passed_quizzes' => $totalPassedQuizzes,
                    'competency_remark' => $remark
                ],
                'subjects' => $subjectsProgress,
                'completed_milestones' => $completedMilestones,
                'quiz_results' => $assessmentResults,
                'next_milestones' => $nextMilestones
            ], 'Learner full progress report generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate progress report: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/progress/parent
     * Multi-child family progress overview for homeschooling parents.
     */
    public function getParentDashboard(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $db = $this->db;

            $pStmt = $db->prepare("SELECT parent_id, full_name, district FROM parents WHERE user_id = :uid LIMIT 1");
            $pStmt->execute([':uid' => $user['user_id']]);
            $parent = $pStmt->fetch(PDO::FETCH_ASSOC);

            $parentId = $parent['parent_id'] ?? null;

            if (!$parentId && !empty($user['email'])) {
                $pStmt = $db->prepare("SELECT parent_id, full_name, district FROM parents WHERE email = :email LIMIT 1");
                $pStmt->execute([':email' => $user['email']]);
                $parent = $pStmt->fetch(PDO::FETCH_ASSOC);
                $parentId = $parent['parent_id'] ?? null;
                if ($parentId) {
                    $db->prepare("UPDATE parents SET user_id = :uid WHERE parent_id = :pid")->execute([':uid' => $user['user_id'], ':pid' => $parentId]);
                }
            }

            // Fetch children
            if ($parentId) {
                $lStmt = $db->prepare("
                    SELECT l.learner_id, l.full_name, l.gender, l.date_of_birth as dob, l.avatar_url, u.username as learner_username,
                           l.class_id, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level
                    FROM learners l
                    LEFT JOIN classes c ON l.class_id = c.class_id
                    LEFT JOIN users u ON l.user_id = u.user_id
                    WHERE l.parent_id = :pid
                    ORDER BY (l.status = 'active') DESC, c.level ASC, l.full_name ASC
                ");
                $lStmt->execute([':pid' => $parentId]);
                $children = $lStmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $children = [];
            }

            $childrenCards = [];
            $totalFamilyLessonsCompleted = 0;
            $totalFamilyTimeSpent = 0;
            $allChildrenScoresEarned = 0.0;
            $allChildrenScoresMax = 0.0;

            foreach ($children as $c) {
                $cid = (int)$c['learner_id'];

                // Subjects progress
                $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid");
                $spStmt->execute([':lid' => $cid]);
                $subs = $spStmt->fetchAll(PDO::FETCH_ASSOC);

                $exp = 0;
                $comp = 0;
                $time = 0;
                foreach ($subs as $s) {
                    $exp += (int)$s['expected_lessons'];
                    $comp += (int)$s['completed_lessons'];
                    $time += (int)$s['total_time_spent_minutes'];
                }

                $totalFamilyLessonsCompleted += $comp;
                $totalFamilyTimeSpent += $time;

                // Quizzes
                $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                $apStmt->execute([':lid' => $cid]);
                $qSummary = $apStmt->fetch(PDO::FETCH_ASSOC);
                $earned = (float)($qSummary['earned'] ?? 0);
                $maxMarks = (float)($qSummary['max_marks'] ?? 0);

                $allChildrenScoresEarned += $earned;
                $allChildrenScoresMax += $maxMarks;

                $pct = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                $quizPct = $maxMarks > 0 ? round(($earned / $maxMarks) * 100, 1) : null;

                // Check if needs attention (<50% avg on at least 2 quizzes or stalled)
                $needsAttention = false;
                $attentionReason = null;
                if ($quizPct !== null && $quizPct < 50.0) {
                    $needsAttention = true;
                    $attentionReason = 'Quiz average is below 50% (' . $quizPct . '%). Needs revision.';
                } elseif ($comp === 0 && $exp > 0) {
                    $needsAttention = true;
                    $attentionReason = 'Has not yet completed syllabus lessons.';
                }

                // Next suggested lesson
                $nextStmt = $db->prepare("
                    SELECT le.lesson_id, le.lesson_title, s.subject_name, s.subject_code
                    FROM lessons le
                    JOIN subjects s ON le.subject_id = s.subject_id
                    JOIN learner_subjects ls ON ls.subject_id = s.subject_id AND ls.learner_id = :lid AND ls.status = 'active'
                    LEFT JOIN progress_records pr ON pr.lesson_id = le.lesson_id AND pr.learner_id = :lid2
                    WHERE le.class_id = :class_id AND le.status = 'active' 
                      AND (pr.completion_status IS NULL OR pr.completion_status != 'completed')
                    ORDER BY CASE WHEN pr.completion_status = 'in_progress' THEN 1 ELSE 2 END, le.sequence_number ASC
                    LIMIT 1
                ");
                $nextStmt->execute([
                    ':lid' => $cid,
                    ':lid2' => $cid,
                    ':class_id' => (int)$c['class_id']
                ]);
                $nextLesson = $nextStmt->fetch(PDO::FETCH_ASSOC);

                $childrenCards[] = [
                    'learner_id' => $cid,
                    'full_name' => $c['full_name'],
                    'class_name' => $c['class_name'],
                    'class_code' => $c['class_code'],
                    'avatar_url' => $c['avatar_url'],
                    'learner_username' => $c['learner_username'],
                    'expected_lessons' => $exp,
                    'completed_lessons' => $comp,
                    'completion_percentage' => $pct,
                    'weighted_quiz_percentage' => $quizPct,
                    'time_spent_minutes' => $time,
                    'time_spent_hours' => round($time / 60, 1),
                    'needs_attention' => $needsAttention,
                    'attention_reason' => $attentionReason,
                    'next_lesson' => $nextLesson ?: null,
                    'subjects_count' => count($subs)
                ];
            }

            $familyWeightedQuiz = $allChildrenScoresMax > 0 ? round(($allChildrenScoresEarned / $allChildrenScoresMax) * 100, 1) : null;

            Response::success([
                'parent' => [
                    'parent_id' => $parentId,
                    'full_name' => $parent['full_name'] ?? $user['full_name'] ?? 'Parent',
                    'district' => $parent['district'] ?? ''
                ],
                'family_summary' => [
                    'total_children' => count($childrenCards),
                    'total_lessons_completed' => $totalFamilyLessonsCompleted,
                    'total_time_spent_minutes' => $totalFamilyTimeSpent,
                    'total_hours_spent' => round($totalFamilyTimeSpent / 60, 1),
                    'overall_family_quiz_average' => $familyWeightedQuiz
                ],
                'children' => $childrenCards
            ], 'Parent family progress data retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load parent dashboard: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/progress/teacher
     * Progress summary for classroom teachers (assigned learners, gradebook, struggling lessons).
     */
    public function getTeacherDashboard(): void
    {
        try {
            $user = RoleMiddleware::allow(['administrator', 'curriculum officer', 'teacher']);
            $db = $this->db;

            // Fetch learners across primary classes (or teacher's class if filtered)
            $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;

            $whereClass = $classId !== null ? "AND l.class_id = {$classId}" : "";

            $rosterStmt = $db->query("
                SELECT l.learner_id, l.full_name, l.avatar_url, p.full_name as parent_name,
                       c.class_id, c.class_code, c.class_name
                FROM learners l
                JOIN classes c ON l.class_id = c.class_id
                JOIN parents p ON l.parent_id = p.parent_id
                WHERE l.status = 'active'
                {$whereClass}
                ORDER BY c.level ASC, l.full_name ASC
            ");
            $learners = $rosterStmt->fetchAll(PDO::FETCH_ASSOC);

            $roster = [];
            $atRiskCount = 0;
            $sumCompletion = 0.0;
            $sumScores = 0.0;
            $scoredCount = 0;

            foreach ($learners as $lr) {
                $lid = (int)$lr['learner_id'];

                $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid");
                $spStmt->execute([':lid' => $lid]);
                $subs = $spStmt->fetchAll(PDO::FETCH_ASSOC);

                $exp = 0;
                $comp = 0;
                $lastActive = null;
                foreach ($subs as $s) {
                    $exp += (int)$s['expected_lessons'];
                    $comp += (int)$s['completed_lessons'];
                    if ($s['last_progress_at'] && (!$lastActive || $s['last_progress_at'] > $lastActive)) {
                        $lastActive = $s['last_progress_at'];
                    }
                }

                $cRate = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                $sumCompletion += $cRate;

                // Quiz summary
                $qStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_m FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                $qStmt->execute([':lid' => $lid]);
                $qRes = $qStmt->fetch(PDO::FETCH_ASSOC);
                $earned = (float)($qRes['earned'] ?? 0);
                $maxM = (float)($qRes['max_m'] ?? 0);
                $quizAvg = $maxM > 0 ? round(($earned / $maxM) * 100, 1) : null;

                if ($quizAvg !== null) {
                    $sumScores += $quizAvg;
                    $scoredCount++;
                }

                $risk = 'good';
                if ($quizAvg !== null && $quizAvg < 50.0) {
                    $risk = 'critical';
                    $atRiskCount++;
                } elseif ($cRate < 20.0 && $exp > 0) {
                    $risk = 'warning';
                }

                $roster[] = [
                    'learner_id' => $lid,
                    'full_name' => $lr['full_name'],
                    'parent_name' => $lr['parent_name'],
                    'class_code' => $lr['class_code'],
                    'class_name' => $lr['class_name'],
                    'avatar_url' => $lr['avatar_url'],
                    'completed_lessons' => $comp,
                    'expected_lessons' => $exp,
                    'completion_percentage' => $cRate,
                    'weighted_quiz_percentage' => $quizAvg,
                    'last_active' => $lastActive,
                    'risk_level' => $risk
                ];
            }

            // Struggling topics (Assessments with pass rate < 60%)
            $diffStmt = $db->query("
                SELECT a.assessment_id, a.title, s.subject_name, c.class_code,
                       COUNT(ar.result_id) as total_attempts,
                       ROUND(AVG(ar.percentage), 1) as average_percentage,
                       ROUND((COUNT(CASE WHEN ar.percentage >= 50 THEN 1 END) / COUNT(ar.result_id)) * 100, 1) as pass_rate
                FROM assessments a
                JOIN subjects s ON a.subject_id = s.subject_id
                JOIN classes c ON a.class_id = c.class_id
                JOIN assessment_results ar ON ar.assessment_id = a.assessment_id
                GROUP BY a.assessment_id, a.title, s.subject_name, c.class_code
                HAVING total_attempts >= 1 AND average_percentage < 60
                ORDER BY average_percentage ASC
                LIMIT 5
            ");
            $strugglingTopics = $diffStmt->fetchAll(PDO::FETCH_ASSOC);

            Response::success([
                'summary' => [
                    'total_learners' => count($roster),
                    'at_risk_count' => $atRiskCount,
                    'average_completion_rate' => count($roster) > 0 ? round($sumCompletion / count($roster), 1) : 0.0,
                    'average_quiz_score' => $scoredCount > 0 ? round($sumScores / $scoredCount, 1) : null
                ],
                'roster' => $roster,
                'struggling_topics' => $strugglingTopics
            ], 'Teacher progress summary retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load teacher dashboard: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/progress/officer
     * NCDC macro syllabus coverage and primary curriculum attainment analytics.
     */
    public function getOfficerAnalytics(): void
    {
        try {
            RoleMiddleware::allow(['administrator', 'curriculum officer']);
            $db = $this->db;

            // 1. Coverage by Class level P1–P7
            $classCovStmt = $db->query("
                SELECT c.class_id, c.class_code, c.class_name, c.level,
                       COUNT(DISTINCT l.learner_id) as active_learners,
                       COUNT(DISTINCT le.lesson_id) as total_syllabus_lessons,
                       COUNT(DISTINCT pr.progress_id) as progress_events,
                       COUNT(DISTINCT CASE WHEN pr.completion_status = 'completed' THEN pr.progress_id END) as completed_milestones
                FROM classes c
                LEFT JOIN learners l ON l.class_id = c.class_id AND l.status = 'active'
                LEFT JOIN lessons le ON le.class_id = c.class_id AND le.status = 'active'
                LEFT JOIN progress_records pr ON pr.lesson_id = le.lesson_id AND pr.completion_status = 'completed'
                GROUP BY c.class_id, c.class_code, c.class_name, c.level
                ORDER BY c.level ASC
            ");
            $classesCoverage = $classCovStmt->fetchAll(PDO::FETCH_ASSOC);

            // 2. Performance by Subject track
            $subPerfStmt = $db->query("
                SELECT s.subject_id, s.subject_name, s.subject_code,
                       COUNT(DISTINCT le.lesson_id) as lessons_count,
                       COUNT(DISTINCT a.assessment_id) as assessments_count,
                       ROUND(AVG(ar.percentage), 1) as overall_subject_quiz_avg,
                       COUNT(DISTINCT ar.result_id) as total_quiz_submissions
                FROM subjects s
                LEFT JOIN lessons le ON le.subject_id = s.subject_id AND le.status = 'active'
                LEFT JOIN assessments a ON a.subject_id = s.subject_id AND a.status = 'published'
                LEFT JOIN assessment_results ar ON ar.assessment_id = a.assessment_id
                WHERE s.is_active = 1
                GROUP BY s.subject_id, s.subject_name, s.subject_code
                ORDER BY s.subject_name ASC
            ");
            $subjectPerformance = $subPerfStmt->fetchAll(PDO::FETCH_ASSOC);

            // 3. System Engagement Totals
            $totalsStmt = $db->query("
                SELECT 
                    (SELECT COUNT(*) FROM learners WHERE status = 'active') as active_learners,
                    (SELECT COUNT(*) FROM parents) as registered_parents,
                    (SELECT COUNT(*) FROM lessons WHERE status = 'active') as active_lessons,
                    (SELECT COUNT(*) FROM progress_records WHERE completion_status = 'completed') as total_completed_lessons,
                    (SELECT COUNT(*) FROM assessment_results) as total_quizzes_taken,
                    (SELECT COALESCE(SUM(time_spent_minutes), 0) FROM progress_records) as total_time_spent_minutes
            ")->fetch(PDO::FETCH_ASSOC);

            Response::success([
                'totals' => [
                    'active_learners' => (int)$totalsStmt['active_learners'],
                    'registered_parents' => (int)$totalsStmt['registered_parents'],
                    'active_lessons' => (int)$totalsStmt['active_lessons'],
                    'total_completed_lessons' => (int)$totalsStmt['total_completed_lessons'],
                    'total_quizzes_taken' => (int)$totalsStmt['total_quizzes_taken'],
                    'total_hours_spent' => round(((int)$totalsStmt['total_time_spent_minutes']) / 60, 1)
                ],
                'classes_coverage' => $classesCoverage,
                'subject_performance' => $subjectPerformance
            ], 'Curriculum Officer analytics retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load officer analytics: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/progress/lesson OR PATCH /api/progress/lesson
     * Atomically record/update lesson completion progress.
     */
    public function updateLessonProgress(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $input = $this->getJsonInput();

            $validator = new Validator($input);
            $validator->required(['lesson_id', 'completion_status']);

            if (!$validator->isValid()) {
                Response::error('Validation failed: ' . implode(', ', $validator->getErrors()), 422, $validator->getErrors());
                return;
            }

            $lessonId = (int)$input['lesson_id'];
            $status = trim((string)$input['completion_status']);
            if (!in_array($status, ['not_started', 'in_progress', 'completed'], true)) {
                Response::error("Invalid status. Allowed: 'not_started', 'in_progress', 'completed'", 422);
                return;
            }

            $learnerId = isset($input['learner_id']) ? (int)$input['learner_id'] : null;
            $learner = $this->resolveLearner($user, $learnerId);

            if (!$learner) {
                Response::error('Unauthorized: Learner record not found or accessible.', 403);
                return;
            }

            $targetLearnerId = (int)$learner['learner_id'];
            $timeSpentMinutes = isset($input['time_spent_minutes']) ? max(0, (int)$input['time_spent_minutes']) : 0;
            $score = isset($input['score']) ? (float)$input['score'] : null;

            // Upsert into progress_records
            $stmt = $this->db->prepare("
                INSERT INTO progress_records (
                    learner_id, lesson_id, completion_status, score, time_spent_minutes,
                    date_started, date_completed, date_recorded
                ) VALUES (
                    :lid, :les_id, :status, :score, :time_spent,
                    CASE WHEN :status_start IN ('in_progress', 'completed') THEN NOW() ELSE NULL END,
                    CASE WHEN :status_comp = 'completed' THEN NOW() ELSE NULL END,
                    NOW()
                )
                ON DUPLICATE KEY UPDATE
                    completion_status = VALUES(completion_status),
                    score = COALESCE(VALUES(score), score),
                    time_spent_minutes = time_spent_minutes + VALUES(time_spent_minutes),
                    date_started = COALESCE(date_started, VALUES(date_started)),
                    date_completed = CASE WHEN VALUES(completion_status) = 'completed' THEN NOW() ELSE date_completed END,
                    updated_at = NOW()
            ");

            $stmt->execute([
                ':lid' => $targetLearnerId,
                ':les_id' => $lessonId,
                ':status' => $status,
                ':score' => $score,
                ':time_spent' => $timeSpentMinutes,
                ':status_start' => $status,
                ':status_comp' => $status
            ]);

            AuditService::log((int)$user['user_id'], 'UPDATE_LESSON_PROGRESS', "Updated progress for learner #{$targetLearnerId} on lesson #{$lessonId} to '{$status}'");

            Response::success([
                'learner_id' => $targetLearnerId,
                'lesson_id' => $lessonId,
                'completion_status' => $status,
                'updated_at' => date('c')
            ], 'Lesson progress updated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to update progress: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/progress/activity
     * Ingest learning material activity / heartbeat (supports offline sync UUIDs).
     */
    public function recordActivity(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $input = $this->getJsonInput();

            $validator = new Validator($input);
            $validator->required(['material_id', 'activity_status']);

            if (!$validator->isValid()) {
                Response::error('Validation failed: ' . implode(', ', $validator->getErrors()), 422);
                return;
            }

            $materialId = (int)$input['material_id'];
            $status = trim((string)$input['activity_status']);
            if (!in_array($status, ['cached', 'opened', 'completed', 'synced'], true)) {
                Response::error("Invalid activity status.", 422);
                return;
            }

            $learnerId = isset($input['learner_id']) ? (int)$input['learner_id'] : null;
            $learner = $this->resolveLearner($user, $learnerId);

            if (!$learner) {
                Response::error('Unauthorized learner access.', 403);
                return;
            }

            $targetLearnerId = (int)$learner['learner_id'];
            $timeSpentSeconds = isset($input['time_spent_seconds']) ? max(0, (int)$input['time_spent_seconds']) : 0;
            $uuid = !empty($input['client_activity_uuid']) ? trim((string)$input['client_activity_uuid']) : bin2hex(random_bytes(16));

            $stmt = $this->db->prepare("
                INSERT INTO learning_activities (
                    learner_id, material_id, activity_status, cached_at, opened_at, completed_at, synced_at,
                    time_spent_seconds, client_activity_uuid, created_at
                ) VALUES (
                    :lid, :mat_id, :st, NOW(),
                    CASE WHEN :st_open IN ('opened', 'completed') THEN NOW() ELSE NULL END,
                    CASE WHEN :st_comp = 'completed' THEN NOW() ELSE NULL END,
                    NOW(), :time_sec, :uuid, NOW()
                )
                ON DUPLICATE KEY UPDATE
                    activity_status = VALUES(activity_status),
                    time_spent_seconds = time_spent_seconds + VALUES(time_spent_seconds),
                    completed_at = CASE WHEN VALUES(activity_status) = 'completed' THEN NOW() ELSE completed_at END,
                    synced_at = NOW()
            ");

            $stmt->execute([
                ':lid' => $targetLearnerId,
                ':mat_id' => $materialId,
                ':st' => $status,
                ':st_open' => $status,
                ':st_comp' => $status,
                ':time_sec' => $timeSpentSeconds,
                ':uuid' => $uuid
            ]);

            Response::success([
                'client_activity_uuid' => $uuid,
                'activity_status' => $status,
                'learner_id' => $targetLearnerId,
                'material_id' => $materialId
            ], 'Learning activity recorded.');
        } catch (Throwable $e) {
            Response::error('Failed to record activity: ' . $e->getMessage(), 500);
        }
    }
}
