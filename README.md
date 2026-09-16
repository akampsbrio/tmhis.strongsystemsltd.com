# Technology-Mediated Homeschooling Information System (TMHIS)

> **Academic Project:** Plan B Project for the Degree of **Master of Science in Information Systems (MIS)**  
> **Institution:** Department of Information Systems, School of Computing and Informatics Technology, **Makerere University**, Kampala, Uganda  
> **Educational Target:** Primary One through Primary Seven (**P1–P7**) based on the **Ugandan National Curriculum** (NCDC / MoES)

---

## 1. Executive Summary & Research Context

The **Technology-Mediated Homeschooling Information System (TMHIS)** is an educational information system engineered to facilitate, structure, and monitor primary education (P1–P7) in home-based learning environments across Uganda. 

- [**Interactive Web Documentation Portal**](docs/index.html)
- [**System Architecture & PWA Offline Engine**](docs/index.html#architecture)
- [**Database Schema & Data Dictionary**](docs/index.html#database)
- [**REST API Reference & Conventions**](docs/index.html#api)
- [**Module Documentation (01 – 13)**](docs/index.html#mod-01)
- [**Default Credentials**](CREDENTIALS.md)
1. **Curriculum Alignment & Standardisation:** Ensuring home instruction adheres strictly to the National Curriculum Development Centre (NCDC) guidelines and Ministry of Education and Sports (MoES) competence frameworks.
2. **Pedagogical Support for Parents:** Providing parents (who may lack formal teacher training) with daily lesson guides, suggested schedules, and instructional strategies.
3. **Intermittent Connectivity & Device Constraints:** Bridging the digital divide in low-bandwidth regions through an **offline-first Progressive Web Application (PWA)** that allows uninterrupted learning without internet.
4. **Assessment Integrity & Compliance Monitoring:** Tracking learner progress, objective auto-scoring, teacher observations, and institutional compliance reporting.

---

## 2. Architectural Overview

TMHIS employs a **Decoupled API-First Layered Architecture** with an **Offline-First PWA Client**:

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

## 3. System Actors and Access Boundaries

| Actor | Primary Responsibilities | Access Boundaries |
| :--- | :--- | :--- |
| **Learner** (P1–P7) | - Access curriculum lessons and approved media.<br>- Complete interactive assessments online or offline.<br>- View progress, scores, and badges. | Scoped strictly to own assigned class, enrolled subjects, and personal attempts. P1–P3 is parent-assisted; P4–P7 is self-guided. |
| **Parent / Guardian** | - Register and manage home learners.<br>- Download/print daily parental guides and adjust weekly timetables.<br>- Monitor attendance, lesson completion, and quiz scores.<br>- Direct communication with curriculum officers. | Scoped strictly to verified biological or legal children. Cannot view other families' records. |
| **Teacher** | - Oversee assigned cohort of home learners.<br>- Review subjective/open-ended assessment submissions.<br>- Record qualitative lesson observations and feedback. | Scoped only to home learners explicitly assigned to their oversight. |
| **Curriculum Officer** (NCDC / MoES) | - Structure classes (P1–P7), subjects, terms, and competencies.<br>- Upload, review, version, and approve learning materials.<br>- Set curriculum compliance thresholds.<br>- Broadcast educational announcements and respond to parent queries. | System-wide educational governance and aggregate reporting. No direct private family profiling without authorization. |
| **System Administrator** | - Manage user accounts, role allocations, and security settings.<br>- Monitor offline sync health and server performance.<br>- Inspect security audit logs and manage system backups. | Restricted strictly to technical maintenance. Does **not** have unrestricted educational snooping screens. |

---

## 4. Detailed Module Specifications (01 – 13)

### Module 01: Authentication, Users & RBAC
- Multi-role secure login supporting email or username.
- Bcrypt password hashing and single-use, time-expiring password reset tokens.
- Brute-force protection: IP rate limiting and account lockout after repeated failed attempts.
- Stateful sessions and stateless HMAC Bearer tokens for offline PWA sync.
- Comprehensive security audit logging of all authentication events.

### Module 02: Parent, Family & Learner Management
- Self-service parent registration with family profile capture.
- Learner enrollment for Primary One (P1) through Primary Seven (P7).
- Duplicate prevention mechanism using Full Name + Date of Birth.
- Automatic class-to-subject enrollment upon registration.

### Module 03: Curriculum Structure Management
- Multi-tier curriculum hierarchy: Class $\rightarrow$ Subject $\rightarrow$ Term $\rightarrow$ Lesson Unit.
- Alignment with NCDC primary school syllabi (English, Mathematics, Science, Social Studies, Local Language).
- Competence statements, learning outcomes, and prerequisites definition.

### Module 04: Learning Materials & Digital Delivery
- Management of multimedia materials (PDF notes, worksheets, audio pronunciations, illustrations).
- Material lifecycle: Draft $\rightarrow$ Under Review $\rightarrow$ Approved / Published $\rightarrow$ Retired.
- Version control tracking modifications and preserving historical data.

### Module 05: Parental Guides & Flexible Scheduling
- Structured lesson walkthroughs designed for parents with non-teaching backgrounds.
- Customizable weekly scheduling engine with suggested time allocations per subject.
- Printable lesson summary sheets.

### Module 06: Online & Offline Assessments & Scoring
- Multi-format question bank: Multiple Choice, True/False, Fill-in-the-blank, Short Answer.
- Server-authoritative objective auto-scoring (client scores are never trusted).
- Rubrics for subjective teacher grading and feedback.

### Module 07: PWA Offline Architecture & Synchronisation
- Service Worker caching App Shell and approved media.
- IndexedDB for client-side storage of syllabus units, offline attempts, and mutations.
- Sync engine with Client Transaction UUIDs for idempotent processing (guaranteeing zero duplicate submissions or double scoring).
- Exponential backoff retry logic and dead-letter queue for failed syncs.

### Module 08: Progress Tracking & Dashboards
- Multi-perspective analytical dashboards for Learner, Parent, Teacher, Officer, and Admin.
- Granular tracking: lesson status (`not_started`, `in_progress`, `completed`), duration, and assessment scores.

### Module 09: Reporting & Compliance
- Learner termly and annual report cards with subject averages and teacher comments.
- PDF and CSV export generation.
- District and national curriculum coverage compliance monitoring against MoES thresholds.

### Module 10: In-App Notifications
- Automated triggers for overdue lessons, pending quizzes, new materials, and sync alerts.
- In-app notification center with read/unread state management.

### Module 11: Messaging & Curriculum Communication
- Two-way threaded messaging between Parents and designated Curriculum Officers.
- Broadcast announcements and circulars published by NCDC officers.

### Module 12: Audit Trail & Technical Administration
- Immutable `audit_trail` table capturing User ID, Action Type, Table Affected, IP Address, User Agent, and Before/After JSON snapshots.
- System health checks and sync queue diagnostics.

### Module 13: Testing & Dissertation Validation
- Automated unit and integration test suites covering security, scoring, offline sync, and role boundaries.
- Empirical evidence generation for dissertation evaluation.

---

## 5. Technology Stack & Database Design

- **Backend:** PHP 8.2 (Modular MVC, Native PDO, PSR-compliant routing)
- **Frontend / Client:** Progressive Web App (PWA), Service Worker API, IndexedDB API, Vanilla JS (ES6+), Modern Responsive CSS
- **Database:** MySQL 8.0 (InnoDB engine, `utf8mb4_unicode_ci`, Foreign Key constraints, JSON data types for sync payloads and audit diffs)
- **Web Server:** Apache 2.4 (with `mod_rewrite` and `mod_headers`)

---

## 6. API Conventions

All API responses strictly adhere to a standardized JSON envelope:

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable status message",
  "errors": []
}
```

### Standard HTTP Status Codes:
- `200 OK` / `201 Created`: Request processed successfully.
- `400 Bad Request`: Malformed syntax or invalid state.
- `401 Unauthorized`: Unauthenticated / Missing token.
- `403 Forbidden`: Authenticated user lacks permission for this role.
- `404 Not Found`: Resource does not exist.
- `409 Conflict`: Duplicate entry (e.g. email or learner already exists).
- `422 Unprocessable Entity`: Input validation failure.
- `423 Locked`: Account temporarily locked due to repeated failed logins.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Server Error`: Unhandled server exception.

---

## 7. Default System Accounts for Demonstration & Evaluation

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@tmhis.org` | `Admin@2026!` | Technical System Administration, User Accounts, Audit Trail |
| **Curriculum Officer** | `officer.ncdc@tmhis.org` | `Officer@2026!` | NCDC Curriculum Setup, Materials Review, Compliance Reports |
| **Teacher** | `teacher.mukasa@tmhis.org` | `Teacher@2026!` | Assigned Learners Oversight, Assessment Review & Grading |
| **Parent** | `parent.namubiru@tmhis.org` | `Parent@2026!` | Home Learning Facilitation, Learner Management, Progress & Schedules |

---

## 8. Installation & Setup Instructions

### Prerequisites
- PHP 8.2 or higher with `pdo_mysql`, `mbstring`, `json`, `session`, `openssl` extensions enabled.
- MySQL 8.0 or MariaDB 10.5+.
- Apache Web Server with `mod_rewrite` enabled.

### Step 1: Database Setup
Import the database schema and initial roles:
```bash
mysql -u tmhis -p tmhis < TMHIS_Antigravity_Plan/TMHIS_DATABASE.sql
```

### Step 2: Seed Demo Accounts
Run the seed script to populate test accounts:
```bash
php database/seeds/seed_demo_users.php
```

### Step 3: Run Automated Test Suite
Verify that all core components and security constraints pass:
```bash
php tests/test_sprint0_sprint1.php
```

---

## 9. Academic Citation & Declaration

> **Project Title:** A Technology-Mediated Homeschooling Information System for Primary Education (P1–P7) Using the Ugandan Syllabus  
> **Degree:** Master of Science in Information Systems (Plan B Research Project)  
> **Institution:** Makerere University, Kampala, Uganda  
> **Copyright:** &copy; 2026 Makerere University & Author. All rights reserved.
