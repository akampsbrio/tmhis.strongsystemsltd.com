<?php
declare(strict_types=1);

/**
 * Seed Exam Sets, Papers, UNEB Grading Schemes, and Sample Submissions
 * Author: TMHIS System Development Team
 */

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

$db = Database::getConnection();

echo "--- SEEDING EXAM SETS, PAPERS, UNEB GRADING SCHEME & SAMPLE SUBMISSIONS ---\n";

// Function to generate clean valid PDF files with minimal pure PHP PDF generator
function createSimpleExamPdf(string $filePath, string $title, string $subject, string $classLevel, string $type = 'EXAMINATION PAPER', array $questions = []): void
{
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $content = "%PDF-1.4\n";
    $content .= "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
    $content .= "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
    $content .= "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n";
    $content .= "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";
    $content .= "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

    // Build text stream
    $stream = "BT\n";
    // Header
    $stream .= "/F1 16 Tf\n50 800 Td\n(THE MASTER'S HOME INTERNATIONAL SCHOOL - TMHIS) Tj\n";
    $stream .= "/F1 12 Tf\n0 -22 Td\n(" . addcslashes(strtoupper($title), "()") . ") Tj\n";
    $stream .= "/F2 10 Tf\n0 -16 Td\n(SUBJECT: " . addcslashes($subject, "()") . "  |  CLASS: " . addcslashes($classLevel, "()") . "  |  TYPE: " . addcslashes($type, "()") . ") Tj\n";
    $stream .= "0 -14 Td\n(TIME ALLOWED: 2 HOURS 15 MINUTES  |  MAXIMUM MARKS: 100) Tj\n";
    $stream .= "0 -10 Td\n(------------------------------------------------------------------------------------------------------) Tj\n";
    $stream .= "/F1 10 Tf\n0 -18 Td\n(CANDIDATE NAME: _____________________________________   INDEX NO: ______________) Tj\n";
    $stream .= "/F2 9 Tf\n0 -16 Td\n(INSTRUCTIONS TO CANDIDATES: Answer all questions in the spaces provided. Write clearly.) Tj\n";
    $stream .= "0 -12 Td\n(------------------------------------------------------------------------------------------------------) Tj\n";

    // Questions / Guide content
    $yOffset = -22;
    $count = 1;
    foreach ($questions as $q) {
        $stream .= "/F1 10 Tf\n0 $yOffset Td\n(" . addcslashes("Q{$count}. {$q['q']} [{$q['marks']} Marks]", "()") . ") Tj\n";
        if (!empty($q['sub'])) {
            foreach ($q['sub'] as $sub) {
                $stream .= "/F2 9 Tf\n0 -14 Td\n(" . addcslashes("    - {$sub}", "()") . ") Tj\n";
            }
            $yOffset = -18;
        } else {
            $stream .= "/F2 9 Tf\n0 -14 Td\n(    Answer: ____________________________________________________________________) Tj\n";
            $yOffset = -20;
        }
        $count++;
    }

    $stream .= "/F1 10 Tf\n0 -25 Td\n(*** END OF " . addcslashes($type, "()") . " - TMHIS ACCREDITED CURRICULUM ***) Tj\n";
    $stream .= "ET\n";

    $len = strlen($stream);
    $content .= "6 0 obj\n<< /Length $len >>\nstream\n" . $stream . "\nendstream\nendobj\n";
    $content .= "xref\n0 7\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000234 00000 n \n0000000306 00000 n \n0000000373 00000 n \ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n" . (strlen($content)) . "\n%%EOF\n";

    file_put_contents($filePath, $content);
}

