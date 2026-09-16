# TMHIS REST API Reference

All endpoints return JSON wrapped in the standard response envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable message",
  "errors": []
}
```

---

## Authentication Endpoints

### 1. User Login
- **Endpoint:** `POST /api/auth/login`
- **Body:**
  ```json
  {
    "login": "parent@example.com",
    "password": "Password123!",
    "remember": true
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "token": "NTpjYWM0ZWE4...",
      "user": {
        "user_id": 5,
        "role_code": "parent",
        "email": "parent@example.com",
        "dashboard_url": "/#parent-dashboard"
      }
    },
    "message": "Login successful."
  }
  ```

### 2. Parent Self-Registration
- **Endpoint:** `POST /api/auth/register-parent`
- **Body:**
  ```json
  {
    "full_name": "Sarah Namubiru",
    "email": "sarah@example.com",
    "phone": "+256 700 112233",
    "district": "Wakiso",
    "password": "SecurePassword123!",
    "password_confirmation": "SecurePassword123!"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "data": {
      "user_id": 6,
      "parent_id": 2,
      "email": "sarah@example.com"
    },
    "message": "Parent account created successfully."
  }
  ```

### 3. Current User Profile
- **Endpoint:** `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns authenticated user, profile, and permissions array.

### 4. Forgot Password
- **Endpoint:** `POST /api/auth/forgot-password`
- **Body:** `{"email": "user@example.com"}`

### 5. Reset Password
- **Endpoint:** `POST /api/auth/reset-password`
- **Body:**
  ```json
  {
    "token": "<raw_reset_token>",
    "password": "NewPassword123!",
    "password_confirmation": "NewPassword123!"
  }
  ```

### 6. Change Password
- **Endpoint:** `POST /api/auth/change-password`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "current_password": "OldPassword123!",
    "new_password": "NewPassword123!",
    "new_password_confirmation": "NewPassword123!"
  }
  ```

---

## Administration Endpoints (Admin Role Required)

### 1. List Users
- **Endpoint:** `GET /api/admin/users?role=parent&status=active&page=1&limit=20`
- **Headers:** `Authorization: Bearer <admin_token>`

### 2. Create User
- **Endpoint:** `POST /api/admin/users`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Body:**
  ```json
  {
    "role_code": "teacher",
    "full_name": "David Mukasa",
    "email": "mukasa@example.com",
    "phone": "+256 701 445566",
    "password": "TeacherPassword123!"
  }
  ```

### 3. Update User Status
- **Endpoint:** `PATCH /api/admin/users/{id}/status`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Body:** `{"status": "suspended"}`
