<?php
declare(strict_types=1);

namespace App\Utils;

use Throwable;

class Router
{
    private array $routes = [];

    public function get(string $path, callable|array $handler): void
    {
        $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, callable|array $handler): void
    {
        $this->addRoute('POST', $path, $handler);
    }

    public function patch(string $path, callable|array $handler): void
    {
        $this->addRoute('PATCH', $path, $handler);
    }

    public function put(string $path, callable|array $handler): void
    {
        $this->addRoute('PUT', $path, $handler);
    }

    public function delete(string $path, callable|array $handler): void
    {
        $this->addRoute('DELETE', $path, $handler);
    }

    private function addRoute(string $method, string $path, callable|array $handler): void
    {
        $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $path);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'pattern' => $pattern,
            'handler' => $handler,
        ];
    }

    public function dispatch(): void
    {
        // Handle CORS Preflight
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
            header('Access-Control-Max-Age: 86400');
            http_response_code(204);
            exit;
        }

        // Set global CORS header for API requests
        header('Access-Control-Allow-Origin: *');

        $requestMethod = $_SERVER['REQUEST_METHOD'];
        $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

        // Strip sub-directory path if hosted in subfolder
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptDir !== '/' && $scriptDir !== '\\' && str_starts_with($requestUri, $scriptDir)) {
            $requestUri = substr($requestUri, strlen($scriptDir));
        }
        $requestUri = '/' . trim($requestUri, '/');

        // Check matching route
        foreach ($this->routes as $route) {
            if ($route['method'] === $requestMethod && preg_match($route['pattern'], $requestUri, $matches)) {
                $params = array_values(array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY));
                
                try {
                    if (is_array($route['handler'])) {
                        [$class, $method] = $route['handler'];
                        $controller = new $class();
                        $refMethod = new \ReflectionMethod($controller, $method);
                        $methodParams = $refMethod->getParameters();
                        $castedParams = [];
                        foreach ($params as $idx => $val) {
                            if (isset($methodParams[$idx])) {
                                $type = $methodParams[$idx]->getType();
                                if ($type instanceof \ReflectionNamedType) {
                                    $typeName = $type->getName();
                                    if ($typeName === 'int' && is_numeric($val)) {
                                        $castedParams[] = (int)$val;
                                        continue;
                                    } elseif ($typeName === 'float' && is_numeric($val)) {
                                        $castedParams[] = (float)$val;
                                        continue;
                                    }
                                }
                            }
                            $castedParams[] = is_numeric($val) ? (int)$val : $val;
                        }
                        call_user_func_array([$controller, $method], $castedParams);
                    } else {
                        call_user_func_array($route['handler'], $params);
                    }
                    return;
                } catch (Throwable $e) {
                    error_log("Router Execution Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
                    Response::error($e->getMessage(), 500);
                    return;
                }
            }
        }

        // If it starts with /api/, return JSON 404
        if (str_starts_with($requestUri, '/api/')) {
            Response::notFound("Endpoint {$requestMethod} {$requestUri} not found.");
            return;
        }

        // If it's a frontend navigation route or root, serve the PWA index.html
        $frontendFile = __DIR__ . '/../../index.html';
        if (file_exists($frontendFile)) {
            header('Content-Type: text/html; charset=UTF-8');
            readfile($frontendFile);
            exit;
        }

        Response::notFound('Page not found.');
    }
}
