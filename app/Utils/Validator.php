<?php
declare(strict_types=1);

namespace App\Utils;

class Validator
{
    private array $errors = [];
    private array $data;

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function make(array $data): self
    {
        return new self($data);
    }

    /**
     * Retrieve JSON body or fall back to $_POST
     */
    public static function getJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $json = json_decode($raw, true);
            if (is_array($json)) {
                return $json;
            }
        }
        return $_POST ?? [];
    }

    /**
     * Declarative array-based validation helper
     * Example: Validator::validate($data, ['full_name' => 'required|min:2|max:150'])
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $ruleList = explode('|', $ruleString);
            $val = $data[$field] ?? null;
            $label = ucfirst(str_replace('_', ' ', $field));

            foreach ($ruleList as $rule) {
                if ($rule === 'required') {
                    if ($val === null || (is_string($val) && trim($val) === '') || (is_array($val) && empty($val))) {
                        $errors[$field][] = "{$label} is required.";
                    }
                } elseif (str_starts_with($rule, 'min:')) {
                    $min = (int)substr($rule, 4);
                    if ($val !== null && mb_strlen((string)$val) < $min) {
                        $errors[$field][] = "{$label} must be at least {$min} characters.";
                    }
                } elseif (str_starts_with($rule, 'max:')) {
                    $max = (int)substr($rule, 4);
                    if ($val !== null && mb_strlen((string)$val) > $max) {
                        $errors[$field][] = "{$label} cannot exceed {$max} characters.";
                    }
                } elseif ($rule === 'email') {
                    if (!empty($val) && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
                        $errors[$field][] = "{$label} must be a valid email address.";
                    }
                }
            }
        }

        return $errors;
    }

    public function required(string|array $field, string $label = ''): self
    {
        if (is_array($field)) {
            foreach ($field as $f) {
                $this->required($f);
            }
            return $this;
        }

        $label = $label ?: ucfirst(str_replace('_', ' ', $field));
        if (!isset($this->data[$field]) || trim((string)$this->data[$field]) === '') {
            $this->errors[$field][] = "{$label} is required.";
        }
        return $this;
    }

    public function email(string $field, string $label = 'Email'): self
    {
        if (isset($this->data[$field]) && trim((string)$this->data[$field]) !== '') {
            if (!filter_var($this->data[$field], FILTER_VALIDATE_EMAIL)) {
                $this->errors[$field][] = "{$label} must be a valid email address.";
            }
        }
        return $this;
    }

    public function minLength(string $field, int $min, string $label = ''): self
    {
        $label = $label ?: ucfirst(str_replace('_', ' ', $field));
        if (isset($this->data[$field]) && mb_strlen((string)$this->data[$field]) < $min) {
            $this->errors[$field][] = "{$label} must be at least {$min} characters.";
        }
        return $this;
    }

    public function in(string $field, array $allowed, string $label = ''): self
    {
        $label = $label ?: ucfirst(str_replace('_', ' ', $field));
        if (isset($this->data[$field]) && !in_array($this->data[$field], $allowed, true)) {
            $this->errors[$field][] = "{$label} must be one of: " . implode(', ', $allowed);
        }
        return $this;
    }

    public function matches(string $field, string $matchField, string $label = ''): self
    {
        $label = $label ?: ucfirst(str_replace('_', ' ', $field));
        $matchLabel = ucfirst(str_replace('_', ' ', $matchField));
        if (isset($this->data[$field]) && isset($this->data[$matchField])) {
            if ($this->data[$field] !== $this->data[$matchField]) {
                $this->errors[$field][] = "{$label} must match {$matchLabel}.";
            }
        }
        return $this;
    }

    public function passes(): bool
    {
        return empty($this->errors);
    }

    public function isValid(): bool
    {
        return empty($this->errors);
    }

    public function fails(): bool
    {
        return !empty($this->errors);
    }

    public function getErrors(): array
    {
        return $this->errors;
    }

    public function getFirstError(): ?string
    {
        if (empty($this->errors)) {
            return null;
        }
        $firstField = array_key_first($this->errors);
        return $this->errors[$firstField][0] ?? null;
    }
}
