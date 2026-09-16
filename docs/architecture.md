# TMHIS System Architecture & Offline Design

## 1. High-Level Architecture

TMHIS is built using a **Decoupled API-First Layered Architecture** with an **Offline-First Progressive Web Application (PWA)** client:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER (PWA)                            │
│                                                                         │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐  │
│  │    Service Worker     │  │           Application Shell            │  │
│  │ (Cache Storage Assets)│  │      (Responsive Single Page App)      │  │
│  └───────────────────────┘  └────────────────────────────────────────┘  │
│                                                 │                       │
│  ┌──────────────────────────────────────────────┴────────────────────┐  │
│  │                     Client Storage & State Engine                 │  │
│  │  - IndexedDB: Cached lessons, syllabus metadata, quiz questions   │  │
│  │  - Local Sync Queue: Pending offline mutations + UUID keys         │  │
│  │  - Network State Monitor: Automatic reconnection & sync flush     │  │
│  └──────────────────────────────────────┬────────────────────────────┘  │
└─────────────────────────────────────────┼───────────────────────────────┘
                                          │ HTTPS JSON API (REST)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER (PHP 8.2 MVC)                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Middleware Pipeline: Auth (Session/Bearer), RBAC, Rate Limiting   │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Controllers (Route dispatching, Input validation, JSON Responses) │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Domain & Service Logic:                                           │  │
│  │  - Server-Authoritative Auto-Scoring Engine                       │  │
│  │  - Idempotent Sync Processor (UUID de-duplication)                │  │
│  │  - Parent-Child / Teacher-Learner Boundary Authorization          │  │
│  │  - Curriculum Coverage & Compliance Computation                   │  │
│  │  - Comprehensive Audit Logger                                     │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Models & Data Layer (PDO Prepared Statements, ACID Transactions)  │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │    MySQL 8.0 (InnoDB, JSON)    │
                      └───────────────────────────────┘
```

---

## 2. Offline-First PWA Engineering

### A. App Shell Caching (`sw.js` & CacheStorage)
- The Service Worker pre-caches all critical application shell files (`/index.html`, `/css/app.css`, `/js/api.js`, `/js/auth.js`, `/js/app.js`, `/manifest.json`).
- When network disconnects, requests for HTML navigation and static assets resolve immediately from CacheStorage.

### B. Client Data Storage (IndexedDB)
- Structured educational content (Ugandan P1–P7 syllabus, subject units, lesson text, downloaded guides) is stored in the browser's IndexedDB.
- Offline assessment questionnaires and learner answers are preserved in IndexedDB until connectivity is restored.

### C. Idempotent Synchronization Queue
- Every mutation initiated while offline (e.g. lesson completed, assessment attempt submitted) generates a unique `client_transaction_uuid` (UUIDv4).
- Mutations are stored in a local FIFO queue.
- When an online event is detected (`window.addEventListener('online')`):
  1. Acquire local synchronization lock.
  2. Send queue items to `/api/sync` in chronological order.
  3. Server checks `client_transaction_uuid` against `sync_log` in the database.
  4. If duplicate, server returns original ACK without re-executing.
  5. If new, server validates, computes authoritative scores, writes to database in an ACID transaction, and returns ACK.
  6. Client marks record as synced.

---

## 3. Security & RBAC Pipeline

- **Session & Bearer Token Authentication:** Stateful sessions for browser users and HMAC-SHA256 Bearer tokens for API sync.
- **Strict Role Boundaries:** Enforced server-side via `RoleMiddleware`. Roles are never trusted from client request bodies.
- **Rate Limiting & Account Lockout:** 5 failed attempts locks an account for 15 minutes to prevent brute-force attacks.
- **Comprehensive Audit Trail:** All administrative, security, and state-changing actions are logged to `audit_trail` with before/after JSON diffs.
