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
use App\Controllers\MaterialController;
use App\Controllers\GuideController;
use App\Controllers\ScheduleController;
use App\Controllers\AssessmentController;
use App\Controllers\ExamController;
use App\Controllers\SyncController;
use App\Controllers\ProgressController;
use App\Controllers\ReportController;
use App\Controllers\NotificationController;
use App\Controllers\AuditController;
use App\Controllers\SystemHealthController;
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
$router->get('/api/curriculum/subjects', [CurriculumController::class, 'getAllSubjects']);
$router->get('/api/curriculum/subjects/{id}', [CurriculumController::class, 'getSubject']);
$router->get('/api/curriculum/subjects/{id}/lessons', [CurriculumController::class, 'getLessons']);
$router->get('/api/curriculum/lessons/{id}', [CurriculumController::class, 'getLesson']);
$router->post('/api/officer/subjects', [CurriculumController::class, 'createSubject']);
$router->put('/api/officer/subjects/{id}', [CurriculumController::class, 'updateSubject']);
$router->post('/api/officer/lessons', [CurriculumController::class, 'createLesson']);
$router->put('/api/officer/lessons/{id}', [CurriculumController::class, 'updateLesson']);
$router->post('/api/officer/lessons/{id}/retire', [CurriculumController::class, 'retireLesson']);
$router->post('/api/officer/lessons/reorder', [CurriculumController::class, 'reorderLessons']);

// Learning Materials & Digital Delivery (Module 04)
$router->get('/api/materials', [MaterialController::class, 'getMaterials']);
$router->get('/api/materials/{id}', [MaterialController::class, 'getMaterial']);
$router->get('/api/materials/{id}/download', [MaterialController::class, 'downloadMaterial']);
$router->post('/api/officer/materials', [MaterialController::class, 'uploadMaterial']);
$router->post('/api/officer/materials/{id}/new-version', [MaterialController::class, 'uploadNewVersion']);
$router->put('/api/officer/materials/{id}', [MaterialController::class, 'updateMaterial']);
$router->post('/api/officer/materials/{id}/submit', [MaterialController::class, 'submitMaterial']);
$router->post('/api/officer/materials/{id}/approve', [MaterialController::class, 'approveMaterial']);
$router->post('/api/officer/materials/{id}/retire', [MaterialController::class, 'retireMaterial']);

// Parental Guides & Flexible Scheduling (Module 05)
$router->get('/api/parent/terms', [ScheduleController::class, 'getTerms']);
$router->get('/api/curriculum/terms', [ScheduleController::class, 'getTerms']);

$router->get('/api/parent/guides', [GuideController::class, 'getGuides']);
$router->get('/api/guides', [GuideController::class, 'getGuides']);
$router->get('/api/guides/{id}', [GuideController::class, 'getGuide']);
$router->get('/api/guides/{id}/export', [GuideController::class, 'exportGuide']);
$router->post('/api/officer/guides', [GuideController::class, 'createGuide']);
$router->put('/api/officer/guides/{id}', [GuideController::class, 'updateGuide']);
$router->post('/api/officer/guides/{id}/submit', [GuideController::class, 'submitForReview']);
$router->post('/api/officer/guides/{id}/publish', [GuideController::class, 'publishGuide']);
$router->post('/api/officer/guides/{id}/archive', [GuideController::class, 'archiveGuide']);
$router->get('/api/officer/guides/{id}/versions', [GuideController::class, 'getVersions']);

$router->get('/api/parent/schedule', [ScheduleController::class, 'getSchedule']);
$router->post('/api/parent/schedule', [ScheduleController::class, 'createSchedule']);
$router->put('/api/parent/schedule/{id}', [ScheduleController::class, 'updateSchedule']);
$router->patch('/api/parent/schedule/{id}/status', [ScheduleController::class, 'updateStatus']);
$router->delete('/api/parent/schedule/{id}', [ScheduleController::class, 'deleteSchedule']);
$router->get('/api/parent/schedule/term-summary', [ScheduleController::class, 'getTermSummary']);
$router->get('/api/parent/schedule/suggested-next', [ScheduleController::class, 'getSuggestedNext']);
$router->get('/api/parent/schedule/term-roadmap', [ScheduleController::class, 'getTermRoadmap']);
$router->post('/api/parent/schedule/auto-distribute', [ScheduleController::class, 'autoDistributeTermSchedule']);

