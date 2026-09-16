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

// Administration User Management (Module 01 / 12)
$router->get('/api/admin/users', [AdminUserController::class, 'index']);
$router->post('/api/admin/users', [AdminUserController::class, 'create']);
$router->patch('/api/admin/users/{id}/status', [AdminUserController::class, 'updateStatus']);

// Dispatch router
$router->dispatch();
