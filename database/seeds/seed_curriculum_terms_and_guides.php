<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

echo "--- SEEDING CURRICULUM TERMS, PARENTAL GUIDES & LEARNING SCHEDULES ---" . PHP_EOL;

$db = Database::getConnection();

// 1. Ensure foreign key column term_id exists on parental_guides and learning_schedules
try {
    $cols = $db->query("SHOW COLUMNS FROM parental_guides LIKE 'term_id'")->rowCount();
    if ($cols === 0) {
        $db->exec("ALTER TABLE parental_guides ADD COLUMN term_id BIGINT UNSIGNED NULL AFTER lesson_id, ADD CONSTRAINT fk_guide_term FOREIGN KEY (term_id) REFERENCES curriculum_terms(term_id) ON DELETE SET NULL");
    }
    $cols2 = $db->query("SHOW COLUMNS FROM learning_schedules LIKE 'term_id'")->rowCount();
    if ($cols2 === 0) {
        $db->exec("ALTER TABLE learning_schedules ADD COLUMN term_id BIGINT UNSIGNED NULL AFTER subject_id, ADD CONSTRAINT fk_sched_term FOREIGN KEY (term_id) REFERENCES curriculum_terms(term_id) ON DELETE SET NULL");
    }
} catch (Exception $e) {
    // Already exists
}

// 2. Seed Curriculum Terms (Ugandan Primary 2026 Calendar)
$termsData = [
    [
        'academic_year' => 2026,
        'term_number' => 1,
        'term_name' => 'Term 1',
        'start_date' => '2026-02-02',
        'end_date' => '2026-05-01',
        'is_current' => 0
    ],
    [
        'academic_year' => 2026,
        'term_number' => 2,
        'term_name' => 'Term 2',
        'start_date' => '2026-05-25',
        'end_date' => '2026-08-21',
        'is_current' => 0
    ],
    [
        'academic_year' => 2026,
        'term_number' => 3,
        'term_name' => 'Term 3',
        'start_date' => '2026-09-14',
        'end_date' => '2026-12-04',
        'is_current' => 1
    ]
];