// Module 06: Assessments, Attempts & Scoring Routes
$router->get('/api/assessments', [AssessmentController::class, 'getAssessments']);
$router->get('/api/assessments/{id}', [AssessmentController::class, 'getAssessmentDetails']);
$router->post('/api/officer/assessments', [AssessmentController::class, 'createAssessment']);
$router->put('/api/officer/assessments/{id}', [AssessmentController::class, 'updateAssessment']);
$router->post('/api/officer/assessments/{id}/publish', [AssessmentController::class, 'publishAssessment']);
$router->post('/api/assessments/{id}/attempts', [AssessmentController::class, 'startAttempt']);
$router->post('/api/attempts/{id}/submit', [AssessmentController::class, 'submitAttempt']);
$router->get('/api/attempts/{id}/result', [AssessmentController::class, 'getAttemptResult']);
$router->get('/api/parent/assessments/results', [AssessmentController::class, 'getLearnerResults']);
$router->post('/api/results/{id}/manual-score', [AssessmentController::class, 'manualScoreEssay']);

// Module 06.1 Annex: Termly Exam Sets, PDF Releases & UNEB Division Grading Engine
$router->get('/api/exams/sets', [ExamController::class, 'getExamSets']);
$router->get('/api/exams/sets/{id}', [ExamController::class, 'getExamSetDetails']);
$router->post('/api/officer/exams/sets', [ExamController::class, 'createExamSet']);
$router->post('/api/officer/exams/sets/{id}/papers', [ExamController::class, 'uploadExamPaper']);
$router->post('/api/officer/exams/sets/{id}/publish', [ExamController::class, 'publishExamSet']);
$router->post('/api/teacher/exams/sets', [ExamController::class, 'createExamSet']);
$router->post('/api/teacher/exams/sets/{id}/papers', [ExamController::class, 'uploadExamPaper']);
$router->post('/api/teacher/exams/sets/{id}/publish', [ExamController::class, 'publishExamSet']);
$router->post('/api/admin/exams/sets', [ExamController::class, 'createExamSet']);
$router->post('/api/admin/exams/sets/{id}/papers', [ExamController::class, 'uploadExamPaper']);
$router->post('/api/admin/exams/sets/{id}/publish', [ExamController::class, 'publishExamSet']);
$router->post('/api/exams/sets/{id}/papers', [ExamController::class, 'uploadExamPaper']);
$router->post('/api/parent/exams/sets/{id}/marks', [ExamController::class, 'submitExamMarks']);
$router->get('/api/parent/exams/submissions/{id}/report-card', [ExamController::class, 'getExamReportCard']);
$router->get('/api/parent/exams/results', [ExamController::class, 'getLearnerExamResults']);

// Deletion endpoints for exam sets and individual papers
$router->delete('/api/officer/exams/sets/{id}', [ExamController::class, 'deleteExamSet']);
$router->delete('/api/teacher/exams/sets/{id}', [ExamController::class, 'deleteExamSet']);
$router->delete('/api/admin/exams/sets/{id}', [ExamController::class, 'deleteExamSet']);
$router->delete('/api/exams/sets/{id}', [ExamController::class, 'deleteExamSet']);

$router->delete('/api/officer/exams/papers/{id}', [ExamController::class, 'deleteExamPaper']);
$router->delete('/api/teacher/exams/papers/{id}', [ExamController::class, 'deleteExamPaper']);
$router->delete('/api/admin/exams/papers/{id}', [ExamController::class, 'deleteExamPaper']);
$router->delete('/api/exams/papers/{id}', [ExamController::class, 'deleteExamPaper']);

