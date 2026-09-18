# Module 12 — Administration, Security Audit Trail & System Health Engine

## 1. Overview & Objectives
Module 12 delivers the **Security Audit Trail & Technical Administration System** for the **Technology-Based Homeschooling Information System (TMHIS)**. It ensures complete regulatory compliance, accountability, and security monitoring without breaching learner educational privacy boundaries.

---

## 2. Key Features & Capabilities

### 2.1. Immutable Audit Logging
- **Append-Only Logging**: The `audit_trail` table records every administrative, security, authentication, and state-changing event.
- **State Diff Inspector**: Captures before-and-after JSON snapshots, enabling administrators to inspect exact attribute-level modifications (`added`, `modified`, `removed`).
- **Comprehensive Context**: Every audit record stores the Actor (`user_id`, `username`, `role`), Action Type, Target Entity & Record ID, Description, IP Address, User Agent, and Timestamp.

### 2.2. Audit Trail Explorer & CSV Export
- Multi-dimensional filtering by Actor, Action Type, Target Table/Entity, Record ID, Date Range, and keyword search.
- One-click compliant CSV export streaming for regulatory audits.
- Real-time audit KPI metrics: 24h event volume, failed login attempts, sensitive configuration updates, and top actors.

### 2.3. Real-Time System Health Telemetry
- **Database Health**: Connection status, MySQL version, total database size in MB, and table row count aggregations.
- **Offline Sync Queue Telemetry**: Total queue items, pending items, processing status, and dead-letter/failed counts with registered device metrics.
- **Storage Metrics**: Storage breakdown for learning materials, termly exam papers, report snapshots, and total disk free space.
- **Runtime Diagnostics**: PHP engine version, real-time memory usage vs peak allocation, max execution time, upload filesize, and API response latency in milliseconds.
- **System Settings Configuration**: Dynamic key-value configuration management with automatic audit logging on updates.

---

## 3. REST API Specification

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/audit` | `administrator` | Paginated audit trail with multi-filter parameters |
| `GET` | `/api/admin/audit/stats` | `administrator` | Aggregated 24h audit stats and anomaly telemetry |
| `GET` | `/api/admin/audit/{id}` | `administrator` | Single audit record with parsed before/after state diff |
| `GET` | `/api/admin/audit/export` | `administrator` | Streamed CSV download of filtered audit logs |
| `GET` | `/api/admin/system/health` | `administrator` | Real-time system health and telemetry diagnostics |
| `GET` | `/api/admin/system/settings` | `administrator` | Retrieve system administrative settings |
| `PATCH` | `/api/admin/system/settings` | `administrator` | Update system configuration setting (logged to audit trail) |

---

## 4. Verification & Testing
Automated test suite: `tests/test_sprint12_audit_admin.php` (**22/22 tests passing, 100% green**).