$termIds = [];
$termStmt = $db->prepare("
    INSERT INTO curriculum_terms (academic_year, term_number, term_name, start_date, end_date, is_current)
    VALUES (:year, :number, :name, :start, :end, :current)
    ON DUPLICATE KEY UPDATE term_name = VALUES(term_name), start_date = VALUES(start_date), end_date = VALUES(end_date), is_current = VALUES(is_current)
");

foreach ($termsData as $t) {
    $termStmt->execute([
        ':year' => $t['academic_year'],
        ':number' => $t['term_number'],
        ':name' => $t['term_name'],
        ':start' => $t['start_date'],
        ':end' => $t['end_date'],
        ':current' => $t['is_current']
    ]);
    $id = (int)$db->query("SELECT term_id FROM curriculum_terms WHERE academic_year = {$t['academic_year']} AND term_number = {$t['term_number']}")->fetchColumn();
    $termIds[$t['term_number']] = $id;
}
echo "✔ Seeded 3 Academic Terms for 2026 (Current: Term 3)" . PHP_EOL;

// 3. Resolve Officer and Admin
$officer = $db->query('SELECT officer_id, user_id FROM curriculum_officers LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$officerId = $officer ? (int)$officer['officer_id'] : 1;
$officerUserId = $officer ? (int)$officer['user_id'] : 6;

// 4. Seed Comprehensive Parental Guides across P1-P7
// Clean up previous test seed if any
$db->exec("DELETE FROM parental_guide_versions");
$db->exec("DELETE FROM parental_guides");

$guidesSeed = [
    [
        'class_level' => 1,
        'subject_pattern' => 'English Language',
        'lesson_pattern' => 'Phonics: Letter Sounds a, b, c, d',
        'term_number' => 1,
        'title' => 'Parent Guide: Teaching Letter Sounds a, b, c, d at Home',
        'education_level_target' => 'basic',
        'expected_duration_minutes' => 35,
        'learning_objectives' => "- Recognize the letter shapes of lowercase a, b, c, d\n- Pronounce individual letter sounds clearly using phonics songs\n- Identify 3 common household objects starting with each sound (e.g. apple, ball, cup, dog)",
        'materials_needed' => "Plain paper sheets, marker pen or crayons, real household items (apple/spoon/cup/ball), bottle caps for letter counters.",
        'suggested_steps' => "### Step 1: Warm-up & Sound Song (5 mins)\nSing the phonics rhyme: 'a is for apple /a/ /a/ apple'. Have your child clap each time they make the sound.\n\n### Step 2: Shape Tracing (10 mins)\nDraw large letters on paper. Guide your child's index finger along the letter strokes in air and on paper.\n\n### Step 3: Treasure Hunt (10 mins)\nPlace objects around the room. Ask: 'Find something that begins with /b/!' Reward every correct find with praise.\n\n### Step 4: CVC Sound Blending (10 mins)\nBlend simple 3-letter combinations like c-a-t and b-a-g with bottle cap tokens.",
        'common_mistakes' => "- Saying the letter names (Ay, Bee, See) instead of the phonic sound (/æ/, /b/, /k/).\n- Rushing sound blending before the child recognizes single letters.\n- Overcorrecting; encourage phonetic attempts with positive praise.",
        'assessment_checklist' => "[] Child clearly articulates /a/, /b/, /k/, /d/ without adding extra vowel sounds\n[] Child correctly points to 'b' when asked to show /b/\n[] Child identifies at least 2 home objects per letter sound",
        'guide_body' => "## NCDC Primary 1 Literacy Phonics Foundation\nThis guide equips parents to build early English reading readiness through multi-sensory home interactions. Focus on phonetic sounds over rote memorization.",
        'status' => 'published',
        'version' => 2
    ],
    [
        'class_level' => 1,
        'subject_pattern' => 'Literacy 1',
        'lesson_pattern' => 'Personal Hygiene and Handwashing Steps',
        'term_number' => 1,
        'title' => 'Parent Guide: Daily Hygiene & 7-Step Handwashing Routine',
        'education_level_target' => 'basic',
        'expected_duration_minutes' => 30,
        'learning_objectives' => "- Explain why washing hands with clean running water and soap prevents illness\n- Demonstrate the 7 critical steps of proper handwashing\n- Establish a daily hygiene checklist at home",
        'materials_needed' => "Clean water jug (Tippy Tap or tap), hand soap, clean hand towel, chart paper for hygiene stars.",
        'suggested_steps' => "### Step 1: The Invisible Germs Demonstration (5 mins)\nSprinkle a pinch of flour or talcum powder on hands to show how germs spread to toys and food.\n\n### Step 2: 7-Step Handwashing Song (15 mins)\nSing 'Wash, wash, wash your hands' for 20 seconds while scrubbing: palms, back of hands, between fingers, thumbs, fingernails, and wrists.\n\n### Step 3: Practical Routine (10 mins)\nPractice handwashing before meals and after bathroom visits. Award a star on the family chart.",
        'common_mistakes' => "- Rinsing with water alone without soap.\n- Washing for fewer than 20 seconds.\n- Drying hands on unclean clothing instead of a fresh towel.",
        'assessment_checklist' => "[] Child recalls at least 3 moments when hands must be washed\n[] Child executes all 7 handwashing steps independently\n[] Child washes hands without reminders before snacks",
        'guide_body' => "## Primary 1 Health & Community Literacy\nInstilling positive personal hygiene habits early protects families and fosters personal responsibility.",
        'status' => 'published',
        'version' => 1
    ],
    [
        'class_level' => 4,
        'subject_pattern' => 'Mathematics',
        'lesson_pattern' => 'Place Value',
        'term_number' => 3,
        'title' => 'Parent Guide: Mastering Place Value up to 100,000 using Abacus & Bundles',
        'education_level_target' => 'intermediate',
        'expected_duration_minutes' => 45,
        'learning_objectives' => "- Identify digits in Ones, Tens, Hundreds, Thousands, and Ten Thousands positions\n- Expand numbers into standard expanded form (e.g. 45,230 = 40,000 + 5,000 + 200 + 30)\n- Represent 5-digit numbers accurately on an abacus or bead frame",
        'materials_needed' => "Home-made abacus (wire/sticks and beads or bottle tops), number cards 0–9, grid notebook, beans/straws for bundle practice.",
        'suggested_steps' => "### Step 1: Base Ten Review (10 mins)\nReview bundling: 10 ones make 1 ten; 10 tens make 1 hundred; 10 hundreds make 1 thousand.\n\n### Step 2: The Value of Position (15 mins)\nWrite '54,321'. Cover digits and ask the value of '4' (4,000) versus '5' (50,000). Emphasize that position determines value.\n\n### Step 3: Expanded Notation Game (10 mins)\nDraw place value columns (TTh, Th, H, T, O). Dictate numbers from real-world Ugandan prices (e.g. 25,500 UGX for school shoes).\n\n### Step 4: Rapid Fire Quiz (10 mins)\nShow random 5-digit cards and have the learner call out the place value of underlined digits.",
        'common_mistakes' => "- Confusing 'Place Value' (e.g. Thousands) with 'Value of Digit' (e.g. 7,000).\n- Skipping zero placeholders in numbers like 40,502.\n- Reading 50,004 as fifty hundred four.",
        'assessment_checklist' => "[] Learner correctly states the place value of any digit in a 5-digit number\n[] Learner correctly writes expanded form without missing zeros\n[] Learner successfully builds numbers on the place value chart",
        'guide_body' => "## NCDC P4 Upper Primary Numeracy Milestone\nPlace value is the cornerstone of all multi-digit arithmetic, multiplication algorithms, and currency handling.",
        'status' => 'published',
        'version' => 3
    ],
    [
        'class_level' => 5,
        'subject_pattern' => 'Integrated Science',
        'lesson_pattern' => 'Digestive',
        'term_number' => 3,
        'title' => 'Parent Guide: The Human Digestive System & Enzyme Action',
        'education_level_target' => 'intermediate',
        'expected_duration_minutes' => 50,
        'learning_objectives' => "- Trace food transit through mouth, esophagus, stomach, small intestine, and large intestine\n- Explain the mechanical and chemical roles of teeth, saliva, and stomach acids\n- Relate good dietary habits and hydration to healthy digestion",
        'materials_needed' => "A slice of bread/cassava, transparent plastic bag, lemon juice or vinegar (representing stomach acid), water, pantyhose/sock (representing intestine filter).",
        'suggested_steps' => "### Step 1: Mouth & Chewing Experiment (10 mins)\nChew a piece of bread for 1 minute without swallowing. Note how it turns sweet as salivary amylase breaks starch into simple sugars.\n\n### Step 2: Stomach Churning Simulation (15 mins)\nPlace crushed biscuit/bread in a zip bag, add 2 spoons of lemon juice/water. Knead the bag for 3 minutes to demonstrate churning.\n\n### Step 3: Nutrient Absorption Demonstration (15 mins)\nPour the blended mixture into a mesh or sock over a bowl. Show how liquid nutrients pass through the villi while bulk fiber continues to large intestines.\n\n### Step 4: Diagram Labeling & Review (10 mins)\nHave learner sketch and label the alimentary canal from memory.",
        'common_mistakes' => "- Thinking digestion begins in the stomach rather than the mouth.\n- Confusing the liver's bile storage with enzyme digestion.\n- Omitting the role of dietary roughage in preventing constipation.",
        'assessment_checklist' => "[] Learner names 5 main digestive organs in correct sequence\n[] Learner explains difference between physical and chemical digestion\n[] Learner draws digestive tract with key glands (liver, pancreas)",
        'guide_body' => "## P5 Science: Biology & Human Health\nPractical home experiments bridge textbook diagrams with everyday physiological understanding.",
        'status' => 'published',
        'version' => 1
    ],
    [
        'class_level' => 7,
        'subject_pattern' => 'Mathematics',
        'lesson_pattern' => 'Linear',
        'term_number' => 3,
        'title' => 'Parent Guide: Solving Linear Equations & Word Problems in P7',
        'education_level_target' => 'advanced',
        'expected_duration_minutes' => 60,
        'learning_objectives' => "- Solve single-variable linear equations involving brackets and fractions\n- Formulate algebraic equations from everyday word scenarios\n- Check solutions systematically through backward substitution",
        'materials_needed' => "Grid notebook, ruler, two-pan balance or scale diagram.",
        'suggested_steps' => "### Step 1: The Balance Concept (10 mins)\nExplain that '=' means balanced scales. Whatever is added, subtracted, multiplied, or divided on the left must be done on the right.\n\n### Step 2: 3-Step Systematic Solving (20 mins)\n1. Expand brackets: 3(x + 4) = 24 -> 3x + 12 = 24\n2. Group like terms by inverse operations: 3x = 24 - 12 -> 3x = 12\n3. Divide by coefficient: x = 4\n\n### Step 3: Word Problem Translation (20 mins)\nAnalyze scenarios: 'Sarah is 4 years older than Kato. Their total age is 26. Find Kato\'s age.' Guide: Let Kato be x, Sarah is x+4; x + (x+4) = 26.\n\n### Step 4: Verification Check (10 mins)\nSubstitute x = 11 back into original problem statement.",
        'common_mistakes' => "- Forgetting to multiply every term inside brackets by the outside coefficient.\n- Sign errors when moving terms across the '=' equal sign.\n- Giving final answer without verifying if it makes sense in the word context.",
        'assessment_checklist' => "[] Learner solves 3(2x - 1) = 21 accurately\n[] Learner constructs algebraic equations from word statements\n[] Learner checks result via substitution",
        'guide_body' => "## P7 Primary Leaving Examination (PLE) Preparation\nAlgebraic problem solving represents 15-20% of the PLE Mathematics paper.",
        'status' => 'published',
        'version' => 1
    ],
    [
        'class_level' => 3,
        'subject_pattern' => 'Science',
        'lesson_pattern' => 'Plant',
        'term_number' => 2,
        'title' => 'Parent Guide: Plant Parts, Seed Germination, and Soil Exploration',
        'education_level_target' => 'intermediate',
        'expected_duration_minutes' => 40,
        'learning_objectives' => "- Identify roots, stems, leaves, flowers, and fruits on garden plants\n- State conditions necessary for seed germination (Water, Oxygen, Warmth)\n- Conduct a 5-day bean germination test in a recycled container",
        'materials_needed' => "Bean seeds, clear plastic cup or bottle, cotton wool/soil, water, ruler for daily growth chart.",
        'suggested_steps' => "### Step 1: Backyard Plant Inspection (10 mins)\nWalk outside and observe different plants (maize, bean, flowering shrubs). Point out taproots vs fibrous roots.\n\n### Step 2: Setting Up the Germination Experiment (15 mins)\nPlace 4 bean seeds in moist cotton wool inside a transparent cup near a window.\n\n### Step 3: Science Journal Entry (15 mins)\nSet up a 7-day observation chart recording date, root appearance, shoot height, and leaf count.",
        'common_mistakes' => "- Overwatering seeds causing rotting.\n- Assuming seeds need direct harsh sunlight to germinate before leaves emerge.\n- Confusing monocotyledonous and dicotyledonous seedlings.",
        'assessment_checklist' => "[] Learner names 4 parts of a plant and their core functions\n[] Learner correctly lists WOW (Water, Oxygen, Warmth) factors\n[] Learner maintains daily germination log",
        'guide_body' => "## P3 Primary Science & Environmental Literacy\nHands-on gardening connections deepen children's environmental science comprehension.",
        'status' => 'published',
        'version' => 1
    ],
    [
        'class_level' => 6,
        'subject_pattern' => 'Social Studies',
        'lesson_pattern' => 'Climate',
        'term_number' => 3,
        'title' => 'Parent Guide: Climate Zones and Natural Vegetation of East Africa',
        'education_level_target' => 'advanced',
        'expected_duration_minutes' => 45,
        'learning_objectives' => "- Describe the 4 major climatic zones of East Africa (Equatorial, Tropical, Semi-Arid, Montane)\n- Relate human economic activities to local rainfall and vegetation belts\n- Interpret climate graphs showing monthly temperature and precipitation in Uganda",
        'materials_needed' => "Uganda and East Africa Physical Atlas, notebook, colored pencils.",
        'suggested_steps' => "### Step 1: Map Reading & Relief Exploration (15 mins)\nLocate Lake Victoria basin, Mt. Elgon, Rwenzori mountains, and Karamoja region on the map.\n\n### Step 2: Climate vs Weather Discussion (10 mins)\nClarify that weather is daily condition while climate is average over 30+ years.\n\n### Step 3: Case Study Analysis (15 mins)\nCompare dairy farming in Mbarara with tea growing in Fort Portal and pastoralism in Kotido.\n\n### Step 4: Summary Table (5 mins)\nComplete a matrix matching Zone -> Vegetation -> Crops -> District.",
        'common_mistakes' => "- Confusing equatorial climate (hot and wet all year) with semi-desert zones.\n- Misinterpreting relief rainfall on windward vs leeward slopes.",
        'assessment_checklist' => "[] Learner identifies 4 climate zones on an outline map of East Africa\n[] Learner explains why highlands receive more rainfall than rift valley plains\n[] Learner completes climate comparison matrix",
        'guide_body' => "## P6 Social Studies & Geography of East Africa\nUnderstanding regional climate patterns provides essential context for agriculture and civic development.",
        'status' => 'published',
        'version' => 1
    ],
    [
        'class_level' => 2,
        'subject_pattern' => 'Mathematics',
        'lesson_pattern' => 'Addition',
        'term_number' => 2,
        'title' => 'Parent Guide: 2-Digit Addition with Regrouping (Carrying)',
        'education_level_target' => 'basic',
        'expected_duration_minutes' => 35,
        'learning_objectives' => "- Add two 2-digit numbers where sum of ones column exceeds 9\n- Bundle 10 ones into 1 ten and carry it to the tens column\n- Solve practical market buying problems with coins/tokens",
        'materials_needed' => "Matchsticks/straws tied in bundles of 10, loose sticks for ones, place value mat.",
        'suggested_steps' => "### Step 1: Concrete Modeling (15 mins)\nSet up 28 + 15 using 2 bundles + 8 loose sticks and 1 bundle + 5 loose sticks. Combine loose sticks to get 13. Bundle 10 and move to tens pile.\n\n### Step 2: Written Column Algorithm (10 mins)\nWrite tens and ones columns on paper. Write 3 in ones answer, carry 1 ten to the top of tens column.\n\n### Step 3: Fun Market Roleplay (10 mins)\nPlay shopkeeper buying items worth 25 UGX and 37 UGX.",
        'common_mistakes' => "- Writing the whole number 13 in the ones column.\n- Forgetting to add the carried 1 in the tens column.\n- Adding tens column first from left to right.",
        'assessment_checklist' => "[] Child correctly regroups 10 ones into 1 ten with physical objects\n[] Child records carried digit on top of tens column\n[] Child calculates 3 practice problems accurately",
        'guide_body' => "## P2 Early Mathematics & Numeracy\nPhysical regrouping using familiar local counters prevents algorithmic confusion.",
        'status' => 'draft',
        'version' => 1
    ]
];

$guideInsertStmt = $db->prepare("
    INSERT INTO parental_guides (
        subject_id, class_id, lesson_id, term_id, officer_id, created_by,
        title, guide_body, learning_objectives, suggested_steps, common_mistakes,
        materials_needed, expected_duration_minutes, assessment_checklist,
        education_level_target, status, published_at
    ) VALUES (
        :subject_id, :class_id, :lesson_id, :term_id, :officer_id, :created_by,
        :title, :guide_body, :learning_objectives, :suggested_steps, :common_mistakes,
        :materials_needed, :expected_duration_minutes, :assessment_checklist,
        :education_level_target, :status, :published_at
    )
");

$versionInsertStmt = $db->prepare("
    INSERT INTO parental_guide_versions (
        guide_id, version_number, guide_body, created_by, change_notes, created_at
    ) VALUES (
        :guide_id, :version_number, :guide_body, :created_by, :change_notes, NOW()
    )
");

$seededGuidesCount = 0;

foreach ($guidesSeed as $g) {
    // Find class
    $class = $db->query("SELECT class_id FROM classes WHERE level = {$g['class_level']} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$class) continue;
    $classId = (int)$class['class_id'];

    // Find subject
    $subj = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$classId} AND subject_name LIKE '%{$g['subject_pattern']}%' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$subj) {
        $subj = $db->query("SELECT subject_id FROM subjects WHERE class_id = {$classId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    }
    if (!$subj) continue;
    $subjectId = (int)$subj['subject_id'];

    // Find lesson
    $lesson = $db->query("SELECT lesson_id FROM lessons WHERE subject_id = {$subjectId} AND lesson_title LIKE '%{$g['lesson_pattern']}%' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$lesson) {
        $lesson = $db->query("SELECT lesson_id FROM lessons WHERE subject_id = {$subjectId} LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    }
    $lessonId = $lesson ? (int)$lesson['lesson_id'] : null;

    $termId = $termIds[$g['term_number']] ?? null;
    $publishedAt = ($g['status'] === 'published') ? date('Y-m-d H:i:s') : null;

    $guideInsertStmt->execute([
        ':subject_id' => $subjectId,
        ':class_id' => $classId,
        ':lesson_id' => $lessonId,
        ':term_id' => $termId,
        ':officer_id' => $officerId,
        ':created_by' => $officerUserId,
        ':title' => $g['title'],
        ':guide_body' => $g['guide_body'],
        ':learning_objectives' => $g['learning_objectives'],
        ':suggested_steps' => $g['suggested_steps'],
        ':common_mistakes' => $g['common_mistakes'],
        ':materials_needed' => $g['materials_needed'],
        ':expected_duration_minutes' => $g['expected_duration_minutes'],
        ':assessment_checklist' => $g['assessment_checklist'],
        ':education_level_target' => $g['education_level_target'],
        ':status' => $g['status'],
        ':published_at' => $publishedAt
    ]);

    $guideId = (int)$db->lastInsertId();
    $seededGuidesCount++;

    // Seed version snapshots for multi-version guides
    $versionsCount = $g['version'] ?? 1;
    for ($v = 1; $v <= $versionsCount; $v++) {
        $notes = ($v === 1) ? 'Initial NCDC curriculum approved draft' : 'Pedagogical refinement with updated home activity steps';
        $versionBody = $g['guide_body'] . "\n\n*Edition {$v} Approved Content*";
        $versionInsertStmt->execute([
            ':guide_id' => $guideId,
            ':version_number' => $v,
            ':guide_body' => $versionBody,
            ':created_by' => $officerUserId,
            ':change_notes' => $notes
        ]);
    }
}

echo "✔ Seeded {$seededGuidesCount} comprehensive Parental Guides across P1–P7 & Terms with version history" . PHP_EOL;

// 5. Seed Demo Learning Schedules for active learners in Term 3 (September 2026)
$db->exec("DELETE FROM learning_schedules");

$learners = $db->query("SELECT learner_id, parent_id, class_id FROM learners WHERE status = 'active' LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
$currentTermId = $termIds[3] ?? null;

$schedInsertStmt = $db->prepare("
    INSERT INTO learning_schedules (
        learner_id, lesson_id, subject_id, term_id, scheduled_date,
        start_time, end_time, status, notes, created_by
    ) VALUES (
        :learner_id, :lesson_id, :subject_id, :term_id, :scheduled_date,
        :start_time, :end_time, :status, :notes, :created_by
    )
");

$seededSchedCount = 0;
$dates = [
    '2026-09-14' => ['time' => '09:00:00', 'end' => '09:45:00', 'status' => 'completed', 'note' => 'Covered introduction successfully'],
    '2026-09-15' => ['time' => '10:00:00', 'end' => '10:40:00', 'status' => 'completed', 'note' => 'Practical worksheet completed'],
    '2026-09-16' => ['time' => '09:00:00', 'end' => '09:50:00', 'status' => 'completed', 'note' => 'Active today session'],
    '2026-09-17' => ['time' => '09:00:00', 'end' => '09:45:00', 'status' => 'planned', 'note' => 'Planned for tomorrow morning'],
    '2026-09-18' => ['time' => '11:00:00', 'end' => '11:45:00', 'status' => 'planned', 'note' => 'Friday review session']
];

foreach ($learners as $l) {
    $learnerId = (int)$l['learner_id'];
    $parentId = (int)$l['parent_id'];
    $classId = (int)$l['class_id'];

    // Get parent's user_id
    $parentUser = $db->query("SELECT user_id FROM parents WHERE parent_id = {$parentId}")->fetch(PDO::FETCH_ASSOC);
    $creatorUserId = $parentUser ? (int)$parentUser['user_id'] : 8;

    // Get lessons for this learner's class
    $lessons = $db->query("SELECT lesson_id, subject_id FROM lessons WHERE class_id = {$classId} ORDER BY sequence_number LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);

    $i = 0;
    foreach ($dates as $dateStr => $dInfo) {
        $lessonItem = $lessons[$i % count($lessons)] ?? null;
        if (!$lessonItem) continue;

        $schedInsertStmt->execute([
            ':learner_id' => $learnerId,
            ':lesson_id' => (int)$lessonItem['lesson_id'],
            ':subject_id' => (int)$lessonItem['subject_id'],
            ':term_id' => $currentTermId,
            ':scheduled_date' => $dateStr,
            ':start_time' => $dInfo['time'],
            ':end_time' => $dInfo['end'],
            ':status' => $dInfo['status'],
            ':notes' => $dInfo['note'],
            ':created_by' => $creatorUserId
        ]);
        $seededSchedCount++;
        $i++;
    }
}

echo "✔ Seeded {$seededSchedCount} weekly learning schedules for active learners mapped to Term 3" . PHP_EOL;
echo "--- MODULE 05 SEEDING COMPLETE ---" . PHP_EOL;
