<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Services\AuditService;
use App\Utils\Response;
use App\Utils\Validator;
use DateTime;
use PDO;
use Throwable;

class LearnerController
{
    /**
     * Helper to resolve the authenticated parent profile
     */
    private static function getAuthenticatedParent(): array
    {
        $user = AuthMiddleware::handle();
        $db = Database::getConnection();

        // If user has parent role, retrieve their parent_id
        if ($user['role_code'] === 'parent') {
            $stmt = $db->prepare('SELECT * FROM parents WHERE user_id = :uid LIMIT 1');
            $stmt->execute([':uid' => $user['user_id']]);
            $parent = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$parent) {
                // Auto-create parent record if missing for this user
                $ins = $db->prepare('
                    INSERT INTO parents (user_id, full_name, email, phone, status, registration_date, created_at, updated_at)
                    VALUES (:uid, :name, :email, :phone, "active", CURDATE(), NOW(), NOW())
                ');
                $ins->execute([
                    ':uid' => $user['user_id'],
                    ':name' => $user['full_name'] ?? $user['username'],
                    ':email' => $user['email'],
                    ':phone' => '+256 700 000000'
                ]);
                $parentId = (int)$db->lastInsertId();
                $stmt->execute([':uid' => $user['user_id']]);
                $parent = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            $user['parent_record'] = $parent;
            return $user;
        }

        // Administrators and Curriculum Officers can pass ?parent_id in query if auditing
        if (in_array($user['role_code'], ['administrator', 'curriculum_officer', 'teacher'], true)) {
            $requestedParentId = (int)($_GET['parent_id'] ?? 0);
            if ($requestedParentId > 0) {
                $stmt = $db->prepare('SELECT * FROM parents WHERE parent_id = :pid LIMIT 1');
                $stmt->execute([':pid' => $requestedParentId]);
                $parent = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($parent) {
                    $user['parent_record'] = $parent;
                }
            }
            return $user;
        }

        Response::forbidden('Access restricted to parents or authorized staff.');
        exit;
    }

    /**
     * GET /api/parent/classes
     * List all primary school classes (P1–P7) with subject counts
     */
    public function getClasses(): void
    {
        AuthMiddleware::handle();
        $db = Database::getConnection();

        $stmt = $db->query('
            SELECT 
                c.class_id, 
                c.class_name, 
                c.class_code, 
                c.level, 
                c.description, 
                c.min_age, 
                c.max_age, 
                c.is_active,
                COUNT(s.subject_id) as total_subjects
            FROM classes c
            LEFT JOIN subjects s ON c.class_id = s.class_id AND s.is_active = 1
            WHERE c.is_active = 1
            GROUP BY c.class_id
            ORDER BY c.level ASC
        ');
        $classes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success($classes, 'Primary classes retrieved successfully.');
    }

    /**
     * GET /api/parent/learners
     * List learners belonging to the authenticated parent (or filtered list for Admin/Officer)
     */
    public function index(): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();

        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer', 'teacher'], true);
        $parentId = $user['parent_record']['parent_id'] ?? null;

        $where = [];
        $params = [];

        if (!$isStaff || ($parentId && !isset($_GET['all']))) {
            if (!$parentId) {
                Response::success([], 'No parent profile found.');
                return;
            }
            $where[] = 'l.parent_id = :parent_id';
            $params[':parent_id'] = $parentId;
        }

        // Optional status filter
        if (!empty($_GET['status'])) {
            $where[] = 'l.status = :status';
            $params[':status'] = $_GET['status'];
        }

        // Optional class filter
        if (!empty($_GET['class_id'])) {
            $where[] = 'l.class_id = :class_id';
            $params[':class_id'] = (int)$_GET['class_id'];
        }

        // Optional search filter
        if (!empty($_GET['search'])) {
            $where[] = '(l.full_name LIKE :search OR p.full_name LIKE :search)';
            $params[':search'] = '%' . trim($_GET['search']) . '%';
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = "
            SELECT 
                l.learner_id,
                l.parent_id,
                l.user_id,
                l.class_id,
                l.full_name,
                l.date_of_birth,
                l.gender,
                l.avatar_url,
                l.special_learning_needs,
                l.special_needs_description,
                l.enrolment_date,
                l.status,
                l.created_at,
                c.class_name,
                c.class_code,
                c.level as class_level,
                p.full_name as parent_name,
                p.phone as parent_phone,
                p.district as parent_district,
                u.username as learner_username,
                (SELECT COUNT(*) FROM learner_subjects ls WHERE ls.learner_id = l.learner_id AND ls.status = 'active') as active_subjects_count
            FROM learners l
            JOIN classes c ON l.class_id = c.class_id
            JOIN parents p ON l.parent_id = p.parent_id
            LEFT JOIN users u ON l.user_id = u.user_id
            {$whereClause}
            ORDER BY l.created_at DESC
        ";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $learners = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Format calculated fields (e.g. age)
        $now = new DateTime();
        foreach ($learners as &$learner) {
            $learner['special_learning_needs'] = (bool)$learner['special_learning_needs'];
            $learner['active_subjects_count'] = (int)$learner['active_subjects_count'];
            if (!empty($learner['date_of_birth'])) {
                $dob = new DateTime($learner['date_of_birth']);
                $learner['age'] = $dob->diff($now)->y;
            } else {
                $learner['age'] = null;
            }
        }

        Response::success($learners, 'Learners retrieved successfully.');
    }

    /**
     * POST /api/parent/learners
     * Register a new child learner into a class with automatic subject allocation
     */
    public function create(): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'full_name' => 'required|min:2|max:150',
            'date_of_birth' => 'required',
            'gender' => 'required',
            'class_id' => 'required'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $fullName = trim((string)$data['full_name']);
        $dobStr = trim((string)$data['date_of_birth']);
        $gender = strtolower(trim((string)$data['gender']));
        $classId = (int)$data['class_id'];
        $specialNeeds = !empty($data['special_learning_needs']) ? 1 : 0;
        $specialNeedsDesc = $specialNeeds ? trim((string)($data['special_needs_description'] ?? '')) : null;
        $religiousTrack = strtolower(trim((string)($data['religious_track'] ?? 'cre'))); // 'cre', 'ire', or 'all'
        $avatarUrl = !empty($data['avatar_url']) ? trim((string)$data['avatar_url']) : null;

        // Determine parent_id
        $parentId = $user['parent_record']['parent_id'] ?? null;
        if (in_array($user['role_code'], ['administrator', 'curriculum_officer'], true) && !empty($data['parent_id'])) {
            $parentId = (int)$data['parent_id'];
        }

        if (!$parentId) {
            Response::badRequest('Valid parent profile is required to register a learner.');
        }

        // Validate gender
        $validGenders = ['male', 'female', 'other', 'prefer_not_to_say'];
        if (!in_array($gender, $validGenders, true)) {
            Response::validationError(['gender' => ['Gender must be one of: ' . implode(', ', $validGenders)]]);
        }

        // Validate Date of Birth
        $dob = DateTime::createFromFormat('Y-m-d', $dobStr);
        if (!$dob || $dob->format('Y-m-d') !== $dobStr) {
            Response::validationError(['date_of_birth' => ['Date of birth must be a valid date in YYYY-MM-DD format.']]);
        }

        $now = new DateTime();
        if ($dob > $now) {
            Response::validationError(['date_of_birth' => ['Date of birth cannot be in the future.']]);
        }

        $age = $dob->diff($now)->y;
        if ($age < 3 || $age > 22) {
            Response::validationError(['date_of_birth' => ['Learner age must be between 3 and 22 years for primary education.']]);
        }

        // Validate Class
        $clsStmt = $db->prepare('SELECT class_id, class_name, class_code, level, min_age, max_age FROM classes WHERE class_id = :cid AND is_active = 1 LIMIT 1');
        $clsStmt->execute([':cid' => $classId]);
        $classRecord = $clsStmt->fetch(PDO::FETCH_ASSOC);

        if (!$classRecord) {
            Response::validationError(['class_id' => ['Selected primary class is invalid or inactive.']]);
        }

        // 1. DUPLICATE LEARNER GUARD: Same parent + Full Name + DOB
        $dupStmt = $db->prepare('
            SELECT learner_id 
            FROM learners 
            WHERE parent_id = :pid 
              AND LOWER(TRIM(full_name)) = LOWER(TRIM(:name)) 
              AND date_of_birth = :dob 
            LIMIT 1
        ');
        $dupStmt->execute([
            ':pid' => $parentId,
            ':name' => $fullName,
            ':dob' => $dobStr
        ]);

        if ($dupStmt->fetchColumn()) {
            Response::error("A learner named '{$fullName}' with Date of Birth {$dobStr} is already registered under your family profile.", 409);
        }

        // Begin Transaction for atomic learner creation + subject auto-allocation + optional account
        $db->beginTransaction();

        try {
            $createdUserId = null;

            // Optional Standalone Learner Login (e.g. for P5–P7 learners)
            if (!empty($data['create_login']) && !empty($data['username']) && !empty($data['password'])) {
                $username = trim((string)$data['username']);
                $password = (string)$data['password'];

                if (strlen($username) < 3 || strlen($username) > 50) {
                    throw new \Exception('Learner username must be between 3 and 50 characters.');
                }
                if (strlen($password) < 6) {
                    throw new \Exception('Learner password must be at least 6 characters.');
                }

                // Check username uniqueness
                $uCheck = $db->prepare('SELECT user_id FROM users WHERE username = :u LIMIT 1');
                $uCheck->execute([':u' => $username]);
                if ($uCheck->fetchColumn()) {
                    throw new \Exception("The username '{$username}' is already taken. Please choose another.");
                }

                $learnerRoleId = $db->query("SELECT role_id FROM roles WHERE role_code = 'learner'")->fetchColumn();
                $learnerEmail = !empty($data['learner_email']) ? trim((string)$data['learner_email']) : $username . '@tmhis.local';

                $uStmt = $db->prepare('
                    INSERT INTO users (
                        role_id, username, email, full_name, avatar_url, password_hash, account_status, created_at, updated_at
                    ) VALUES (
                        :role_id, :username, :email, :full_name, :avatar_url, :pwd, "active", NOW(), NOW()
                    )
                ');
                $uStmt->execute([
                    ':role_id' => $learnerRoleId,
                    ':username' => $username,
                    ':email' => $learnerEmail,
                    ':full_name' => $fullName,
                    ':avatar_url' => $avatarUrl,
                    ':pwd' => password_hash($password, PASSWORD_BCRYPT)
                ]);
                $createdUserId = (int)$db->lastInsertId();
            }

            // Insert Learner
            $insLearner = $db->prepare('
                INSERT INTO learners (
                    parent_id,
                    user_id,
                    class_id,
                    full_name,
                    date_of_birth,
                    gender,
                    avatar_url,
                    special_learning_needs,
                    special_needs_description,
                    enrolment_date,
                    status,
                    created_at,
                    updated_at
                ) VALUES (
                    :parent_id,
                    :user_id,
                    :class_id,
                    :full_name,
                    :date_of_birth,
                    :gender,
                    :avatar_url,
                    :special_learning_needs,
                    :special_needs_description,
                    CURDATE(),
                    "active",
                    NOW(),
                    NOW()
                )
            ');

            $insLearner->execute([
                ':parent_id' => $parentId,
                ':user_id' => $createdUserId,
                ':class_id' => $classId,
                ':full_name' => $fullName,
                ':date_of_birth' => $dobStr,
                ':gender' => $gender,
                ':avatar_url' => $avatarUrl,
                ':special_learning_needs' => $specialNeeds,
                ':special_needs_description' => $specialNeedsDesc
            ]);

            $learnerId = (int)$db->lastInsertId();

            // 2. AUTOMATIC SUBJECT ALLOCATION FOR CLASS
            $subjStmt = $db->prepare('
                SELECT subject_id, subject_code, subject_name 
                FROM subjects 
                WHERE class_id = :cid AND is_active = 1
            ');
            $subjStmt->execute([':cid' => $classId]);
            $availableSubjects = $subjStmt->fetchAll(PDO::FETCH_ASSOC);

            $insSubj = $db->prepare('
                INSERT INTO learner_subjects (
                    learner_id, subject_id, assigned_at, status
                ) VALUES (
                    :lid, :sid, NOW(), "active"
                )
            ');

            $enrolledSubjectsCount = 0;
            $enrolledList = [];

            foreach ($availableSubjects as $subj) {
                $code = strtoupper($subj['subject_code']);

                // Filter Religious Track if selected
                if ($religiousTrack === 'cre' && str_contains($code, '-IRE')) {
                    continue; // Skip Islamic Religious Education
                }
                if ($religiousTrack === 'ire' && str_contains($code, '-CRE')) {
                    continue; // Skip Christian Religious Education
                }

                $insSubj->execute([
                    ':lid' => $learnerId,
                    ':sid' => $subj['subject_id']
                ]);
                $enrolledSubjectsCount++;
                $enrolledList[] = $subj['subject_name'];
            }

            $db->commit();

            // Log Audit Trail
            AuditService::log(
                (int)$user['user_id'],
                'learner_registered',
                "Registered learner '{$fullName}' into {$classRecord['class_name']} ({$classRecord['class_code']}) with {$enrolledSubjectsCount} active subjects.",
                'learners',
                $learnerId,
                null,
                [
                    'learner_id' => $learnerId,
                    'full_name' => $fullName,
                    'class_code' => $classRecord['class_code'],
                    'dob' => $dobStr,
                    'age' => $age,
                    'special_needs' => (bool)$specialNeeds,
                    'enrolled_subjects' => $enrolledList
                ]
            );

            // Fetch created learner
            $fetchStmt = $db->prepare('
                SELECT 
                    l.*, 
                    c.class_name, 
                    c.class_code, 
                    c.level as class_level,
                    p.full_name as parent_name
                FROM learners l
                JOIN classes c ON l.class_id = c.class_id
                JOIN parents p ON l.parent_id = p.parent_id
                WHERE l.learner_id = :lid
            ');
            $fetchStmt->execute([':lid' => $learnerId]);
            $newLearner = $fetchStmt->fetch(PDO::FETCH_ASSOC);
            $newLearner['age'] = $age;
            $newLearner['special_learning_needs'] = (bool)$newLearner['special_learning_needs'];
            $newLearner['enrolled_subjects_count'] = $enrolledSubjectsCount;
            $newLearner['enrolled_subjects'] = $enrolledList;

            // Age warning notification if outside recommended bracket
            $ageWarning = null;
            if ($age < $classRecord['min_age'] || $age > $classRecord['max_age']) {
                $ageWarning = "Note: Recommended age for {$classRecord['class_name']} is {$classRecord['min_age']}–{$classRecord['max_age']} years. Learner is {$age} years.";
            }

            Response::success([
                'learner' => $newLearner,
                'age_advisory' => $ageWarning
            ], "Learner '{$fullName}' registered successfully in {$classRecord['class_name']} with {$enrolledSubjectsCount} subjects assigned.", 201);

        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Failed to register learner: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/parent/learners/{id}
     * Retrieve complete learner profile, class info, special accommodations, and enrolled subjects
     */
    public function show(int $id): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT 
                l.*,
                c.class_name,
                c.class_code,
                c.level as class_level,
                c.description as class_description,
                c.min_age,
                c.max_age,
                p.parent_id,
                p.full_name as parent_name,
                p.phone as parent_phone,
                p.email as parent_email,
                p.district as parent_district,
                u.username as learner_username,
                u.email as learner_login_email,
                u.account_status as learner_account_status
            FROM learners l
            JOIN classes c ON l.class_id = c.class_id
            JOIN parents p ON l.parent_id = p.parent_id
            LEFT JOIN users u ON l.user_id = u.user_id
            WHERE l.learner_id = :id
            LIMIT 1
        ');
        $stmt->execute([':id' => $id]);
        $learner = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$learner) {
            Response::notFound('Learner not found.');
        }

        // Strict Access Control: Parents can only view their own learners
        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer', 'teacher'], true);
        $myParentId = $user['parent_record']['parent_id'] ?? null;

        if (!$isStaff && (int)$learner['parent_id'] !== (int)$myParentId) {
            Response::forbidden('Access denied. You can only view your own children.');
        }

        // Calculate age
        $now = new DateTime();
        $dob = new DateTime($learner['date_of_birth']);
        $learner['age'] = $dob->diff($now)->y;
        $learner['special_learning_needs'] = (bool)$learner['special_learning_needs'];

        // Fetch enrolled subjects
        $subjStmt = $db->prepare('
            SELECT 
                ls.learner_subject_id,
                ls.subject_id,
                ls.assigned_at,
                ls.status as enrollment_status,
                s.subject_name,
                s.subject_code,
                s.description as subject_description,
                s.language_of_instruction,
                s.weekly_hours
            FROM learner_subjects ls
            JOIN subjects s ON ls.subject_id = s.subject_id
            WHERE ls.learner_id = :lid
            ORDER BY s.subject_name ASC
        ');
        $subjStmt->execute([':lid' => $id]);
        $learner['subjects'] = $subjStmt->fetchAll(PDO::FETCH_ASSOC);
        $learner['total_weekly_hours'] = array_sum(array_column($learner['subjects'], 'weekly_hours'));

        Response::success($learner, 'Learner details retrieved successfully.');
    }

    /**
     * PUT /api/parent/learners/{id}
     * Update learner demographics, special needs accommodations, photo or class level
     */
    public function update(int $id): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'full_name' => 'required|min:2|max:150',
            'date_of_birth' => 'required',
            'gender' => 'required',
            'class_id' => 'required'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        // Fetch current learner
        $curStmt = $db->prepare('SELECT * FROM learners WHERE learner_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $currentLearner = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$currentLearner) {
            Response::notFound('Learner not found.');
        }

        // Strict isolation check
        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer'], true);
        $myParentId = $user['parent_record']['parent_id'] ?? null;

        if (!$isStaff && (int)$currentLearner['parent_id'] !== (int)$myParentId) {
            Response::forbidden('Access denied. You cannot modify records for other families.');
        }

        $fullName = trim((string)$data['full_name']);
        $dobStr = trim((string)$data['date_of_birth']);
        $gender = strtolower(trim((string)$data['gender']));
        $newClassId = (int)$data['class_id'];
        $specialNeeds = !empty($data['special_learning_needs']) ? 1 : 0;
        $specialNeedsDesc = $specialNeeds ? trim((string)($data['special_needs_description'] ?? '')) : null;
        $religiousTrack = strtolower(trim((string)($data['religious_track'] ?? 'cre')));
        $avatarUrl = isset($data['avatar_url']) ? trim((string)$data['avatar_url']) : $currentLearner['avatar_url'];

        // Validate DOB
        $dob = DateTime::createFromFormat('Y-m-d', $dobStr);
        if (!$dob) {
            Response::validationError(['date_of_birth' => ['Invalid date of birth.']]);
        }

        // Duplicate guard check (excluding current record)
        $dupStmt = $db->prepare('
            SELECT learner_id 
            FROM learners 
            WHERE parent_id = :pid 
              AND LOWER(TRIM(full_name)) = LOWER(TRIM(:name)) 
              AND date_of_birth = :dob 
              AND learner_id != :id
            LIMIT 1
        ');
        $dupStmt->execute([
            ':pid' => $currentLearner['parent_id'],
            ':name' => $fullName,
            ':dob' => $dobStr,
            ':id' => $id
        ]);

        if ($dupStmt->fetchColumn()) {
            Response::error("Another learner in your profile already has the name '{$fullName}' and DOB {$dobStr}.", 409);
        }

        $oldClassId = (int)$currentLearner['class_id'];
        $classChanged = ($oldClassId !== $newClassId);

        $db->beginTransaction();

        try {
            // Update learner record
            $upStmt = $db->prepare('
                UPDATE learners SET 
                    class_id = :class_id,
                    full_name = :full_name,
                    date_of_birth = :date_of_birth,
                    gender = :gender,
                    avatar_url = :avatar_url,
                    special_learning_needs = :special_learning_needs,
                    special_needs_description = :special_needs_description,
                    updated_at = NOW()
                WHERE learner_id = :id
            ');
            $upStmt->execute([
                ':class_id' => $newClassId,
                ':full_name' => $fullName,
                ':date_of_birth' => $dobStr,
                ':gender' => $gender,
                ':avatar_url' => $avatarUrl,
                ':special_learning_needs' => $specialNeeds,
                ':special_needs_description' => $specialNeedsDesc,
                ':id' => $id
            ]);

            // Synchronize full_name & avatar_url in users table if learner has an account
            if (!empty($currentLearner['user_id'])) {
                $uStmt = $db->prepare('UPDATE users SET full_name = :name, avatar_url = :avatar, updated_at = NOW() WHERE user_id = :uid');
                $uStmt->execute([
                    ':name' => $fullName,
                    ':avatar' => $avatarUrl,
                    ':uid' => $currentLearner['user_id']
                ]);
            }

            // If class changed or re-enrollment requested: update learner_subjects
            $newSubjectsEnrolled = 0;
            if ($classChanged) {
                // Set old subjects to inactive (preserving historical records)
                $deactSubj = $db->prepare('UPDATE learner_subjects SET status = "inactive" WHERE learner_id = :lid');
                $deactSubj->execute([':lid' => $id]);

                // Query subjects for new class
                $newSubjStmt = $db->prepare('SELECT subject_id, subject_code FROM subjects WHERE class_id = :cid AND is_active = 1');
                $newSubjStmt->execute([':cid' => $newClassId]);
                $newSubjects = $newSubjStmt->fetchAll(PDO::FETCH_ASSOC);

                $insSubj = $db->prepare('
                    INSERT INTO learner_subjects (learner_id, subject_id, assigned_at, status) 
                    VALUES (:lid, :sid, NOW(), "active")
                    ON DUPLICATE KEY UPDATE status = "active", assigned_at = NOW()
                ');

                foreach ($newSubjects as $ns) {
                    $code = strtoupper($ns['subject_code']);
                    if ($religiousTrack === 'cre' && str_contains($code, '-IRE')) continue;
                    if ($religiousTrack === 'ire' && str_contains($code, '-CRE')) continue;

                    $insSubj->execute([
                        ':lid' => $id,
                        ':sid' => $ns['subject_id']
                    ]);
                    $newSubjectsEnrolled++;
                }
            }

            $db->commit();

            // Log Audit
            AuditService::log(
                (int)$user['user_id'],
                'learner_updated',
                "Updated learner '{$fullName}' (Class changed: " . ($classChanged ? "Yes" : "No") . ")",
                'learners',
                $id,
                $currentLearner,
                $data
            );

            Response::success([
                'learner_id' => $id,
                'full_name' => $fullName,
                'class_changed' => $classChanged,
                'new_subjects_enrolled' => $newSubjectsEnrolled
            ], "Learner profile updated successfully.");

        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Failed to update learner: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PATCH /api/parent/learners/{id}/status
     * Toggle learner active/inactive status
     */
    public function updateStatus(int $id): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $status = strtolower(trim((string)($data['status'] ?? '')));
        $validStatuses = ['active', 'inactive', 'completed'];

        if (!in_array($status, $validStatuses, true)) {
            Response::validationError(['status' => ['Status must be one of: ' . implode(', ', $validStatuses)]]);
        }

        $curStmt = $db->prepare('SELECT * FROM learners WHERE learner_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $current = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::notFound('Learner not found.');
        }

        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer'], true);
        $myParentId = $user['parent_record']['parent_id'] ?? null;

        if (!$isStaff && (int)$current['parent_id'] !== (int)$myParentId) {
            Response::forbidden('Access denied. You can only modify your own children.');
        }

        $stmt = $db->prepare('UPDATE learners SET status = :status, updated_at = NOW() WHERE learner_id = :id');
        $stmt->execute([
            ':status' => $status,
            ':id' => $id
        ]);

        AuditService::log(
            (int)$user['user_id'],
            'learner_status_changed',
            "Changed learner #{$id} ({$current['full_name']}) status to '{$status}'",
            'learners',
            $id,
            ['status' => $current['status']],
            ['status' => $status]
        );

        Response::success(['learner_id' => $id, 'status' => $status], "Learner status updated to '{$status}'.");
    }

    /**
     * POST /api/parent/learners/{id}/create-login
     * Grant standalone student login credentials for an upper primary learner
     */
    public function createLogin(int $id): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $errors = Validator::validate($data, [
            'username' => 'required|min:3|max:50',
            'password' => 'required|min:6'
        ]);

        if (!empty($errors)) {
            Response::validationError($errors);
        }

        $curStmt = $db->prepare('SELECT * FROM learners WHERE learner_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $learner = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$learner) {
            Response::notFound('Learner not found.');
        }

        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer'], true);
        $myParentId = $user['parent_record']['parent_id'] ?? null;

        if (!$isStaff && (int)$learner['parent_id'] !== (int)$myParentId) {
            Response::forbidden('Access denied. You can only create logins for your own children.');
        }

        if (!empty($learner['user_id'])) {
            Response::badRequest('This learner already has an active student login account.');
        }

        $username = trim((string)$data['username']);
        $password = (string)$data['password'];
        $email = !empty($data['email']) ? trim((string)$data['email']) : $username . '@tmhis.local';

        // Check uniqueness
        $uCheck = $db->prepare('SELECT user_id FROM users WHERE username = :u LIMIT 1');
        $uCheck->execute([':u' => $username]);
        if ($uCheck->fetchColumn()) {
            Response::error("Username '{$username}' is already in use. Please choose another.", 409);
        }

        $db->beginTransaction();
        try {
            $learnerRoleId = $db->query("SELECT role_id FROM roles WHERE role_code = 'learner'")->fetchColumn();

            $insUser = $db->prepare('
                INSERT INTO users (
                    role_id, username, email, full_name, password_hash, account_status, created_at, updated_at
                ) VALUES (
                    :role_id, :username, :email, :full_name, :pwd, "active", NOW(), NOW()
                )
            ');
            $insUser->execute([
                ':role_id' => $learnerRoleId,
                ':username' => $username,
                ':email' => $email,
                ':full_name' => $learner['full_name'],
                ':pwd' => password_hash($password, PASSWORD_BCRYPT)
            ]);
            $newUserId = (int)$db->lastInsertId();

            $upLearner = $db->prepare('UPDATE learners SET user_id = :uid, updated_at = NOW() WHERE learner_id = :lid');
            $upLearner->execute([
                ':uid' => $newUserId,
                ':lid' => $id
            ]);

            $db->commit();

            AuditService::log(
                (int)$user['user_id'],
                'learner_login_created',
                "Created student login '{$username}' for learner #{$id} ({$learner['full_name']})",
                'users',
                $newUserId
            );

            Response::success([
                'learner_id' => $id,
                'user_id' => $newUserId,
                'username' => $username,
                'full_name' => $learner['full_name']
            ], "Student login created successfully for {$learner['full_name']}.", 201);

        } catch (Throwable $e) {
            $db->rollBack();
            Response::error('Failed to create student account: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/parent/learners/{id}/avatar
     * Upload or update a student's profile photo
     */
    public function uploadAvatar(int $id): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();

        $curStmt = $db->prepare('SELECT * FROM learners WHERE learner_id = :id LIMIT 1');
        $curStmt->execute([':id' => $id]);
        $learner = $curStmt->fetch(PDO::FETCH_ASSOC);

        if (!$learner) {
            Response::notFound('Learner not found.');
        }

        $isStaff = in_array($user['role_code'], ['administrator', 'curriculum_officer'], true);
        $myParentId = $user['parent_record']['parent_id'] ?? null;

        if (!$isStaff && (int)$learner['parent_id'] !== (int)$myParentId) {
            Response::forbidden('Access denied. You can only update photos for your own children.');
        }

        $avatarUrl = null;

        // 1. Check if binary file uploaded via multipart form
        if (!empty($_FILES['avatar_file']['tmp_name'])) {
            $file = $_FILES['avatar_file'];
            if ($file['error'] !== UPLOAD_ERR_OK) {
                Response::error('File upload failed with error code ' . $file['error'], 400);
            }

            if ($file['size'] > 4 * 1024 * 1024) {
                Response::error('Photo file size must not exceed 4MB.', 422);
            }

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedMimes = [
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                'image/gif' => 'gif',
                'image/svg+xml' => 'svg'
            ];

            if (!isset($allowedMimes[$mime])) {
                Response::error('Invalid image type. Supported formats: JPG, PNG, WEBP, GIF, SVG.', 422);
            }

            $ext = $allowedMimes[$mime];
            $uploadDir = __DIR__ . '/../../storage/uploads/avatars';
            if (!is_dir($uploadDir)) {
                @mkdir($uploadDir, 0775, true);
            }

            $filename = 'learner_' . $id . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            $destination = $uploadDir . '/' . $filename;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                Response::error('Failed to save uploaded photo.', 500);
            }

            $avatarUrl = '/storage/uploads/avatars/' . $filename;
        } else {
            $body = Validator::getJsonInput();
            if (!empty($body['avatar_url'])) {
                $avatarUrl = trim((string)$body['avatar_url']);
            }
        }

        if (!$avatarUrl) {
            Response::error('Please select an image file to upload or provide an image URL.', 422);
        }

        $stmt = $db->prepare('UPDATE learners SET avatar_url = :url, updated_at = NOW() WHERE learner_id = :id');
        $stmt->execute([':url' => $avatarUrl, ':id' => $id]);

        // Also sync user account if learner has one
        if (!empty($learner['user_id'])) {
            $uStmt = $db->prepare('UPDATE users SET avatar_url = :url, updated_at = NOW() WHERE user_id = :uid');
            $uStmt->execute([':url' => $avatarUrl, ':uid' => $learner['user_id']]);
        }

        AuditService::log(
            (int)$user['user_id'],
            'learner_avatar_updated',
            "Updated photo for learner #{$id} ({$learner['full_name']})",
            'learners',
            $id
        );

        Response::success([
            'learner_id' => $id,
            'avatar_url' => $avatarUrl
        ], 'Student photo updated successfully.');
    }

    /**
     * GET /api/parent/profile
     * Fetch authenticated parent's extended homeschooling profile
     */
    public function getParentProfile(): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();

        $parentId = $user['parent_record']['parent_id'] ?? null;
        if (!$parentId) {
            Response::notFound('Parent profile not found.');
        }

        $stmt = $db->prepare('
            SELECT 
                p.*,
                u.username,
                u.email as account_email,
                u.avatar_url,
                (SELECT COUNT(*) FROM learners l WHERE l.parent_id = p.parent_id) as total_children_enrolled
            FROM parents p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.parent_id = :pid
        ');
        $stmt->execute([':pid' => $parentId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);

        Response::success($profile, 'Parent profile retrieved successfully.');
    }

    /**
     * PUT /api/parent/profile
     * Update parent extended homeschooling attributes (NIN, District, Household size, Language, Experience)
     */
    public function updateParentProfile(): void
    {
        $user = self::getAuthenticatedParent();
        $db = Database::getConnection();
        $data = Validator::getJsonInput();

        $parentId = $user['parent_record']['parent_id'] ?? null;
        if (!$parentId) {
            Response::notFound('Parent profile not found.');
        }

        $stmt = $db->prepare('
            UPDATE parents SET 
                full_name = :name,
                national_id = :nin,
                phone = :phone,
                physical_address = :addr,
                district = :district,
                household_size = :hsize,
                preferred_language = :lang,
                education_level = :edulevel,
                homeschooling_experience = :experience,
                updated_at = NOW()
            WHERE parent_id = :pid
        ');

        $fullName = trim((string)($data['full_name'] ?? $user['full_name']));
        $stmt->execute([
            ':name' => $fullName,
            ':nin' => !empty($data['national_id']) ? trim((string)$data['national_id']) : null,
            ':phone' => !empty($data['phone']) ? trim((string)$data['phone']) : null,
            ':addr' => !empty($data['physical_address']) ? trim((string)$data['physical_address']) : null,
            ':district' => !empty($data['district']) ? trim((string)$data['district']) : 'Kampala',
            ':hsize' => !empty($data['household_size']) ? (int)$data['household_size'] : 1,
            ':lang' => !empty($data['preferred_language']) ? trim((string)$data['preferred_language']) : 'English',
            ':edulevel' => !empty($data['education_level']) ? trim((string)$data['education_level']) : null,
            ':experience' => !empty($data['homeschooling_experience']) ? 1 : 0,
            ':pid' => $parentId
        ]);

        // Keep users.full_name in sync
        $uStmt = $db->prepare('UPDATE users SET full_name = :name, updated_at = NOW() WHERE user_id = :uid');
        $uStmt->execute([':name' => $fullName, ':uid' => $user['user_id']]);

        AuditService::log(
            (int)$user['user_id'],
            'parent_profile_updated',
            "Updated parent homeschooling family profile.",
            'parents',
            $parentId
        );

        Response::success(['parent_id' => $parentId], 'Family profile updated successfully.');
    }
}
