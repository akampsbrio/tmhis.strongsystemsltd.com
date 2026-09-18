<?php
declare(strict_types=1);

/**
 * TMHIS Sprint 11 — Seed Realistic Dummy Messages & Conversation Threads
 */

date_default_timezone_set('Africa/Kampala');

require_once __DIR__ . '/../app/Config/Database.php';

use App\Config\Database;

$db = Database::getConnection();

echo "=====================================================\n";
echo "TMHIS: Seeding Dummy Messages & Conversation Threads\n";
echo "=====================================================\n\n";

// Target primary demo accounts
$userBrian = 9;   // Brian Akampurira (Admin)
$userAdmin = 5;   // System Administrator
$userOfficer = 6; // Dr. Grace Kiconco (Curriculum Officer)
$userTeacher = 7; // David Mukasa (Teacher)
$userParent = 8;  // Sarah Namubiru (Parent)

// Verify users exist
$stmt = $db->prepare("SELECT user_id, full_name FROM users WHERE user_id IN (?, ?, ?, ?, ?)");
$stmt->execute([$userBrian, $userAdmin, $userOfficer, $userTeacher, $userParent]);
$existing = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

if (count($existing) < 4) {
    echo "Warning: Some primary user accounts were not found. Verifying available users...\n";
}

// Helper to create thread and messages
function seedThread(
    PDO $db,
    int $creatorId,
    int $recipientId,
    string $subject,
    array $messages,
    bool $isImportant = false,
    string $status = 'open'
) {
    $now = date('Y-m-d H:i:s');
    $lastMsg = end($messages);
    $lastMsgTime = $lastMsg['sent_at'] ?? $now;
    $lastPreview = mb_substr($lastMsg['body'], 0, 120);

    $stmt = $db->prepare("
        INSERT INTO message_threads (
            creator_user_id, recipient_user_id, subject_line, status, is_important,
            last_message_at, last_message_preview, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $creatorId,
        $recipientId,
        $subject,
        $status,
        $isImportant ? 1 : 0,
        $lastMsgTime,
        $lastPreview,
        $messages[0]['sent_at'] ?? $now
    ]);
    $threadId = (int)$db->lastInsertId();

    foreach ($messages as $m) {
        $stmtMsg = $db->prepare("
            INSERT INTO messages (
                thread_id, sender_user_id, message_body, sent_at, read_at, status
            ) VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmtMsg->execute([
            $threadId,
            $m['sender_id'],
            $m['body'],
            $m['sent_at'] ?? $now,
            $m['read_at'] ?? null,
            $m['status'] ?? ($m['read_at'] ? 'read' : 'sent')
        ]);
    }

    // Also send an in-app notification to the recipient for the latest message if unread
    if (empty($lastMsg['read_at'])) {
        $notifRecipient = ($lastMsg['sender_id'] === $creatorId) ? $recipientId : $creatorId;
        $senderNameStmt = $db->prepare("SELECT full_name, username FROM users WHERE user_id = ?");
        $senderNameStmt->execute([$lastMsg['sender_id']]);
        $sender = $senderNameStmt->fetch(PDO::FETCH_ASSOC);
        $sName = $sender['full_name'] ?? $sender['username'] ?? 'Someone';

        $db->prepare("
            INSERT INTO notifications (
                user_id, notification_type, title, message, action_url, priority, status, date_created
            ) VALUES (?, 'announcement', ?, ?, ?, ?, 'unread', NOW())
        ")->execute([
            $notifRecipient,
            "💬 Message from {$sName}",
            "{$subject}\n" . mb_substr($lastMsg['body'], 0, 80),
            "#messages?thread={$threadId}",
            $isImportant ? 'high' : 'normal'
        ]);
    }

    echo "  [OK] Created Thread #{$threadId}: '{$subject}' with " . count($messages) . " messages.\n";
    return $threadId;
}

