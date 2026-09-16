<?php
declare(strict_types=1);

namespace App\Utils;

class Response
{
    /**
     * Send standardized JSON response adhering to TMHIS Master Plan specification:
     * {
     *   "success": bool,
     *   "data": mixed,
     *   "message": string|null,
     *   "errors": array
     * }
     */
    public static function json(
        mixed $data = null,
        int $statusCode = 200,
        ?string $message = null,
        array $errors = []
    ): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=UTF-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('X-XSS-Protection: 1; mode=block');

        $isSuccess = $statusCode >= 200 && $statusCode < 300;

        $response = [
            'success' => $isSuccess,
            'data' => $data ?? (object)[],
            'message' => $message,
            'errors' => $errors
        ];

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(mixed $data = null, ?string $message = null, int $statusCode = 200): void
    {
        self::json($data, $statusCode, $message, []);
    }

    public static function error(string $message, int $statusCode = 400, array $errors = [], mixed $data = null): void
    {
        self::json($data, $statusCode, $message, $errors);
    }

    public static function unauthorized(string $message = 'Unauthorized access'): void
    {
        self::json(null, 401, $message, ['auth' => $message]);
    }

    public static function forbidden(string $message = 'Access forbidden for this role'): void
    {
        self::json(null, 403, $message, ['forbidden' => $message]);
    }

    public static function notFound(string $message = 'Resource not found'): void
    {
        self::json(null, 404, $message, ['notFound' => $message]);
    }

    public static function validationError(array $errors, string $message = 'Validation failed'): void
    {
        self::json(null, 422, $message, $errors);
    }
}