// Module 07: PWA Offline Mode and Synchronisation Routes
$router->post('/api/devices/register', [SyncController::class, 'registerDevice']);
$router->post('/api/sync/process', [SyncController::class, 'processSync']);
$router->get('/api/sync/status', [SyncController::class, 'getStatus']);
$router->get('/api/sync/download-package', [SyncController::class, 'downloadPackage']);
$router->post('/api/sync/retry-failed', [SyncController::class, 'retryFailed']);

// Module 08: Activities, Progress Tracking & Dashboards Routes
$router->get('/api/progress/learner/report', [ProgressController::class, 'getLearnerProgressReport']);
$router->get('/api/progress/learner/{id}/report', [ProgressController::class, 'getLearnerProgressReport']);
$router->get('/api/progress/learner', [ProgressController::class, 'getLearnerDashboard']);
$router->get('/api/progress/learner/{id}', [ProgressController::class, 'getLearnerDashboard']);
$router->get('/api/progress/parent', [ProgressController::class, 'getParentDashboard']);
$router->get('/api/progress/teacher', [ProgressController::class, 'getTeacherDashboard']);
$router->get('/api/progress/officer', [ProgressController::class, 'getOfficerAnalytics']);
$router->post('/api/progress/lesson', [ProgressController::class, 'updateLessonProgress']);
$router->patch('/api/progress/lesson', [ProgressController::class, 'updateLessonProgress']);
$router->post('/api/progress/activity', [ProgressController::class, 'recordActivity']);

// Module 09: Reports, Analytics & MoES Compliance Routes
$router->get('/api/reports/learner', [ReportController::class, 'getLearnerReport']);
$router->get('/api/reports/learner/{id}', [ReportController::class, 'getLearnerReport']);
$router->get('/api/reports/parent', [ReportController::class, 'getParentReport']);
$router->get('/api/reports/class-summary', [ReportController::class, 'getClassSummaryReport']);
$router->get('/api/reports/compliance', [ReportController::class, 'getComplianceReport']);
$router->get('/api/reports/benchmarks', [ReportController::class, 'getBenchmarks']);
$router->post('/api/reports/benchmarks', [ReportController::class, 'updateBenchmarks']);
$router->get('/api/reports/snapshots/{uuid}', [ReportController::class, 'getSnapshot']);
$router->get('/api/reports/{type}/export', [ReportController::class, 'exportReport']);

// Module 10: Notifications, Alerts & MoES Statutory Circulars Routes
$router->get('/api/notifications', [NotificationController::class, 'getNotifications']);
$router->patch('/api/notifications/{id}/read', [NotificationController::class, 'markRead']);
$router->post('/api/notifications/{id}/read', [NotificationController::class, 'markRead']);
$router->post('/api/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
$router->post('/api/notifications/{id}/dismiss', [NotificationController::class, 'dismiss']);
$router->post('/api/officer/notifications/broadcast', [NotificationController::class, 'broadcast']);
$router->get('/api/officer/notifications/broadcasts', [NotificationController::class, 'getBroadcasts']);
$router->post('/api/notifications/evaluate-pacing', [NotificationController::class, 'evaluatePacing']);

// Module 12: Administration, Security Audit Trail & System Health Routes
$router->get('/api/admin/audit', [AuditController::class, 'list']);
$router->get('/api/admin/audit/stats', [AuditController::class, 'stats']);
$router->get('/api/admin/audit/export', [AuditController::class, 'export']);
$router->get('/api/admin/audit/{id}', [AuditController::class, 'show']);
$router->get('/api/admin/system/health', [SystemHealthController::class, 'getHealth']);
$router->get('/api/admin/system/settings', [SystemHealthController::class, 'getSettings']);
$router->patch('/api/admin/system/settings', [SystemHealthController::class, 'updateSetting']);
$router->post('/api/admin/system/settings', [SystemHealthController::class, 'updateSetting']);

// Dispatch router
$router->dispatch();