// 1. Seed UNEB 9-Point Grading Scheme
$schemeRules = [
    'grade_scale' => [
        ['grade' => 'D1', 'points' => 1, 'min' => 90, 'max' => 100, 'label' => 'Distinction 1', 'remarks' => 'Outstanding Performance'],
        ['grade' => 'D2', 'points' => 2, 'min' => 80, 'max' => 89,  'label' => 'Distinction 2', 'remarks' => 'Excellent Performance'],
        ['grade' => 'C3', 'points' => 3, 'min' => 70, 'max' => 79,  'label' => 'Credit 3',      'remarks' => 'Very Good Performance'],
        ['grade' => 'C4', 'points' => 4, 'min' => 60, 'max' => 69,  'label' => 'Credit 4',      'remarks' => 'Good Performance'],
        ['grade' => 'C5', 'points' => 5, 'min' => 55, 'max' => 59,  'label' => 'Credit 5',      'remarks' => 'Above Average Performance'],
        ['grade' => 'C6', 'points' => 6, 'min' => 50, 'max' => 54,  'label' => 'Credit 6',      'remarks' => 'Average Performance / Credit Pass'],
        ['grade' => 'P7', 'points' => 7, 'min' => 45, 'max' => 49,  'label' => 'Pass 7',        'remarks' => 'Pass with Remediation Recommended'],
        ['grade' => 'P8', 'points' => 8, 'min' => 40, 'max' => 44,  'label' => 'Pass 8',        'remarks' => 'Bare Minimum Pass'],
        ['grade' => 'F9', 'points' => 9, 'min' => 0,  'max' => 39,  'label' => 'Fail 9',        'remarks' => 'Ungraded / Fail']
    ],
    'division_rules' => [
        'I' => [
            'name' => 'Division 1 (First Grade)',
            'min_aggregate' => 4,
            'max_aggregate' => 12,
            'max_f9_allowed' => 0,
            'demote_if_f9_to' => 'II',
            'required_passes' => 4,
            'description' => 'Aggregates 4 to 12. Must pass all 4 subjects with Grade 8 or better (Zero F9s). Any F9 strictly demotes to Division 2.'
        ],
        'II' => [
            'name' => 'Division 2 (Second Grade)',
            'min_aggregate' => 13,
            'max_aggregate' => 24,
            'max_f9_allowed' => 1,
            'required_passes' => 3,
            'description' => 'Aggregates 13 to 24 (or 4-12 with 1 F9). Must pass at least 3 subjects with a pass in English or Math.'
        ],
        'III' => [
            'name' => 'Division 3 (Third Grade)',
            'min_aggregate' => 25,
            'max_aggregate' => 28,
            'max_f9_allowed' => 1,
            'required_passes' => 3,
            'description' => 'Aggregates 25 to 28. Must pass at least 3 subjects.'
        ],
        'IV' => [
            'name' => 'Division 4 (Fourth Grade)',
            'min_aggregate' => 29,
            'max_aggregate' => 32,
            'max_f9_allowed' => 2,
            'required_passes' => 2,
            'description' => 'Aggregates 29 to 32. Must pass at least 2 subjects.'
        ],
        'U' => [
            'name' => 'Division U (Ungraded)',
            'min_aggregate' => 33,
            'max_aggregate' => 36,
            'max_f9_allowed' => 4,
            'required_passes' => 0,
            'description' => 'Aggregates 33 to 36, or fewer than 2 subjects passed.'
        ],
        'X' => [
            'name' => 'Division X (Absent / Incomplete)',
            'description' => 'Absent in one or more core subject papers.'
        ]
    ]
];

