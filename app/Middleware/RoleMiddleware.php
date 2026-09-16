<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Utils\Response;

class RoleMiddleware
{
    /**
     * Enforce that the authenticated user possesses one of the allowed role codes.
     */
    public static function requireRoles(array $allowedRoles): array
    {
        $user = AuthMiddleware::handle();

        $userRole = $user['role_code'] ?? '';
        if (!in_array($userRole, $allowedRoles, true)) {
            Response::forbidden("Access denied. Required role: " . implode(' or ', $allowedRoles));
        }

        return $user;
    }

    public static function requireAdmin(): array
    {
        return self::requireRoles(['administrator']);
    }

    public static function requireParent(): array
    {
        return self::requireRoles(['parent']);
    }

    public static function requireLearner(): array
    {
        return self::requireRoles(['learner']);
    }

    public static function requireTeacher(): array
    {
        return self::requireRoles(['teacher']);
    }

    public static function requireOfficer(): array
    {
        return self::requireRoles(['curriculum_officer']);
    }

    public static function requireEducationalStaff(): array
    {
        return self::requireRoles(['teacher', 'curriculum_officer']);
    }
}
