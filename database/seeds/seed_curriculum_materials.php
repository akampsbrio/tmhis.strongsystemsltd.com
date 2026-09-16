<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/Config/Database.php';

use App\Config\Database;

echo "--- SEEDING NCDC PRIMARY LEARNING MATERIALS (P1–P7) ---" . PHP_EOL;

$db = Database::getConnection();

// 1. Get Curriculum Officer ID and linked User ID
$officer = $db->query('SELECT officer_id, user_id FROM curriculum_officers LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$officerId = $officer ? (int)$officer['officer_id'] : 1;
$officerUserId = $officer ? (int)$officer['user_id'] : 1;

// 2. Prepare sample assets directory
$uploadDir = __DIR__ . '/../../storage/uploads/materials/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0775, true);
}

// Generate real sample physical files
$sampleFiles = [
    'sample_p1_literacy_guide.pdf' => [
        'type' => 'text',
        'mime' => 'application/pdf',
        'content' => "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    ],
    'sample_p1_phonics_audio.mp3' => [
        'type' => 'audio',
        'mime' => 'audio/mpeg',
        'content' => "\xFF\xFB\x90\x44" . str_repeat("\x00", 1024)
    ],
    'sample_p4_math_place_value.pdf' => [
        'type' => 'text',
        'mime' => 'application/pdf',
        'content' => "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    ],
    'sample_p4_science_digestive_diagram.svg' => [
        'type' => 'image',
        'mime' => 'image/svg+xml',
        'content' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f0f9ff"/><circle cx="200" cy="150" r="80" fill="#2563eb"/><text x="200" y="155" text-anchor="middle" fill="#ffffff" font-size="16" font-family="sans-serif">NCDC Human Anatomy</text></svg>'
    ],
    'sample_p5_science_plants_video.mp4' => [
        'type' => 'video',
        'mime' => 'video/mp4',
        'content' => "\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6F\x6D\x00\x00\x02\x00\x69\x73\x6F\x6D\x69\x73\x6F\x32\x61\x76\x63\x31\x6D\x70\x34\x31" . str_repeat("\x00", 2048)
    ],
    'sample_p7_math_algebra_activity.html' => [
        'type' => 'interactive',
        'mime' => 'text/html',
        'content' => '<!DOCTYPE html><html><head><title>NCDC Interactive Math Activity</title></head><body style="font-family:sans-serif;padding:20px;"><h2>Primary 7 Algebra Interactive Practice</h2><p>Solve for x: 2x + 6 = 18</p><input type="number" id="ans" placeholder="Enter x"><button onclick="alert(document.getElementById(\'ans\').value == 6 ? \'Correct!\' : \'Try again!\')">Check Answer</button></body></html>'
    ]
];

foreach ($sampleFiles as $fname => $meta) {
    file_put_contents($uploadDir . $fname, $meta['content']);
}

// 3. Define Seed Materials Mapped to Classes, Subjects, and Lessons
$materials = [
    // P1 Materials
    [
        'class_code' => 'P1',
        'subject_code' => 'P1-ENG',
        'lesson_seq' => 1,
        'type' => 'text',
        'title' => 'P1 English: Phonics & Letter Sounds Practice Worksheet',
        'description' => 'Official NCDC printable letter sound tracing worksheet and classroom phonics cards.',
        'filename' => 'sample_p1_literacy_guide.pdf',
        'mime' => 'application/pdf',
        'status' => 'approved'
    ],
    [
        'class_code' => 'P1',
        'subject_code' => 'P1-ENG',
        'lesson_seq' => 2,
        'type' => 'audio',
        'title' => 'P1 English: Alphabet Pronunciation & Audio Phonics Guide',
        'description' => 'Standard Ugandan English audio pronunciation guide for early literacy home learners.',
        'filename' => 'sample_p1_phonics_audio.mp3',
        'mime' => 'audio/mpeg',
        'status' => 'approved'
    ],
    // P4 Materials
    [
        'class_code' => 'P4',
        'subject_code' => 'P4-MTC',
        'lesson_seq' => 1,
        'type' => 'text',
        'title' => 'P4 Mathematics: Place Values & Expanded Form Study Guide',
        'description' => 'Comprehensive textbook chapter and exercise sets covering 5-digit place values.',
        'filename' => 'sample_p4_math_place_value.pdf',
        'mime' => 'application/pdf',
        'status' => 'approved'
    ],
    [
        'class_code' => 'P4',
        'subject_code' => 'P4-SCI',
        'lesson_seq' => 1,
        'type' => 'image',
        'title' => 'P4 Science: Human Digestive System Biological Chart',
        'description' => 'High-resolution anatomical diagram illustrating human digestion organs and processes.',
        'filename' => 'sample_p4_science_digestive_diagram.svg',
        'mime' => 'image/svg+xml',
        'status' => 'approved'
    ],
    // P5 Materials
    [
        'class_code' => 'P5',
        'subject_code' => 'P5-SCI',
        'lesson_seq' => 1,
        'type' => 'video',
        'title' => 'P5 Science: Flowering Plants & Photosynthesis Demonstration',
        'description' => 'NCDC video demonstration showing plant transpiration, pollination, and chlorophyll reactions.',
        'filename' => 'sample_p5_science_plants_video.mp4',
        'mime' => 'video/mp4',
        'status' => 'approved'
    ],
    // P7 Materials
    [
        'class_code' => 'P7',
        'subject_code' => 'P7-MTC',
        'lesson_seq' => 1,
        'type' => 'interactive',
        'title' => 'P7 Mathematics: Linear Equations & Algebra Interactive Quiz',
        'description' => 'Interactive digital equation solver and self-grading algebra exercise module.',
        'filename' => 'sample_p7_math_algebra_activity.html',
        'mime' => 'text/html',
        'status' => 'approved'
    ]
];

$insertedCount = 0;

foreach ($materials as $m) {
    // Resolve class_id
    $cStmt = $db->prepare('SELECT class_id FROM classes WHERE class_code = :cc LIMIT 1');
    $cStmt->execute([':cc' => $m['class_code']]);
    $class = $cStmt->fetch(PDO::FETCH_ASSOC);
    if (!$class) continue;
    $classId = (int)$class['class_id'];

    // Resolve subject_id
    $sStmt = $db->prepare('SELECT subject_id FROM subjects WHERE subject_code = :sc AND class_id = :cid LIMIT 1');
    $sStmt->execute([':sc' => $m['subject_code'], ':cid' => $classId]);
    $subject = $sStmt->fetch(PDO::FETCH_ASSOC);
    if (!$subject) continue;
    $subjectId = (int)$subject['subject_id'];

    // Resolve lesson_id
    $lStmt = $db->prepare('SELECT lesson_id FROM lessons WHERE subject_id = :sid AND sequence_number = :seq LIMIT 1');
    $lStmt->execute([':sid' => $subjectId, ':seq' => $m['lesson_seq']]);
    $lesson = $lStmt->fetch(PDO::FETCH_ASSOC);
    $lessonId = $lesson ? (int)$lesson['lesson_id'] : null;

    $fileRelPath = "/storage/uploads/materials/{$m['filename']}";
    $fileAbsPath = $uploadDir . $m['filename'];
    $fileSizeKb = file_exists($fileAbsPath) ? (int)ceil(filesize($fileAbsPath) / 1024) : 10;
    $checksum = file_exists($fileAbsPath) ? hash_file('sha256', $fileAbsPath) : hash('sha256', $m['title']);

    // Check if material already exists by title
    $chkStmt = $db->prepare('SELECT material_id FROM learning_materials WHERE title = :title LIMIT 1');
    $chkStmt->execute([':title' => $m['title']]);
    $existing = $chkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        $insStmt = $db->prepare('
            INSERT INTO learning_materials (
                subject_id, class_id, lesson_id, officer_id, material_type,
                title, file_url, file_size_kb, mime_type, description,
                date_uploaded, status, current_version, approved_at, approved_by, created_at, updated_at
            ) VALUES (
                :subject_id, :class_id, :lesson_id, :officer_id, :material_type,
                :title, :file_url, :file_size_kb, :mime_type, :description,
                NOW(), :status, 1, NOW(), :approved_by, NOW(), NOW()
            )
        ');
        $insStmt->execute([
            ':subject_id' => $subjectId,
            ':class_id' => $classId,
            ':lesson_id' => $lessonId,
            ':officer_id' => $officerId,
            ':material_type' => $m['type'],
            ':title' => $m['title'],
            ':file_url' => $fileRelPath,
            ':file_size_kb' => $fileSizeKb,
            ':mime_type' => $m['mime'],
            ':description' => $m['description'],
            ':status' => $m['status'],
            ':approved_by' => $officerUserId
        ]);

        $materialId = (int)$db->lastInsertId();

        // Insert version 1
        $vStmt = $db->prepare('
            INSERT INTO material_versions (
                material_id, version_number, file_url, file_size_kb,
                mime_type, checksum_sha256, change_notes, created_by, created_at
            ) VALUES (
                :material_id, 1, :file_url, :file_size_kb,
                :mime_type, :checksum_sha256, "Initial NCDC verified digital release", :created_by, NOW()
            )
        ');
        $vStmt->execute([
            ':material_id' => $materialId,
            ':file_url' => $fileRelPath,
            ':file_size_kb' => $fileSizeKb,
            ':mime_type' => $m['mime'],
            ':checksum_sha256' => $checksum,
            ':created_by' => $officerUserId
        ]);

        $insertedCount++;
    }
}

echo "✔ Seeding complete! Seeded {$insertedCount} learning materials across P1–P7." . PHP_EOL;
