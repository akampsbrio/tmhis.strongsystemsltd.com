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

        $userRole = strtolower(str_replace(' ', '_', (string)($user['role_code'] ?? '')));
        $normalizedAllowed = array_map(function($r) {
            $nr = strtolower(str_replace(' ', '_', (string)$r));
            if ($nr === 'super_admin' || $nr === 'admin') return 'administrator';
            return $nr;
        }, $allowedRoles);

        if (!in_array($userRole, $normalizedAllowed, true)) {
            Response::forbidden("Access denied. Required role: " . implode(' or ', $allowedRoles));
        }

        return $user;
    }

    /**
     * Aliases for requireRoles
     */
    public static function requireRole(array|string $allowedRoles): array
    {
        return self::requireRoles((array)$allowedRoles);
    }

    public static function requireAny(array $allowedRoles): array
    {
        return self::requireRoles($allowedRoles);
    }

    public static function allow(array $allowedRoles): array
    {
        return self::requireRoles($allowedRoles);
    }

    public static function permit(array $allowedRoles): array
    {
        return self::requireRoles($allowedRoles);
    }

    public static function authorize(array $allowedRoles): array
    {
        return self::requireRoles($allowedRoles);
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
