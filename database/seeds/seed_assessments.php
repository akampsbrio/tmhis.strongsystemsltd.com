<?php
declare(strict_types=1);

/**
 * Seed Curriculum Assessments for TMHIS Primary Education (P1–P7)
 * Author: TMHIS System Development Team
 */

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

$db = Database::getConnection();

echo "--- SEEDING CURRICULUM ASSESSMENTS FOR TMHIS ---\n";

// 1. Fetch Curriculum Officer & Admin for created_by
$officer = $db->query("SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_code IN ('curriculum_officer', 'administrator') LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$officerId = $officer ? (int)$officer['user_id'] : 1;

// 2. Fetch Classes and Subjects
$classes = $db->query("SELECT class_id, class_code, class_name FROM classes ORDER BY class_id")->fetchAll(PDO::FETCH_ASSOC);
$p6 = null;
$p3 = null;
foreach ($classes as $c) {
    if ($c['class_code'] === 'P6' || $c['class_name'] === 'Primary 6') $p6 = (int)$c['class_id'];
    if ($c['class_code'] === 'P3' || $c['class_name'] === 'Primary 3') $p3 = (int)$c['class_id'];
}
$p6 = $p6 ?: 6;
$p3 = $p3 ?: 3;

// Fetch subjects for P6
$p6Subjects = $db->query("SELECT subject_id, subject_name, subject_code FROM subjects WHERE class_id = $p6")->fetchAll(PDO::FETCH_ASSOC);
$subjMap = [];
foreach ($p6Subjects as $s) {
    $subjMap[$s['subject_name']] = (int)$s['subject_id'];
    $subjMap[$s['subject_code']] = (int)$s['subject_id'];
}

$mathId = $subjMap['Mathematics'] ?? $subjMap['P6-MTC'] ?? null;
$sciId = $subjMap['Integrated Science'] ?? $subjMap['P6-SCI'] ?? null;
$engId = $subjMap['English Language'] ?? $subjMap['P6-ENG'] ?? null;
$sstId = $subjMap['Social Studies'] ?? $subjMap['P6-SST'] ?? null;

// Fallback if subjects not found
if (!$mathId) {
    $firstSubj = $db->query("SELECT subject_id FROM subjects LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $mathId = $firstSubj ? (int)$firstSubj['subject_id'] : 1;
    $sciId = $mathId;
    $engId = $mathId;
    $sstId = $mathId;
}

// Clear existing seeded assessments to ensure clean state
$db->exec("SET FOREIGN_KEY_CHECKS = 0");
$db->exec("TRUNCATE TABLE assessment_answers");
$db->exec("TRUNCATE TABLE assessment_results");
$db->exec("TRUNCATE TABLE assessment_attempts");
$db->exec("TRUNCATE TABLE assessment_options");
$db->exec("TRUNCATE TABLE assessment_questions");
$db->exec("TRUNCATE TABLE assessments");
$db->exec("SET FOREIGN_KEY_CHECKS = 1");

$assessments = [
    [
        'title' => 'P6 Mathematics: Place Value, Number Bases & Calculations',
        'class_id' => $p6,
        'subject_id' => $mathId,
        'assessment_type' => 'mixed',
        'instructions' => 'Read each question carefully. Write your answers clearly or select the best alternative. Calculators are NOT permitted.',
        'total_marks' => 30.00,
        'passing_marks' => 15.00,
        'time_limit_minutes' => 30,
        'status' => 'published',
        'questions' => [
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'What is the place value of the digit 4 in the number 458,230?',
                'marks' => 5.00,
                'explanation' => 'The place value order from right to left is: Ones (0), Tens (3), Hundreds (2), Thousands (8), Ten Thousands (5), Hundred Thousands (4).',
                'options' => [
                    ['label' => 'A', 'text' => 'Ten Thousands', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'Hundred Thousands', 'is_correct' => 1],
                    ['label' => 'C', 'text' => 'Millions', 'is_correct' => 0],
                    ['label' => 'D', 'text' => 'Thousands', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'Convert 13_ten (thirteen in base ten) to binary (base two).',
                'marks' => 5.00,
                'explanation' => '13 divided by 2 gives remainders: 13 = 8 + 4 + 0 + 1 = 1101 in base two.',
                'options' => [
                    ['label' => 'A', 'text' => '1100_two', 'is_correct' => 0],
                    ['label' => 'B', 'text' => '1101_two', 'is_correct' => 1],
                    ['label' => 'C', 'text' => '1110_two', 'is_correct' => 0],
                    ['label' => 'D', 'text' => '1011_two', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'true_false',
                'question_text' => 'The number 2 is the only even prime number.',
                'marks' => 4.00,
                'explanation' => '2 has only two factors (1 and 2), making it prime. All other even numbers are divisible by 2.',
                'options' => [
                    ['label' => 'A', 'text' => 'True', 'is_correct' => 1],
                    ['label' => 'B', 'text' => 'False', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'short_answer',
                'question_text' => 'Calculate the value of: 350 + (25 × 4).',
                'marks' => 6.00,
                'correct_text' => '450',
                'explanation' => 'By BODMAS, multiplication precedes addition: 25 × 4 = 100, then 350 + 100 = 450.',
                'options' => []
            ],
            [
                'question_type' => 'essay',
                'question_text' => 'A trader bought 5 sacks of sugar for UGX 200,000 each and sold all of them for UGX 1,250,000 total. Calculate the trader\'s profit and explain the calculation steps.',
                'marks' => 10.00,
                'explanation' => 'Total cost = 5 × 200,000 = 1,000,000 UGX. Selling price = 1,250,000 UGX. Profit = 1,250,000 - 1,000,000 = 250,000 UGX.',
                'options' => []
            ]
        ]
    ],
    [
        'title' => 'P6 Integrated Science: Electricity, Magnetism & Circulatory System',
        'class_id' => $p6,
        'subject_id' => $sciId,
        'assessment_type' => 'multiple_choice',
        'instructions' => 'Choose the most correct option for each question. All questions carry equal marks.',
        'total_marks' => 20.00,
        'passing_marks' => 10.00,
        'time_limit_minutes' => 20,
        'status' => 'published',
        'questions' => [
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'Which component of human blood is primarily responsible for transporting oxygen?',
                'marks' => 5.00,
                'explanation' => 'Red blood cells contain haemoglobin which combines with oxygen to form oxyhaemoglobin for transport to body tissues.',
                'options' => [
                    ['label' => 'A', 'text' => 'White Blood Cells', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'Blood Platelets', 'is_correct' => 0],
                    ['label' => 'C', 'text' => 'Red Blood Cells', 'is_correct' => 1],
                    ['label' => 'D', 'text' => 'Blood Plasma', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'What happens when two like magnetic poles (e.g. North and North) are brought close to each other?',
                'marks' => 5.00,
                'explanation' => 'The fundamental law of magnetism states that like poles repel each other, while unlike poles attract.',
                'options' => [
                    ['label' => 'A', 'text' => 'They attract each other', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'They repel each other', 'is_correct' => 1],
                    ['label' => 'C', 'text' => 'They become demagnetized', 'is_correct' => 0],
                    ['label' => 'D', 'text' => 'No force is experienced', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'Which of the following materials is a good conductor of electricity?',
                'marks' => 5.00,
                'explanation' => 'Copper is a metal with free moving electrons, making it an excellent electrical conductor.',
                'options' => [
                    ['label' => 'A', 'text' => 'Dry Wood', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'Plastic Ruler', 'is_correct' => 0],
                    ['label' => 'C', 'text' => 'Copper Wire', 'is_correct' => 1],
                    ['label' => 'D', 'text' => 'Rubber Band', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'Which blood vessel carries oxygenated blood from the lungs back to the left atrium of the heart?',
                'marks' => 5.00,
                'explanation' => 'The pulmonary vein is the unique vein in the human body that carries oxygenated blood from the lungs into the left atrium.',
                'options' => [
                    ['label' => 'A', 'text' => 'Vena Cava', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'Aorta', 'is_correct' => 0],
                    ['label' => 'C', 'text' => 'Pulmonary Artery', 'is_correct' => 0],
                    ['label' => 'D', 'text' => 'Pulmonary Vein', 'is_correct' => 1]
                ]
            ]
        ]
    ],
    [
        'title' => 'P6 Social Studies: The East African Community & Physical Features',
        'class_id' => $p6,
        'subject_id' => $sstId,
        'assessment_type' => 'mixed',
        'instructions' => 'Answer all questions in the sections below.',
        'total_marks' => 25.00,
        'passing_marks' => 12.00,
        'time_limit_minutes' => 25,
        'status' => 'published',
        'questions' => [
            [
                'question_type' => 'multiple_choice',
                'question_text' => 'Where is the official headquarters of the East African Community (EAC) located?',
                'marks' => 5.00,
                'explanation' => 'The East African Community secretariat and headquarters are situated in Arusha, Tanzania.',
                'options' => [
                    ['label' => 'A', 'text' => 'Nairobi, Kenya', 'is_correct' => 0],
                    ['label' => 'B', 'text' => 'Kampala, Uganda', 'is_correct' => 0],
                    ['label' => 'C', 'text' => 'Arusha, Tanzania', 'is_correct' => 1],
                    ['label' => 'D', 'text' => 'Kigali, Rwanda', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'true_false',
                'question_text' => 'Lake Victoria is the largest fresh water lake in Africa.',
                'marks' => 5.00,
                'explanation' => 'Lake Victoria is the largest tropical freshwater lake in the world and the largest in Africa, shared by Uganda, Kenya, and Tanzania.',
                'options' => [
                    ['label' => 'A', 'text' => 'True', 'is_correct' => 1],
                    ['label' => 'B', 'text' => 'False', 'is_correct' => 0]
                ]
            ],
            [
                'question_type' => 'short_answer',
                'question_text' => 'Name the highest mountain peak in East Africa.',
                'marks' => 5.00,
                'correct_text' => 'Mount Kilimanjaro',
                'explanation' => 'Mount Kilimanjaro in Tanzania is the highest peak in Africa at 5,895 meters above sea level.',
                'options' => []
            ],
            [
                'question_type' => 'essay',
                'question_text' => 'Explain three benefits that Uganda gains from being an active member of the East African Community (EAC).',
                'marks' => 10.00,
                'explanation' => 'Benefits include: 1) Wider market for agricultural produce, 2) Free movement of labor and goods, 3) Shared infrastructure projects like railway and electricity interconnectivity.',
                'options' => []
            ]
        ]
    ]
];

$stmtAssess = $db->prepare("
    INSERT INTO assessments (subject_id, class_id, assessment_type, title, instructions, total_marks, passing_marks, time_limit_minutes, created_by, date_created, published_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
");

$stmtQ = $db->prepare("
    INSERT INTO assessment_questions (assessment_id, question_type, question_text, marks, question_order, correct_text, explanation, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
");

$stmtOpt = $db->prepare("
    INSERT INTO assessment_options (question_id, option_label, option_text, is_correct, option_order)
    VALUES (?, ?, ?, ?, ?)
");

$seededCount = 0;
foreach ($assessments as $a) {
    $stmtAssess->execute([
        $a['subject_id'],
        $a['class_id'],
        $a['assessment_type'],
        $a['title'],
        $a['instructions'],
        $a['total_marks'],
        $a['passing_marks'],
        $a['time_limit_minutes'],
        $officerId,
        $a['status']
    ]);
    $assessmentId = (int)$db->lastInsertId();

    $qOrder = 1;
    foreach ($a['questions'] as $q) {
        $stmtQ->execute([
            $assessmentId,
            $q['question_type'],
            $q['question_text'],
            $q['marks'],
            $qOrder++,
            $q['correct_text'] ?? null,
            $q['explanation'] ?? null
        ]);
        $questionId = (int)$db->lastInsertId();

        if (!empty($q['options'])) {
            $optOrder = 1;
            foreach ($q['options'] as $opt) {
                $stmtOpt->execute([
                    $questionId,
                    $opt['label'],
                    $opt['text'],
                    $opt['is_correct'],
                    $optOrder++
                ]);
            }
        }
    }
    $seededCount++;
    echo "✔ Seeded Assessment: {$a['title']} (ID: $assessmentId)\n";
}

echo "\n--- SEEDING COMPLETE: $seededCount Assessments Created ---\n";
