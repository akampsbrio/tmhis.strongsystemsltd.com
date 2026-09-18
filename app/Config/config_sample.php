<?php
declare(strict_types=1);

namespace App\Config;

return [
    'app' => [
        'name' => 'TMHIS - Technology-Mediated Homeschooling Information System',
        'env' => getenv('APP_ENV') ?: 'production',
        'debug' => (bool)(getenv('APP_DEBUG') ?: false),
        'url' => getenv('APP_URL') ?: 'base_url_here',
        'timezone' => 'Africa/Kampala',
    ],
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: 3306,
        'dbname' => getenv('DB_NAME') ?: 'dbname',
        'user' => getenv('DB_USER') ?: 'dbname',
        'password' => getenv('DB_PASSWORD') ?: 'dbpd',
        'charset' => 'utf8mb4',
    ],
    'auth' => [
        'session_lifetime' => 86400, // 24 hours
        'remember_me_lifetime' => 2592000, // 30 days
        'max_login_attempts' => 5,
        'lockout_duration_minutes' => 15,
        'password_reset_expiry_minutes' => 60,
    ],
    'security' => [
        'token_secret' => getenv('APP_SECRET') ?: 'tmhis_super_secret_uganda_curriculum_key_2026',
        'cors_allowed_origins' => ['*'],
    ]
];
