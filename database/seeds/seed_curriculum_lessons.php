<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

echo "=== Seeding Ugandan Primary Curriculum (NCDC P1-P7) Lessons ===\n";

try {
    $db = Database::getConnection();

    // Query all subjects
    $subjects = $db->query("
        SELECT s.subject_id, s.subject_code, s.subject_name, s.class_id, c.class_code 
        FROM subjects s 
        JOIN classes c ON s.class_id = c.class_id 
        WHERE s.is_active = 1
        ORDER BY c.level, s.subject_code
    ")->fetchAll(PDO::FETCH_ASSOC);

    if (empty($subjects)) {
        die("Error: No subjects found. Run seed_curriculum_subjects.php first.\n");
    }

    $lessonsTemplates = [
        // P1 Mathematics
        'P1-MTC' => [
            ['title' => 'Counting Objects from 1 to 10', 'obj' => 'Learner should be able to count real objects (counters, bottle tops) up to 10 accurately.', 'dur' => 35, 'seq' => 1],
            ['title' => 'Recognising and Writing Numbers 1 to 5', 'obj' => 'Identify number symbols 1, 2, 3, 4, 5 and trace their correct strokes in workbooks.', 'dur' => 35, 'seq' => 2],
            ['title' => 'Recognising and Writing Numbers 6 to 10', 'obj' => 'Identify number symbols 6, 7, 8, 9, 10 and pair them with sets of objects.', 'dur' => 35, 'seq' => 3],
            ['title' => 'Comparing Groups: More Than and Less Than', 'obj' => 'Compare two groups of objects and use comparative language (more, fewer, equal).', 'dur' => 40, 'seq' => 4],
            ['title' => 'Basic Addition with Real Objects (Sum up to 10)', 'obj' => 'Combine two small collections of items and state the total count.', 'dur' => 40, 'seq' => 5],
            ['title' => 'Identifying Basic Shapes: Circle, Square, Triangle', 'obj' => 'Recognise geometric shapes in classroom and home items.', 'dur' => 35, 'seq' => 6],
        ],

        // P1 English Language
        'P1-ENG' => [
            ['title' => 'Greetings and Self-Introduction', 'obj' => 'Express polite greetings (Good morning, Hello) and state own name and age clearly.', 'dur' => 30, 'seq' => 1],
            ['title' => 'Phonics: Letter Sounds a, b, c, d', 'obj' => 'Produce the phonetic sounds /æ/, /b/, /k/, /d/ and name items starting with each sound.', 'dur' => 35, 'seq' => 2],
            ['title' => 'Common Classroom and Home Objects Vocabulary', 'obj' => 'Name at least 10 everyday objects in English with correct pronunciation.', 'dur' => 35, 'seq' => 3],
            ['title' => 'Following Simple Oral Instructions', 'obj' => 'Demonstrate comprehension of physical actions (Stand up, Sit down, Open your book).', 'dur' => 30, 'seq' => 4],
            ['title' => 'Three-Letter Phonic Words (C-V-C)', 'obj' => 'Blend simple consonant-vowel-consonant words (cat, dog, sun, pen).', 'dur' => 40, 'seq' => 5],
        ],

        // P1 Literacy 1
        'P1-LIT1' => [
            ['title' => 'Our Home and Family Members', 'obj' => 'Identify father, mother, brother, sister, baby and describe their helpful roles.', 'dur' => 35, 'seq' => 1],
            ['title' => 'Personal Hygiene and Handwashing Steps', 'obj' => 'Demonstrate effective handwashing with clean water and soap before meals.', 'dur' => 30, 'seq' => 2],
            ['title' => 'Domestic Animals and Their Uses', 'obj' => 'Distinguish cows, goats, hens, dogs and state how they assist the home.', 'dur' => 35, 'seq' => 3],
            ['title' => 'Clean Water and Safe Drinking Habits', 'obj' => 'Explain the danger of contaminated water and the importance of boiling water.', 'dur' => 35, 'seq' => 4],
        ],

        // P2 Mathematics
        'P2-MTC' => [
            ['title' => 'Place Values: Tens and Ones up to 50', 'obj' => 'Group counters into bundles of ten and loose ones, writing standard notation.', 'dur' => 40, 'seq' => 1],
            ['title' => 'Addition of Two-Digit Numbers without Regrouping', 'obj' => 'Set up vertical addition columns for tens and ones and compute totals.', 'dur' => 40, 'seq' => 2],
            ['title' => 'Subtraction of Single and Two-Digit Numbers', 'obj' => 'Perform take-away operations with concrete models and number lines.', 'dur' => 40, 'seq' => 3],
            ['title' => 'Telling Time to the Hour on Clock Faces', 'obj' => 'Read o’clock positions on analogue clocks (1:00, 4:00, 7:00).', 'dur' => 35, 'seq' => 4],
            ['title' => 'Ugandan Currency: Coins and Small Notes', 'obj' => 'Recognise 100, 200, 500 UGX coins and 1000 UGX note, solving simple buying tasks.', 'dur' => 40, 'seq' => 5],
        ],

        // P2 English
        'P2-ENG' => [
            ['title' => 'Using Singular and Plural Nouns (-s and -es)', 'obj' => 'Transform singular nouns to plurals (book/books, box/boxes, mango/mangoes).', 'dur' => 35, 'seq' => 1],
            ['title' => 'Action Words (Verbs in Present Continuous -ing)', 'obj' => 'Form sentences showing continuous actions (is playing, is writing, are reading).', 'dur' => 40, 'seq' => 2],
            ['title' => 'Describing Words (Adjectives: Colours and Sizes)', 'obj' => 'Use descriptive terms to expand simple sentences (a big red ball).', 'dur' => 35, 'seq' => 3],
            ['title' => 'Reading Short Story Passages Fluently', 'obj' => 'Read a 50-word leveled paragraph aloud and answer three comprehension questions.', 'dur' => 40, 'seq' => 4],
        ],

        // P3 Mathematics
        'P3-MTC' => [
            ['title' => 'Place Values up to Thousands (Hundreds, Tens, Ones)', 'obj' => 'Represent 4-digit numbers in figures, words, and expanded form.', 'dur' => 40, 'seq' => 1],
            ['title' => 'Multiplication Tables: 2, 3, 4, 5, and 10', 'obj' => 'Recall multiplication facts and model multiplication as repeated addition.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Introduction to Simple Fractions (Half, Quarter, Third)', 'obj' => 'Shade and identify fractional parts of geometric shapes and real objects.', 'dur' => 40, 'seq' => 3],
            ['title' => 'Measuring Lengths using Metres and Centimetres', 'obj' => 'Measure classroom objects using standard metre rulers and tape measures.', 'dur' => 40, 'seq' => 4],
            ['title' => 'Word Problems on Basic Operations', 'obj' => 'Translate real-world word problems into mathematical number sentences.', 'dur' => 45, 'seq' => 5],
        ],

        // P4 English Language
        'P4-ENG' => [
            ['title' => 'Nouns: Proper, Common, and Collective Nouns', 'obj' => 'Differentiate types of nouns and apply capitalisation rules correctly.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Tenses: Simple Past and Past Continuous', 'obj' => 'Construct accurate past tense sentences with regular and irregular verbs.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Punctuation: Capital Letters, Commas, and Question Marks', 'obj' => 'Punctuate unformatted dialogue paragraphs accurately.', 'dur' => 40, 'seq' => 3],
            ['title' => 'Friendly Letter Writing Structure', 'obj' => 'Draft a short personal letter to a friend including address, salutation, body, and sign-off.', 'dur' => 50, 'seq' => 4],
            ['title' => 'Reading Comprehension: Our Community Heroes', 'obj' => 'Extract main ideas, inference points, and vocabulary definitions from text.', 'dur' => 45, 'seq' => 5],
        ],

        // P4 Mathematics
        'P4-MTC' => [
            ['title' => 'Set Concepts: Types of Sets and Venn Diagrams', 'obj' => 'Define empty, equal, equivalent, and intersection sets with Venn representations.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Operations on Whole Numbers: Long Multiplication', 'obj' => 'Multiply 3-digit numbers by 2-digit numbers with proper column alignment.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Long Division with and without Remainders', 'obj' => 'Execute long division algorithms step-by-step verifying with multiplication.', 'dur' => 50, 'seq' => 3],
            ['title' => 'Fractions: Equivalent Fractions and Addition', 'obj' => 'Simplify proper fractions and compute sums of like and unlike fractions.', 'dur' => 45, 'seq' => 4],
            ['title' => 'Geometry: Angles (Acute, Right, Obtuse) and Triangles', 'obj' => 'Classify angles using protractor measurements and identify angle properties.', 'dur' => 40, 'seq' => 5],
            ['title' => 'Data Handling: Reading Bar Graphs and Picto-graphs', 'obj' => 'Interpret frequency tables and construct scaled bar graphs.', 'dur' => 40, 'seq' => 6],
        ],

        // P4 Integrated Science
        'P4-SCI' => [
            ['title' => 'Human Digestive System: Organs and Functions', 'obj' => 'Trace the passage of food through the alimentary canal and explain enzyme action.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Plant Germination: Conditions and Seed Structure', 'obj' => 'Identify testa, micropyle, cotyledon, and perform bean germination experiment.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Sanitation and Disease Vectors: Houseflies and Mosquitoes', 'obj' => 'Describe life cycles of vectors and preventative sanitation measures.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Primary Health Care: Immunisation and Vaccines in Uganda', 'obj' => 'List childhood immunisable diseases (UNEPI schedule) and community prevention.', 'dur' => 50, 'seq' => 4],
            ['title' => 'States of Matter: Solids, Liquids, and Gases', 'obj' => 'Demonstrate changes of state (melting, evaporation, condensation, freezing).', 'dur' => 40, 'seq' => 5],
        ],

        // P4 Social Studies
        'P4-SST' => [
            ['title' => 'Map Reading: Compass Directions and Map Symbols', 'obj' => 'Use 8-point compass directions and interpret key topographic symbols.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Physical Features of Our District (Hills, Rivers, Lakes)', 'obj' => 'Locate key physical landforms and analyze their impact on climate and farming.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Economic Activities in Our District (Farming, Trade, Fishing)', 'obj' => 'Explain cash and food crop farming and modern commercial trade channels.', 'dur' => 45, 'seq' => 3],
            ['title' => 'District Administrative Structure and Local Council (LC1 - LC5)', 'obj' => 'Outline duties of LC executives, RDC, and municipal governance.', 'dur' => 40, 'seq' => 4],
            ['title' => 'Caring for the Environment: Wetland Protection in Uganda', 'obj' => 'Explain importance of wetlands and consequences of environmental encroachment.', 'dur' => 40, 'seq' => 5],
        ],

        // P4 Christian Religious Education (CRE)
        'P4-CRE' => [
            ['title' => 'God’s Creation: The Gift of Life and Stewards of Nature', 'obj' => 'Reflect on Genesis account of creation and duties of environmental stewardship.', 'dur' => 35, 'seq' => 1],
            ['title' => 'The Call of Abraham and Living by Faith', 'obj' => 'Narrate Abraham’s journey of faith and obedience to God’s covenant.', 'dur' => 35, 'seq' => 2],
            ['title' => 'The Ten Commandments: Moral Guidance in Daily Life', 'obj' => 'Examine the Decalogue and apply love for God and neighbour in family life.', 'dur' => 40, 'seq' => 3],
            ['title' => 'Jesus Teaches Forgiveness: Parable of the Prodigal Son', 'obj' => 'Analyze Luke 15 and practice reconciliation within family and peer groups.', 'dur' => 35, 'seq' => 4],
        ],

        // P4 Islamic Religious Education (IRE)
        'P4-IRE' => [
            ['title' => 'Pillars of Islam (Arkan al-Islam) Overview', 'obj' => 'State the five pillars and discuss Shahada and daily observance.', 'dur' => 35, 'seq' => 1],
            ['title' => 'Conditions and Steps of Wudhu (Ablution)', 'obj' => 'Demonstrate sequential steps of ritual purification before prayer.', 'dur' => 40, 'seq' => 2],
            ['title' => 'Memorisation and Meaning of Surah Al-Ikhlas', 'obj' => 'Recite Surah Al-Ikhlas with proper Tajweed and articulate Tawheed.', 'dur' => 35, 'seq' => 3],
            ['title' => 'Prophetic Manners (Adab) in Eating and Greeting', 'obj' => 'Apply Sunnah manners of saying Bismillah, eating with right hand, and Salam.', 'dur' => 35, 'seq' => 4],
        ],

        // P4 Kiswahili
        'P4-KIS' => [
            ['title' => 'Salamu na Mazungumzo ya Kila Siku (Greetings & Daily Dialogues)', 'obj' => 'Use polite East African greetings (Hujambo, Sijambo, Habari za asubuhi).', 'dur' => 35, 'seq' => 1],
            ['title' => 'Tarakimu na Hesabu (Numbers 1 to 50 in Kiswahili)', 'obj' => 'Count, write, and pronounce numbers in Kiswahili accurately.', 'dur' => 35, 'seq' => 2],
            ['title' => 'Majina ya Vyakula na Vinywaji (Foods & Beverages)', 'obj' => 'Identify common foods (Chakula, Maji, Ndizi, Mahindi) in conversations.', 'dur' => 35, 'seq' => 3],
        ],

        // P5 Mathematics
        'P5-MTC' => [
            ['title' => 'Prime Factorisation and Lowest Common Multiple (LCM / GCF)', 'obj' => 'Determine prime factors using factor trees and solve LCM/GCF problems.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Fractions: Multiplication and Division of Fractions', 'obj' => 'Multiply proper and mixed fractions using reciprocal algorithms.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Decimals: Addition, Subtraction, and Real-Life Conversions', 'obj' => 'Convert fractions to decimals and calculate decimal financial transactions.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Integers: Negative and Positive Numbers on Number Lines', 'obj' => 'Add and subtract directed numbers using temperature and elevation models.', 'dur' => 45, 'seq' => 4],
            ['title' => 'Algebra: Solving Linear Equations with One Variable', 'obj' => 'Formulate algebraic equations from statements and solve for unknowns (e.g. 2x + 4 = 16).', 'dur' => 50, 'seq' => 5],
        ],

        // P5 Integrated Science
        'P5-SCI' => [
            ['title' => 'Human Circulatory System: Heart, Blood, and Blood Vessels', 'obj' => 'Identify atria, ventricles, pulmonary artery, and summarize systemic circulation.', 'dur' => 50, 'seq' => 1],
            ['title' => 'Soil Science: Soil Erosion Types, Causes, and Control', 'obj' => 'Investigate splash, rill, sheet, and gully erosion; model terracing and mulching.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Domestic Poultry and Livestock Keeping in Uganda', 'obj' => 'Compare deep litter vs battery cage systems; describe Newcastle & Gumboro control.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Energy: Sound Energy, Transmission, and Echoes', 'obj' => 'Explain sound wave propagation through solids, liquids, gases and calculating echo distances.', 'dur' => 45, 'seq' => 4],
        ],

        // P5 Social Studies
        'P5-SST' => [
            ['title' => 'Uganda as a Nation: Location, Boundaries, and Neighbours', 'obj' => 'Map Uganda’s latitudinal/longitudinal coordinates and border points with 5 neighbours.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Ethnic Groups in Uganda: Bantu, Nilotes, Central Sudanic', 'obj' => 'Trace origin routes, migration causes, and cultural heritage of Ugandan ethnic groups.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Vegetation Zones of Uganda and Conservation', 'obj' => 'Distinguish tropical rainforests, savannah grasslands, semi-deserts, and montane zones.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Transport and Communication Systems in Uganda', 'obj' => 'Analyze economic role of road, air, water, railway, and modern digital telecom networks.', 'dur' => 45, 'seq' => 4],
        ],

        // P6 Mathematics
        'P6-MTC' => [
            ['title' => 'Number Bases: Base Ten and Non-Decimal Bases (Base 2, 5, 8)', 'obj' => 'Convert between Base 10 and Base 5/2; perform base additions and subtractions.', 'dur' => 50, 'seq' => 1],
            ['title' => 'Speed, Distance, and Time Calculations', 'obj' => 'Apply formula Speed = Distance / Time; convert km/h to m/s for vehicles.', 'dur' => 50, 'seq' => 2],
            ['title' => 'Percentages: Profit, Loss, Discount, and Simple Interest', 'obj' => 'Calculate percentage increase/decrease and simple interest formula I = PRT / 100.', 'dur' => 50, 'seq' => 3],
            ['title' => 'Circle Theorems: Circumference and Area of Circles', 'obj' => 'Compute circumference (2*pi*r) and area (pi*r^2) with precision.', 'dur' => 45, 'seq' => 4],
            ['title' => 'Probability and Statistics: Mean, Median, Mode, Range', 'obj' => 'Calculate statistical averages from frequency distributions.', 'dur' => 45, 'seq' => 5],
        ],

        // P6 Integrated Science
        'P6-SCI' => [
            ['title' => 'Reproductive Health and Adolescent Changes', 'obj' => 'Identify physical, emotional, and social changes during puberty with wholesome hygiene.', 'dur' => 50, 'seq' => 1],
            ['title' => 'Electricity and Magnetism: Circuits and Safety', 'obj' => 'Construct series and parallel circuits; explain conductors, insulators, fuses, and breakers.', 'dur' => 50, 'seq' => 2],
            ['title' => 'Classification of Animals: Vertebrates and Invertebrates', 'obj' => 'Classify mammals, birds, reptiles, amphibians, fish, and arthropods with keys.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Environmental Resources: Renewable vs Non-Renewable Energy', 'obj' => 'Evaluate solar, wind, biomass, hydro vs fossil fuels in sustainable development.', 'dur' => 45, 'seq' => 4],
        ],

        // P6 Social Studies
        'P6-SST' => [
            ['title' => 'The East African Community (EAC): Member States & Organs', 'obj' => 'Outline history, revival, objectives, and organs (Secretariat, EALA, EACJ) of EAC.', 'dur' => 45, 'seq' => 1],
            ['title' => 'Physical Features of East Africa: Great Rift Valley & Mountains', 'obj' => 'Explain formation of block mountains, volcanic peaks, and rift lakes.', 'dur' => 45, 'seq' => 2],
            ['title' => 'Climate of East Africa: Factors Influencing Regional Weather', 'obj' => 'Analyze altitude, winds, water bodies, and ocean currents on East African rainfall.', 'dur' => 45, 'seq' => 3],
            ['title' => 'Mining and Minerals in East Africa', 'obj' => 'Locate key mineral deposits (Oil in Albertine, Gold, Copper, Soda Ash) and trade.', 'dur' => 45, 'seq' => 4],
        ],

        // P7 Mathematics (Candidate Revision & Mastery)
        'P7-MTC' => [
            ['title' => 'UNEB PLE Masterclass: Advanced Sets and Probability', 'obj' => 'Solve 3-set Venn problems, complement sets, and compound probability questions.', 'dur' => 60, 'seq' => 1],
            ['title' => 'Advanced Geometry: Geometric Construction of 60°, 90°, 120° Angles', 'obj' => 'Construct exact angles, perpendicular bisectors, and triangles using compass and ruler.', 'dur' => 60, 'seq' => 2],
            ['title' => 'Coordinate Geometry: Plotting Points and Finding Distances/Midpoints', 'obj' => 'Plot (x, y) coordinates on Cartesian planes and calculate slopes and polygon areas.', 'dur' => 55, 'seq' => 3],
            ['title' => 'Commercial Arithmetic: Compound Interest, Currency Exchange, and Taxes', 'obj' => 'Calculate VAT, income tax, and bank currency conversion rates.', 'dur' => 55, 'seq' => 4],
            ['title' => 'Algebraic Word Problems and Inequalities', 'obj' => 'Solve simultaneous equations and represent inequalities on number lines.', 'dur' => 60, 'seq' => 5],
        ],

        // P7 Integrated Science (Candidate Mastery)
        'P7-SCI' => [
            ['title' => 'Light and Optics: Reflection, Refraction, Lenses, and Optical Instruments', 'obj' => 'Analyze laws of reflection, critical angles, convex/concave lenses, and the human eye.', 'dur' => 60, 'seq' => 1],
            ['title' => 'Human Excretory System: Kidneys, Skin, Lungs, and Liver', 'obj' => 'Describe nephron filtration, sweat glands, and metabolic waste management.', 'dur' => 55, 'seq' => 2],
            ['title' => 'Simple Machines: Levers, Pulleys, Inclined Planes, and Mechanical Advantage', 'obj' => 'Compute Mechanical Advantage (MA), Velocity Ratio (VR), and Efficiency of machines.', 'dur' => 60, 'seq' => 3],
            ['title' => 'Ecosystems, Food Chains, and Pollution Management', 'obj' => 'Diagram trophic levels and evaluate biodegradable vs non-biodegradable waste control.', 'dur' => 55, 'seq' => 4],
        ],

        // P7 Social Studies (Candidate Mastery)
        'P7-SST' => [
            ['title' => 'Africa as a Continent: Location, Size, and Regional Groupings', 'obj' => 'Locate major capes, peninsulas, straits, and trade blocs (ECOWAS, SADC, COMESA, Maghreb).', 'dur' => 60, 'seq' => 1],
            ['title' => 'Colonisation of Africa: The Scramble, Partition, and Resistance Leaders', 'obj' => 'Analyze Berlin Conference of 1884 and evaluate direct vs indirect colonial rule systems.', 'dur' => 60, 'seq' => 2],
            ['title' => 'Struggle for Independence: Pan-Africanism and Founding Fathers', 'obj' => 'Examine contributions of Kwame Nkrumah, Julius Nyerere, Nelson Mandela, and OAU/AU.', 'dur' => 60, 'seq' => 3],
            ['title' => 'World Affairs: United Nations (UN) and Global Peacekeeping', 'obj' => 'Explain roles of General Assembly, Security Council, WHO, UNICEF, and UNESCO.', 'dur' => 55, 'seq' => 4],
        ],
    ];

    $stmtCheck = $db->prepare("SELECT lesson_id FROM lessons WHERE subject_id = :sid AND sequence_number = :seq");
    $stmtInsert = $db->prepare("
        INSERT INTO lessons (
            subject_id, class_id, lesson_title, lesson_objectives,
            duration_minutes, sequence_number, curriculum_version, status, created_at, updated_at
        ) VALUES (
            :sid, :cid, :title, :obj,
            :dur, :seq, 'NCDC-2026.1', 'active', NOW(), NOW()
        )
    ");
    $stmtUpdate = $db->prepare("
        UPDATE lessons SET 
            class_id = :cid, lesson_title = :title, lesson_objectives = :obj,
            duration_minutes = :dur, curriculum_version = 'NCDC-2026.1', status = 'active', updated_at = NOW()
        WHERE subject_id = :sid AND sequence_number = :seq
    ");

    // Generic template for subjects without custom templates
    $genericTemplates = [
        ['title' => 'Introduction to Core Concepts and Foundation', 'obj' => 'Introduce fundamental terminology, principles, and real-world relevance.', 'dur' => 40, 'seq' => 1],
        ['title' => 'Exploring Practical Applications and Guided Practice', 'obj' => 'Conduct guided exercises, group discussions, and problem-solving.', 'dur' => 45, 'seq' => 2],
        ['title' => 'Critical Analysis and Local Case Studies', 'obj' => 'Examine Ugandan and community contexts with hands-on practice.', 'dur' => 45, 'seq' => 3],
        ['title' => 'Synthesis, Revision, and Assessment Preparation', 'obj' => 'Review competencies, address common misconceptions, and complete quiz review.', 'dur' => 40, 'seq' => 4],
    ];

    $totalInserted = 0;
    $totalUpdated = 0;

    foreach ($subjects as $subj) {
        $code = $subj['subject_code'];
        $subjectId = (int)$subj['subject_id'];
        $classId = (int)$subj['class_id'];

        $lessons = $lessonsTemplates[$code] ?? $genericTemplates;

        foreach ($lessons as $l) {
            $stmtCheck->execute([
                ':sid' => $subjectId,
                ':seq' => $l['seq']
            ]);
            $existingId = $stmtCheck->fetchColumn();

            $params = [
                ':sid' => $subjectId,
                ':cid' => $classId,
                ':title' => $l['title'],
                ':obj' => $l['obj'],
                ':dur' => $l['dur'],
                ':seq' => $l['seq']
            ];

            if ($existingId) {
                $stmtUpdate->execute($params);
                $totalUpdated++;
            } else {
                $stmtInsert->execute($params);
                $totalInserted++;
            }
        }
    }

    echo "✅ Successfully seeded curriculum lessons: {$totalInserted} inserted, {$totalUpdated} updated.\n";
    $totalLessons = $db->query("SELECT count(*) FROM lessons WHERE status = 'active'")->fetchColumn();
    echo "Total active lessons across P1-P7: {$totalLessons}\n";

} catch (Throwable $e) {
    echo "❌ Seeding failed: " . $e->getMessage() . "\n";
    exit(1);
}
