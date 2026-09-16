<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use PDO;
use Throwable;

class MaterialController
{
    private const MAX_FILE_SIZE_BYTES = 314572800; // 300 MB
    private const UPLOAD_DIR = __DIR__ . '/../../storage/uploads/materials/';

    private const ALLOWED_MIME_TYPES = [
        'text' => [
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'text/plain' => 'txt',
            'application/epub+zip' => 'epub'
        ],
        'video' => [
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'video/ogg' => 'ogv',
            'video/quicktime' => 'mov'
        ],
        'audio' => [
            'audio/mpeg' => 'mp3',
            'audio/mp3' => 'mp3',
            'audio/wav' => 'wav',
            'audio/x-wav' => 'wav',
            'audio/ogg' => 'ogg',
            'audio/aac' => 'aac',
            'audio/mp4' => 'm4a'
        ],
        'image' => [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg'
        ],
        'interactive' => [
            'application/zip' => 'zip',
            'application/x-zip-compressed' => 'zip',
            'application/json' => 'json',
            'text/html' => 'html'
        ]
    ];

    /**
     * GET /api/materials
     * List materials with filtering by class, subject, lesson, type, search keyword, and status
     */
    public function getMaterials(): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $role = $user['role_code'] ?? 'learner';
        $isStaff = in_array($role, ['curriculum_officer', 'administrator', 'teacher'], true);

        $where = [];
        $params = [];

        // Class filter
        if (!empty($_GET['class_id'])) {
            $where[] = 'm.class_id = :class_id';
            $params[':class_id'] = (int)$_GET['class_id'];
        }

        // Child / Max Class Level Scoping (Child-centric discovery for Parents and Learners)
        $maxClassLevel = null;
        $childContext = null;

