<?php
declare(strict_types=1);

// Set default timezone for Uganda
date_default_timezone_set('Africa/Kampala');

// Autoloader for App namespace
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/app/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

use App\Controllers\AuthController;
use App\Controllers\AdminUserController;
use App\Controllers\CurriculumController;
use App\Controllers\LearnerController;
use App\Utils\Response;
use App\Utils\Router;

// Global exception handling
set_exception_handler(function (Throwable $e) {
    error_log("Unhandled Exception: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    if (str_starts_with($_SERVER['REQUEST_URI'] ?? '', '/api/')) {
        Response::error("An unexpected error occurred: " . $e->getMessage(), 500);
    } else {
        http_response_code(500);
        echo "<h1>500 Server Error</h1><p>" . htmlspecialchars($e->getMessage()) . "</p>";
    }
});

$router = new Router();

// ================= API ROUTES =================

// Health check
$router->get('/api/health', function () {
    Response::success([
        'system' => 'TMHIS API',
        'status' => 'operational',
        'version' => '1.0.0',
        'timestamp' => date('c'),
        'timezone' => date_default_timezone_get()
    ], 'TMHIS API operational.');
});

// Authentication & Profile (Module 01)
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->post('/api/auth/register-parent', [AuthController::class, 'registerParent']);
$router->post('/api/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->post('/api/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/api/auth/reset-password', [AuthController::class, 'resetPassword']);
$router->post('/api/auth/change-password', [AuthController::class, 'changePassword']);
$router->post('/api/auth/update-avatar', [AuthController::class, 'updateAvatar']);
$router->post('/api/auth/update-profile', [AuthController::class, 'updateProfile']);

// Parent, Family & Learner Management (Module 02)
$router->get('/api/parent/classes', [LearnerController::class, 'getClasses']);
$router->get('/api/parent/learners', [LearnerController::class, 'index']);
$router->post('/api/parent/learners', [LearnerController::class, 'create']);
$router->get('/api/parent/learners/{id}', [LearnerController::class, 'show']);
$router->put('/api/parent/learners/{id}', [LearnerController::class, 'update']);
$router->patch('/api/parent/learners/{id}/status', [LearnerController::class, 'updateStatus']);
$router->post('/api/parent/learners/{id}/avatar', [LearnerController::class, 'uploadAvatar']);
$router->post('/api/parent/learners/{id}/create-login', [LearnerController::class, 'createLogin']);
$router->get('/api/parent/profile', [LearnerController::class, 'getParentProfile']);
$router->put('/api/parent/profile', [LearnerController::class, 'updateParentProfile']);

// Administration User Management (Module 01 / 12)
$router->get('/api/admin/users', [AdminUserController::class, 'index']);
$router->post('/api/admin/users', [AdminUserController::class, 'create']);
$router->get('/api/admin/users/{id}', [AdminUserController::class, 'show']);
$router->put('/api/admin/users/{id}', [AdminUserController::class, 'update']);
$router->patch('/api/admin/users/{id}/status', [AdminUserController::class, 'updateStatus']);
$router->post('/api/admin/users/{id}/reset-password', [AdminUserController::class, 'resetPassword']);
$router->post('/api/admin/users/{id}/unlock', [AdminUserController::class, 'unlock']);

// Curriculum Management (Module 03)
$router->get('/api/curriculum/classes', [CurriculumController::class, 'getClasses']);
$router->get('/api/curriculum/classes/{id}/subjects', [CurriculumController::class, 'getSubjects']);
$router->get('/api/curriculum/subjects/{id}', [CurriculumController::class, 'getSubject']);
$router->get('/api/curriculum/subjects/{id}/lessons', [CurriculumController::class, 'getLessons']);
$router->get('/api/curriculum/lessons/{id}', [CurriculumController::class, 'getLesson']);
$router->post('/api/officer/subjects', [CurriculumController::class, 'createSubject']);
$router->put('/api/officer/subjects/{id}', [CurriculumController::class, 'updateSubject']);
$router->post('/api/officer/lessons', [CurriculumController::class, 'createLesson']);
$router->put('/api/officer/lessons/{id}', [CurriculumController::class, 'updateLesson']);
$router->post('/api/officer/lessons/{id}/retire', [CurriculumController::class, 'retireLesson']);
$router->post('/api/officer/lessons/reorder', [CurriculumController::class, 'reorderLessons']);

// Dispatch router
$router->dispatch();
