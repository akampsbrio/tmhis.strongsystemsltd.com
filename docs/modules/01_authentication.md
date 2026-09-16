# Module 01 — Authentication, Users and RBAC

## Status: ✅ Implemented & Tested

### Objective
Securely authenticate all five system roles (**Learner**, **Parent**, **Teacher**, **Curriculum Officer**, **Administrator**) and expose only authorised functions and data.

---

## 1. Implemented Features

1. **Email & Username Login:** Single endpoint `/api/auth/login` supporting email/username login with role detection and dashboard dispatching.
2. **Parent Self-Registration:** Public registration `/api/auth/register-parent` with transactional profile association.
3. **Session & Bearer Token Auth:** Dual support for browser sessions and stateless HMAC-SHA256 bearer tokens.
4. **Remember-Me Cookie:** 30-day persistent cookie with secure DB hash storage.
5. **Brute-Force Rate Limiting:** 5 requests/minute threshold; 5 failed logins triggers a 15-minute account lockout.
6. **Password Reset:** Single-use, time-expiring (1 hour) tokens.
7. **Role-Based Access Control:** Strict server-side verification using `RoleMiddleware`.
8. **Admin User Management:** Admin can create staff accounts and activate/suspend/deactivate users.
9. **Audit Trail Logging:** All logins, logouts, resets, password changes, and status alterations logged to `audit_trail`.

---

## 2. Source Files

- **Controller:** [`AuthController.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Controllers/AuthController.php)
- **Admin Controller:** [`AdminUserController.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Controllers/AdminUserController.php)
- **Auth Middleware:** [`AuthMiddleware.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Middleware/AuthMiddleware.php)
- **RBAC Middleware:** [`RoleMiddleware.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Middleware/RoleMiddleware.php)
- **Rate Limit Middleware:** [`RateLimitMiddleware.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Middleware/RateLimitMiddleware.php)
- **Audit Service:** [`AuditService.php`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/app/Services/AuditService.php)
- **Frontend Views:** [`js/auth.js`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/js/auth.js) & [`js/app.js`](file:///home/tmhis/htdocs/tmhis.strongsystemsltd.com/js/app.js)

---

## 3. Verification & Test Suite

Run the automated test suite:
```bash
php tests/test_sprint0_sprint1.php
```
All 14 tests pass covering password verification, profile lookup, rate limiting, token expiration, single-use reset, and RBAC barriers.
