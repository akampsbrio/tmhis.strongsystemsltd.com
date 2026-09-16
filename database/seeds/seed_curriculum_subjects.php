<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

echo "=== Seeding Ugandan Primary Curriculum (NCDC P1-P7) Subjects ===\n";

try {
    $db = Database::getConnection();

    // Fetch existing classes
    $classes = $db->query("SELECT class_id, class_code, class_name, level FROM classes ORDER BY level")->fetchAll(PDO::FETCH_ASSOC);
    if (empty($classes)) {
        die("Error: No classes found. Please run base schema migration first.\n");
    }

    $classMap = [];
    foreach ($classes as $c) {
        $classMap[$c['class_code']] = (int)$c['class_id'];
    }

    // Standard Ugandan Curriculum Subjects per Class
    $subjectsData = [
        // Primary 1 (Lower Primary Thematic)
        ['class' => 'P1', 'code' => 'P1-ENG', 'name' => 'English Language', 'desc' => 'Oral communication, phonics, vocabulary, and early reading skills.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P1', 'code' => 'P1-MTC', 'name' => 'Mathematics & Numeracy', 'desc' => 'Number recognition, basic operations, counting, and shapes.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P1', 'code' => 'P1-LIT1', 'name' => 'Literacy 1', 'desc' => 'Language structures, reading comprehension, and daily themes in local environment.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P1', 'code' => 'P1-LIT2', 'name' => 'Literacy 2', 'desc' => 'Writing skills, letter formation, storytelling, and cultural expressions.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P1', 'code' => 'P1-LL', 'name' => 'Local Language (Luganda/Area)', 'desc' => 'Mother tongue literacy, pronunciation, and local cultural proverbs.', 'lang' => 'Local Language', 'hours' => 3.0],
        ['class' => 'P1', 'code' => 'P1-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Bible stories, moral values, creation, love, and respect.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P1', 'code' => 'P1-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Pillars of Islam, Quran recitation, prophetic morals, and daily supplications.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P1', 'code' => 'P1-CAPE', 'name' => 'Physical Ed & Creative Arts', 'desc' => 'Motor skills, music, dance, gymnastics, and creative craft.', 'lang' => 'English', 'hours' => 3.0],

        // Primary 2
        ['class' => 'P2', 'code' => 'P2-ENG', 'name' => 'English Language', 'desc' => 'Sentence construction, reading fluency, spelling, and guided dialogues.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P2', 'code' => 'P2-MTC', 'name' => 'Mathematics & Numeracy', 'desc' => 'Addition, subtraction, basic measurements, time, and word problems.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P2', 'code' => 'P2-LIT1', 'name' => 'Literacy 1', 'desc' => 'Living things, sanitation, weather, and community roles.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P2', 'code' => 'P2-LIT2', 'name' => 'Literacy 2', 'desc' => 'Paragraph writing, dictation, creative rhymes, and composition.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P2', 'code' => 'P2-LL', 'name' => 'Local Language (Luganda/Area)', 'desc' => 'Reading local literature, grammar rules, and cultural customs.', 'lang' => 'Local Language', 'hours' => 3.0],
        ['class' => 'P2', 'code' => 'P2-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Jesus Christ ministry, parables, prayer life, and forgiveness.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P2', 'code' => 'P2-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Tawheed, Hadith basics, Wudhu, and Islamic etiquette.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P2', 'code' => 'P2-CAPE', 'name' => 'Physical Ed & Creative Arts', 'desc' => 'Drawing, traditional music instruments, athletics, and group games.', 'lang' => 'English', 'hours' => 3.0],

        // Primary 3
        ['class' => 'P3', 'code' => 'P3-ENG', 'name' => 'English Language', 'desc' => 'Grammar tenses, story composition, functional writing, and debates.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P3', 'code' => 'P3-MTC', 'name' => 'Mathematics', 'desc' => 'Multiplication tables, division, fractions, geometry, and money.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P3', 'code' => 'P3-LIT1', 'name' => 'Literacy 1', 'desc' => 'Environment, natural resources, agriculture, and hygiene.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P3', 'code' => 'P3-LIT2', 'name' => 'Literacy 2', 'desc' => 'Report writing, creative prose, and vocabulary expansion.', 'lang' => 'English', 'hours' => 4.0],
        ['class' => 'P3', 'code' => 'P3-LL', 'name' => 'Local Language (Luganda/Area)', 'desc' => 'Advanced mother tongue comprehension, idioms, and oral folklore.', 'lang' => 'Local Language', 'hours' => 3.0],
        ['class' => 'P3', 'code' => 'P3-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Ten Commandments, Christian living, worship, and honesty.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P3', 'code' => 'P3-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Salah practice, fasting in Ramadan, Zakat, and Quran surahs.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P3', 'code' => 'P3-CAPE', 'name' => 'Physical Ed & Creative Arts', 'desc' => 'Pottery, weaving, folk dances, team sports, and fitness.', 'lang' => 'English', 'hours' => 3.0],

        // Primary 4 (Transition to Upper Primary Core Subjects)
        ['class' => 'P4', 'code' => 'P4-ENG', 'name' => 'English Language', 'desc' => 'Parts of speech, comprehension passages, letter writing, and speech.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P4', 'code' => 'P4-MTC', 'name' => 'Mathematics', 'desc' => 'Set concepts, operations on whole numbers, decimals, and basic graphs.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P4', 'code' => 'P4-SCI', 'name' => 'Integrated Science', 'desc' => 'Human body, plant life, sanitation, vectors, and primary health care.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P4', 'code' => 'P4-SST', 'name' => 'Social Studies', 'desc' => 'Our District, geography, physical features, climate, and administration.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P4', 'code' => 'P4-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'God’s people, early church history, love in action, and service.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P4', 'code' => 'P4-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Articles of faith, ethics, Islamic history, and selected Surahs.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P4', 'code' => 'P4-KIS', 'name' => 'Kiswahili', 'desc' => 'Basic East African Kiswahili conversational phrases and vocabulary.', 'lang' => 'Kiswahili', 'hours' => 3.0],
        ['class' => 'P4', 'code' => 'P4-CAPE', 'name' => 'Creative Arts & Physical Ed', 'desc' => 'Visual art, music theory, gymnastics, ball games, and health habits.', 'lang' => 'English', 'hours' => 2.5],

        // Primary 5
        ['class' => 'P5', 'code' => 'P5-ENG', 'name' => 'English Language', 'desc' => 'Relative clauses, conditional clauses, vocabulary, formal correspondence.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P5', 'code' => 'P5-MTC', 'name' => 'Mathematics', 'desc' => 'Fractions, percentages, integers, algebra, angles, and ratios.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P5', 'code' => 'P5-SCI', 'name' => 'Integrated Science', 'desc' => 'Soil science, crop growing, domestic animals, matter & energy, first aid.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P5', 'code' => 'P5-SST', 'name' => 'Social Studies', 'desc' => 'Uganda our Country, ethnic groups, economic activities, transport & comms.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P5', 'code' => 'P5-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Hope, Holy Spirit, Christian sacraments, and integrity.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P5', 'code' => 'P5-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Pillars of Iman, Surah Al-Fatiha & Al-Baqarah excerpts, Akhlaq.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P5', 'code' => 'P5-KIS', 'name' => 'Kiswahili', 'desc' => 'Sentence building, greetings, shopping, and direction vocabulary.', 'lang' => 'Kiswahili', 'hours' => 3.0],

        // Primary 6
        ['class' => 'P6', 'code' => 'P6-ENG', 'name' => 'English Language', 'desc' => 'Direct/indirect speech, active/passive voice, debate rhetoric, essay writing.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P6', 'code' => 'P6-MTC', 'name' => 'Mathematics', 'desc' => 'Bases, speed/distance/time, finance, circle theorems, statistics.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P6', 'code' => 'P6-SCI', 'name' => 'Integrated Science', 'desc' => 'Sound, electricity, classification of animals, reproductive health, resources.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P6', 'code' => 'P6-SST', 'name' => 'Social Studies', 'desc' => 'East African Community, regional climate, trade, minerals, and regional bodies.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P6', 'code' => 'P6-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Christian witness, justice, human rights, and the Kingdom of God.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P6', 'code' => 'P6-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Caliphate history, Islamic jurisprudence fundamentals, and Surahs.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P6', 'code' => 'P6-KIS', 'name' => 'Kiswahili', 'desc' => 'Grammar tenses, proverbs (Methali), dialogue comprehension.', 'lang' => 'Kiswahili', 'hours' => 3.0],

        // Primary 7 (Candidate Class)
        ['class' => 'P7', 'code' => 'P7-ENG', 'name' => 'English Language', 'desc' => 'UNEB PLE prep: syntax, comprehension, functional letters, compositions.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P7', 'code' => 'P7-MTC', 'name' => 'Mathematics', 'desc' => 'Advanced arithmetic, coordinate geometry, probability, algebra, construction.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P7', 'code' => 'P7-SCI', 'name' => 'Integrated Science', 'desc' => 'Energy, light, mechanics, ecosystem, environmental conservation, human systems.', 'lang' => 'English', 'hours' => 6.0],
        ['class' => 'P7', 'code' => 'P7-SST', 'name' => 'Social Studies', 'desc' => 'Africa as a Continent, World affairs, democracy, colonization to independence.', 'lang' => 'English', 'hours' => 5.0],
        ['class' => 'P7', 'code' => 'P7-CRE', 'name' => 'Christian Religious Education (CRE)', 'desc' => 'Living as a Christian citizen, family life, peace, and spiritual maturity.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P7', 'code' => 'P7-IRE', 'name' => 'Islamic Religious Education (IRE)', 'desc' => 'Hajj pilgrimage, ethics in leadership, Islamic contributions to civilization.', 'lang' => 'English', 'hours' => 2.5],
        ['class' => 'P7', 'code' => 'P7-KIS', 'name' => 'Kiswahili', 'desc' => 'Advanced communication, East African trade terminology, and composition.', 'lang' => 'Kiswahili', 'hours' => 3.0],
    ];

    $stmtCheck = $db->prepare("SELECT subject_id FROM subjects WHERE subject_code = :code");
    $stmtInsert = $db->prepare("
        INSERT INTO subjects (
            class_id, subject_name, subject_code, description, 
            language_of_instruction, weekly_hours, is_active, created_at, updated_at
        ) VALUES (
            :class_id, :name, :code, :desc, 
            :lang, :hours, 1, NOW(), NOW()
        )
    ");
    $stmtUpdate = $db->prepare("
        UPDATE subjects SET 
            class_id = :class_id, subject_name = :name, description = :desc,
            language_of_instruction = :lang, weekly_hours = :hours, is_active = 1, updated_at = NOW()
        WHERE subject_code = :code
    ");

    $insertedCount = 0;
    $updatedCount = 0;

    foreach ($subjectsData as $s) {
        $classId = $classMap[$s['class']] ?? null;
        if (!$classId) {
            echo "Skipping {$s['code']}: Unknown class code {$s['class']}\n";
            continue;
        }

        $stmtCheck->execute([':code' => $s['code']]);
        $existingId = $stmtCheck->fetchColumn();

        $params = [
            ':class_id' => $classId,
            ':name' => $s['name'],
            ':code' => $s['code'],
            ':desc' => $s['desc'],
            ':lang' => $s['lang'],
            ':hours' => $s['hours']
        ];

        if ($existingId) {
            $stmtUpdate->execute($params);
            $updatedCount++;
        } else {
            $stmtInsert->execute($params);
            $insertedCount++;
        }
    }

    echo "✅ Successfully seeded curriculum subjects: {$insertedCount} inserted, {$updatedCount} updated.\n";
    $total = $db->query("SELECT count(*) FROM subjects")->fetchColumn();
    echo "Total active subjects in database: {$total}\n";

} catch (Throwable $e) {
    echo "❌ Seeding failed: " . $e->getMessage() . "\n";
    exit(1);
}