        if (!empty($_GET['learner_id'])) {
            $learnerId = (int)$_GET['learner_id'];
            if ($role === 'parent') {
                $cStmt = $db->prepare('
                    SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    JOIN parents p ON l.parent_id = p.parent_id
                    WHERE l.learner_id = :lid AND p.user_id = :uid
                    LIMIT 1
                ');
                $cStmt->execute([':lid' => $learnerId, ':uid' => $user['user_id']]);
                $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($childContext) {
                    $maxClassLevel = (int)$childContext['class_level'];
                } else {
                    // Parent does not own this learner
                    Response::forbidden('You do not have access to view materials scoped to this learner.');
                    return;
                }
            } elseif ($role === 'learner') {
                $cStmt = $db->prepare('
                    SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    WHERE l.learner_id = :lid AND l.user_id = :uid
                    LIMIT 1
                ');
                $cStmt->execute([':lid' => $learnerId, ':uid' => $user['user_id']]);
                $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($childContext) {
                    $maxClassLevel = (int)$childContext['class_level'];
                }
            } else {
                // Staff / Teacher auditing child context
                $cStmt = $db->prepare('
                    SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                    FROM learners l
                    JOIN classes c ON l.class_id = c.class_id
                    WHERE l.learner_id = :lid
                    LIMIT 1
                ');
                $cStmt->execute([':lid' => $learnerId]);
                $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($childContext) {
                    $maxClassLevel = (int)$childContext['class_level'];
                }
            }
        } elseif (!empty($_GET['max_class_level'])) {
            $reqLevel = (int)$_GET['max_class_level'];
            if ($reqLevel >= 1 && $reqLevel <= 7) {
                $maxClassLevel = $reqLevel;
            }
        } elseif ($role === 'learner') {
            // Unspecified learner query defaults to learner's class level and below
            $cStmt = $db->prepare('
                SELECT l.learner_id, l.full_name, l.class_id, c.level as class_level, c.class_name, c.class_code
                FROM learners l
                JOIN classes c ON l.class_id = c.class_id
                WHERE l.user_id = :uid
                LIMIT 1
            ');
            $cStmt->execute([':uid' => $user['user_id']]);
            $childContext = $cStmt->fetch(PDO::FETCH_ASSOC);
            if ($childContext) {
                $maxClassLevel = (int)$childContext['class_level'];
            }
        }

        if ($maxClassLevel !== null) {
            $where[] = 'c.level <= :max_class_level';
            $params[':max_class_level'] = $maxClassLevel;
        }

        // Subject filter
        if (!empty($_GET['subject_id'])) {
            $where[] = 'm.subject_id = :subject_id';
            $params[':subject_id'] = (int)$_GET['subject_id'];
        }

        // Lesson filter
        if (!empty($_GET['lesson_id'])) {
            $where[] = 'm.lesson_id = :lesson_id';
            $params[':lesson_id'] = (int)$_GET['lesson_id'];
        }

        // Material Type filter (support both type and material_type parameter names)
        $rawType = $_GET['material_type'] ?? $_GET['type'] ?? null;
        if (!empty($rawType)) {
            $type = strtolower(trim((string)$rawType));
            if (in_array($type, ['text', 'video', 'audio', 'image', 'interactive'], true)) {
                $where[] = 'm.material_type = :mtype';
                $params[':mtype'] = $type;
            }
        }

        // Status filter & Role boundary gatekeeping
        if ($isStaff) {
            if (!empty($_GET['status'])) {
                $status = strtolower(trim((string)$_GET['status']));
                if ($status !== 'all') {
                    $where[] = 'm.status = :status';
                    $params[':status'] = $status;
                }
            }
        } else {
            // Learners & parents only receive approved/active materials
            $where[] = 'm.status IN ("approved", "active")';
        }

        // Search query
        if (!empty($_GET['search'])) {
            $search = '%' . trim((string)$_GET['search']) . '%';
            $where[] = '(m.title LIKE :search1 OR m.description LIKE :search2 OR s.subject_name LIKE :search3)';
            $params[':search1'] = $search;
            $params[':search2'] = $search;
            $params[':search3'] = $search;
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = "
            SELECT 
                m.material_id,
                m.subject_id,
                m.class_id,
                m.lesson_id,
                m.officer_id,
                m.material_type,
                m.title,
                m.file_url,
                m.file_size_kb,
                m.mime_type,
                m.description,
                m.date_uploaded,
                m.status,
                m.current_version,
                m.approved_at,
                m.approved_by,
                m.created_at,
                m.updated_at,
                s.subject_name,
                s.subject_code,
                c.class_name,
                c.class_code,
                c.level as class_level,
                l.lesson_title,
                l.sequence_number as lesson_sequence,
                u.full_name as uploaded_by_name,
                appr.full_name as approved_by_name
            FROM learning_materials m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN classes c ON m.class_id = c.class_id
            LEFT JOIN lessons l ON m.lesson_id = l.lesson_id
            LEFT JOIN curriculum_officers co ON m.officer_id = co.officer_id
            LEFT JOIN users u ON co.user_id = u.user_id
            LEFT JOIN users appr ON m.approved_by = appr.user_id
            {$whereClause}
            ORDER BY m.created_at DESC, m.material_id DESC
        ";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $materials = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($materials as &$mat) {
            $mat['material_id'] = (int)$mat['material_id'];
            $mat['class_id'] = (int)$mat['class_id'];
            $mat['subject_id'] = (int)$mat['subject_id'];
            $mat['lesson_id'] = $mat['lesson_id'] ? (int)$mat['lesson_id'] : null;
            $mat['file_size_kb'] = (int)$mat['file_size_kb'];
            $mat['file_size_bytes'] = (int)$mat['file_size_kb'] * 1024;
            $mat['current_version'] = (int)$mat['current_version'];
        }

        Response::success($materials, 'Learning materials retrieved successfully.');
    }

    /**
     * GET /api/materials/{id}
     * Retrieve single material with active metadata and complete version history
     */
    public function getMaterial(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                m.*,
                s.subject_name,
                s.subject_code,
                c.class_name,
                c.class_code,
                l.lesson_title,
                l.sequence_number as lesson_sequence,
                COALESCE(u.full_name, co.full_name, "Curriculum Specialist") as uploaded_by_name,
                appr.full_name as approved_by_name
            FROM learning_materials m
            JOIN subjects s ON m.subject_id = s.subject_id
            JOIN classes c ON m.class_id = c.class_id
            LEFT JOIN lessons l ON m.lesson_id = l.lesson_id
            LEFT JOIN curriculum_officers co ON m.officer_id = co.officer_id
            LEFT JOIN users u ON co.user_id = u.user_id
            LEFT JOIN users appr ON m.approved_by = appr.user_id
            WHERE m.material_id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        $role = $user['role_code'] ?? 'learner';
        $isStaff = in_array($role, ['curriculum_officer', 'administrator', 'teacher'], true);

        // Non-staff can only view approved/active materials
        if (!$isStaff && !in_array($material['status'], ['approved', 'active'], true)) {
            Response::forbidden('This material is pending approval or has been retired.');
        }

        // Retrieve version history
        $vStmt = $db->prepare('
            SELECT 
                v.material_version_id,
                v.version_number,
                v.file_url,
                v.file_size_kb,
                v.mime_type,
                v.checksum_sha256,
                v.change_notes,
                v.created_at,
                u.full_name as author_name
            FROM material_versions v
            JOIN users u ON v.created_by = u.user_id
            WHERE v.material_id = :mid
            ORDER BY v.version_number DESC
        ');
        $vStmt->execute([':mid' => $id]);
        $versions = $vStmt->fetchAll(PDO::FETCH_ASSOC);

        $material['material_id'] = (int)$material['material_id'];
        $material['class_id'] = (int)$material['class_id'];
        $material['subject_id'] = (int)$material['subject_id'];
        $material['lesson_id'] = $material['lesson_id'] ? (int)$material['lesson_id'] : null;
        $material['file_size_kb'] = (int)$material['file_size_kb'];
        $material['current_version'] = (int)$material['current_version'];
        $material['versions'] = $versions;

        Response::success($material, 'Learning material details retrieved successfully.');
    }

    /**
     * GET /api/materials/{id}/download
     * Stream or download learning material asset
     */
    public function downloadMaterial(int $id): void
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Material file not found.');
        }

        $role = $user['role_code'] ?? 'learner';
        $isStaff = in_array($role, ['curriculum_officer', 'administrator', 'teacher'], true);

        if (!$isStaff && !in_array($material['status'], ['approved', 'active'], true)) {
            Response::forbidden('Access to this learning material is restricted.');
        }

        $relativeUrl = $material['file_url'];
        $filePath = __DIR__ . '/../../' . ltrim($relativeUrl, '/');

        if (!file_exists($filePath) || !is_readable($filePath)) {
            Response::notFound('Material physical asset file is missing from storage.');
        }

        $mimeType = $material['mime_type'] ?: 'application/octet-stream';
        $filename = basename($filePath);
        $cleanTitle = preg_replace('/[^a-zA-Z0-9_-]/', '_', $material['title']);
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $downloadName = "{$cleanTitle}.{$ext}";

        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($filePath));
        header('Content-Disposition: inline; filename="' . $downloadName . '"');
        header('Cache-Control: private, max-age=86400');
        readfile($filePath);
        exit;
    }

    /**
     * POST /api/officer/materials
     * Upload initial learning material asset with automatic version 1
     */
    public function uploadMaterial(): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        // Resolve officer_id foreign key
        $offStmt = $db->prepare('SELECT officer_id FROM curriculum_officers WHERE user_id = :uid LIMIT 1');
        $offStmt->execute([':uid' => $user['user_id']]);
        $officerRow = $offStmt->fetch(PDO::FETCH_ASSOC);

        if ($officerRow) {
            $officerId = (int)$officerRow['officer_id'];
        } else {
            $anyOfficer = $db->query('SELECT officer_id FROM curriculum_officers LIMIT 1')->fetch(PDO::FETCH_ASSOC);
            if ($anyOfficer) {
                $officerId = (int)$anyOfficer['officer_id'];
            } else {
                $insOff = $db->prepare('INSERT INTO curriculum_officers (user_id, full_name, department, officer_role, phone, email, institution, registration_date, status, created_at, updated_at) VALUES (:uid, :fn, "Curriculum Oversight", "Specialist", "+256000000", :em, "NCDC", CURDATE(), "active", NOW(), NOW())');
                $insOff->execute([
                    ':uid' => $user['user_id'],
                    ':fn' => $user['full_name'] ?? 'Curriculum Officer',
                    ':em' => $user['email'] ?? 'officer@tmhis.org'
                ]);
                $officerId = (int)$db->lastInsertId();
            }
        }

        // Support both multipart form data and raw JSON fallback
        $classId = (int)($_POST['class_id'] ?? 0);
        $subjectId = (int)($_POST['subject_id'] ?? 0);
        $lessonId = !empty($_POST['lesson_id']) ? (int)$_POST['lesson_id'] : null;
        $materialType = strtolower(trim((string)($_POST['material_type'] ?? 'text')));
        $title = trim((string)($_POST['title'] ?? ''));
        $description = trim((string)($_POST['description'] ?? ''));
        $initialStatus = !empty($_POST['submit_for_review']) ? 'submitted' : 'draft';

        // 1. Validate required fields
        if ($classId <= 0 || $subjectId <= 0 || empty($title)) {
            Response::badRequest('Class ID, Subject ID, and Material Title are required.');
        }

        if (!in_array($materialType, ['text', 'video', 'audio', 'image', 'interactive'], true)) {
            Response::badRequest('Invalid material type. Supported: text, video, audio, image, interactive.');
        }

        // 2. Validate class-subject-lesson hierarchy consistency
        $this->validateHierarchyConsistency($db, $classId, $subjectId, $lessonId);

        // 3. Process File Upload
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $errCode = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
            $msg = match ($errCode) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Uploaded file exceeds server size limit (Max: 300 MB).',
                UPLOAD_ERR_NO_FILE => 'No file was uploaded.',
                default => 'File upload error occurred.'
            };
            Response::badRequest($msg);
        }

        $file = $_FILES['file'];
        $uploadedData = $this->storeUploadedAsset($file, $materialType);

        try {
            $db->beginTransaction();

            // Insert learning_materials record
            $stmt = $db->prepare('
                INSERT INTO learning_materials (
                    subject_id, class_id, lesson_id, officer_id, material_type,
                    title, file_url, file_size_kb, mime_type, description,
                    date_uploaded, status, current_version, created_at, updated_at
                ) VALUES (
                    :subject_id, :class_id, :lesson_id, :officer_id, :material_type,
                    :title, :file_url, :file_size_kb, :mime_type, :description,
                    NOW(), :status, 1, NOW(), NOW()
                )
            ');

            $stmt->execute([
                ':subject_id' => $subjectId,
                ':class_id' => $classId,
                ':lesson_id' => $lessonId,
                ':officer_id' => $officerId,
                ':material_type' => $materialType,
                ':title' => $title,
                ':file_url' => $uploadedData['file_url'],
                ':file_size_kb' => $uploadedData['file_size_kb'],
                ':mime_type' => $uploadedData['mime_type'],
                ':description' => $description,
                ':status' => $initialStatus
            ]);

            $materialId = (int)$db->lastInsertId();

            // Insert initial version (v1) in material_versions
            $vStmt = $db->prepare('
                INSERT INTO material_versions (
                    material_id, version_number, file_url, file_size_kb,
                    mime_type, checksum_sha256, change_notes, created_by, created_at
                ) VALUES (
                    :material_id, 1, :file_url, :file_size_kb,
                    :mime_type, :checksum_sha256, "Initial version uploaded", :created_by, NOW()
                )
            ');

            $vStmt->execute([
                ':material_id' => $materialId,
                ':file_url' => $uploadedData['file_url'],
                ':file_size_kb' => $uploadedData['file_size_kb'],
                ':mime_type' => $uploadedData['mime_type'],
                ':checksum_sha256' => $uploadedData['checksum_sha256'],
                ':created_by' => $user['user_id']
            ]);

            AuditService::log(
                (int)$user['user_id'],
                'MATERIAL_UPLOAD',
                "Uploaded {$materialType} material: '{$title}' (v1, {$uploadedData['file_size_kb']} KB)",
                'learning_materials',
                $materialId
            );

            $db->commit();

            Response::created([
                'material_id' => $materialId,
                'title' => $title,
                'material_type' => $materialType,
                'file_url' => $uploadedData['file_url'],
                'file_size_kb' => $uploadedData['file_size_kb'],
                'version' => 1,
                'status' => $initialStatus
            ], 'Learning material uploaded successfully.');
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if (file_exists($uploadedData['absolute_path'])) {
                unlink($uploadedData['absolute_path']);
            }
            error_log("Material Upload Exception: " . $e->getMessage());
            Response::error('Failed to create learning material: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/officer/materials/{id}/new-version
     * Upload a new revision/version without overwriting historical version records
     */
    public function uploadNewVersion(int $id): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::badRequest('A new replacement file is required for versioning.');
        }

        $changeNotes = trim((string)($_POST['change_notes'] ?? 'Updated content revision'));
        $newVersionNumber = (int)$material['current_version'] + 1;

        $uploadedData = $this->storeUploadedAsset($_FILES['file'], $material['material_type']);

        try {
            $db->beginTransaction();

            // Insert new version in material_versions
            $vStmt = $db->prepare('
                INSERT INTO material_versions (
                    material_id, version_number, file_url, file_size_kb,
                    mime_type, checksum_sha256, change_notes, created_by, created_at
                ) VALUES (
                    :material_id, :version_number, :file_url, :file_size_kb,
                    :mime_type, :checksum_sha256, :change_notes, :created_by, NOW()
                )
            ');

            $vStmt->execute([
                ':material_id' => $id,
                ':version_number' => $newVersionNumber,
                ':file_url' => $uploadedData['file_url'],
                ':file_size_kb' => $uploadedData['file_size_kb'],
                ':mime_type' => $uploadedData['mime_type'],
                ':checksum_sha256' => $uploadedData['checksum_sha256'],
                ':change_notes' => $changeNotes,
                ':created_by' => $user['user_id']
            ]);

            // Update main material record
            $mStmt = $db->prepare('
                UPDATE learning_materials
                SET file_url = :file_url,
                    file_size_kb = :file_size_kb,
                    mime_type = :mime_type,
                    current_version = :new_version,
                    status = "submitted",
                    updated_at = NOW()
                WHERE material_id = :id
            ');

            $mStmt->execute([
                ':file_url' => $uploadedData['file_url'],
                ':file_size_kb' => $uploadedData['file_size_kb'],
                ':mime_type' => $uploadedData['mime_type'],
                ':new_version' => $newVersionNumber,
                ':id' => $id
            ]);

            AuditService::log(
                (int)$user['user_id'],
                'MATERIAL_VERSION_ADD',
                "Uploaded new version v{$newVersionNumber} for '{$material['title']}': {$changeNotes}",
                'learning_materials',
                $id
            );

            $db->commit();

            Response::success([
                'material_id' => $id,
                'version_number' => $newVersionNumber,
                'file_url' => $uploadedData['file_url'],
                'file_size_kb' => $uploadedData['file_size_kb'],
                'checksum_sha256' => $uploadedData['checksum_sha256'],
                'status' => 'submitted'
            ], "New material version v{$newVersionNumber} uploaded successfully.");
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if (file_exists($uploadedData['absolute_path'])) {
                unlink($uploadedData['absolute_path']);
            }
            Response::error('Failed to create new material version: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/officer/materials/{id}
     * Update material metadata (title, description, optional lesson link)
     */
    public function updateMaterial(int $id): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        $input = Validator::getJsonInput();

        $title = trim((string)($input['title'] ?? $material['title']));
        $description = trim((string)($input['description'] ?? $material['description']));
        $lessonId = isset($input['lesson_id']) ? ($input['lesson_id'] ? (int)$input['lesson_id'] : null) : $material['lesson_id'];

        if (empty($title)) {
            Response::badRequest('Material title cannot be empty.');
        }

        if ($lessonId !== null && $lessonId !== (int)$material['lesson_id']) {
            $this->validateHierarchyConsistency($db, (int)$material['class_id'], (int)$material['subject_id'], $lessonId);
        }

        $upStmt = $db->prepare('
            UPDATE learning_materials
            SET title = :title,
                description = :description,
                lesson_id = :lesson_id,
                updated_at = NOW()
            WHERE material_id = :id
        ');

        $upStmt->execute([
            ':title' => $title,
            ':description' => $description,
            ':lesson_id' => $lessonId,
            ':id' => $id
        ]);

        AuditService::log(
            (int)$user['user_id'],
            'MATERIAL_UPDATE',
            "Updated learning material metadata for '{$title}'",
            'learning_materials',
            $id
        );

        Response::success(null, 'Learning material updated successfully.');
    }

    /**
     * POST /api/officer/materials/{id}/submit
     * Transition material status from 'draft' to 'submitted'
     */
    public function submitMaterial(int $id): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        $upStmt = $db->prepare('UPDATE learning_materials SET status = "submitted", updated_at = NOW() WHERE material_id = :id');
        $upStmt->execute([':id' => $id]);

        AuditService::log(
            (int)$user['user_id'],
            'MATERIAL_SUBMIT',
            "Submitted material '{$material['title']}' for NCDC review",
            'learning_materials',
            $id
        );

        Response::success(['status' => 'submitted'], 'Material submitted for review successfully.');
    }

    /**
     * POST /api/officer/materials/{id}/approve
     * Curriculum officer review and approval, activating the material for learners
     */
    public function approveMaterial(int $id): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        $upStmt = $db->prepare('
            UPDATE learning_materials 
            SET status = "approved",
                approved_at = NOW(),
                approved_by = :uid,
                updated_at = NOW() 
            WHERE material_id = :id
        ');
        $upStmt->execute([
            ':uid' => $user['user_id'],
            ':id' => $id
        ]);

        AuditService::log(
            (int)$user['user_id'],
            'MATERIAL_APPROVE',
            "Approved material '{$material['title']}' for primary curriculum delivery",
            'learning_materials',
            $id
        );

        Response::success(['status' => 'approved', 'approved_by' => $user['user_id']], 'Learning material approved and published.');
    }

    /**
     * POST /api/officer/materials/{id}/retire
     * Toggle soft-retirement status of a material preserving historical quiz and lesson logs
     */
    public function retireMaterial(int $id): void
    {
        $user = RoleMiddleware::requireRoles(['curriculum_officer', 'administrator']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM learning_materials WHERE material_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $material = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$material) {
            Response::notFound('Learning material not found.');
        }

        $input = Validator::getJsonInput();
        $rawStatus = !empty($input['status']) ? strtolower(trim((string)$input['status'])) : '';
        $targetStatus = in_array($rawStatus, ['active', 'approved'], true) ? 'approved' : 'retired';

        $upStmt = $db->prepare('UPDATE learning_materials SET status = :status, updated_at = NOW() WHERE material_id = :id');
        $upStmt->execute([':status' => $targetStatus, ':id' => $id]);

        AuditService::log(
            (int)$user['user_id'],
            'MATERIAL_RETIRE',
            "Set material '{$material['title']}' status to {$targetStatus}",
            'learning_materials',
            $id
        );

        Response::success(['status' => $targetStatus], "Learning material marked as {$targetStatus}.");
    }

    // -------------------------------------------------------------------------
    // Helper Methods
    // -------------------------------------------------------------------------

    private function validateHierarchyConsistency(PDO $db, int $classId, int $subjectId, ?int $lessonId): void
    {
        // 1. Verify subject belongs to specified class
        $sStmt = $db->prepare('SELECT subject_id, class_id FROM subjects WHERE subject_id = :sid LIMIT 1');
        $sStmt->execute([':sid' => $subjectId]);
        $subject = $sStmt->fetch(PDO::FETCH_ASSOC);

        if (!$subject) {
            Response::badRequest('Specified subject does not exist.');
        }

        if ((int)$subject['class_id'] !== $classId) {
            Response::badRequest("Subject #{$subjectId} belongs to class #{$subject['class_id']}, which does not match specified class #{$classId}.");
        }

        // 2. If lesson provided, verify lesson belongs to specified subject and class
        if ($lessonId !== null) {
            $lStmt = $db->prepare('SELECT lesson_id, subject_id, class_id FROM lessons WHERE lesson_id = :lid LIMIT 1');
            $lStmt->execute([':lid' => $lessonId]);
            $lesson = $lStmt->fetch(PDO::FETCH_ASSOC);

            if (!$lesson) {
                Response::badRequest('Specified lesson does not exist.');
            }

            if ((int)$lesson['subject_id'] !== $subjectId || (int)$lesson['class_id'] !== $classId) {
                Response::badRequest("Lesson #{$lessonId} hierarchy mismatch (Lesson subject #{$lesson['subject_id']}, class #{$lesson['class_id']}).");
            }
        }
    }

    private function storeUploadedAsset(array $file, string $materialType): array
    {
        // 1. Check size limit (300 MB)
        if ($file['size'] > self::MAX_FILE_SIZE_BYTES) {
            Response::badRequest('Uploaded file exceeds maximum limit of 300 MB.');
        }

        // 2. Verify MIME type using finfo
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $allowedTypes = self::ALLOWED_MIME_TYPES[$materialType] ?? [];
        if (!array_key_exists($detectedMime, $allowedTypes)) {
            // Also check client extension as graceful fallback for specific office/zip formats
            $clientExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $validExts = array_values($allowedTypes);
            if (!in_array($clientExt, $validExts, true)) {
                Response::badRequest("Invalid file format ({$detectedMime}) for material type '{$materialType}'.");
            }
            $ext = $clientExt;
        } else {
            $ext = $allowedTypes[$detectedMime];
        }

        // 3. Generate safe storage filename and calculate SHA-256 checksum
        $randomHex = bin2hex(random_bytes(16));
        $safeFileName = "mat_{$materialType}_{$randomHex}.{$ext}";
        $destPath = self::UPLOAD_DIR . $safeFileName;

        if (!is_dir(self::UPLOAD_DIR)) {
            mkdir(self::UPLOAD_DIR, 0775, true);
        }

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to move uploaded file to permanent storage.', 500);
        }

        $checksum = hash_file('sha256', $destPath);
        $sizeKb = (int)ceil(filesize($destPath) / 1024);

        return [
            'file_url' => "/storage/uploads/materials/{$safeFileName}",
            'absolute_path' => $destPath,
            'file_size_kb' => $sizeKb,
            'mime_type' => $detectedMime,
            'checksum_sha256' => $checksum
        ];
    }
}
