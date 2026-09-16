<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Utils\Response;

class RateLimitMiddleware
{
    private static string $storageDir = __DIR__ . '/../../storage/ratelimit';

    public static function check(string $endpointKey, int $maxAttempts = 10, int $decaySeconds = 60): void
    {
        if (!is_dir(self::$storageDir)) {
            @mkdir(self::$storageDir, 0775, true);
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $key = md5("{$endpointKey}_{$ip}");
        $file = self::$storageDir . "/{$key}.json";

        $now = time();
        $attempts = [];

        if (file_exists($file)) {
            $data = json_decode((string)file_get_contents($file), true);
            if (is_array($data)) {
                // Filter out timestamps older than decay window
                $attempts = array_filter($data, fn($ts) => ($now - $ts) < $decaySeconds);
            }
        }

        if (count($attempts) >= $maxAttempts) {
            $retryAfter = $decaySeconds - ($now - min($attempts));
            header("Retry-After: {$retryAfter}");
            Response::json(
                null,
                429,
                "Too many requests. Please try again in {$retryAfter} seconds.",
                ['rate_limit' => "Too many attempts from this IP address."]
            );
        }

        $attempts[] = $now;
        file_put_contents($file, json_encode(array_values($attempts)));
    }
}