// 1. Teacher Mukasa <-> Brian Akampurira (Active with unread reply from teacher)
seedThread(
    $db,
    $userTeacher,
    $userBrian,
    "P5 Science Scheme of Work - Term 2 Plant Classification",
    [
        [
            'sender_id' => $userTeacher,
            'body' => "Greetings Brian,\n\nCould you please review the updated Term 2 Science scheme of work for P5? We added interactive hands-on leaf collection and angiosperm classification activities aligned with the NCDC curriculum.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-3 hours')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-2 hours 30 mins')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userBrian,
            'body' => "Thanks Teacher David! The leaf taxonomy structure looks brilliant and will work great for homeschooling parents. Let's make sure it includes the continuous assessment revision questions.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-2 hours 15 mins')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-1 hour 45 mins')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userTeacher,
            'body' => "Understood! I have drafted 15 multiple-choice questions and 2 practical diagram essays. I will bundle them into the parental guide before Friday.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-10 mins')),
            'read_at' => null, // Unread by Brian
            'status' => 'sent'
        ]
    ],
    true
);

// 2. Dr. Grace Kiconco <-> Brian Akampurira (Transparent Read Receipt Example)
seedThread(
    $db,
    $userOfficer,
    $userBrian,
    "NCDC Primary Four Literacy Pacing & Termly Milestones",
    [
        [
            'sender_id' => $userOfficer,
            'body' => "Dear Brian,\n\nThe Ministry of Education (MoES) has released the statutory pacing guidelines for P4 English & Literacy for Term 1. Please verify that our parent guidance modules highlight local dialect vocabulary alongside English terminology.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-1 day 4 hours')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-1 day 2 hours')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userBrian,
            'body' => "Acknowledged, Dr. Grace.\n\nAll P4 audio guides and thematic vocabulary cards now feature dual-language annotations (English + Luganda/Runyankole) and are available in the offline PWA package.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-1 day 1 hour')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-1 day 30 mins')), // Dr Grace read this message transparently!
            'status' => 'read'
        ]
    ],
    true
);

// 3. Sarah Namubiru (Parent) <-> Brian Akampurira (Parent inquiry)
seedThread(
    $db,
    $userParent,
    $userBrian,
    "Inquiry on P3 Mathematics Remedial Practice Quizzes",
    [
        [
            'sender_id' => $userParent,
            'body' => "Good morning,\n\nMy son Jonathan has been having a bit of trouble with long division in Week 3 of P3 Math. Are there supplemental practice sets or step-by-step guides we can download for home practice?",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-5 hours')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-4 hours')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userBrian,
            'body' => "Good morning Sarah!\n\nYes, absolutely. We have enabled 3 diagnostic auto-scoring practice quizzes with step-by-step parent guides under the P3 Mathematics topic menu. You can also download them for offline use.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-3 hours 40 mins')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-2 hours')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userParent,
            'body' => "Wonderful! I just checked and found the worksheets. Thank you so much for the quick response.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-1 hour 15 mins')),
            'read_at' => null, // Unread by Brian
            'status' => 'sent'
        ]
    ],
    false
);

// 4. Sarah Namubiru (Parent) <-> David Mukasa (Teacher) (Teacher-Parent Discussion)
seedThread(
    $db,
    $userParent,
    $userTeacher,
    "Jonathan's Term 1 Progress Report & Social Studies Revision",
    [
        [
            'sender_id' => $userParent,
            'body' => "Hello Teacher David,\n\nI reviewed Jonathan's terminal report card. His overall aggregate is 10 (Division 1), but his SST score was slightly lower than Math. What specific areas should we focus on during the break?",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-2 days')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-2 days + 2 hours')),
            'status' => 'read'
        ],
        [
            'sender_id' => $userTeacher,
            'body' => "Hello Mrs. Namubiru,\n\nJonathan performed exceptionally well overall! For Social Studies, practicing East African map reading and climate zones on the printable worksheets will help him maintain an easy D1 distinction.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-1 day 18 hours')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-1 day 10 hours')),
            'status' => 'read'
        ]
    ],
    false
);

// 5. System Administrator <-> Brian Akampurira (System Notice)
seedThread(
    $db,
    $userAdmin,
    $userBrian,
    "Scheduled Database Maintenance & Offline Sync Health Check",
    [
        [
            'sender_id' => $userAdmin,
            'body' => "Technical Advisory:\n\nRoutine database log optimization and offline sync dead-letter queue inspection is scheduled for tonight at 23:00 EAT. All API endpoints and client sync queues will remain fully resilient.",
            'sent_at' => date('Y-m-d H:i:s', strtotime('-4 days')),
            'read_at' => date('Y-m-d H:i:s', strtotime('-3 days 20 hours')),
            'status' => 'read'
        ]
    ],
    false,
    'closed'
);

echo "\nDummy messages seeded successfully!\n";
