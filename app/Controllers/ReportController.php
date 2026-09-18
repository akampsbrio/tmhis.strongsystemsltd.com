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
 * TMHIS Module 09: Reports, Analytics & MoES Curriculum Compliance Controller
 */
class ReportController
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
     * Resolve learner record and enforce access boundaries
     */
    private function resolveLearner(array $user, ?int $learnerId = null): ?array
    {
        $role = $user['role_code'] ?? '';

        if ($role === 'learner') {
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
                }
            }

            if (!$parentId) {
                return null;
            }

            if ($learnerId === null) {
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
                return null; // Cross-parent security isolation
            }

            return $learner;
        }

        if ($learnerId === null) {
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
     * Create an immutable reproducible snapshot of a report
     */
    private function saveSnapshot(string $type, ?int $scopeId, ?string $district, ?int $termId, ?int $year, array $payload, array $summary, int $userId): string
    {
        $uuid = 'snap_' . bin2hex(random_bytes(12));
        try {
            $stmt = $this->db->prepare("
                INSERT INTO report_snapshots (
                    snapshot_uuid, report_type, scope_id, district, term_id, academic_year,
                    payload_json, summary_metrics, generated_by, created_at
                ) VALUES (
                    :uuid, :type, :scope, :district, :term, :year,
                    :payload, :summary, :uid, NOW()
                )
            ");
            $stmt->execute([
                ':uuid' => $uuid,
                ':type' => $type,
                ':scope' => $scopeId,
                ':district' => $district,
                ':term' => $termId,
                ':year' => $year,
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                ':summary' => json_encode($summary, JSON_UNESCAPED_UNICODE),
                ':uid' => $userId
            ]);
        } catch (Throwable) {
            // Non-blocking snapshot fail
        }
        return $uuid;
    }

    /**
     * Compute UNEB Division (Division 1 to Division U) and Aggregates for Primary Education
     */
    public static function calculateUNEBDivision(array $subjects): array
    {
        $totalAggregates = 0;
        $gradedCount = 0;
        $hasF9Demotion = false;

        foreach ($subjects as $s) {
            $agg = $s['exam_aggregate'] ?? $s['aggregate_value'] ?? $s['aggregates'] ?? null;
            $grade = $s['exam_grade'] ?? $s['grade'] ?? '';
            if ($agg !== null && is_numeric($agg)) {
                $aggInt = (int)$agg;
                $totalAggregates += $aggInt;
                $gradedCount++;
                if ($aggInt === 9 || $grade === 'F9') {
                    $hasF9Demotion = true;
                }
            }
        }

        $division = 'N/A (Continuous Assessment Mode)';
        $divisionCode = 'NA';

        if ($gradedCount >= 4) {
            if ($totalAggregates >= 4 && $totalAggregates <= 12 && !$hasF9Demotion) {
                $division = 'Division 1 (First Grade)';
                $divisionCode = 'Division 1';
            } elseif ($totalAggregates >= 13 && $totalAggregates <= 24 && !$hasF9Demotion) {
                $division = 'Division 2 (Second Grade)';
                $divisionCode = 'Division 2';
            } elseif ($totalAggregates <= 28) {
                $division = 'Division 3 (Third Grade)';
                $divisionCode = 'Division 3';
            } elseif ($totalAggregates <= 32) {
                $division = 'Division 4 (Pass)';
                $divisionCode = 'Division 4';
            } else {
                $division = 'Division U (Ungraded / Revision Required)';
                $divisionCode = 'Division U';
            }
        }

        return [
            'total_aggregates' => $totalAggregates,
            'graded_count' => $gradedCount,
            'has_f9_demotion' => $hasF9Demotion,
            'division' => $divisionCode,
            'division_label' => $division
        ];
    }

    /**
     * GET /api/reports/learner/{id} OR GET /api/reports/learner
     * Comprehensive official terminal report card with syllabus progress, quizzes, and UNEB exam results.
     */
    public function getLearnerReport(?int $id = null): void
    {
        try {
            $user = AuthMiddleware::handle();
            $learner = $this->resolveLearner($user, $id);

            if (!$learner) {
                Response::error('Learner profile not found or access unauthorized.', 404);
                return;
            }

            $learnerId = (int)$learner['learner_id'];
            $classId = (int)$learner['class_id'];
            $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
            $academicYear = isset($_GET['year']) && is_numeric($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');

            $db = $this->db;

            // 1. Term Info
            $term = null;
            if ($termId) {
                $tStmt = $db->prepare("SELECT * FROM curriculum_terms WHERE term_id = :tid LIMIT 1");
                $tStmt->execute([':tid' => $termId]);
                $term = $tStmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$term) {
                $tStmt = $db->prepare("SELECT * FROM curriculum_terms ORDER BY (academic_year = :yr AND is_current = 1) DESC, start_date DESC LIMIT 1");
                $tStmt->execute([':yr' => $academicYear]);
                $term = $tStmt->fetch(PDO::FETCH_ASSOC) ?: [
                    'term_id' => 1,
                    'term_name' => 'Term 1',
                    'academic_year' => $academicYear,
                    'start_date' => $academicYear . '-02-01',
                    'end_date' => $academicYear . '-05-01'
                ];
            }

            // 2. Parent Info
            $pStmt = $db->prepare("SELECT parent_id, full_name, email, phone, district FROM parents WHERE parent_id = :pid LIMIT 1");
            $pStmt->execute([':pid' => (int)($learner['parent_id'] ?? 0)]);
            $parent = $pStmt->fetch(PDO::FETCH_ASSOC) ?: [
                'full_name' => 'Homeschooling Guardian',
                'email' => 'N/A',
                'phone' => 'N/A',
                'district' => 'Uganda'
            ];

            // 3. Subject Progress & Quiz Averages
            $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid ORDER BY subject_name ASC");
            $spStmt->execute([':lid' => $learnerId]);
            $subjectsProgress = $spStmt->fetchAll(PDO::FETCH_ASSOC);

            $apStmt = $db->prepare("SELECT * FROM vw_learner_assessment_summary WHERE learner_id = :lid");
            $apStmt->execute([':lid' => $learnerId]);
            $assessmentsMap = [];
            foreach ($apStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $assessmentsMap[(int)$row['subject_id']] = $row;
            }

            // 5. Exam Results for Term
            $exStmt = $db->prepare("
                SELECT em.subject_id, em.raw_score as score, em.percentage, em.grade_label as grade, em.grade_point as aggregate_value, 
                       e.title as exam_title, e.exam_type, e.term_id
                FROM exam_marks em
                JOIN exam_submissions es ON em.submission_id = es.submission_id
                JOIN exam_sets e ON es.exam_set_id = e.exam_set_id
                WHERE es.learner_id = :lid AND es.status = 'graded'
                ORDER BY e.release_date DESC
            ");
            $exStmt->execute([':lid' => $learnerId]);
            $examSubmissions = $exStmt->fetchAll(PDO::FETCH_ASSOC);
            $examMap = [];
            foreach ($examSubmissions as $sub) {
                $examMap[(int)$sub['subject_id']] = $sub;
            }

            // Combine Subject Analytics
            $totalExpected = 0;
            $totalCompleted = 0;
            $totalTimeSpent = 0;
            $totalQuizEarned = 0.0;
            $totalQuizMax = 0.0;
            $totalExamAggregates = 0;
            $gradedCoreSubjectsCount = 0;
            $hasF9Demotion = false;

            $reportSubjects = [];
            foreach ($subjectsProgress as $sp) {
                $sid = (int)$sp['subject_id'];
                $exp = (int)$sp['expected_lessons'];
                $comp = (int)$sp['completed_lessons'];
                $time = (int)$sp['total_time_spent_minutes'];
                $pct = (float)$sp['completion_percentage'];

                $totalExpected += $exp;
                $totalCompleted += $comp;
                $totalTimeSpent += $time;

                $quiz = $assessmentsMap[$sid] ?? null;
                $quizAvg = null;
                if ($quiz && (float)$quiz['total_possible_marks'] > 0) {
                    $quizAvg = (float)$quiz['weighted_percentage'];
                    $totalQuizEarned += (float)$quiz['total_score'];
                    $totalQuizMax += (float)$quiz['total_possible_marks'];
                }

                $exam = $examMap[$sid] ?? null;
                $examScore = $exam ? (float)$exam['score'] : null;
                $examGrade = $exam ? $exam['grade'] : null;
                $examAgg = $exam && isset($exam['aggregate_value']) ? (int)$exam['aggregate_value'] : null;

                if ($examAgg !== null) {
                    $totalExamAggregates += $examAgg;
                    $gradedCoreSubjectsCount++;
                    if ($examGrade === 'F9') {
                        $hasF9Demotion = true;
                    }
                }

                // Pedagogical remark per subject
                $remark = 'Satisfactory';
                if ($pct >= 75.0 && ($quizAvg === null || $quizAvg >= 75.0)) {
                    $remark = 'Distinction / Exemplary Concept Mastery';
                } elseif ($pct >= 50.0 && ($quizAvg === null || $quizAvg >= 50.0)) {
                    $remark = 'Credit / Steady Syllabus Progression';
                } elseif ($quizAvg !== null && $quizAvg < 50.0) {
                    $remark = 'Needs Revision on Foundational Units';
                }

                $reportSubjects[] = [
                    'subject_id' => $sid,
                    'subject_name' => $sp['subject_name'],
                    'subject_code' => $sp['subject_code'],
                    'expected_lessons' => $exp,
                    'completed_lessons' => $comp,
                    'in_progress_lessons' => (int)$sp['in_progress_lessons'],
                    'completion_percentage' => $pct,
                    'total_time_spent_minutes' => $time,
                    'quiz_average_percentage' => $quizAvg,
                    'exam_score' => $examScore,
                    'exam_grade' => $examGrade,
                    'exam_aggregate' => $examAgg,
                    'competency_remark' => $remark
                ];
            }

            // Overall UNEB Division Calculation (for 4 core subjects: ENG, MTC, SCI, SST)
            $division = 'N/A (Continuous Assessment Mode)';
            if ($gradedCoreSubjectsCount >= 4) {
                if ($totalExamAggregates >= 4 && $totalExamAggregates <= 12 && !$hasF9Demotion) {
                    $division = 'Division 1 (First Grade)';
                } elseif ($totalExamAggregates >= 13 && $totalExamAggregates <= 24 && !$hasF9Demotion) {
                    $division = 'Division 2 (Second Grade)';
                } elseif ($totalExamAggregates >= 25 && $totalExamAggregates <= 28) {
                    $division = 'Division 3 (Third Grade)';
                } elseif ($totalExamAggregates >= 29 && $totalExamAggregates <= 32) {
                    $division = 'Division 4 (Pass)';
                } else {
                    $division = 'Division U (Ungraded / Revision Required)';
                }
            }

            $overallCompletion = $totalExpected > 0 ? round(($totalCompleted / $totalExpected) * 100, 1) : 0.0;
            $overallQuizAvg = $totalQuizMax > 0 ? round(($totalQuizEarned / $totalQuizMax) * 100, 1) : null;

            // General Teacher / Headteacher Remarks
            $generalComment = 'Demonstrates active homeschooling commitment and steady curriculum attainment.';
            if ($overallCompletion >= 80.0 && ($overallQuizAvg === null || $overallQuizAvg >= 75.0)) {
                $generalComment = 'Outstanding performance and rapid syllabus completion. Demonstrates exceptional primary competency.';
            } elseif ($overallCompletion < 40.0) {
                $generalComment = 'Pacing is currently behind national termly benchmarks. Increased daily homeschooling study hours recommended.';
            }

            $summary = [
                'expected_lessons' => $totalExpected,
                'completed_lessons' => $totalCompleted,
                'completion_percentage' => $overallCompletion,
                'weighted_quiz_percentage' => $overallQuizAvg,
                'total_time_spent_minutes' => $totalTimeSpent,
                'total_hours_spent' => round($totalTimeSpent / 60, 1),
                'total_exam_aggregates' => $gradedCoreSubjectsCount >= 4 ? $totalExamAggregates : null,
                'uneb_division' => $division,
                'general_comment' => $generalComment
            ];

            $payload = [
                'meta' => [
                    'institution_name' => 'Technology-Based Homeschooling Information System (TMHIS)',
                    'ministry_affiliation' => 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard',
                    'academic_year' => (int)($term['academic_year'] ?? $academicYear),
                    'term_name' => $term['term_name'] ?? 'Term 1',
                    'term_id' => (int)($term['term_id'] ?? 1),
                    'report_title' => 'Official Learner Terminal Report Card & Syllabus Attainment',
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
                'summary' => $summary,
                'subjects' => $reportSubjects
            ];

            $snapshotUuid = $this->saveSnapshot('learner_term', $learnerId, $parent['district'] ?? null, (int)$term['term_id'], (int)$term['academic_year'], $payload, $summary, (int)$user['user_id']);
            $payload['meta']['snapshot_uuid'] = $snapshotUuid;

            Response::success($payload, 'Official learner terminal report card generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate learner report: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/parent
     * Multi-child aggregate family progress report across custom term or annual timeframes.
     */
    public function getParentReport(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $db = $this->db;

            $pStmt = $db->prepare("SELECT parent_id, full_name, email, phone, district FROM parents WHERE user_id = :uid LIMIT 1");
            $pStmt->execute([':uid' => $user['user_id']]);
            $parent = $pStmt->fetch(PDO::FETCH_ASSOC);

            $parentId = $parent['parent_id'] ?? null;
            if (!$parentId && !empty($user['email'])) {
                $pStmt = $db->prepare("SELECT parent_id, full_name, email, phone, district FROM parents WHERE email = :email LIMIT 1");
                $pStmt->execute([':email' => $user['email']]);
                $parent = $pStmt->fetch(PDO::FETCH_ASSOC);
                $parentId = $parent['parent_id'] ?? null;
            }

            if (!$parentId) {
                Response::error('Parent record not found.', 404);
                return;
            }

            $academicYear = isset($_GET['year']) && is_numeric($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
            $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;

            // Fetch children
            $lStmt = $db->prepare("
                SELECT l.learner_id, l.full_name, l.gender, l.date_of_birth, l.avatar_url,
                       l.class_id, COALESCE(c.class_name, 'Unassigned') as class_name, COALESCE(c.class_code, 'N/A') as class_code, c.level as class_level
                FROM learners l
                LEFT JOIN classes c ON l.class_id = c.class_id
                WHERE l.parent_id = :pid
                ORDER BY (l.status = 'active') DESC, c.level ASC, l.full_name ASC
            ");
            $lStmt->execute([':pid' => $parentId]);
            $children = $lStmt->fetchAll(PDO::FETCH_ASSOC);

            $childrenReports = [];
            $totalFamilyExpected = 0;
            $totalFamilyCompleted = 0;
            $totalFamilyTimeMinutes = 0;
            $totalFamilyEarned = 0.0;
            $totalFamilyMaxMarks = 0.0;

            foreach ($children as $c) {
                $cid = (int)$c['learner_id'];

                $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid");
                $spStmt->execute([':lid' => $cid]);
                $subs = $spStmt->fetchAll(PDO::FETCH_ASSOC);

                $cExp = 0;
                $cComp = 0;
                $cTime = 0;
                foreach ($subs as $s) {
                    $cExp += (int)$s['expected_lessons'];
                    $cComp += (int)$s['completed_lessons'];
                    $cTime += (int)$s['total_time_spent_minutes'];
                }

                $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                $apStmt->execute([':lid' => $cid]);
                $qSummary = $apStmt->fetch(PDO::FETCH_ASSOC);
                $cEarned = (float)($qSummary['earned'] ?? 0);
                $cMax = (float)($qSummary['max_marks'] ?? 0);

                $totalFamilyExpected += $cExp;
                $totalFamilyCompleted += $cComp;
                $totalFamilyTimeMinutes += $cTime;
                $totalFamilyEarned += $cEarned;
                $totalFamilyMaxMarks += $cMax;

                $cPct = $cExp > 0 ? round(($cComp / $cExp) * 100, 1) : 0.0;
                $cQuizPct = $cMax > 0 ? round(($cEarned / $cMax) * 100, 1) : null;

                $childrenReports[] = [
                    'learner_id' => $cid,
                    'full_name' => $c['full_name'],
                    'class_name' => $c['class_name'],
                    'class_code' => $c['class_code'],
                    'class_level' => (int)$c['class_level'],
                    'avatar_url' => $c['avatar_url'],
                    'expected_lessons' => $cExp,
                    'completed_lessons' => $cComp,
                    'completion_percentage' => $cPct,
                    'weighted_quiz_percentage' => $cQuizPct,
                    'time_spent_minutes' => $cTime,
                    'time_spent_hours' => round($cTime / 60, 1),
                    'subjects_count' => count($subs),
                    'status' => $cPct >= 70.0 ? 'Ahead of Schedule' : ($cPct >= 40.0 ? 'On Track' : 'Needs Pacing Attention')
                ];
            }

            $overallFamilyCompletion = $totalFamilyExpected > 0 ? round(($totalFamilyCompleted / $totalFamilyExpected) * 100, 1) : 0.0;
            $overallFamilyQuiz = $totalFamilyMaxMarks > 0 ? round(($totalFamilyEarned / $totalFamilyMaxMarks) * 100, 1) : null;

            $summary = [
                'total_children' => count($children),
                'total_expected_lessons' => $totalFamilyExpected,
                'total_completed_lessons' => $totalFamilyCompleted,
                'overall_completion_percentage' => $overallFamilyCompletion,
                'overall_quiz_average' => $overallFamilyQuiz,
                'total_time_spent_minutes' => $totalFamilyTimeMinutes,
                'total_study_hours' => round($totalFamilyTimeMinutes / 60, 1)
            ];

            $payload = [
                'meta' => [
                    'institution_name' => 'Technology-Based Homeschooling Information System (TMHIS)',
                    'ministry_affiliation' => 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard',
                    'academic_year' => $academicYear,
                    'report_title' => 'Official Family Multi-Learner Progress & Pacing Audit',
                    'generated_at' => date('Y-m-d H:i:s'),
                    'generated_by' => $user['full_name'] ?? 'Parent'
                ],
                'parent' => $parent,
                'summary' => $summary,
                'children' => $childrenReports
            ];

            $snapshotUuid = $this->saveSnapshot('parent_family', $parentId, $parent['district'] ?? null, $termId, $academicYear, $payload, $summary, (int)$user['user_id']);
            $payload['meta']['snapshot_uuid'] = $snapshotUuid;

            Response::success($payload, 'Parent multi-child family report generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate parent report: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/class-summary
     * Class-level performance, gradebook breakdown, at-risk learners, and diagnostic failure analysis.
     */
    public function getClassSummaryReport(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $db = $this->db;

            $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;
            $district = isset($_GET['district']) && trim((string)$_GET['district']) !== '' ? trim((string)$_GET['district']) : null;
            $academicYear = isset($_GET['year']) && is_numeric($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');

            // Find default class if not provided
            if (!$classId) {
                $cStmt = $db->query("SELECT class_id FROM classes WHERE is_active = 1 ORDER BY level ASC LIMIT 1");
                $classId = (int)$cStmt->fetchColumn();
            }

            $clsStmt = $db->prepare("SELECT * FROM classes WHERE class_id = :cid LIMIT 1");
            $clsStmt->execute([':cid' => $classId]);
            $class = $clsStmt->fetch(PDO::FETCH_ASSOC);

            if (!$class) {
                Response::error('Class record not found.', 404);
                return;
            }

            // Learners in this class
            $query = "
                SELECT l.learner_id, l.full_name, l.gender, l.date_of_birth, l.avatar_url,
                       p.parent_id, p.full_name as parent_name, p.district, p.phone as parent_phone
                FROM learners l
                LEFT JOIN parents p ON l.parent_id = p.parent_id
                WHERE l.class_id = :cid AND l.status = 'active'
            ";
            $params = [':cid' => $classId];
            if ($district) {
                $query .= " AND p.district = :dist";
                $params[':dist'] = $district;
            }
            $query .= " ORDER BY l.full_name ASC";

            $lStmt = $db->prepare($query);
            $lStmt->execute($params);
            $learners = $lStmt->fetchAll(PDO::FETCH_ASSOC);

            $roster = [];
            $totalClassExpected = 0;
            $totalClassCompleted = 0;
            $totalClassTime = 0;
            $totalScoresEarned = 0.0;
            $totalScoresMax = 0.0;
            $atRiskCount = 0;

            foreach ($learners as $lrn) {
                $lid = (int)$lrn['learner_id'];

                // Subject stats for learner
                $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid");
                $spStmt->execute([':lid' => $lid]);
                $subs = $spStmt->fetchAll(PDO::FETCH_ASSOC);

                $exp = 0;
                $comp = 0;
                $time = 0;
                foreach ($subs as $s) {
                    $exp += (int)$s['expected_lessons'];
                    $comp += (int)$s['completed_lessons'];
                    $time += (int)$s['total_time_spent_minutes'];
                }

                $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                $apStmt->execute([':lid' => $lid]);
                $qSummary = $apStmt->fetch(PDO::FETCH_ASSOC);
                $earned = (float)($qSummary['earned'] ?? 0);
                $max = (float)($qSummary['max_marks'] ?? 0);

                $totalClassExpected += $exp;
                $totalClassCompleted += $comp;
                $totalClassTime += $time;
                $totalScoresEarned += $earned;
                $totalScoresMax += $max;

                $pct = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                $quizPct = $max > 0 ? round(($earned / $max) * 100, 1) : null;

                $isAtRisk = false;
                $riskReason = null;
                if ($quizPct !== null && $quizPct < 50.0) {
                    $isAtRisk = true;
                    $riskReason = 'Low Assessment Average (' . $quizPct . '%)';
                    $atRiskCount++;
                } elseif ($pct < 30.0 && $exp > 0) {
                    $isAtRisk = true;
                    $riskReason = 'Behind Syllabus Pacing (' . $pct . '%)';
                    $atRiskCount++;
                }

                $roster[] = [
                    'learner_id' => $lid,
                    'full_name' => $lrn['full_name'],
                    'parent_name' => $lrn['parent_name'] ?? 'Guardian',
                    'parent_phone' => $lrn['parent_phone'] ?? 'N/A',
                    'district' => $lrn['district'] ?? 'Unspecified',
                    'expected_lessons' => $exp,
                    'completed_lessons' => $comp,
                    'completion_percentage' => $pct,
                    'weighted_quiz_percentage' => $quizPct,
                    'time_spent_hours' => round($time / 60, 1),
                    'is_at_risk' => $isAtRisk,
                    'risk_reason' => $riskReason
                ];
            }

            // Struggling topics across class
            $stStmt = $db->prepare("
                SELECT a.assessment_id, a.title, s.subject_name, s.subject_code,
                       COUNT(ar.result_id) as attempts_count,
                       ROUND(AVG(ar.percentage), 1) as average_percentage,
                       ROUND((COUNT(CASE WHEN ar.percentage >= 50.0 THEN 1 END) / COUNT(ar.result_id)) * 100, 1) as pass_rate
                FROM assessments a
                JOIN subjects s ON a.subject_id = s.subject_id
                JOIN assessment_results ar ON ar.assessment_id = a.assessment_id
                WHERE a.class_id = :cid
                GROUP BY a.assessment_id, a.title, s.subject_name, s.subject_code
                HAVING pass_rate < 60.0 OR average_percentage < 50.0
                ORDER BY pass_rate ASC, average_percentage ASC
                LIMIT 8
            ");
            $stStmt->execute([':cid' => $classId]);
            $strugglingTopics = $stStmt->fetchAll(PDO::FETCH_ASSOC);

            $overallCoverage = $totalClassExpected > 0 ? round(($totalClassCompleted / $totalClassExpected) * 100, 1) : 0.0;
            $overallQuizAvg = $totalScoresMax > 0 ? round(($totalScoresEarned / $totalScoresMax) * 100, 1) : null;

            $summary = [
                'total_learners' => count($learners),
                'at_risk_count' => $atRiskCount,
                'average_completion_percentage' => $overallCoverage,
                'average_quiz_score' => $overallQuizAvg,
                'total_study_hours' => round($totalClassTime / 60, 1),
                'total_struggling_topics' => count($strugglingTopics)
            ];

            $payload = [
                'meta' => [
                    'institution_name' => 'Technology-Based Homeschooling Information System (TMHIS)',
                    'ministry_affiliation' => 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard',
                    'academic_year' => $academicYear,
                    'report_title' => 'Official Class Pacing, Gradebook & Diagnostic Summary Report',
                    'generated_at' => date('Y-m-d H:i:s'),
                    'generated_by' => $user['full_name'] ?? 'Teacher'
                ],
                'class' => [
                    'class_id' => $classId,
                    'class_code' => $class['class_code'],
                    'class_name' => $class['class_name'],
                    'class_level' => (int)$class['level'],
                    'district_filter' => $district ?: 'All Districts'
                ],
                'summary' => $summary,
                'roster' => $roster,
                'struggling_topics' => $strugglingTopics
            ];

            $snapshotUuid = $this->saveSnapshot('teacher_class', $classId, $district, null, $academicYear, $payload, $summary, (int)$user['user_id']);
            $payload['meta']['snapshot_uuid'] = $snapshotUuid;

            Response::success($payload, 'Class performance and diagnostic summary generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate class summary: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/compliance
     * MoES / NCDC student-level homeschooling curriculum compliance tracking & threshold audit.
     * Evaluates every active learner against national syllabus coverage & assessment benchmarks.
     */
    public function getComplianceReport(): void
    {
        try {
            $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator', 'teacher']);
            $db = $this->db;

            $academicYear = isset($_GET['year']) && is_numeric($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
            $classIdFilter = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;
            $classLevelFilter = isset($_GET['class_level']) && is_numeric($_GET['class_level']) ? (int)$_GET['class_level'] : null;
            $search = isset($_GET['search']) && trim((string)$_GET['search']) !== '' ? trim((string)$_GET['search']) : null;
            $districtFilter = isset($_GET['district']) && trim((string)$_GET['district']) !== '' ? trim((string)$_GET['district']) : null;

            // 1. Fetch active compliance benchmark thresholds
            $bStmt = $db->query("SELECT * FROM compliance_benchmarks WHERE is_active = 1 ORDER BY benchmark_id ASC LIMIT 1");
            $benchmark = $bStmt->fetch(PDO::FETCH_ASSOC) ?: [
                'min_coverage_percentage' => 70.00,
                'min_pass_rate' => 50.00,
                'min_study_hours' => 25.00
            ];
            $minCoverage = (float)$benchmark['min_coverage_percentage'];
            $minPassRate = (float)$benchmark['min_pass_rate'];
            $minHours = (float)$benchmark['min_study_hours'];

            // 2. Fetch all individual active learners with class and guardian info
            $query = "
                SELECT 
                    l.learner_id, 
                    l.full_name, 
                    l.class_id, 
                    l.status as learner_status,
                    c.class_code, 
                    c.class_name, 
                    c.level as class_level,
                    p.parent_id, 
                    p.full_name as parent_name, 
                    p.phone as parent_phone, 
                    p.email as parent_email, 
                    p.district
                FROM learners l
                JOIN classes c ON l.class_id = c.class_id
                LEFT JOIN parents p ON l.parent_id = p.parent_id
                WHERE l.status = 'active'
            ";
            $params = [];
            if ($classIdFilter) {
                $query .= " AND l.class_id = :cid";
                $params[':cid'] = $classIdFilter;
            }
            if ($classLevelFilter) {
                $query .= " AND c.level = :lvl";
                $params[':lvl'] = $classLevelFilter;
            }
            if ($districtFilter) {
                $query .= " AND p.district = :dist";
                $params[':dist'] = $districtFilter;
            }
            if ($search) {
                $query .= " AND (l.full_name LIKE :search OR p.full_name LIKE :search2 OR c.class_code LIKE :search3)";
                $params[':search'] = '%' . $search . '%';
                $params[':search2'] = '%' . $search . '%';
                $params[':search3'] = '%' . $search . '%';
            }
            $query .= " ORDER BY c.level ASC, l.full_name ASC";

            $stmt = $db->prepare($query);
            $stmt->execute($params);
            $learnersRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $totalStudents = count($learnersRows);
            $uniqueParents = [];
            $totalExpectedLessons = 0;
            $totalCompletedLessons = 0;
            $totalStudyMinutes = 0;
            $nonCompliantCount = 0;

            $students = [];
            foreach ($learnersRows as $row) {
                $lid = (int)$row['learner_id'];
                if ($row['parent_id']) {
                    $uniqueParents[$row['parent_id']] = true;
                }

                // Syllabus progress from view
                $spStmt = $db->prepare("SELECT SUM(expected_lessons) as exp, SUM(completed_lessons) as comp, SUM(total_time_spent_minutes) as t FROM vw_learner_subject_progress WHERE learner_id = :lid");
                $spStmt->execute([':lid' => $lid]);
                $sub = $spStmt->fetch(PDO::FETCH_ASSOC);
                $exp = (int)($sub['exp'] ?? 0);
                $comp = (int)($sub['comp'] ?? 0);
                $time = (int)($sub['t'] ?? 0);
                $covPct = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                $hrs = round($time / 60, 1);

                // Quiz average
                $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks, AVG(weighted_percentage) as avg_pct FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                $apStmt->execute([':lid' => $lid]);
                $q = $apStmt->fetch(PDO::FETCH_ASSOC);
                $quizPct = null;
                if ((float)($q['max_marks'] ?? 0) > 0) {
                    $quizPct = round(((float)$q['earned'] / (float)$q['max_marks']) * 100, 1);
                } elseif ($q['avg_pct'] !== null) {
                    $quizPct = round((float)$q['avg_pct'], 1);
                }

                $totalExpectedLessons += $exp;
                $totalCompletedLessons += $comp;
                $totalStudyMinutes += $time;

                // Threshold Check per student
                $isCompliant = true;
                $complianceIssues = [];
                if ($covPct < $minCoverage) {
                    $isCompliant = false;
                    $complianceIssues[] = "Coverage {$covPct}% is below MoES target ({$minCoverage}%)";
                }
                if ($quizPct !== null && $quizPct < $minPassRate) {
                    $isCompliant = false;
                    $complianceIssues[] = "Pass Rate {$quizPct}% is below threshold ({$minPassRate}%)";
                }
                if ($hrs < $minHours && $minHours > 0) {
                    $isCompliant = false;
                    $complianceIssues[] = "Study Time {$hrs}h is below target ({$minHours}h)";
                }

                if (!$isCompliant) {
                    $nonCompliantCount++;
                }

                $studentEntry = [
                    'learner_id' => $lid,
                    'full_name' => $row['full_name'],
                    'learner_name' => $row['full_name'],
                    'student_number' => $row['student_number'] ?: ('LRN-' . str_pad((string)$lid, 4, '0', STR_PAD_LEFT)),
                    'class_id' => (int)$row['class_id'],
                    'class_code' => $row['class_code'],
                    'class_name' => $row['class_name'],
                    'class_level' => (int)$row['class_level'],
                    'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null,
                    'parent_name' => $row['parent_name'] ?? 'Homeschool Guardian',
                    'parent_phone' => $row['parent_phone'] ?? 'N/A',
                    'parent_email' => $row['parent_email'] ?? 'N/A',
                    'district' => $row['district'] ?? 'Unspecified',
                    'expected_lessons' => $exp,
                    'completed_lessons' => $comp,
                    'coverage_percentage' => $covPct,
                    'quiz_average_percentage' => $quizPct,
                    'total_study_hours' => $hrs,
                    'is_compliant' => $isCompliant,
                    'compliance_status' => $isCompliant ? 'Compliant' : 'Non-Compliant / Flagged',
                    'compliance_issues' => $complianceIssues
                ];

                $students[] = $studentEntry;
            }

            $averageCoverage = $totalExpectedLessons > 0 ? round(($totalCompletedLessons / $totalExpectedLessons) * 100, 1) : 0.0;
            $overallComplianceRate = $totalStudents > 0 ? round((($totalStudents - $nonCompliantCount) / $totalStudents) * 100, 1) : 100.0;

            $summary = [
                'total_monitored_students' => $totalStudents,
                'total_monitored_sectors' => $totalStudents,
                'total_active_learners' => $totalStudents,
                'total_active_parents' => count($uniqueParents),
                'national_coverage_percentage' => $averageCoverage,
                'average_coverage_percentage' => $averageCoverage,
                'overall_compliance_rate' => $overallComplianceRate,
                'non_compliant_students_count' => $nonCompliantCount,
                'non_compliant_sectors_count' => $nonCompliantCount,
                'at_risk_learners_count' => $nonCompliantCount,
                'total_national_study_hours' => round($totalStudyMinutes / 60, 1),
                'benchmark_targets' => [
                    'min_coverage_percentage' => $minCoverage,
                    'min_pass_rate' => $minPassRate,
                    'min_study_hours' => $minHours
                ]
            ];

            $payload = [
                'meta' => [
                    'institution_name' => 'Technology-Based Homeschooling Information System (TMHIS)',
                    'ministry_affiliation' => 'Uganda Ministry of Education & Sports (MoES) / NCDC Standard',
                    'academic_year' => $academicYear,
                    'report_title' => 'National Homeschooling Student Curriculum Compliance & Attainment Audit',
                    'generated_at' => date('Y-m-d H:i:s'),
                    'generated_by' => $user['full_name'] ?? 'Curriculum Officer'
                ],
                'summary' => $summary,
                'students' => $students,
                'learners' => $students,
                'district_sectors' => $students
            ];

            $snapshotUuid = $this->saveSnapshot('national_compliance', null, $districtFilter, null, $academicYear, $payload, $summary, (int)$user['user_id']);
            $payload['meta']['snapshot_uuid'] = $snapshotUuid;

            Response::success($payload, 'National student curriculum compliance audit generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate compliance report: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/benchmarks
     * Retrieve active national and grade-level compliance benchmarks
     */
    public function getBenchmarks(): void
    {
        try {
            AuthMiddleware::handle();
            $db = $this->db;

            $stmt = $db->query("
                SELECT b.*, c.class_name, c.class_code, t.term_name 
                FROM compliance_benchmarks b
                LEFT JOIN classes c ON b.class_id = c.class_id
                LEFT JOIN curriculum_terms t ON b.term_id = t.term_id
                ORDER BY b.class_id ASC, b.benchmark_id ASC
            ");
            $benchmarks = $stmt->fetchAll(PDO::FETCH_ASSOC);

            Response::success($benchmarks, 'Compliance benchmarks retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load benchmarks: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/reports/benchmarks
     * Configure or update compliance benchmarks (Curriculum Officers & Admins only)
     */
    public function updateBenchmarks(): void
    {
        try {
            $user = RoleMiddleware::requireRoles(['administrator', 'curriculum_officer']);

            $input = $this->getJsonInput();
            $minCoverage = isset($input['min_coverage_percentage']) ? (float)$input['min_coverage_percentage'] : 70.0;
            $minPassRate = isset($input['min_pass_rate']) ? (float)$input['min_pass_rate'] : 50.0;
            $minStudyHours = isset($input['min_study_hours']) ? (float)$input['min_study_hours'] : 25.0;
            $classId = isset($input['class_id']) && is_numeric($input['class_id']) ? (int)$input['class_id'] : null;
            $termId = isset($input['term_id']) && is_numeric($input['term_id']) ? (int)$input['term_id'] : null;

            $db = $this->db;
            $benchmarkId = isset($input['benchmark_id']) && is_numeric($input['benchmark_id']) ? (int)$input['benchmark_id'] : null;

            if ($benchmarkId) {
                $stmt = $db->prepare("UPDATE compliance_benchmarks SET min_coverage_percentage = :cov, min_pass_rate = :pass, min_study_hours = :hours, updated_at = NOW() WHERE benchmark_id = :bid");
                $stmt->execute([':cov' => $minCoverage, ':pass' => $minPassRate, ':hours' => $minStudyHours, ':bid' => $benchmarkId]);
            } elseif ($classId === null && $termId === null) {
                $existingId = $db->query("SELECT benchmark_id FROM compliance_benchmarks WHERE class_id IS NULL AND term_id IS NULL LIMIT 1")->fetchColumn();
                if ($existingId) {
                    $stmt = $db->prepare("UPDATE compliance_benchmarks SET min_coverage_percentage = :cov, min_pass_rate = :pass, min_study_hours = :hours, updated_at = NOW() WHERE benchmark_id = :bid");
                    $stmt->execute([':cov' => $minCoverage, ':pass' => $minPassRate, ':hours' => $minStudyHours, ':bid' => $existingId]);
                } else {
                    $stmt = $db->prepare("INSERT INTO compliance_benchmarks (class_id, term_id, min_coverage_percentage, min_pass_rate, min_study_hours, is_active, created_by) VALUES (NULL, NULL, :cov, :pass, :hours, 1, :uid)");
                    $stmt->execute([':cov' => $minCoverage, ':pass' => $minPassRate, ':hours' => $minStudyHours, ':uid' => $user['user_id']]);
                }
            } else {
                $stmt = $db->prepare("
                    INSERT INTO compliance_benchmarks (class_id, term_id, min_coverage_percentage, min_pass_rate, min_study_hours, is_active, created_by)
                    VALUES (:cid, :tid, :cov, :pass, :hours, 1, :uid)
                    ON DUPLICATE KEY UPDATE
                        min_coverage_percentage = VALUES(min_coverage_percentage),
                        min_pass_rate = VALUES(min_pass_rate),
                        min_study_hours = VALUES(min_study_hours),
                        is_active = 1,
                        updated_at = NOW()
                ");
                $stmt->execute([
                    ':cid' => $classId,
                    ':tid' => $termId,
                    ':cov' => $minCoverage,
                    ':pass' => $minPassRate,
                    ':hours' => $minStudyHours,
                    ':uid' => $user['user_id']
                ]);
            }

            AuditService::log((int)$user['user_id'], 'UPDATE_COMPLIANCE_BENCHMARKS', "Updated MoES compliance benchmark (Min coverage: {$minCoverage}%, Pass rate: {$minPassRate}%)");

            Response::success([
                'min_coverage_percentage' => $minCoverage,
                'min_pass_rate' => $minPassRate,
                'min_study_hours' => $minStudyHours
            ], 'Compliance benchmarks saved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to update benchmarks: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/{type}/export?format=csv
     * Export raw CSV data stream for analytics and spreadsheet applications
     */
    public function exportReport(string $type): void
    {
        try {
            $user = AuthMiddleware::handle();
            $db = $this->db;

            $format = strtolower((string)($_GET['format'] ?? 'csv'));
            if ($format !== 'csv') {
                Response::error('Only CSV export is supported by this endpoint. For PDF, use the client printable view.', 400);
                return;
            }

            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="tmhis_' . $type . '_report_' . date('Ymd_His') . '.csv"');
            header('Pragma: no-cache');
            header('Expires: 0');

            $out = fopen('php://output', 'w');
            // UTF-8 BOM for Excel
            fputs($out, "\xEF\xBB\xBF");

            if ($type === 'compliance' || $type === 'national_compliance') {
                fputcsv($out, ['Learner ID', 'Student Name', 'Class Code', 'Class Name', 'Parent Name', 'Parent Contact', 'District', 'Expected Lessons', 'Completed Lessons', 'Coverage %', 'Quiz Avg %', 'Study Hours', 'Compliance Status', 'Audit Flags']);
                $bStmt = $db->query("SELECT * FROM compliance_benchmarks WHERE is_active = 1 ORDER BY benchmark_id ASC LIMIT 1");
                $benchmark = $bStmt->fetch(PDO::FETCH_ASSOC) ?: [
                    'min_coverage_percentage' => 70.00,
                    'min_pass_rate' => 50.00,
                    'min_study_hours' => 25.00
                ];
                $minCoverage = (float)$benchmark['min_coverage_percentage'];
                $minPassRate = (float)$benchmark['min_pass_rate'];

                $stmt = $db->query("
                    SELECT 
                        l.learner_id, l.full_name, c.class_code, c.class_name,
                        p.full_name as parent_name, p.phone as parent_phone, p.district
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    LEFT JOIN parents p ON l.parent_id = p.parent_id
                    WHERE l.status = 'active'
                    ORDER BY c.level ASC, l.full_name ASC
                ");
                while ($lrn = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $lid = (int)$lrn['learner_id'];
                    $spStmt = $db->prepare("SELECT SUM(expected_lessons) as exp, SUM(completed_lessons) as comp, SUM(total_time_spent_minutes) as t FROM vw_learner_subject_progress WHERE learner_id = :lid");
                    $spStmt->execute([':lid' => $lid]);
                    $sub = $spStmt->fetch(PDO::FETCH_ASSOC);
                    $exp = (int)($sub['exp'] ?? 0);
                    $comp = (int)($sub['comp'] ?? 0);
                    $pct = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                    $hrs = round((int)($sub['t'] ?? 0) / 60, 1);

                    $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                    $apStmt->execute([':lid' => $lid]);
                    $q = $apStmt->fetch(PDO::FETCH_ASSOC);
                    $qPct = ((float)($q['max_marks'] ?? 0) > 0) ? round(((float)$q['earned'] / (float)$q['max_marks']) * 100, 1) : null;
                    $qStr = $qPct !== null ? $qPct . '%' : 'N/A';

                    $isCompliant = ($pct >= $minCoverage) && ($qPct === null || $qPct >= $minPassRate);
                    $issues = [];
                    if ($pct < $minCoverage) $issues[] = "Low coverage ({$pct}%)";
                    if ($qPct !== null && $qPct < $minPassRate) $issues[] = "Low pass rate ({$qPct}%)";

                    fputcsv($out, [
                        $lid,
                        $lrn['full_name'],
                        $lrn['class_code'],
                        $lrn['class_name'],
                        $lrn['parent_name'] ?? 'Homeschool Guardian',
                        $lrn['parent_phone'] ?? 'N/A',
                        $lrn['district'] ?? 'Unspecified',
                        $exp,
                        $comp,
                        $pct . '%',
                        $qStr,
                        $hrs,
                        $isCompliant ? 'Compliant' : 'Non-Compliant / Flagged',
                        implode('; ', $issues)
                    ]);
                }
            } elseif ($type === 'class_summary' || $type === 'class-summary') {
                $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : 1;
                fputcsv($out, ['Learner ID', 'Full Name', 'Parent Name', 'Parent Contact', 'District', 'Class', 'Expected Lessons', 'Completed Lessons', 'Coverage %', 'Quiz Avg %', 'Study Hours', 'At Risk Flag']);
                $stmt = $db->prepare("
                    SELECT l.learner_id, l.full_name, p.full_name as parent_name, p.phone as parent_phone, p.district, c.class_code
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    LEFT JOIN parents p ON l.parent_id = p.parent_id
                    WHERE l.class_id = :cid AND l.status = 'active'
                    ORDER BY l.full_name ASC
                ");
                $stmt->execute([':cid' => $classId]);
                while ($lrn = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $lid = (int)$lrn['learner_id'];
                    $spStmt = $db->prepare("SELECT SUM(expected_lessons) as exp, SUM(completed_lessons) as comp, SUM(total_time_spent_minutes) as t FROM vw_learner_subject_progress WHERE learner_id = :lid");
                    $spStmt->execute([':lid' => $lid]);
                    $sub = $spStmt->fetch(PDO::FETCH_ASSOC);
                    $exp = (int)($sub['exp'] ?? 0);
                    $comp = (int)($sub['comp'] ?? 0);
                    $pct = $exp > 0 ? round(($comp / $exp) * 100, 1) : 0.0;
                    $hrs = round((int)($sub['t'] ?? 0) / 60, 1);

                    $apStmt = $db->prepare("SELECT SUM(total_score) as earned, SUM(total_possible_marks) as max_marks FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                    $apStmt->execute([':lid' => $lid]);
                    $q = $apStmt->fetch(PDO::FETCH_ASSOC);
                    $qPct = ((float)($q['max_marks'] ?? 0) > 0) ? round(((float)$q['earned'] / (float)$q['max_marks']) * 100, 1) . '%' : 'N/A';

                    fputcsv($out, [
                        $lid,
                        $lrn['full_name'],
                        $lrn['parent_name'] ?? 'Guardian',
                        $lrn['parent_phone'] ?? 'N/A',
                        $lrn['district'] ?? 'Uganda',
                        $lrn['class_code'],
                        $exp,
                        $comp,
                        $pct . '%',
                        $qPct,
                        $hrs,
                        ($pct < 30.0 || (is_numeric(rtrim($qPct, '%')) && (float)rtrim($qPct, '%') < 50.0)) ? 'YES' : 'NO'
                    ]);
                }
            } elseif ($type === 'learner' || $type === 'terminal_report') {
                $learnerId = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
                $learner = $this->resolveLearner($user, $learnerId);
                if (!$learner) {
                    fputcsv($out, ['Error', 'Learner profile not found or unauthorized']);
                } else {
                    $lid = (int)$learner['learner_id'];
                    fputcsv($out, ['Subject', 'Subject Code', 'Teacher', 'Progress %', 'Quiz Avg', 'Exam Score', 'Grade', 'Aggregates', 'Remark']);
                    $spStmt = $db->prepare("SELECT * FROM vw_learner_subject_progress WHERE learner_id = :lid ORDER BY subject_name ASC");
                    $spStmt->execute([':lid' => $lid]);
                    $subjects = $spStmt->fetchAll(PDO::FETCH_ASSOC);

                    $apStmt = $db->prepare("SELECT * FROM vw_learner_assessment_summary WHERE learner_id = :lid");
                    $apStmt->execute([':lid' => $lid]);
                    $assessments = $apStmt->fetchAll(PDO::FETCH_ASSOC);
                    $aMap = [];
                    foreach ($assessments as $a) {
                        $aMap[(int)$a['subject_id']] = $a;
                    }

                    $exStmt = $db->prepare("
                        SELECT em.subject_id, em.raw_score as score, em.grade_label as grade, em.grade_point as aggregate_value
                        FROM exam_marks em
                        JOIN exam_submissions es ON em.submission_id = es.submission_id
                        JOIN exam_sets e ON es.exam_set_id = e.exam_set_id
                        WHERE es.learner_id = :lid AND es.status = 'graded'
                    ");
                    $exStmt->execute([':lid' => $lid]);
                    $exams = $exStmt->fetchAll(PDO::FETCH_ASSOC);
                    $eMap = [];
                    foreach ($exams as $e) {
                        $eMap[(int)$e['subject_id']] = $e;
                    }

                    foreach ($subjects as $s) {
                        $sid = (int)$s['subject_id'];
                        $q = $aMap[$sid] ?? null;
                        $e = $eMap[$sid] ?? null;
                        $qAvg = ($q && (float)$q['total_possible_marks'] > 0) ? $q['weighted_percentage'] . '%' : 'N/A';
                        $eScore = $e ? $e['score'] : 'N/A';
                        $eGrade = $e ? $e['grade'] : 'N/A';
                        $eAgg = $e ? $e['aggregate_value'] : 'N/A';

                        fputcsv($out, [
                            $s['subject_name'],
                            $s['subject_code'],
                            'Curriculum Specialist',
                            $s['completion_percentage'] . '%',
                            $qAvg,
                            $eScore,
                            $eGrade,
                            $eAgg,
                            ((float)$s['completion_percentage'] >= 75.0) ? 'Exemplary' : 'Satisfactory'
                        ]);
                    }
                }
            } else {
                fputcsv($out, ['Report Type', 'Timestamp', 'Message']);
                fputcsv($out, [$type, date('Y-m-d H:i:s'), 'Standard CSV export generated']);
            }

            fclose($out);
            exit;
        } catch (Throwable $e) {
            Response::error('Failed to export CSV: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/reports/snapshots/{uuid}
     * Retrieve an immutable report snapshot by UUID
     */
    public function getSnapshot(string $uuid): void
    {
        try {
            AuthMiddleware::handle();
            $db = $this->db;

            $stmt = $db->prepare("SELECT * FROM report_snapshots WHERE snapshot_uuid = :uuid LIMIT 1");
            $stmt->execute([':uuid' => $uuid]);
            $snap = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$snap) {
                Response::error('Report snapshot not found.', 404);
                return;
            }

            $payload = json_decode($snap['payload_json'], true);
            Response::success([
                'snapshot_id' => (int)$snap['snapshot_id'],
                'snapshot_uuid' => $snap['snapshot_uuid'],
                'report_type' => $snap['report_type'],
                'created_at' => $snap['created_at'],
                'payload' => $payload
            ], 'Report snapshot retrieved.');
        } catch (Throwable $e) {
            Response::error('Failed to load snapshot: ' . $e->getMessage(), 500);
        }
    }
}