$rulesJson = json_encode($schemeRules, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

$existingScheme = $db->query("SELECT scheme_id FROM grading_schemes WHERE scheme_name = 'Uganda UNEB 9-Point Primary Scale'")->fetch(PDO::FETCH_ASSOC);
if (!$existingScheme) {
    $stmt = $db->prepare("INSERT INTO grading_schemes (scheme_name, description, is_default, rules_json) VALUES (?, ?, 1, ?)");
    $stmt->execute([
        'Uganda UNEB 9-Point Primary Scale',
        'Official National UNEB Primary Leaving Examination 9-grade stanine scale (D1 to F9) with Division 1 to 4 aggregate and strict F9 demotion rules.',
        $rulesJson
    ]);
    $schemeId = (int)$db->lastInsertId();
    echo "[OK] Created default UNEB Grading Scheme (ID: $schemeId).\n";
} else {
    $schemeId = (int)$existingScheme['scheme_id'];
    $stmt = $db->prepare("UPDATE grading_schemes SET rules_json = ?, is_default = 1 WHERE scheme_id = ?");
    $stmt->execute([$rulesJson, $schemeId]);
    echo "[OK] Updated existing UNEB Grading Scheme (ID: $schemeId).\n";
}

// 2. Clear previous seeded exam data
$db->exec("SET FOREIGN_KEY_CHECKS = 0");
$db->exec("TRUNCATE TABLE exam_marks");
$db->exec("TRUNCATE TABLE exam_submissions");
$db->exec("TRUNCATE TABLE exam_papers");
$db->exec("TRUNCATE TABLE exam_sets");
$db->exec("SET FOREIGN_KEY_CHECKS = 1");

// 3. Find Curriculum Officer & Classes
$officer = $db->query("SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code IN ('curriculum_officer', 'administrator') LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$officerId = $officer ? (int)$officer['user_id'] : 1;

$classes = $db->query("SELECT class_id, class_code, class_name FROM classes ORDER BY class_id")->fetchAll(PDO::FETCH_ASSOC);
$p6Id = 6;
$p3Id = 3;
$p7Id = 7;
foreach ($classes as $c) {
    if ($c['class_code'] === 'P6' || $c['class_name'] === 'Primary 6') $p6Id = (int)$c['class_id'];
    if ($c['class_code'] === 'P3' || $c['class_name'] === 'Primary 3') $p3Id = (int)$c['class_id'];
    if ($c['class_code'] === 'P7' || $c['class_name'] === 'Primary 7') $p7Id = (int)$c['class_id'];
}

$term = $db->query("SELECT term_id FROM curriculum_terms ORDER BY term_id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$termId = $term ? (int)$term['term_id'] : null;

// Helper to get or insert subject
function getOrInsertSubject(PDO $db, int $classId, string $code, string $name): int {
    $row = $db->query("SELECT subject_id FROM subjects WHERE class_id = $classId AND (subject_code = '$code' OR subject_name = '$name') LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if ($row) return (int)$row['subject_id'];
    $stmt = $db->prepare("INSERT INTO subjects (subject_name, subject_code, class_id, description, is_active) VALUES (?, ?, ?, ?, 1)");
    $stmt->execute([$name, $code, $classId, "Core Subject: $name for Class $classId"]);
    return (int)$db->lastInsertId();
}

$p6Eng = getOrInsertSubject($db, $p6Id, 'P6-ENG', 'English Language');
$p6Mtc = getOrInsertSubject($db, $p6Id, 'P6-MTC', 'Mathematics');
$p6Sci = getOrInsertSubject($db, $p6Id, 'P6-SCI', 'Integrated Science');
$p6Sst = getOrInsertSubject($db, $p6Id, 'P6-SST', 'Social Studies & R.E');

$p3Eng = getOrInsertSubject($db, $p3Id, 'P3-ENG', 'English Language');
$p3Mtc = getOrInsertSubject($db, $p3Id, 'P3-MTC', 'Mathematics');
$p3Lit1 = getOrInsertSubject($db, $p3Id, 'P3-LIT1', 'Literacy I (Science & Health)');
$p3Lit2 = getOrInsertSubject($db, $p3Id, 'P3-LIT2', 'Literacy II (Social Studies)');

$p7Eng = getOrInsertSubject($db, $p7Id, 'P7-ENG', 'English Language');
$p7Mtc = getOrInsertSubject($db, $p7Id, 'P7-MTC', 'Mathematics');
$p7Sci = getOrInsertSubject($db, $p7Id, 'P7-SCI', 'Integrated Science');
$p7Sst = getOrInsertSubject($db, $p7Id, 'P7-SST', 'Social Studies & R.E');

$pdfBaseDir = __DIR__ . '/../../storage/uploads/exams';

// ==========================================
// EXAM SET 1: Primary 6 Mid-Term 3 Examination Set (2026)
// ==========================================
$stmt = $db->prepare("
    INSERT INTO exam_sets (
        class_id, term_id, academic_year, exam_type, title, description, 
        instructions, grading_scheme_id, release_date, due_date, status, created_by
    ) VALUES (?, ?, '2026', 'mid_term', ?, ?, ?, ?, '2026-09-10', '2026-10-05', 'published', ?)
");
$stmt->execute([
    $p6Id,
    $termId,
    'Primary 6 Mid-Term 3 Comprehensive Examination Set 2026',
    'Official standardized Mid-Term Examination covering all 4 core subjects for Primary 6. Parents must download, print, and supervise candidate sitting under timed conditions.',
    '1. Download and print all 4 examination papers.\n2. Ensure the candidate attempts each paper in an uninterrupted quiet sitting (2h 15m each).\n3. Use the official Marking Guide to mark scripts.\n4. Enter raw marks (0-100) into the Parent Exam Portal for automated UNEB Division grading.',
    $schemeId,
    $officerId
]);
$p6SetId = (int)$db->lastInsertId();

$p6Papers = [
    [
        'subject_id' => $p6Eng,
        'code' => 'P6-ENG-M3',
        'title' => 'Primary 6 English Language Paper 1',
        'pdf' => 'p6_midterm3_english_paper.pdf',
        'guide' => 'p6_midterm3_english_marking_guide.pdf',
        'order' => 1,
        'questions' => [
            ['q' => 'Fill in the blank with the correct preposition: She was accused _____ stealing the textbook.', 'marks' => 2],
            ['q' => 'Re-write using "...neither...nor...": Musa did not go to school. Kato did not go to school.', 'marks' => 4],
            ['q' => 'Give the plural form of: "Chief of Staff" and "Mother-in-law".', 'marks' => 4],
            ['q' => 'Composition: Write a letter to your homeschooling teacher explaining your study timetable for Term 3.', 'marks' => 40, 'sub' => ['Format & Address: 10m', 'Content & Paragraphing: 15m', 'Grammar & Punctuation: 15m']]
        ]
    ],
    [
        'subject_id' => $p6Mtc,
        'code' => 'P6-MTC-M3',
        'title' => 'Primary 6 Mathematics Paper 1',
        'pdf' => 'p6_midterm3_maths_paper.pdf',
        'guide' => 'p6_midterm3_maths_marking_guide.pdf',
        'order' => 2,
        'questions' => [
            ['q' => 'Simplify: (3/4 + 1/2) divided by 5/8.', 'marks' => 5],
            ['q' => 'Find the base area of a cylinder with radius 7cm and height 10cm. (Take pi = 22/7)', 'marks' => 5],
            ['q' => 'Solve the algebraic equation: 3(2x - 4) = 4x + 8.', 'marks' => 6],
            ['q' => 'Calculate the simple interest on UGX 500,000 invested at 12% per annum for 3 years.', 'marks' => 10]
        ]
    ],
    [
        'subject_id' => $p6Sci,
        'code' => 'P6-SCI-M3',
        'title' => 'Primary 6 Integrated Science Paper 1',
        'pdf' => 'p6_midterm3_science_paper.pdf',
        'guide' => 'p6_midterm3_science_marking_guide.pdf',
        'order' => 3,
        'questions' => [
            ['q' => 'State two differences between complete and incomplete metamorphosis in insects.', 'marks' => 4],
            ['q' => 'Explain the function of red blood cells in the human circulatory system.', 'marks' => 4],
            ['q' => 'Describe three methods of conserving soil fertility in tropical farming.', 'marks' => 6],
            ['q' => 'Draw and label the female reproductive parts of a flowering plant (pistil).', 'marks' => 10]
        ]
    ],
    [
        'subject_id' => $p6Sst,
        'code' => 'P6-SST-M3',
        'title' => 'Primary 6 Social Studies & Religious Education Paper 1',
        'pdf' => 'p6_midterm3_sst_paper.pdf',
        'guide' => 'p6_midterm3_sst_marking_guide.pdf',
        'order' => 4,
        'questions' => [
            ['q' => 'Explain why the Nile Valley has a high population density.', 'marks' => 4],
            ['q' => 'State three economic benefits of the East African Community (EAC) integration.', 'marks' => 6],
            ['q' => 'Identify two characteristics of pastoral communities in Uganda.', 'marks' => 4],
            ['q' => 'R.E Section: What lesson can modern youth learn from the story of the Good Samaritan?', 'marks' => 6]
        ]
    ]
];

$paperMapP6 = [];
foreach ($p6Papers as $p) {
    $pdfRelPath = 'storage/uploads/exams/' . $p['pdf'];
    $guideRelPath = 'storage/uploads/exams/' . $p['guide'];
    
    // Generate actual PDF files
    createSimpleExamPdf($pdfBaseDir . '/' . $p['pdf'], $p['title'], 'Primary 6 Core', 'Primary 6', 'OFFICIAL EXAM QUESTION PAPER', $p['questions']);
    createSimpleExamPdf($pdfBaseDir . '/' . $p['guide'], $p['title'] . ' - MARKING GUIDE', 'Primary 6 Core', 'Primary 6', 'OFFICIAL MARKING SCHEME & SCORING KEY', $p['questions']);

    $stmt = $db->prepare("
        INSERT INTO exam_papers (
            exam_set_id, subject_id, paper_code, title, duration_minutes,
            total_marks, pdf_file_path, marking_guide_pdf_path, paper_order, instructions
        ) VALUES (?, ?, ?, ?, 135, 100.00, ?, ?, ?, 'Answer all questions. Show working clearly.')
    ");
    $stmt->execute([
        $p6SetId,
        $p['subject_id'],
        $p['code'],
        $p['title'],
        $pdfRelPath,
        $guideRelPath,
        $p['order']
    ]);
    $paperMapP6[$p['code']] = (int)$db->lastInsertId();
}
echo "[OK] Created P6 Mid-Term Exam Set with 4 Papers and PDFs.\n";

// ==========================================
// EXAM SET 2: Primary 3 Mid-Term 3 Exam Set (2026)
// ==========================================
$stmt = $db->prepare("
    INSERT INTO exam_sets (
        class_id, term_id, academic_year, exam_type, title, description, 
        instructions, grading_scheme_id, release_date, due_date, status, created_by
    ) VALUES (?, ?, '2026', 'mid_term', ?, ?, ?, ?, '2026-09-12', '2026-10-05', 'published', ?)
");
$stmt->execute([
    $p3Id,
    $termId,
    'Primary 3 Mid-Term 3 Foundational Exam Set 2026',
    'Primary 3 Foundation Assessment Set covering English, Mathematics, Literacy I and Literacy II.',
    'Parent supervision required. Read instructions aloud where necessary for young learners.',
    $schemeId,
    $officerId
]);
$p3SetId = (int)$db->lastInsertId();

$p3Papers = [
    ['subject_id' => $p3Eng, 'code' => 'P3-ENG-M3', 'title' => 'Primary 3 English Paper', 'pdf' => 'p3_english.pdf', 'guide' => 'p3_english_guide.pdf', 'order' => 1],
    ['subject_id' => $p3Mtc, 'code' => 'P3-MTC-M3', 'title' => 'Primary 3 Mathematics Paper', 'pdf' => 'p3_math.pdf', 'guide' => 'p3_math_guide.pdf', 'order' => 2],
    ['subject_id' => $p3Lit1, 'code' => 'P3-LIT1-M3', 'title' => 'Primary 3 Literacy I Paper', 'pdf' => 'p3_lit1.pdf', 'guide' => 'p3_lit1_guide.pdf', 'order' => 3],
    ['subject_id' => $p3Lit2, 'code' => 'P3-LIT2-M3', 'title' => 'Primary 3 Literacy II Paper', 'pdf' => 'p3_lit2.pdf', 'guide' => 'p3_lit2_guide.pdf', 'order' => 4],
];

$paperMapP3 = [];
foreach ($p3Papers as $p) {
    $pdfRelPath = 'storage/uploads/exams/' . $p['pdf'];
    $guideRelPath = 'storage/uploads/exams/' . $p['guide'];

    createSimpleExamPdf($pdfBaseDir . '/' . $p['pdf'], $p['title'], 'Primary 3 Foundation', 'Primary 3', 'EXAMINATION PAPER', [
        ['q' => 'Name two domestic animals kept at home.', 'marks' => 2],
        ['q' => 'Write in words: 450.', 'marks' => 2],
        ['q' => 'Draw a clean water container.', 'marks' => 4]
    ]);
    createSimpleExamPdf($pdfBaseDir . '/' . $p['guide'], $p['title'] . ' (Guide)', 'Primary 3 Foundation', 'Primary 3', 'MARKING GUIDE', [
        ['q' => 'Domestic animals: Cow, Goat, Dog, Cat.', 'marks' => 2],
        ['q' => 'Four hundred fifty / Four hundred and fifty.', 'marks' => 2]
    ]);

    $stmt = $db->prepare("
        INSERT INTO exam_papers (
            exam_set_id, subject_id, paper_code, title, duration_minutes,
            total_marks, pdf_file_path, marking_guide_pdf_path, paper_order, instructions
        ) VALUES (?, ?, ?, ?, 90, 100.00, ?, ?, ?, 'Answer all questions.')
    ");
    $stmt->execute([
        $p3SetId,
        $p['subject_id'],
        $p['code'],
        $p['title'],
        $pdfRelPath,
        $guideRelPath,
        $p['order']
    ]);
    $paperMapP3[$p['code']] = (int)$db->lastInsertId();
}
echo "[OK] Created P3 Mid-Term Exam Set with 4 Papers and PDFs.\n";

// ==========================================
// EXAM SET 3: Primary 7 National Mock PLE Simulation 2026
// ==========================================
$stmt = $db->prepare("
    INSERT INTO exam_sets (
        class_id, term_id, academic_year, exam_type, title, description, 
        instructions, grading_scheme_id, release_date, due_date, status, created_by
    ) VALUES (?, ?, '2026', 'mock_ple', ?, ?, ?, ?, '2026-09-15', '2026-10-15', 'published', ?)
");
$stmt->execute([
    $p7Id,
    $termId,
    'Primary 7 National Mock PLE Examination Series 2026',
    'Full UNEB PLE Standardized Mock Simulation for Candidate Primary 7 Homeschoolers.',
    'Strict examination conditions apply. Timed 2h 15m per paper.',
    $schemeId,
    $officerId
]);
$p7SetId = (int)$db->lastInsertId();

$p7Papers = [
    ['subject_id' => $p7Eng, 'code' => 'P7-ENG-MOCK', 'title' => 'P7 UNEB Mock English Paper', 'pdf' => 'p7_mock_eng.pdf', 'guide' => 'p7_mock_eng_guide.pdf', 'order' => 1],
    ['subject_id' => $p7Mtc, 'code' => 'P7-MTC-MOCK', 'title' => 'P7 UNEB Mock Mathematics Paper', 'pdf' => 'p7_mock_mtc.pdf', 'guide' => 'p7_mock_mtc_guide.pdf', 'order' => 2],
    ['subject_id' => $p7Sci, 'code' => 'P7-SCI-MOCK', 'title' => 'P7 UNEB Mock Integrated Science Paper', 'pdf' => 'p7_mock_sci.pdf', 'guide' => 'p7_mock_sci_guide.pdf', 'order' => 3],
    ['subject_id' => $p7Sst, 'code' => 'P7-SST-MOCK', 'title' => 'P7 UNEB Mock Social Studies & R.E Paper', 'pdf' => 'p7_mock_sst.pdf', 'guide' => 'p7_mock_sst_guide.pdf', 'order' => 4],
];
foreach ($p7Papers as $p) {
    $pdfRelPath = 'storage/uploads/exams/' . $p['pdf'];
    $guideRelPath = 'storage/uploads/exams/' . $p['guide'];

    createSimpleExamPdf($pdfBaseDir . '/' . $p['pdf'], $p['title'], 'Primary 7 UNEB Mock', 'Primary 7', 'NATIONAL MOCK EXAM', [
        ['q' => 'Section A: Grammar & Vocabulary Comprehension', 'marks' => 50],
        ['q' => 'Section B: Guided Composition Writing', 'marks' => 50]
    ]);
    createSimpleExamPdf($pdfBaseDir . '/' . $p['guide'], $p['title'] . ' (Guide)', 'Primary 7 UNEB Mock', 'Primary 7', 'MARKING GUIDE', [
        ['q' => 'Award full marks according to standard rubric.', 'marks' => 100]
    ]);

    $stmt = $db->prepare("
        INSERT INTO exam_papers (
            exam_set_id, subject_id, paper_code, title, duration_minutes,
            total_marks, pdf_file_path, marking_guide_pdf_path, paper_order, instructions
        ) VALUES (?, ?, ?, ?, 135, 100.00, ?, ?, ?, 'Standard UNEB instructions apply.')
    ");
    $stmt->execute([
        $p7SetId,
        $p['subject_id'],
        $p['code'],
        $p['title'],
        $pdfRelPath,
        $guideRelPath,
        $p['order']
    ]);
}
echo "[OK] Created P7 National Mock PLE Exam Set with 4 Papers and PDFs.\n";

// ==========================================
// 4. Seed Sample Exam Submissions & Marks for Learners
// ==========================================
// Find Parent Sarah Namubiru and her learners
$parentSarah = $db->query("SELECT p.parent_id, p.user_id FROM parents p JOIN users u ON p.user_id = u.user_id WHERE u.email = 'parent.namubiru@tmhis.org' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$parentSarah) {
    $parentSarah = $db->query("SELECT parent_id, user_id FROM parents LIMIT 1")->fetch(PDO::FETCH_ASSOC);
}
$parentId = (int)$parentSarah['parent_id'];
$parentUserId = (int)$parentSarah['user_id'];

// Find Brian Ssenyonjo (P6)
$brian = $db->query("SELECT learner_id FROM learners WHERE parent_id = $parentId AND (full_name LIKE '%Brian%' OR class_id = $p6Id) LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$brianId = $brian ? (int)$brian['learner_id'] : null;

// Find Joy Kirabo (P3)
$joy = $db->query("SELECT learner_id FROM learners WHERE parent_id = $parentId AND (full_name LIKE '%Joy%' OR class_id = $p3Id) LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$joyId = $joy ? (int)$joy['learner_id'] : null;

// Brian P6 Submission: Excellent Division 1 result (D1 in English 92%, D1 in Math 94%, D2 in Science 86%, D1 in SST 91% -> Total Agg: 1+1+2+1 = 5 -> Division I)
if ($brianId && $p6SetId) {
    $stmt = $db->prepare("
        INSERT INTO exam_submissions (
            exam_set_id, learner_id, parent_id, sitting_date,
            total_raw_marks, total_possible_marks, average_percentage,
            total_aggregate, division, status, parent_remarks, teacher_remarks
        ) VALUES (?, ?, ?, '2026-09-14', 363.00, 400.00, 90.75, 5, 'I', 'submitted', 'Brian sat all four papers with diligence and quiet concentration.', 'Outstanding performance! Strong mathematical and scientific mastery.')
    ");
    $stmt->execute([$p6SetId, $brianId, $parentId]);
    $subId = (int)$db->lastInsertId();

    $marks = [
        ['code' => 'P6-ENG-M3', 'subj' => $p6Eng, 'score' => 92.00, 'pt' => 1, 'lbl' => 'D1', 'rem' => 'Superb composition & grammar'],
        ['code' => 'P6-MTC-M3', 'subj' => $p6Mtc, 'score' => 94.00, 'pt' => 1, 'lbl' => 'D1', 'rem' => 'Excellent algebraic calculations'],
        ['code' => 'P6-SCI-M3', 'subj' => $p6Sci, 'score' => 86.00, 'pt' => 2, 'lbl' => 'D2', 'rem' => 'Great understanding of plant biology'],
        ['code' => 'P6-SST-M3', 'subj' => $p6Sst, 'score' => 91.00, 'pt' => 1, 'lbl' => 'D1', 'rem' => 'Comprehensive East African map work']
    ];

    foreach ($marks as $m) {
        $paperId = $paperMapP6[$m['code']] ?? null;
        if ($paperId) {
            $stmt = $db->prepare("
                INSERT INTO exam_marks (
                    submission_id, exam_paper_id, subject_id, raw_score, max_marks,
                    percentage, grade_point, grade_label, is_absent, remarks, entered_by
                ) VALUES (?, ?, ?, ?, 100.00, ?, ?, ?, 0, ?, ?)
            ");
            $stmt->execute([
                $subId,
                $paperId,
                $m['subj'],
                $m['score'],
                $m['score'],
                $m['pt'],
                $m['lbl'],
                $m['rem'],
                $parentUserId
            ]);
        }
    }
    echo "[OK] Seeded Brian Ssenyonjo (P6) Division 1 Submission (Agg 5: D1, D1, D2, D1).\n";
}

// Joy Kirabo (P3) Submission: Division 1 (D2, D1, D1, D2 -> Agg 6 -> Div I)
if ($joyId && $p3SetId) {
    $stmt = $db->prepare("
        INSERT INTO exam_submissions (
            exam_set_id, learner_id, parent_id, sitting_date,
            total_raw_marks, total_possible_marks, average_percentage,
            total_aggregate, division, status, parent_remarks, teacher_remarks
        ) VALUES (?, ?, ?, '2026-09-15', 350.00, 400.00, 87.50, 6, 'I', 'submitted', 'Joy completed her foundation exam cheerfully.', 'Great foundation in Literacy and Numeracy.')
    ");
    $stmt->execute([$p3SetId, $joyId, $parentId]);
    $joySubId = (int)$db->lastInsertId();

    $joyMarks = [
        ['code' => 'P3-ENG-M3', 'subj' => $p3Eng, 'score' => 84.00, 'pt' => 2, 'lbl' => 'D2', 'rem' => 'Neat handwriting and spelling'],
        ['code' => 'P3-MTC-M3', 'subj' => $p3Mtc, 'score' => 92.00, 'pt' => 1, 'lbl' => 'D1', 'rem' => 'Excellent addition and word problems'],
        ['code' => 'P3-LIT1-M3', 'subj' => $p3Lit1, 'score' => 90.00, 'pt' => 1, 'lbl' => 'D1', 'rem' => 'Clear diagrams'],
        ['code' => 'P3-LIT2-M3', 'subj' => $p3Lit2, 'score' => 84.00, 'pt' => 2, 'lbl' => 'D2', 'rem' => 'Good social environment concepts']
    ];

    foreach ($joyMarks as $m) {
        $paperId = $paperMapP3[$m['code']] ?? null;
        if ($paperId) {
            $stmt = $db->prepare("
                INSERT INTO exam_marks (
                    submission_id, exam_paper_id, subject_id, raw_score, max_marks,
                    percentage, grade_point, grade_label, is_absent, remarks, entered_by
                ) VALUES (?, ?, ?, ?, 100.00, ?, ?, ?, 0, ?, ?)
            ");
            $stmt->execute([
                $joySubId,
                $paperId,
                $m['subj'],
                $m['score'],
                $m['score'],
                $m['pt'],
                $m['lbl'],
                $m['rem'],
                $parentUserId
            ]);
        }
    }
    echo "[OK] Seeded Joy Kirabo (P3) Division 1 Submission (Agg 6).\n";
}

echo "--- EXAM SEED COMPLETED SUCCESSFULLY ---\n";
