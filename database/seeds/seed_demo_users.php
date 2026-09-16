<?php
declare(strict_types=1);

/**
 * Seed initial administrative & demo users for TMHIS
 */

spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/../../app/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) require_once $file;
});

use App\Config\Database;

$db = Database::getConnection();

$demoUsers = [
    [
        'role_id' => 5,
        'role_code' => 'administrator',
        'email' => 'admin@tmhis.org',
        'username' => 'sysadmin',
        'full_name' => 'System Administrator',
        'avatar_url' => 'https://ui-avatars.com/api/?name=Admin+System&background=581c87&color=fff&rounded=true&bold=true',
        'password' => 'Admin@2026!',
        'profile' => [
            'type' => 'admin',
            'full_name' => 'System Administrator'
        ]
    ],
    [
        'role_id' => 4,
        'role_code' => 'curriculum_officer',
        'email' => 'officer.ncdc@tmhis.org',
        'username' => 'officer_ncdc',
        'full_name' => 'Dr. Grace Kiconco',
        'avatar_url' => 'https://ui-avatars.com/api/?name=Grace+Kiconco&background=064e3b&color=a7f3d0&rounded=true&bold=true',
        'password' => 'Officer@2026!',
        'profile' => [
            'type' => 'officer',
            'full_name' => 'Dr. Grace Kiconco',
            'department' => 'Primary Curriculum Department',
            'officer_role' => 'Principal Curriculum Specialist',
            'phone' => '+256 772 112233',
            'institution' => 'National Curriculum Development Centre (NCDC)'
        ]
    ],
    [
        'role_id' => 3,
        'role_code' => 'teacher',
        'email' => 'teacher.mukasa@tmhis.org',
        'username' => 'tr_mukasa',
        'full_name' => 'David Mukasa',
        'avatar_url' => 'https://ui-avatars.com/api/?name=David+Mukasa&background=1e3a8a&color=bfdbfe&rounded=true&bold=true',
        'password' => 'Teacher@2026!',
        'profile' => [
            'type' => 'teacher',
            'full_name' => 'David Mukasa',
            'subject_specialty' => 'Mathematics & Integrated Science',
            'phone' => '+256 701 445566',
            'school' => 'TMHIS Partner Support Center'
        ]
    ],
    [
        'role_id' => 2,
        'role_code' => 'parent',
        'email' => 'parent.namubiru@tmhis.org',
        'username' => 'parent_sarah',
        'full_name' => 'Sarah Namubiru',
        'avatar_url' => 'https://ui-avatars.com/api/?name=Sarah+Namubiru&background=7c2d12&color=fed7aa&rounded=true&bold=true',
        'password' => 'Parent@2026!',
        'profile' => [
            'type' => 'parent',
            'full_name' => 'Sarah Namubiru',
            'phone' => '+256 752 987654',
            'district' => 'Wakiso',
            'physical_address' => 'Kira Municipality, Wakiso'
        ]
    ]
];

foreach ($demoUsers as $u) {
    // Check if user already exists
    $check = $db->prepare('SELECT user_id FROM users WHERE email = :email');
    $check->execute([':email' => $u['email']]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $userId = (int)$existing['user_id'];
        $pwdHash = password_hash($u['password'], PASSWORD_BCRYPT);
        $db->prepare('UPDATE users SET full_name = :fname, password_hash = :ph, avatar_url = :avatar, account_status = "active", locked_until = NULL, failed_login_attempts = 0 WHERE user_id = :id')
           ->execute([':fname' => $u['full_name'], ':ph' => $pwdHash, ':avatar' => $u['avatar_url'], ':id' => $userId]);
    } else {
        $pwdHash = password_hash($u['password'], PASSWORD_BCRYPT);
        $insert = $db->prepare('
            INSERT INTO users (role_id, full_name, username, email, avatar_url, password_hash, account_status, email_verified_at, created_at)
            VALUES (:rid, :fname, :uname, :email, :avatar, :ph, "active", NOW(), NOW())
        ');
        $insert->execute([
            ':rid' => $u['role_id'],
            ':fname' => $u['full_name'],
            ':uname' => $u['username'],
            ':email' => $u['email'],
            ':avatar' => $u['avatar_url'],
            ':ph' => $pwdHash
        ]);
        $userId = (int)$db->lastInsertId();
    }

    // Upsert actor profile
    if ($u['role_code'] === 'parent') {
        $pCheck = $db->prepare('SELECT parent_id FROM parents WHERE user_id = :uid');
        $pCheck->execute([':uid' => $userId]);
        if (!$pCheck->fetch()) {
            $db->prepare('
                INSERT INTO parents (user_id, full_name, phone, email, district, physical_address, registration_date, status, created_at)
                VALUES (:uid, :name, :phone, :email, :district, :addr, CURDATE(), "active", NOW())
            ')->execute([
                ':uid' => $userId,
                ':name' => $u['profile']['full_name'],
                ':phone' => $u['profile']['phone'],
                ':email' => $u['email'],
                ':district' => $u['profile']['district'],
                ':addr' => $u['profile']['physical_address']
            ]);
        }
    } elseif ($u['role_code'] === 'teacher') {
        $tCheck = $db->prepare('SELECT teacher_id FROM teachers WHERE user_id = :uid');
        $tCheck->execute([':uid' => $userId]);
        if (!$tCheck->fetch()) {
            $db->prepare('
                INSERT INTO teachers (user_id, full_name, subject_specialty, phone, email, school, registration_date, status, created_at)
                VALUES (:uid, :name, :spec, :phone, :email, :school, CURDATE(), "active", NOW())
            ')->execute([
                ':uid' => $userId,
                ':name' => $u['profile']['full_name'],
                ':spec' => $u['profile']['subject_specialty'],
                ':phone' => $u['profile']['phone'],
                ':email' => $u['email'],
                ':school' => $u['profile']['school']
            ]);
        }
    } elseif ($u['role_code'] === 'curriculum_officer') {
        $oCheck = $db->prepare('SELECT officer_id FROM curriculum_officers WHERE user_id = :uid');
        $oCheck->execute([':uid' => $userId]);
        if (!$oCheck->fetch()) {
            $db->prepare('
                INSERT INTO curriculum_officers (user_id, full_name, department, officer_role, phone, email, institution, registration_date, status, created_at)
                VALUES (:uid, :name, :dept, :role, :phone, :email, :inst, CURDATE(), "active", NOW())
            ')->execute([
                ':uid' => $userId,
                ':name' => $u['profile']['full_name'],
                ':dept' => $u['profile']['department'],
                ':role' => $u['profile']['officer_role'],
                ':phone' => $u['profile']['phone'],
                ':email' => $u['email'],
                ':inst' => $u['profile']['institution']
            ]);
        }
    }
}

echo "DEMO_USERS_SEEDED_SUCCESSFULLY\n";
