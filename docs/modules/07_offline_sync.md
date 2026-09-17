# Module 07 — PWA Offline Architecture & Synchronisation

## 1. Overview & Objectives
Module 07 delivers the offline-first foundation and two-way synchronisation pipeline for the TMHIS Homeschooling platform. Designed for rural and peri-urban Ugandan contexts with intermittent power and internet connectivity, it enables learners and parents to:
- Download curriculum assets, lessons, worksheets, parental guides, and quizzes to local IndexedDB storage.
- Continue learning sessions, reading notes, and attempting assessments completely offline.
- Queue offline learning events, lesson milestone transitions, and quiz submissions in IndexedDB.
- Automatically or manually synchronise when internet connectivity is restored, with atomic deduplication using UUIDs.

---

## 2. Architecture & Sync Pipeline

```mermaid
flowchart LR
    subgraph Client Device (Offline PWA)
        SW[Service Worker] --> CACHE[Cache Storage: HTML, CSS, JS]
        IDB[(IndexedDB Storage)] --> |Queue Events| OQ[Offline Sync Queue]
    end

    subgraph Sync Engine
        OQ --> |Online Sync Event / Batch Request| API[/api/sync/batch/]
    end

    subgraph Server (MySQL Backend)
        API --> LOG[sync_log: UUID Idempotency]
        API --> PR[progress_records]
        API --> AR[assessment_results]
        API --> LA[learning_activities]
    end
```

---

## 3. Database Schema
- **`devices`**:
  - `device_id` (PK, VARCHAR)
  - `user_id` (FK to `users`)
  - `device_type` (`android`, `ios`, `desktop_browser`, `tablet`)
  - `client_version`, `last_sync_at`, `sync_token`
- **`sync_queue`**:
  - `queue_id` (PK, BIGINT)
  - `device_id`, `user_id`
  - `entity_type` (`progress`, `assessment_attempt`, `activity_heartbeat`)
  - `payload_json` (JSON)
  - `status` (`pending`, `processed`, `failed`)
- **`sync_log`**:
  - `log_id` (PK, BIGINT)
  - `sync_uuid` (UNIQUE VARCHAR)
  - `device_id`, `user_id`, `synced_at`, `status`, `summary`

---

## 4. REST API Endpoints
- `POST /api/sync/register-device`: Registers a client PWA device.
- `GET /api/sync/pull-updates?since=<timestamp>&class_id=<id>`: Delta sync endpoint fetching newly published lessons, guides, and assessments since last sync.
- `POST /api/sync/push-batch`: Ingests a batch of offline actions with idempotent UUID processing.
- `GET /api/sync/status`: Retrieves device sync telemetry, last sync timestamp, and server queue state.

---

## 5. Automated Test Suite
- Test Script: `tests/test_sprint7_offline_sync.php`
- Assertions: **11 / 11 passed (100%)**.
