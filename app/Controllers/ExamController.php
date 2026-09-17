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
 * Controller for Termly Exam Sets, Printable PDF Releases,
 * UNEB 9-Point Scale & Division 1–4 Auto-Grading Engine, and Parent Mark Entry Portal.
 */
class ExamController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Helper to parse JSON or form input from request body
     */
    private function getJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $data = json_decode($raw, true);
            if (is_array($data)) {
                return $data;
            }
        }
        return $_POST ?: [];
    }

    /**
     * Helper to compute UNEB 9-Grade Scale (D1 to F9) from percentage
     */
    public static function calculateUnebGrade(float $percentage): array
    {
        if ($percentage >= 90.0) {
            return ['grade_point' => 1, 'grade_label' => 'D1', 'descriptor' => 'Distinction 1 (Outstanding)'];
        }
        if ($percentage >= 80.0) {
            return ['grade_point' => 2, 'grade_label' => 'D2', 'descriptor' => 'Distinction 2 (Excellent)'];
        }
        if ($percentage >= 70.0) {
            return ['grade_point' => 3, 'grade_label' => 'C3', 'descriptor' => 'Credit 3 (Very Good)'];
        }
        if ($percentage >= 60.0) {
            return ['grade_point' => 4, 'grade_label' => 'C4', 'descriptor' => 'Credit 4 (Good)'];
        }
        if ($percentage >= 55.0) {
            return ['grade_point' => 5, 'grade_label' => 'C5', 'descriptor' => 'Credit 5 (Above Average)'];
        }
        if ($percentage >= 50.0) {
            return ['grade_point' => 6, 'grade_label' => 'C6', 'descriptor' => 'Credit 6 (Credit Pass)'];
        }
        if ($percentage >= 45.0) {
            return ['grade_point' => 7, 'grade_label' => 'P7', 'descriptor' => 'Pass 7 (Pass / Remediation)'];
        }
        if ($percentage >= 40.0) {
            return ['grade_point' => 8, 'grade_label' => 'P8', 'descriptor' => 'Pass 8 (Minimum Pass)'];
        }
        return ['grade_point' => 9, 'grade_label' => 'F9', 'descriptor' => 'Fail 9 (Ungraded / Fail)'];
    }

    /**
     * UNEB Automated Division Evaluator with strict F9 Demotion Rules
     * E.g. Aggregate 12 with grades [1, 1, 1, 9] -> Demoted to Division II.
     */
    public static function evaluateUnebDivision(array $evaluatedMarks): array
    {
        $totalAggregate = 0;
        $totalRawScore = 0.0;
        $totalPossibleMarks = 0.0;
        $totalAggregate = 0;
        $countF9 = 0;
        $countPasses = 0;
        $hasAbsent = false;

        $engGrade = null;
        $mtcGrade = null;
        $demotionReason = null;
        $aggregateContributorCount = 0;

        foreach ($evaluatedMarks as $m) {
            $totalRawScore += (float)($m['raw_score'] ?? 0);
            $totalPossibleMarks += (float)($m['max_marks'] ?? 100);

            // Determine if this paper counts toward UNEB 4-Aggregate & Division
            $isContributor = !isset($m['is_aggregate_contributor']) || !empty($m['is_aggregate_contributor']);

            if ($isContributor) {
                $aggregateContributorCount++;
                if (!empty($m['is_absent'])) {
                    $hasAbsent = true;
                    $totalAggregate += 9;
                    $countF9++;
                } else {
                    $pt = (int)($m['grade_point'] ?? 9);
                    $totalAggregate += $pt;
                    if ($pt === 9) {
                        $countF9++;
                    } else {
                        $countPasses++;
                    }
                }

                // Detect English and Math among core aggregate papers
                $code = strtoupper((string)($m['subject_code'] ?? ''));
                $name = strtolower((string)($m['subject_name'] ?? ''));
                if (str_contains($code, 'ENG') || str_contains($name, 'english')) {
                    $engGrade = (int)($m['grade_point'] ?? 9);
                }
                if (str_contains($code, 'MTC') || str_contains($code, 'MATH') || str_contains($name, 'math')) {
                    $mtcGrade = (int)($m['grade_point'] ?? 9);
                }
            }
        }

        $avgPercentage = $totalPossibleMarks > 0 ? round(($totalRawScore / $totalPossibleMarks) * 100, 2) : 0.0;

        // If absent in any core aggregate paper
        if ($hasAbsent) {
            return [
                'division' => 'X',
                'total_aggregate' => $totalAggregate,
                'total_raw_marks' => $totalRawScore,
                'total_possible_marks' => $totalPossibleMarks,
                'average_percentage' => $avgPercentage,
                'count_f9' => $countF9,
                'count_passes' => $countPasses,
                'aggregate_contributor_count' => $aggregateContributorCount,
                'is_demoted' => false,
                'demotion_reason' => 'Candidate was absent in one or more core aggregate examination papers (Division X).'
            ];
        }

        $isEngPass = ($engGrade !== null) ? ($engGrade <= 8) : true;
        $isMtcPass = ($mtcGrade !== null) ? ($mtcGrade <= 8) : true;
        $isDemoted = false;
        $division = 'U';

        // 1. Division 1 Check (Aggregate 4 to 12)
        if ($totalAggregate >= 4 && $totalAggregate <= 12) {
            if ($countF9 === 0 && $isEngPass && $isMtcPass) {
                $division = 'I';
            } else {
                // Demoted to Division 2 due to F9 or failing core requirement
                $division = 'II';
                $isDemoted = true;
                $demotionReason = "Aggregate of {$totalAggregate} demoted from Division 1 to Division 2 because candidate attained {$countF9} F9 grade(s). Division 1 strictly requires 0 F9s.";
            }
        }
        // 2. Division 2 Check (Aggregate 13 to 24, or demoted from Div 1)
        elseif ($totalAggregate >= 13 && $totalAggregate <= 24) {
            if ($countPasses >= 3 && ($isEngPass || $isMtcPass)) {
                $division = 'II';
            } elseif ($countPasses >= 3 && !$isEngPass && !$isMtcPass) {
                // Failed both English & Math -> demoted to Div 3
                $division = 'III';
                $isDemoted = true;
                $demotionReason = "Aggregate of {$totalAggregate} demoted to Division 3 because candidate failed both English and Mathematics (both F9).";
            } else {
                $division = ($countPasses >= 2) ? 'IV' : 'U';
                $isDemoted = true;
                $demotionReason = "Aggregate of {$totalAggregate} demoted because candidate only passed {$countPasses} subject(s).";
            }
        }
        // 3. Division 3 Check (Aggregate 25 to 28)
        elseif ($totalAggregate >= 25 && $totalAggregate <= 28) {
            if ($countPasses >= 3) {
                $division = 'III';
            } else {
                $division = ($countPasses >= 2) ? 'IV' : 'U';
                $isDemoted = true;
                $demotionReason = "Aggregate of {$totalAggregate} demoted because candidate has fewer than 3 passes.";
            }
        }
        // 4. Division 4 Check (Aggregate 29 to 32)
        elseif ($totalAggregate >= 29 && $totalAggregate <= 32) {
            if ($countPasses >= 2) {
                $division = 'IV';
            } else {
                $division = 'U';
                $isDemoted = true;
                $demotionReason = "Aggregate of {$totalAggregate} demoted to Division U because candidate passed fewer than 2 subjects.";
            }
        }
        // 5. Division U (Ungraded / Failed: Aggregate 33 to 36 or < 2 passes)
        else {
            $division = 'U';
        }

        return [
            'division' => $division,
            'total_aggregate' => $totalAggregate,
            'total_raw_marks' => $totalRawScore,
            'total_possible_marks' => $totalPossibleMarks,
            'average_percentage' => $avgPercentage,
            'count_f9' => $countF9,
            'count_passes' => $countPasses,
            'aggregate_contributor_count' => $aggregateContributorCount,
            'is_demoted' => $isDemoted,
            'demotion_reason' => $demotionReason
        ];
    }

    /**
     * List Published Exam Sets (Filtered by Class Level & Gatekeeping)
     * GET /api/exams/sets
     */
    public function getExamSets(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            $isStaff = in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true);

            $classId = isset($_GET['class_id']) && is_numeric($_GET['class_id']) ? (int)$_GET['class_id'] : null;
            $termId = isset($_GET['term_id']) && is_numeric($_GET['term_id']) ? (int)$_GET['term_id'] : null;
            $examType = isset($_GET['exam_type']) ? trim($_GET['exam_type']) : null;
            $status = isset($_GET['status']) ? trim($_GET['status']) : ($isStaff ? null : 'published');
            $learnerId = !empty($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;

            // Child Class Level Boundary Gatekeeping
            $maxClassLevel = null;
            $learnerContext = null;

            if ($learnerId) {
                if ($role === 'parent') {
                    $lStmt = $this->db->prepare('
                        SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                        FROM learners l
                        JOIN classes c ON l.class_id = c.class_id
                        JOIN parents p ON l.parent_id = p.parent_id
                        WHERE l.learner_id = ? AND p.user_id = ?
                    ');
                    $lStmt->execute([$learnerId, $user['user_id']]);
                    $learnerContext = $lStmt->fetch();
                } else {
                    $lStmt = $this->db->prepare('
                        SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                        FROM learners l
                        JOIN classes c ON l.class_id = c.class_id
                        WHERE l.learner_id = ?
                    ');
                    $lStmt->execute([$learnerId]);
                    $learnerContext = $lStmt->fetch();
                }

                if ($learnerContext) {
                    $maxClassLevel = (int)$learnerContext['class_level'];
                }
            }

            $sql = "
                SELECT 
                    e.exam_set_id,
                    e.class_id,
                    c.class_name,
                    c.class_code,
                    c.level AS class_level,
                    e.term_id,
                    t.term_name,
                    e.academic_year,
                    e.exam_type,
                    e.title,
                    e.description,
                    e.instructions,
                    e.grading_scheme_id,
                    gs.scheme_name AS grading_scheme_name,
                    e.release_date,
                    e.due_date,
                    e.status,
                    e.created_by,
                    u.full_name AS creator_name,
                    e.created_at,
                    e.updated_at,
                    (SELECT COUNT(*) FROM exam_papers ep WHERE ep.exam_set_id = e.exam_set_id) AS total_papers_count
                FROM exam_sets e
                JOIN classes c ON e.class_id = c.class_id
                LEFT JOIN curriculum_terms t ON e.term_id = t.term_id
                LEFT JOIN grading_schemes gs ON e.grading_scheme_id = gs.scheme_id
                JOIN users u ON e.created_by = u.user_id
                WHERE 1=1
            ";

            $params = [];

            if ($status !== null) {
                $sql .= " AND e.status = ?";
                $params[] = $status;
            }

            if ($classId !== null) {
                $sql .= " AND e.class_id = ?";
                $params[] = $classId;
            }

            if ($termId !== null) {
                $sql .= " AND e.term_id = ?";
                $params[] = $termId;
            }

            if ($examType !== null) {
                $sql .= " AND e.exam_type = ?";
                $params[] = $examType;
            }

            // Gatekeeping: Children and parents cannot see exam sets for classes above child's level
            if ($maxClassLevel !== null && !$isStaff) {
                $sql .= " AND c.level <= ?";
                $params[] = $maxClassLevel;
            }

            $sql .= " ORDER BY c.level ASC, e.release_date DESC, e.exam_set_id DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $sets = $stmt->fetchAll();

            // If learner_id provided, fetch submission status for each set
            if (!empty($learnerId)) {
                $subStmt = $this->db->prepare("
                    SELECT submission_id, exam_set_id, total_aggregate, division, status, sitting_date, created_at
                    FROM exam_submissions
                    WHERE learner_id = ?
                ");
                $subStmt->execute([$learnerId]);
                $subs = [];
                while ($row = $subStmt->fetch()) {
                    $subs[$row['exam_set_id']] = $row;
                }

                foreach ($sets as &$s) {
                    $s['submission'] = $subs[$s['exam_set_id']] ?? null;
                }
                unset($s);
            }

            Response::success($sets, 'Examination sets retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch exam sets: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Single Exam Set Details with Papers and Marking Guides
     * GET /api/exams/sets/{id}
     */
    public function getExamSetDetails(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            $isStaff = in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true);
            $isParent = ($role === 'parent');

            $setId = (int)$id;

            $stmt = $this->db->prepare("
                SELECT 
                    e.exam_set_id,
                    e.class_id,
                    c.class_name,
                    c.class_code,
                    c.level AS class_level,
                    e.term_id,
                    t.term_name,
                    e.academic_year,
                    e.exam_type,
                    e.title,
                    e.description,
                    e.instructions,
                    e.grading_scheme_id,
                    gs.scheme_name AS grading_scheme_name,
                    gs.rules_json,
                    e.release_date,
                    e.due_date,
                    e.status,
                    e.created_by,
                    u.full_name AS creator_name,
                    e.created_at
                FROM exam_sets e
                JOIN classes c ON e.class_id = c.class_id
                LEFT JOIN curriculum_terms t ON e.term_id = t.term_id
                LEFT JOIN grading_schemes gs ON e.grading_scheme_id = gs.scheme_id
                JOIN users u ON e.created_by = u.user_id
                WHERE e.exam_set_id = ?
            ");
            $stmt->execute([$setId]);
            $set = $stmt->fetch();

            if (!$set) {
                Response::error('Exam set not found.', 404);
                return;
            }

            // Check published status for non-staff
            if (!$isStaff && $set['status'] !== 'published') {
                Response::error('This examination set has not yet been published.', 403);
                return;
            }

            // Fetch papers for this exam set
            $pStmt = $this->db->prepare("
                SELECT 
                    ep.exam_paper_id,
                    ep.exam_set_id,
                    ep.subject_id,
                    s.subject_name,
                    s.subject_code,
                    ep.paper_code,
                    ep.title,
                    ep.duration_minutes,
                    ep.total_marks,
                    ep.pdf_file_path,
                    ep.marking_guide_pdf_path,
                    ep.is_aggregate_contributor,
                    ep.paper_order,
                    ep.instructions
                FROM exam_papers ep
                JOIN subjects s ON ep.subject_id = s.subject_id
                WHERE ep.exam_set_id = ?
                ORDER BY ep.paper_order ASC, ep.exam_paper_id ASC
            ");
            $pStmt->execute([$setId]);
            $papers = $pStmt->fetchAll();

            // Check if learner_id was provided to fetch existing submission & marks
            $submission = null;
            $marks = [];
            $learnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;

            if ($learnerId) {
                $subStmt = $this->db->prepare("
                    SELECT 
                        s.submission_id,
                        s.exam_set_id,
                        s.learner_id,
                        l.full_name AS learner_name,
                        s.parent_id,
                        s.sitting_date,
                        s.total_raw_marks,
                        s.total_possible_marks,
                        s.average_percentage,
                        s.total_aggregate,
                        s.division,
                        s.status,
                        s.parent_remarks,
                        s.teacher_remarks,
                        s.created_at,
                        s.updated_at
                    FROM exam_submissions s
                    JOIN learners l ON s.learner_id = l.learner_id
                    WHERE s.exam_set_id = ? AND s.learner_id = ?
                ");
                $subStmt->execute([$setId, $learnerId]);
                $submission = $subStmt->fetch();

                if ($submission) {
                    $mStmt = $this->db->prepare("
                        SELECT 
                            em.mark_id,
                            em.submission_id,
                            em.exam_paper_id,
                            em.subject_id,
                            s.subject_name,
                            s.subject_code,
                            ep.paper_code,
                            ep.title AS paper_title,
                            em.raw_score,
                            em.max_marks,
                            em.percentage,
                            em.grade_point,
                            em.grade_label,
                            em.is_absent,
                            em.is_aggregate_contributor,
                            em.remarks
                        FROM exam_marks em
                        JOIN exam_papers ep ON em.exam_paper_id = ep.exam_paper_id
                        JOIN subjects s ON em.subject_id = s.subject_id
                        WHERE em.submission_id = ?
                        ORDER BY ep.paper_order ASC
                    ");
                    $mStmt->execute([$submission['submission_id']]);
                    $marks = $mStmt->fetchAll();
                }
            }

            Response::success([
                'exam_set' => $set,
                'papers' => $papers,
                'submission' => $submission,
                'marks' => $marks,
                'is_staff' => $isStaff,
                'is_parent' => $isParent
            ], 'Exam set details retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch exam set details: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Create New Exam Set (Curriculum Officers, Teachers & Admins)
     * POST /api/officer/exams/sets
     */
    public function createExamSet(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            if (!in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true)) {
                Response::error('Forbidden: Only Teachers, Curriculum Officers, and Administrators can create exam sets.', 403);
                return;
            }

            $input = $this->getJsonInput();
            $v = new Validator($input);
            $v->required(['class_id', 'title']);

            if (!$v->isValid()) {
                Response::error('Validation failed: ' . implode(', ', $v->getErrors()), 422);
                return;
            }

            $schemeId = !empty($input['grading_scheme_id']) ? (int)$input['grading_scheme_id'] : null;
            if (!$schemeId) {
                $defScheme = $this->db->query("SELECT scheme_id FROM grading_schemes WHERE is_default = 1 LIMIT 1")->fetch();
                $schemeId = $defScheme ? (int)$defScheme['scheme_id'] : null;
            }

            $stmt = $this->db->prepare("
                INSERT INTO exam_sets (
                    class_id, term_id, academic_year, exam_type, title, description,
                    instructions, grading_scheme_id, release_date, due_date, status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                (int)$input['class_id'],
                !empty($input['term_id']) ? (int)$input['term_id'] : null,
                $input['academic_year'] ?? '2026',
                $input['exam_type'] ?? 'mid_term',
                trim($input['title']),
                $input['description'] ?? null,
                $input['instructions'] ?? null,
                $schemeId,
                $input['release_date'] ?? date('Y-m-d'),
                $input['due_date'] ?? null,
                $input['status'] ?? 'draft',
                $user['user_id']
            ]);

            $setId = (int)$this->db->lastInsertId();

            Response::created([
                'exam_set_id' => $setId
            ], 'Examination set created successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to create exam set: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Upload Paper PDF & Marking Guide PDF
     * POST /api/officer/exams/sets/{id}/papers
     */
    public function uploadExamPaper(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            if (!in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true)) {
                Response::error('Forbidden: Only Teachers, Curriculum Officers, and Administrators can upload exam papers.', 403);
                return;
            }

            $setId = (int)$id;
            $set = $this->db->query("SELECT exam_set_id, class_id FROM exam_sets WHERE exam_set_id = $setId")->fetch();
            if (!$set) {
                Response::error('Exam set not found.', 404);
                return;
            }

            $input = $this->getJsonInput();
            $subjectId = (int)($input['subject_id'] ?? 0);
            $paperCode = trim((string)($input['paper_code'] ?? ''));
            $title = trim((string)($input['title'] ?? ''));
            $duration = (int)($input['duration_minutes'] ?? 120);
            $totalMarks = (float)($input['total_marks'] ?? 100.00);
            $paperOrder = (int)($input['paper_order'] ?? 1);
            $instructions = $input['instructions'] ?? null;
            $pdfPath = $input['pdf_file_path'] ?? '';
            $guidePath = $input['marking_guide_pdf_path'] ?? null;

            // Handle file uploads if multipart/form-data
            $uploadDir = __DIR__ . '/../../storage/uploads/exams/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }

            if (!empty($_FILES['pdf_file']['name'])) {
                $ext = pathinfo($_FILES['pdf_file']['name'], PATHINFO_EXTENSION);
                if (strtolower($ext) !== 'pdf') {
                    Response::error('Invalid file format. Question Paper must be a PDF file.', 422);
                    return;
                }
                $fileName = 'paper_' . $setId . '_' . time() . '_' . uniqid() . '.pdf';
                move_uploaded_file($_FILES['pdf_file']['tmp_name'], $uploadDir . $fileName);
                $pdfPath = 'storage/uploads/exams/' . $fileName;
            }

            if (!empty($_FILES['marking_guide_pdf']['name'])) {
                $ext = pathinfo($_FILES['marking_guide_pdf']['name'], PATHINFO_EXTENSION);
                if (strtolower($ext) !== 'pdf') {
                    Response::error('Invalid file format. Marking Guide must be a PDF file.', 422);
                    return;
                }
                $guideName = 'guide_' . $setId . '_' . time() . '_' . uniqid() . '.pdf';
                move_uploaded_file($_FILES['marking_guide_pdf']['tmp_name'], $uploadDir . $guideName);
                $guidePath = 'storage/uploads/exams/' . $guideName;
            }

            // Auto-resolve valid subject_id if not provided or 0 (skipping already added subjects)
            if ($subjectId <= 0) {
                $clsId = (int)$set['class_id'];
                $sRow = $this->db->query("SELECT subject_id, subject_name, subject_code FROM subjects WHERE class_id = $clsId AND subject_id NOT IN (SELECT subject_id FROM exam_papers WHERE exam_set_id = $setId) LIMIT 1")->fetch();
                if (!$sRow) {
                    $sRow = $this->db->query("SELECT subject_id, subject_name, subject_code FROM subjects WHERE subject_id NOT IN (SELECT subject_id FROM exam_papers WHERE exam_set_id = $setId) LIMIT 1")->fetch();
                }
                if ($sRow) {
                    $subjectId = (int)$sRow['subject_id'];
                    if (empty($paperCode)) $paperCode = $sRow['subject_code'];
                    if (empty($title)) $title = $sRow['subject_name'] . ' Examination Paper';
                }
            }

            // Guard against duplicate subject in the same examination set
            if ($subjectId > 0) {
                $stmtDup = $this->db->prepare("SELECT exam_paper_id FROM exam_papers WHERE exam_set_id = ? AND subject_id = ?");
                $stmtDup->execute([$setId, $subjectId]);
                if ($stmtDup->fetch()) {
                    Response::error('A paper for this subject has already been added to this examination set. Please select a different subject or delete the existing paper first.', 422);
                    return;
                }
            }

            if (empty($pdfPath)) {
                // If no PDF file was uploaded or specified, assign standard curriculum template
                $pdfPath = 'storage/uploads/exams/paper_p6_eng_t3_2026.pdf';
            }
            if (empty($guidePath)) {
                $guidePath = 'storage/uploads/exams/guide_p6_eng_t3_2026.pdf';
            }

            // Auto-fetch subject info if paperCode or title empty
            if (empty($paperCode) || empty($title)) {
                $sRow = $this->db->query("SELECT subject_name, subject_code FROM subjects WHERE subject_id = $subjectId")->fetch();
                if ($sRow) {
                    if (empty($paperCode)) $paperCode = $sRow['subject_code'];
                    if (empty($title)) $title = $sRow['subject_name'] . ' Examination Paper';
                }
            }

            // Determine is_aggregate_contributor flag
            $isAggregateContributor = 1;
            if (isset($input['is_aggregate_contributor'])) {
                $isAggregateContributor = !empty($input['is_aggregate_contributor']) ? 1 : 0;
            } else {
                $codeUpper = strtoupper($paperCode);
                $titleLower = strtolower($title);
                if (str_contains($codeUpper, 'CAPE') || str_contains($codeUpper, 'KIS') || str_contains($titleLower, 'kiswahili') || str_contains($titleLower, 'creative arts') || str_contains($titleLower, 'physical ed')) {
                    $isAggregateContributor = 0;
                }
            }

            $stmt = $this->db->prepare("
                INSERT INTO exam_papers (
                    exam_set_id, subject_id, paper_code, title, duration_minutes,
                    total_marks, pdf_file_path, marking_guide_pdf_path, is_aggregate_contributor, paper_order, instructions
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $setId,
                $subjectId,
                $paperCode,
                $title,
                $duration,
                $totalMarks,
                $pdfPath,
                $guidePath,
                $isAggregateContributor,
                $paperOrder,
                $instructions
            ]);

            Response::created([
                'exam_paper_id' => (int)$this->db->lastInsertId()
            ], 'Exam paper added successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to upload exam paper: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Publish Exam Set
     * POST /api/officer/exams/sets/{id}/publish
     */
    public function publishExamSet(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            if (!in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true)) {
                Response::error('Forbidden: Insufficient permissions to publish exam set.', 403);
                return;
            }

            $setId = (int)$id;
            $stmt = $this->db->prepare("UPDATE exam_sets SET status = 'published', updated_at = NOW() WHERE exam_set_id = ?");
            $stmt->execute([$setId]);

            Response::success([
                'exam_set_id' => $setId
            ], 'Examination set published successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to publish exam set: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Delete Exam Set (Teachers, Curriculum Officers & Admins)
     * DELETE /api/officer/exams/sets/{id}
     */
    public function deleteExamSet(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            if (!in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true)) {
                Response::error('Forbidden: Insufficient permissions to delete examination set.', 403);
                return;
            }

            $setId = (int)$id;
            $set = $this->db->query("SELECT exam_set_id, title FROM exam_sets WHERE exam_set_id = $setId")->fetch();
            if (!$set) {
                Response::error('Exam set not found.', 404);
                return;
            }

            $stmt = $this->db->prepare("DELETE FROM exam_sets WHERE exam_set_id = ?");
            $stmt->execute([$setId]);

            Response::success([
                'exam_set_id' => $setId,
                'deleted' => true
            ], 'Examination set and all associated papers deleted successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to delete examination set: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Delete Single Subject Examination Paper
     * DELETE /api/officer/exams/papers/{id}
     */
    public function deleteExamPaper(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            if (!in_array($role, ['administrator', 'curriculum_officer', 'teacher'], true)) {
                Response::error('Forbidden: Insufficient permissions to delete examination paper.', 403);
                return;
            }

            $paperId = (int)$id;
            $paper = $this->db->query("SELECT exam_paper_id, exam_set_id, title FROM exam_papers WHERE exam_paper_id = $paperId")->fetch();
            if (!$paper) {
                Response::error('Exam paper not found.', 404);
                return;
            }

            $setId = (int)$paper['exam_set_id'];

            $stmt = $this->db->prepare("DELETE FROM exam_papers WHERE exam_paper_id = ?");
            $stmt->execute([$paperId]);

            Response::success([
                'exam_paper_id' => $paperId,
                'exam_set_id' => $setId,
                'deleted' => true
            ], 'Examination paper deleted successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to delete examination paper: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Parent Mark Entry Portal & Automated Division Grading
     * POST /api/parent/exams/sets/{id}/marks
     */
    public function submitExamMarks(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';
            $setId = (int)$id;

            $input = $this->getJsonInput();
            $v = new Validator($input);
            $v->required(['learner_id', 'marks']);

            if (!$v->isValid()) {
                Response::error('Validation failed: ' . implode(', ', $v->getErrors()), 422);
                return;
            }

            $learnerId = (int)$input['learner_id'];

            // Parent authorization check
            $parentId = null;
            if ($role === 'parent') {
                $pStmt = $this->db->prepare("
                    SELECT p.parent_id FROM parents p
                    JOIN learners l ON p.parent_id = l.parent_id
                    WHERE p.user_id = ? AND l.learner_id = ?
                ");
                $pStmt->execute([$user['user_id'], $learnerId]);
                $pRow = $pStmt->fetch();
                if (!$pRow) {
                    Response::error('Unauthorized: You are not registered as the parent of this learner.', 403);
                    return;
                }
                $parentId = (int)$pRow['parent_id'];
            } else {
                // Staff entering on behalf of learner
                $lRow = $this->db->query("SELECT parent_id FROM learners WHERE learner_id = $learnerId")->fetch();
                if (!$lRow) {
                    Response::error('Learner not found.', 404);
                    return;
                }
                $parentId = (int)$lRow['parent_id'];
            }

            // Fetch exam set and papers
            $setStmt = $this->db->prepare("
                SELECT e.exam_set_id, e.title, e.class_id, e.status
                FROM exam_sets e
                WHERE e.exam_set_id = ?
            ");
            $setStmt->execute([$setId]);
            $examSet = $setStmt->fetch();
            if (!$examSet) {
                Response::error('Exam set not found.', 404);
                return;
            }

            $papersStmt = $this->db->prepare("
                SELECT ep.exam_paper_id, ep.subject_id, s.subject_name, s.subject_code, ep.total_marks, ep.title, ep.is_aggregate_contributor
                FROM exam_papers ep
                JOIN subjects s ON ep.subject_id = s.subject_id
                WHERE ep.exam_set_id = ?
                ORDER BY ep.paper_order ASC
            ");
            $papersStmt->execute([$setId]);
            $papers = $papersStmt->fetchAll();

            $paperLookup = [];
            foreach ($papers as $p) {
                $paperLookup[$p['exam_paper_id']] = $p;
            }

            // Process marks input
            $rawMarks = is_array($input['marks']) ? $input['marks'] : [];
            $evaluatedMarks = [];

            foreach ($rawMarks as $m) {
                $paperId = (int)($m['exam_paper_id'] ?? 0);
                if (!isset($paperLookup[$paperId])) {
                    continue;
                }
                $pMeta = $paperLookup[$paperId];
                $maxMarks = (float)($pMeta['total_marks'] > 0 ? $pMeta['total_marks'] : 100.0);
                $isAbsent = !empty($m['is_absent']);
                $score = $isAbsent ? 0.0 : min($maxMarks, max(0.0, (float)($m['raw_score'] ?? 0.0)));
                $pct = $maxMarks > 0 ? round(($score / $maxMarks) * 100, 2) : 0.0;
                $isContributor = isset($pMeta['is_aggregate_contributor']) ? (int)$pMeta['is_aggregate_contributor'] : 1;

                $gradeInfo = $isAbsent ? ['grade_point' => 9, 'grade_label' => 'F9', 'descriptor' => 'Absent'] : self::calculateUnebGrade($pct);

                $evaluatedMarks[] = [
                    'exam_paper_id' => $paperId,
                    'subject_id' => $pMeta['subject_id'],
                    'subject_name' => $pMeta['subject_name'],
                    'subject_code' => $pMeta['subject_code'],
                    'raw_score' => $score,
                    'max_marks' => $maxMarks,
                    'percentage' => $pct,
                    'grade_point' => $gradeInfo['grade_point'],
                    'grade_label' => $gradeInfo['grade_label'],
                    'is_absent' => $isAbsent ? 1 : 0,
                    'is_aggregate_contributor' => $isContributor,
                    'remarks' => trim((string)($m['remarks'] ?? ''))
                ];
            }

            if (empty($evaluatedMarks)) {
                Response::error('No valid paper marks provided for this exam set.', 422);
                return;
            }

            // Evaluate UNEB Division with strict F9 demotion logic
            $gradingResult = self::evaluateUnebDivision($evaluatedMarks);

            // Save to database inside transaction
            $this->db->beginTransaction();

            // Check if submission already exists
            $existingSub = $this->db->query("SELECT submission_id FROM exam_submissions WHERE exam_set_id = $setId AND learner_id = $learnerId")->fetch();

            $sittingDate = !empty($input['sitting_date']) ? $input['sitting_date'] : date('Y-m-d');
            $parentRemarks = $input['parent_remarks'] ?? null;
            $teacherRemarks = $input['teacher_remarks'] ?? null;

            if ($gradingResult['is_demoted'] && !empty($gradingResult['demotion_reason'])) {
                $teacherRemarks = ($teacherRemarks ? $teacherRemarks . ' | ' : '') . '[UNEB Grading Notice: ' . $gradingResult['demotion_reason'] . ']';
            }

            if ($existingSub) {
                $submissionId = (int)$existingSub['submission_id'];
                $upStmt = $this->db->prepare("
                    UPDATE exam_submissions SET
                        sitting_date = ?,
                        total_raw_marks = ?,
                        total_possible_marks = ?,
                        average_percentage = ?,
                        total_aggregate = ?,
                        division = ?,
                        status = 'submitted',
                        parent_remarks = ?,
                        teacher_remarks = ?,
                        updated_at = NOW()
                    WHERE submission_id = ?
                ");
                $upStmt->execute([
                    $sittingDate,
                    $gradingResult['total_raw_marks'],
                    $gradingResult['total_possible_marks'],
                    $gradingResult['average_percentage'],
                    $gradingResult['total_aggregate'],
                    $gradingResult['division'],
                    $parentRemarks,
                    $teacherRemarks,
                    $submissionId
                ]);

                // Clear previous marks to re-insert
                $this->db->exec("DELETE FROM exam_marks WHERE submission_id = $submissionId");
            } else {
                $inStmt = $this->db->prepare("
                    INSERT INTO exam_submissions (
                        exam_set_id, learner_id, parent_id, sitting_date,
                        total_raw_marks, total_possible_marks, average_percentage,
                        total_aggregate, division, status, parent_remarks, teacher_remarks
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
                ");
                $inStmt->execute([
                    $setId,
                    $learnerId,
                    $parentId,
                    $sittingDate,
                    $gradingResult['total_raw_marks'],
                    $gradingResult['total_possible_marks'],
                    $gradingResult['average_percentage'],
                    $gradingResult['total_aggregate'],
                    $gradingResult['division'],
                    $parentRemarks,
                    $teacherRemarks
                ]);
                $submissionId = (int)$this->db->lastInsertId();
            }

            // Insert exam_marks
            $markStmt = $this->db->prepare("
                INSERT INTO exam_marks (
                    submission_id, exam_paper_id, subject_id, raw_score, max_marks,
                    percentage, grade_point, grade_label, is_absent, is_aggregate_contributor, remarks, entered_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($evaluatedMarks as $em) {
                $markStmt->execute([
                    $submissionId,
                    $em['exam_paper_id'],
                    $em['subject_id'],
                    $em['raw_score'],
                    $em['max_marks'],
                    $em['percentage'],
                    $em['grade_point'],
                    $em['grade_label'],
                    $em['is_absent'],
                    $em['is_aggregate_contributor'] ?? 1,
                    $em['remarks'],
                    $user['user_id']
                ]);
            }

            $this->db->commit();

            Response::success([
                'submission_id' => $submissionId,
                'total_aggregate' => $gradingResult['total_aggregate'],
                'division' => $gradingResult['division'],
                'average_percentage' => $gradingResult['average_percentage'],
                'total_raw_marks' => $gradingResult['total_raw_marks'],
                'total_possible_marks' => $gradingResult['total_possible_marks'],
                'is_demoted' => $gradingResult['is_demoted'],
                'demotion_reason' => $gradingResult['demotion_reason'],
                'marks' => $evaluatedMarks
            ], 'Examination marks saved and graded successfully under Ugandan UNEB standard rules.');
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            Response::error('Failed to submit exam marks: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get Printable Terminal Examination Report Card / Slip
     * GET /api/parent/exams/submissions/{id}/report-card
     */
    public function getExamReportCard(int|string $id): void
    {
        try {
            $user = AuthMiddleware::handle();
            $subId = (int)$id;

            $stmt = $this->db->prepare("
                SELECT 
                    s.submission_id,
                    s.exam_set_id,
                    e.title AS exam_set_title,
                    e.exam_type,
                    e.academic_year,
                    c.class_id,
                    c.class_name,
                    c.class_code,
                    t.term_name,
                    s.learner_id,
                    l.full_name AS learner_name,
                    l.avatar_url AS learner_avatar,
                    l.gender,
                    l.date_of_birth,
                    s.parent_id,
                    p_user.full_name AS parent_name,
                    p_user.email AS parent_email,
                    s.sitting_date,
                    s.total_raw_marks,
                    s.total_possible_marks,
                    s.average_percentage,
                    s.total_aggregate,
                    s.division,
                    s.status,
                    s.parent_remarks,
                    s.teacher_remarks,
                    s.created_at AS submission_date
                FROM exam_submissions s
                JOIN exam_sets e ON s.exam_set_id = e.exam_set_id
                JOIN classes c ON e.class_id = c.class_id
                LEFT JOIN curriculum_terms t ON e.term_id = t.term_id
                JOIN learners l ON s.learner_id = l.learner_id
                JOIN parents p ON s.parent_id = p.parent_id
                JOIN users p_user ON p.user_id = p_user.user_id
                WHERE s.submission_id = ?
            ");
            $stmt->execute([$subId]);
            $sub = $stmt->fetch();

            if (!$sub) {
                Response::error('Report card submission not found.', 404);
                return;
            }

            // Authorization: parent can only view their own learner's report card
            if ($user['role_code'] === 'parent') {
                $authCheck = $this->db->prepare("
                    SELECT 1 FROM parents p WHERE p.parent_id = ? AND p.user_id = ?
                ");
                $authCheck->execute([$sub['parent_id'], $user['user_id']]);
                if (!$authCheck->fetch()) {
                    Response::error('Unauthorized access to report card.', 403);
                    return;
                }
            }

            // Fetch subject marks
            $mStmt = $this->db->prepare("
                SELECT 
                    em.mark_id,
                    em.exam_paper_id,
                    ep.paper_code,
                    ep.title AS paper_title,
                    s.subject_id,
                    s.subject_name,
                    s.subject_code,
                    em.raw_score,
                    em.max_marks,
                    em.percentage,
                    em.grade_point,
                    em.grade_label,
                    em.is_absent,
                    em.is_aggregate_contributor,
                    em.remarks
                FROM exam_marks em
                JOIN exam_papers ep ON em.exam_paper_id = ep.exam_paper_id
                JOIN subjects s ON em.subject_id = s.subject_id
                WHERE em.submission_id = ?
                ORDER BY ep.paper_order ASC
            ");
            $mStmt->execute([$subId]);
            $marks = $mStmt->fetchAll();

            // Grading scale summary for legend
            $scaleLegend = [
                ['grade' => 'D1', 'points' => 1, 'range' => '90 - 100%', 'label' => 'Distinction 1 (Outstanding)'],
                ['grade' => 'D2', 'points' => 2, 'range' => '80 - 89%',  'label' => 'Distinction 2 (Excellent)'],
                ['grade' => 'C3', 'points' => 3, 'range' => '70 - 79%',  'label' => 'Credit 3 (Very Good)'],
                ['grade' => 'C4', 'points' => 4, 'range' => '60 - 69%',  'label' => 'Credit 4 (Good)'],
                ['grade' => 'C5', 'points' => 5, 'range' => '55 - 59%',  'label' => 'Credit 5 (Above Average)'],
                ['grade' => 'C6', 'points' => 6, 'range' => '50 - 54%',  'label' => 'Credit 6 (Credit Pass)'],
                ['grade' => 'P7', 'points' => 7, 'range' => '45 - 49%',  'label' => 'Pass 7 (Pass / Needs Help)'],
                ['grade' => 'P8', 'points' => 8, 'range' => '40 - 44%',  'label' => 'Pass 8 (Minimum Pass)'],
                ['grade' => 'F9', 'points' => 9, 'range' => '0 - 39%',   'label' => 'Fail 9 (Ungraded / Fail)']
            ];

            Response::success([
                'report_card' => $sub,
                'subject_marks' => $marks,
                'grading_legend' => $scaleLegend,
                'institution' => [
                    'name' => "The Master's Home International School",
                    'motto' => 'Nurturing Champions in Christ and Academic Excellence',
                    'address' => 'Kampala, Uganda',
                    'website' => 'https://tmhis.strongsystemsltd.com'
                ]
            ], 'Report card generated successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to generate report card: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get All Exam Results for a Learner
     * GET /api/parent/exams/results
     */
    public function getLearnerExamResults(): void
    {
        try {
            $user = AuthMiddleware::handle();
            $role = $user['role_code'] ?? '';

            $learnerId = isset($_GET['learner_id']) && is_numeric($_GET['learner_id']) ? (int)$_GET['learner_id'] : null;

            if (!$learnerId && $role === 'parent') {
                $pRow = $this->db->query("
                    SELECT l.learner_id FROM learners l
                    JOIN parents p ON l.parent_id = p.parent_id
                    WHERE p.user_id = {$user['user_id']} LIMIT 1
                ")->fetch();
                $learnerId = $pRow ? (int)$pRow['learner_id'] : null;
            }

            if (!$learnerId) {
                Response::error('learner_id parameter is required.', 422);
                return;
            }

            $stmt = $this->db->prepare("
                SELECT * FROM vw_learner_exam_summary
                WHERE learner_id = ?
                ORDER BY submitted_at DESC
            ");
            $stmt->execute([$learnerId]);
            $results = $stmt->fetchAll();

            Response::success($results, 'Learner exam results retrieved successfully.');
        } catch (Throwable $e) {
            Response::error('Failed to fetch learner exam results: ' . $e->getMessage(), 500);
        }
    }
}
