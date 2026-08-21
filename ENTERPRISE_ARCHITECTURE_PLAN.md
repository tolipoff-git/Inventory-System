# Enterprise Architecture & Synchronization Plan

**5S Tool Command Center — Industrial-Grade Architecture & Distributed Synchronization**  
**Document Version:** 1.2.0  
**Target Platform:** Cloudflare Enterprise Edge + Hybrid Cloud (PostgreSQL / AWS Aurora)  
**Classification:** Technical Architecture Specification  

---

## Table of Contents

- [1. System Philosophy, Operational Story & Core Business Logic](#1-system-philosophy-operational-story--core-business-logic)
  - [1.1 The Living System Concept: Two Sides of One Pipeline](#11-the-living-system-concept-two-sides-of-one-pipeline)
  - [1.2 The 5-Step Operational Closed Loop: A Day on the Floor](#12-the-5-step-operational-closed-loop-a-day-on-the-floor)
  - [1.3 Five Operational Personas & User Journeys](#13-five-operational-personas--user-journeys)
  - [1.4 Core Guiding Principles](#14-core-guiding-principles)
- [2. Executive Summary & Problem Statement](#2-executive-summary--problem-statement)
  - [2.1 Context & Background](#21-context--background)
  - [2.2 Limitations of MVP Architecture](#22-limitations-of-mvp-architecture)
  - [2.3 Strategic Enterprise Objectives](#23-strategic-enterprise-objectives)
- [3. Architectural Evolution: MVP vs Enterprise](#3-architectural-evolution-mvp-vs-enterprise)
  - [3.1 Comparison Matrix](#31-comparison-matrix)
  - [3.2 Gap Analysis](#32-gap-analysis)
- [4. Target System Architecture](#4-target-system-architecture)
  - [4.1 High-Level Architecture Topology](#41-high-level-architecture-topology)
  - [4.2 Component Breakdown](#42-component-breakdown)
  - [4.3 Data Flow & Traffic Routing](#43-data-flow--traffic-routing)
- [5. Data Layer & Financial-Grade Ledger](#5-data-layer--financial-grade-ledger)
  - [5.1 Double-Entry Inventory Accounting](#51-double-entry-inventory-accounting)
  - [5.2 Event Sourcing & Immutable Journal](#52-event-sourcing--immutable-journal)
  - [5.3 Schema Definitions & Relational Entities](#53-schema-definitions--relational-entities)
- [6. Edge Computing & Serverless Backend](#6-edge-computing--serverless-backend)
  - [6.1 Cloudflare Pages Functions & Workers API](#61-cloudflare-pages-functions--workers-api)
  - [6.2 Cloudflare Hyperdrive & Connection Pooling](#62-cloudflare-hyperdrive--connection-pooling)
  - [6.3 Cloudflare Durable Objects for Real-Time State & Bin Locks](#63-cloudflare-durable-objects-for-real-time-state--bin-locks)
- [7. Client-Side Engine & Offline Storage](#7-client-side-engine--offline-storage)
  - [7.1 WASM SQLite + Origin Private File System (OPFS)](#71-wasm-sqlite--origin-private-file-system-opfs)
  - [7.2 Service Worker Background Sync API](#72-service-worker-background-sync-api)
  - [7.3 Client Transactional Outbox Pattern](#73-client-transactional-outbox-pattern)
- [8. Distributed Synchronization & Conflict Resolution](#8-distributed-synchronization--conflict-resolution)
  - [8.1 Real-Time Push/Pull Protocol (WebSockets / SSE)](#81-real-time-pushpull-protocol-websockets--sse)
  - [8.2 Conflict-Free Replicated Data Types (CRDT) & Vector Clocks](#82-conflict-free-replicated-data-types-crdt--vector-clocks)
  - [8.3 Delta Sync & Tombstone Soft-Deletes](#83-delta-sync--tombstone-soft-deletes)
- [9. Security, Identity & Enterprise Governance](#9-security-identity--enterprise-governance)
  - [9.1 Corporate SSO & Identity Providers (SAML 2.0 / OIDC)](#91-corporate-sso--identity-providers-saml-20--oidc)
  - [9.2 Role-Based and Attribute-Based Access Control (RBAC/ABAC)](#92-role-based-and-attribute-based-access-control-rbacabac)
  - [9.3 Cryptographic Audit Trail & Non-Repudiation](#93-cryptographic-audit-trail--non-repudiation)
- [10. Enterprise ERP & Procurement Integrations](#10-enterprise-erp--procurement-integrations)
  - [10.1 Connectors for SAP, NetSuite, and Coupa](#101-connectors-for-sap-netsuite-and-coupa)
  - [10.2 Automated Material Reorder & Safety Stock Engine](#102-automated-material-reorder--safety-stock-engine)
  - [10.3 Webhook Event Dispatcher](#103-webhook-event-dispatcher)
- [11. Observability, DevOps & Data Migration](#11-observability-devops--data-migration)
  - [11.1 Schema Migrations & Database Versioning](#111-schema-migrations--database-versioning)
  - [11.2 Telemetry, Tracing & Cloudflare Logpush to SIEM](#112-telemetry-tracing--cloudflare-logpush-to-siem)
  - [11.3 Zero-Downtime Migration from MVP LocalStorage](#113-zero-downtime-migration-from-mvp-localstorage)
- [12. Procurement Workspace & Receiving Dock Engine](#12-procurement-workspace--receiving-dock-engine)
  - [12.1 Dedicated Procurement Hub UI & Workflow Architecture](#121-dedicated-procurement-hub-ui--workflow-architecture)
  - [12.2 Two-Way Organic Integration with Physical Warehouse](#122-two-way-organic-integration-with-physical-warehouse)
  - [12.3 Automated Replenishment & Line-Worker Requisition Protocol](#123-automated-replenishment--line-worker-requisition-protocol)
  - [12.4 Receiving Dock, Quality Inspection & Put-Away Bridge](#124-receiving-dock-quality-inspection--put-away-bridge)
  - [12.5 Financial Compliance & Expense Request Artifact Generation](#125-financial-compliance--expense-request-artifact-generation)
- [13. Phased Implementation Roadmap](#13-phased-implementation-roadmap)
  - [13.1 Phase 1: Core Edge Backend & Database Migration](#131-phase-1-core-edge-backend--database-migration)
  - [13.2 Phase 2: Client WASM SQLite & Offline Outbox](#132-phase-2-client-wasm-sqlite--offline-outbox)
  - [13.3 Phase 3: Real-Time Durable Objects Sync](#133-phase-3-real-time-durable-objects-sync)
  - [13.4 Phase 4: Enterprise SSO, RBAC & ERP Connectors](#134-phase-4-enterprise-sso-rbac--erp-connectors)

---

## 1. System Philosophy, Operational Story & Core Business Logic

### 1.1 The Living System Concept: Two Sides of One Pipeline
In a modern production facility or kitting warehouse (e.g., AMZ TYS1), inventory management and procurement are **not two separate applications**. They are two stages of a single, continuous physical pipeline:

```
[ PHYSICAL SHOP FLOOR ]                     [ INVENTORY WAREHOUSE ]                     [ PROCUREMENT & DOCK ]
Technician needs fasteners  ──(Consume)──>  Bin stock reaches min level ──(Reorder)──>  PO generated & shipped
Technician receives parts   <──(Put-Away)── Goods checked into bin      <──(Receive)── Carrier arrives at Dock
```

When systems are fragmented into disconnected tools (spreadsheets, emails, paper sign-off sheets), the result is inevitable:
- Technicians run out of bolts mid-shift because nobody knew the safety stock was depleted.
- The procurement team orders duplicate tools because they cannot see what is already on order or in transit.
- When parcels arrive at the receiving dock, packages sit unopened for days because the receiving clerk does not know which workstation or technician requested them.

The **5S Tool Command Center Enterprise** unites the entire lifecycle into an organic, closed-loop system where **physical shop-floor reality, warehouse storage bins, and procurement operations always mirror each other in real time.**

---

### 1.2 The 5-Step Operational Closed Loop: A Day on the Floor

#### Step 1: Consumption & Deficit Detection on the Floor
- **What happens:** A technician is assembling hardware on the kitting line. As they use fasteners or if a torque wrench fails calibration, they record the checkout or flag the tool as `Maintenance / Scrapped` via a 2-tap mobile scan.
- **The System Reaction:** The local database instantly recalculates on-hand quantities. If the balance drops below the **Safety Stock Threshold (Reorder Point)**, an automated replenishment flag is triggered immediately.

#### Step 2: Intelligent Aggregation & Requisition
- **What happens:** The Procurement Specialist opens their morning dashboard. Instead of wading through unread emails and handwritten notes, they see an **aggregated Deficit Inbox**.
- **The System Reaction:** The system groups all needed items by vendor and category. Part numbers, item descriptions, vendor URLs, IH codes, target bin locations, and estimated unit costs are already filled in automatically from the master item catalog.

#### Step 3: Purchasing, Carrier Tracking & Real-Time Visibility
- **What happens:** The buyer approves the batch and clicks **"Export Expense Request"**. The system instantly generates the official corporate `Expense_Request.xlsx` (REQ003) with active Excel formulas and required FSE cost codes for management sign-off. Once the order is placed, the buyer enters the PO number and carrier tracking ID.
- **The System Reaction:** In the inventory app, the item card updates with an **"Inbound Delivery"** badge: `📦 Inbound: 500 EA (PO #ORD-8821, ETA: Thursday)`, so anyone checking the tool or fastener in the system sees that replenishment has already been ordered and is on the way.

#### Step 4: Dock Receiving, Inspection & 1-Click Put-Away
- **What happens:** The delivery arrives at the receiving dock. The dock clerk scans the QR code or barcode on the packing slip.
- **The System Reaction:** The app displays the exact items, quantities, and target storage locations: `Put Away into: Rack B, Bin 12-04`.
- **Atomic Put-Away:** The clerk confirms receipt of 500 EA. With a single click:
  1. The purchase order status transitions from `In Transit` to `Completed`.
  2. The warehouse on-hand stock increases by +500.
  3. A double-entry ledger event (`STOCK_RECEIVE` from `LOC-VENDOR-RECEIVING` into `LOC-BIN-B12`) is committed.
  4. Any tool that was marked `Pending Delivery` becomes `Active on Floor`.

#### Step 5: Enterprise Governance & ERP Reconciliation
- **What happens:** In the background, Cloudflare Workers and Event Sourcing engines register the completed transaction.
- **The System Reaction:** Cryptographic audit signatures, actor IDs, device fingerprints, and timestamps are sealed into the immutable ledger and pushed to corporate ERP (SAP / NetSuite) and compliance SIEM logs.

---

### 1.3 Five Operational Personas & User Journeys

| Persona | Primary Goal | Daily User Journey in the System |
| :--- | :--- | :--- |
| **1. Shop-Floor Technician** | Fast, frictionless tool & parts checkout | Scans QR on bin/tool with camera → taps Take/Return → works without UI lag, even completely offline. |
| **2. Kitting Team Lead** | Line readiness & 5S audit compliance | Monitors live 5S radar charts → flags worn tools for maintenance → approves tech replenishment requests. |
| **3. Procurement Specialist** | Zero stockouts & accurate purchase orders | Opens Procurement Hub → reviews auto-generated deficits → generates REQ003 Excel forms in 1 click → tracks carrier ETAs. |
| **4. Receiving Dock Clerk** | Rapid freight intake & put-away accuracy | Scans arriving parcel barcode → verifies item quality → confirms put-away into suggested bin → inventory updates instantly. |
| **5. Financial / Quality Auditor** | 100% traceability & cost compliance | Inspects tamper-evident audit trail → tracks asset depreciation & vendor price trends → exports ISO 9001 compliance records. |

---

### 1.4 Core Guiding Principles
1. **Physical Fidelity (What is in the software exists on the shelf):** No phantom inventory. Every digital record maps to a verifiable physical bin, tool, or active purchase order.
2. **Zero-Friction Shop-Floor First:** Technicians must never wait for spinners or network handshakes. Operations take <= 2 taps and < 100ms.
3. **Deterministic Offline Resilience:** If the factory Wi-Fi dies, work never halts. All mutations queue locally and reconcile deterministically upon reconnect.
4. **Organic Bi-Directional Visibility:** Warehouse stockouts trigger procurement; procurement receipts restock the warehouse; neither operates in a silo.

---

## 2. Executive Summary & Problem Statement

### 2.1 Context & Background
The **5S Tool Command Center** is currently deployed as an offline-first Progressive Web Application (PWA) hosted on Cloudflare Pages. It serves shop-floor operations, kitting lines, and technical workstations for hardware tracking, fastener inventory, and tool assignments.

### 2.2 Limitations of MVP Architecture
1. **Unbounded Race Conditions:** Local storage stores flat item snapshots (`qty: N`). Two technicians checking out parts offline will overwrite each other upon reconnection, causing inventory shrinkage.
2. **Browser Storage Bottlenecks:** `LocalStorage` is synchronous, blocks the main UI thread, and is capped at 5 MB, making high-resolution attachments, full audit logs, and enterprise catalogs impossible.
3. **Absence of Centralized Governance:** Lack of centralized database locking, server-side authentication, and immutable audit logs prevents ISO 9001 / SOC 2 compliance.
4. **No Multi-Facility Isolation:** Inability to handle multi-warehouse (TYS1, TYS2, DEN4) partitioned tenants and centralized supplier restocks.

### 2.3 Strategic Enterprise Objectives
- Deliver **Zero Data Loss** and deterministic conflict resolution across all distributed workstations and offline scanners.
- Ensure **Sub-15ms Read Latency** globally via Cloudflare Edge infrastructure.
- Implement **Financial-Grade Double-Entry Inventory Accounting (Ledger)**.
- Provide turnkey **Single Sign-On (SSO)**, **Role-Based Access Control (RBAC)**, and **Immutable Audit Logs**.

---

## 3. Architectural Evolution: MVP vs Enterprise

### 3.1 Comparison Matrix

| Architectural Dimension | Current MVP Implementation | Target Enterprise Architecture |
| :--- | :--- | :--- |
| **Client Storage** | `window.localStorage` (5MB, string-only) | **WASM SQLite + Origin Private File System (OPFS)** |
| **State Mutation Model** | Direct state replacement (`qty = qty - 1`) | **Event Sourcing + Double-Entry Ledger Transactions** |
| **Sync Protocol** | Manual export/import / no cloud sync | **Bidirectional WebSockets via Durable Objects + Offline Outbox** |
| **Conflict Resolution** | None / Last-Write-Wins (LWW) | **CRDT (Pn-Counters) + Vector Clocks + Bin Reservation Locks** |
| **Database Engine** | None (Client-side browser cache) | **Managed PostgreSQL (AWS Aurora) via Cloudflare Hyperdrive** |
| **Edge Cache / Serverless** | Pure Static Site Hosting | **Cloudflare Pages Functions + Workers + Hyperdrive** |
| **Authentication & IAM** | Hardcoded PIN code check | **Enterprise SAML 2.0 / OIDC (Okta, Azure AD) + mTLS** |
| **Access Control** | Uniform unrestricted access | **Granular RBAC + ABAC with Cryptographic Token Verification** |
| **Audit & Compliance** | Ephemeral browser memory log | **Append-Only Tamper-Evident Ledger + Cloudflare Logpush SIEM** |
| **Integrations** | Static Excel export | **Automated Webhooks + REST/GraphQL ERP Bridges (SAP, NetSuite)** |

### 3.2 Gap Analysis
The evolution requires separating the application into distinct layers:
- **Presentation & Local Engine Layer:** PWA UI using Web Workers and WASM SQLite for ultra-fast local interaction.
- **Edge Routing & Lock Management Layer:** Cloudflare Pages Functions and Durable Objects managing real-time connections and transactional leases.
- **Persistent Core Layer:** Highly available, multi-region PostgreSQL cluster handling ledger storage and ERP sync.

---

## 4. Target System Architecture

### 4.1 High-Level Architecture Topology

```
+-----------------------------------------------------------------------------------+
|                            WORKSTATION & CLIENT TIER                             |
|                                                                                   |
|  [ Industrial Scanner / PWA ]       [ Technician Laptop ]       [ Mobile Scanner / Phone ] |
|  +--------------------------+       +-------------------+       +------------------------+ |
|  | UI (DOM / Canvas / PWA)  |       | UI (Web Component)|       | UI (PWA Mobile)        | |
|  | Web Worker + WASM SQLite |       | WASM SQLite (OPFS)|       | WASM SQLite            | |
|  | Transactional Outbox     |       | Outbox Sync Engine|       | Outbox Sync            | |
|  +------------+-------------+       +---------+---------+       +-----------+------------+ |
+---------------|-------------------------------|-------------------------|---------+
                |                               |                         |
                +-----------------------+-------+-------------------------+
                                        | (HTTPS / WebSocket + mTLS / SSO JWT)
                                        v
+-----------------------------------------------------------------------------------+
|                           CLOUDFLARE EDGE NETWORK                                 |
|                                                                                   |
|  [ Cloudflare Zero Trust / Access Gateway ]                                      |
|    - SAML 2.0 / OIDC Auth Validation                                             |
|    - WAF, Rate Limiting & DDoS Shield                                             |
|                                                                                   |
|  [ Cloudflare Pages Functions ]                 [ Cloudflare Durable Objects ]   |
|    - REST / GraphQL Ingress Endpoints              - Warehouse Zone Coordinator   |
|    - Mutation Validation & Signatures             - Live WebSocket Broadcast     |
|    - Outbox Transaction Ingestion                 - Short-Term Bin Locks         |
|                                                                                   |
|  [ Cloudflare Hyperdrive ]                                                        |
|    - Distributed Connection Pooling & Query Caching (< 15ms latency)             |
+---------------------------------------+-------------------------------------------+
                                        |
                                        | Secure VPC Peering / WireGuard Tunnel
                                        v
+-----------------------------------------------------------------------------------+
|                        ENTERPRISE PERSISTENT DATA TIER                            |
|                                                                                   |
|  [ PostgreSQL Multi-Region Cluster / AWS Aurora ]                                 |
|    - Immutable Ledger Events Table (`inventory_events`)                           |
|    - Master Entities (`items`, `bins`, `facilities`, `users`)                     |
|    - Materialized Projections (`current_stock_view`)                              |
|                                                                                   |
|  [ Cloudflare Logpush ] ─────────> [ SIEM / Datadog / S3 Compliance Bucket ]     |
|  [ ERP Webhook Worker ] ─────────> [ SAP S/4HANA / NetSuite / Coupa ]             |
+-----------------------------------------------------------------------------------+
```

### 4.2 Component Breakdown
1. **Client Engine:** Runs locally in a Web Worker to avoid blocking UI rendering. It queries local WASM SQLite with zero network latency.
2. **Cloudflare Durable Objects:** Acts as the single-source-of-truth coordinator for a specific physical zone or warehouse. Manages active WebSocket connections and arbitrates simultaneous checkouts.
3. **Cloudflare Hyperdrive:** Solves the cold-start and connection latency problem by maintaining persistent connection pools from edge nodes to the central PostgreSQL database.
4. **Master PostgreSQL Database:** Stores the primary immutable financial ledger, foreign keys, constraints, and historical snapshots.

### 4.3 Data Flow & Traffic Routing
- **Read Operations:** Served instantly from local client WASM SQLite. Background queries hit Cloudflare Pages Functions -> Hyperdrive -> Read Replicas.
- **Write Operations:** Written immediately to local SQLite outbox queue, then streamed via WebSocket/HTTPS to the Zone Durable Object. The Durable Object commits the ledger entry to PostgreSQL and broadcasts the delta to all active clients in the facility.

---

## 5. Data Layer & Financial-Grade Ledger

### 5.1 Double-Entry Inventory Accounting
In an enterprise system, stock quantities are treated like financial currency:
- **No inventory is created or destroyed without equal offsetting debits and credits.**
- Every movement requires a `source_location_id` and a `destination_location_id`.
- **System Accounts:**
  - `LOC-VENDOR-RECEIVING`: External incoming goods.
  - `LOC-FLOOR-SCRAP`: Damaged/scrapped items.
  - `LOC-WORK-ORDER-EXPENSE`: Parts consumed in assembly/maintenance.
  - `LOC-BIN-XXXX`: Physical storage bins.

```
Example: Technician checks out 10 fasteners for Assembly Line #1
Debit:   LOC-WORK-ORDER-4091  (+10)
Credit:  LOC-BIN-A12          (-10)
Net Balance Change in Warehouse: -10 Available, +10 Allocated
```

### 5.2 Event Sourcing & Immutable Journal
The database never executes `UPDATE items SET qty = 15`. Instead, it appends immutable events:

```sql
CREATE TABLE inventory_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sequence BIGSERIAL NOT NULL,
    facility_id VARCHAR(32) NOT NULL,
    event_type VARCHAR(64) NOT NULL, -- 'STOCK_CHECKOUT', 'STOCK_RECEIVE', 'BIN_TRANSFER'
    item_id VARCHAR(64) NOT NULL,
    source_location VARCHAR(64) NOT NULL,
    dest_location VARCHAR(64) NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    client_tx_id UUID NOT NULL UNIQUE, -- Idempotency token
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_events_facility_seq ON inventory_events(facility_id, event_sequence);
CREATE INDEX idx_events_item_id ON inventory_events(item_id);
```

### 5.3 Schema Definitions & Relational Entities

```sql
-- Materialized View for Real-Time Stock Queries
CREATE MATERIALIZED VIEW current_inventory_balance AS
SELECT 
    facility_id,
    item_id,
    location_id,
    SUM(CASE WHEN dest_location = location_id THEN quantity ELSE -quantity END) AS on_hand_qty
FROM (
    SELECT facility_id, item_id, dest_location AS location_id, quantity FROM inventory_events
    UNION ALL
    SELECT facility_id, item_id, source_location AS location_id, quantity FROM inventory_events
) transfers
WHERE location_id NOT LIKE 'LOC-SYSTEM-%'
GROUP BY facility_id, item_id, location_id;

-- Master Items Catalog
CREATE TABLE master_items (
    item_id VARCHAR(64) PRIMARY KEY,
    part_number VARCHAR(128) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    min_safety_stock NUMERIC(12, 4) NOT NULL DEFAULT 0,
    reorder_point NUMERIC(12, 4) NOT NULL DEFAULT 0,
    uom VARCHAR(16) NOT NULL DEFAULT 'EA',
    ih_number VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Edge Computing & Serverless Backend

### 6.1 Cloudflare Pages Functions & Workers API
API routes are placed directly within the repository structure under `/functions/api/`:
- `/functions/api/v1/auth/session.ts` — Validates SSO token and returns user permissions.
- `/functions/api/v1/sync/pull.ts` — Returns delta events since client's `last_sequence_number`.
- `/functions/api/v1/sync/push.ts` — Accepts batch transactions from offline outbox.
- `/functions/api/v1/items/[id].ts` — Granular item metadata, bin locations, and stock levels.

### 6.2 Cloudflare Hyperdrive & Connection Pooling
- Cloudflare Workers are distributed across 300+ edge cities. Directly opening a TCP connection to PostgreSQL on every serverless invocation causes database connection exhaustion.
- **Hyperdrive Integration:** Maintains pre-warmed connection pools in every Cloudflare region, reducing database handshake overhead from ~150ms to <15ms.

### 6.3 Cloudflare Durable Objects for Real-Time State & Bin Locks
For real-time multi-user operations, a Durable Object is provisioned per facility/zone (e.g., `ZoneDurableObject("TYS1-ZONE-A")`):
- **WebSockets Coordinator:** Holds persistent WebSocket connections with all tablets and scanners active in that zone.
- **Bin Reservation Locks:** When a user begins scanning a bin, the Durable Object grants a 30-second soft-lock to prevent simultaneous conflicting checkouts.
- **Instant Broadcast:** As soon as an event is validated, the Durable Object pushes the JSON delta down all open WebSockets in under 20ms.

---

## 7. Client-Side Engine & Offline Storage

### 7.1 WASM SQLite + Origin Private File System (OPFS)
The client application drops `localStorage` in favor of an in-browser relational database:
- **`@sqlite.org/sqlite-wasm`** running in a dedicated Web Worker (`db.worker.js`).
- Persisted using the **Origin Private File System (OPFS)** API, providing fast, unmetered, private disk storage.
- Supports complete SQL queries, indexes, and full-text search (FTS5) locally in the browser with sub-millisecond execution times.

### 7.2 Service Worker Background Sync API
- Registered background sync tags: `sync-inventory-outbox`.
- If a technician performs operations in a basement or shielded enclosure with zero cellular/Wi-Fi coverage, the browser queues the sync job.
- When network connectivity is restored (even if the browser tab has been closed), the Service Worker wakes up, executes the sync loop, and receives confirmation from Cloudflare.

### 7.3 Client Transactional Outbox Pattern
Every local user mutation creates a local database transaction with two operations:
1. Mutate local SQLite state projection.
2. Insert transaction payload into local table `client_outbox`:
   ```sql
   CREATE TABLE client_outbox (
       tx_id TEXT PRIMARY KEY,
       created_at TEXT NOT NULL,
       event_type TEXT NOT NULL,
       payload TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_FLIGHT', 'COMMITTED'
       retry_count INTEGER DEFAULT 0
   );
   ```

---

## 8. Distributed Synchronization & Conflict Resolution

### 8.1 Real-Time Push/Pull Protocol (WebSockets / SSE)
The synchronization lifecycle follows an active bi-directional handshake:

```
[ Client Device ]                                  [ Cloudflare Edge ]
       |                                                    |
       | ── 1. CONNECT (Bearer JWT + LastKnownSeq=1042) ──> | (Durable Object)
       | <── 2. CATCH_UP_STREAM (Events 1043...1080) ────── |
       | ── 3. PUSH_OUTBOX_BATCH [tx_01, tx_02] ──────────> |
       | <── 4. ACK_BATCH [tx_01=Committed, tx_02=OK] ───── |
       |                                                    |
       | <── 5. LIVE_DELTA_EVENT (Real-time Broadcast) ──── |
```

### 8.2 Conflict-Free Replicated Data Types (CRDT) & Vector Clocks
1. **Positive-Negative Counters (PN-Counters):** Used for stock counting. Increments and decrements are recorded as independent monotonic vectors.
2. **Vector Clocks:** Every client maintains a state vector `V = { ClientA: seq, ClientB: seq, Server: seq }`. This allows the server to detect whether an event is concurrent or causally dependent.
3. **Business Rule Conflict Resolution:**
   - If two offline technicians checkout the last available part simultaneously:
     - The server commits both transactions in chronological order of `client_timestamp` (verified against drift bounds).
     - The item balance reaches negative stock (`-1`), and an automated **Discrepancy Exception Task** is instantly assigned to the inventory supervisor.

### 8.3 Delta Sync & Tombstone Soft-Deletes
- No record is physically deleted during offline sync cycles.
- Deleted items are marked with `is_deleted = TRUE` and a `deleted_at` timestamp (Tombstone).
- Sync queries filter `WHERE server_sequence > :last_client_seq`, ensuring tombstones propagate properly to all remote clients.

---

## 9. Security, Identity & Enterprise Governance

### 9.1 Corporate SSO & Identity Providers (SAML 2.0 / OIDC)
- Integrated through **Cloudflare Zero Trust Access**.
- Supports enterprise identity providers:
  - **Microsoft Entra ID (Azure AD)**
  - **Okta Identity Cloud**
  - **Google Workspace Enterprise / PingFederate**
- Automatic session revocation and token rotation with short-lived JWTs (15-minute expiration + refresh tokens).

### 9.2 Role-Based and Attribute-Based Access Control (RBAC/ABAC)

```
+--------------------------------------------------------------------------------+
|                         RBAC PERMISSION MATRIX                                 |
+---------------------+-------------+-------------+---------------+--------------+
| Role                | View & Scan | Adjust Qty  | Modify Master | Export Audit |
+---------------------+-------------+-------------+---------------+--------------+
| Operator / Tech     |     YES     |  NO (Scan)  |      NO       |      NO      |
| Lead Specialist     |     YES     |     YES     |      NO       |      NO      |
| Inventory Manager   |     YES     |     YES     |      YES      |     YES      |
| Financial Auditor   |  READ-ONLY  |      NO     |      NO       |   FULL-AUDIT |
| System Admin        |  FULL-ADMIN |  FULL-ADMIN |  FULL-ADMIN   |  FULL-ADMIN  |
+---------------------+-------------+-------------+---------------+--------------+
```

### 9.3 Cryptographic Audit Trail & Non-Repudiation
- Every critical event (adjustments, cycle counts, part scrapping) includes:
  - `actor_uuid` & `actor_email`
  - `client_device_fingerprint`
  - `ip_address` (via Cloudflare header `CF-Connecting-IP`)
  - `signature`: HMAC-SHA256 generated with client device key.
- Tamper-evident hash chain linking each event to the previous event (`prev_event_hash`), guaranteeing full non-repudiation for safety-critical hardware assemblies.

---

## 10. Enterprise ERP & Procurement Integrations

### 10.1 Connectors for SAP, NetSuite, and Coupa
- **Outbound Webhook Worker:** Translates inventory consumption events into ERP-compatible standard payloads (OData, JSON, cXML).
- **Inbound Purchase Order Sync:** Automatically imports PO tracking numbers, vendor part numbers, and expected delivery dates into bin allocations.

### 10.2 Automated Material Reorder & Safety Stock Engine
- Dynamic calculation of reorder triggers:
  $$\text{Reorder Point (ROP)} = (\text{Average Daily Usage} \times \text{Lead Time in Days}) + \text{Safety Stock}$$
- When `current_stock <= ROP`, the system automatically generates an electronic Purchase Requisition (PR) draft ready for approval.

### 10.3 Webhook Event Dispatcher
- Delivers real-time notifications to:
  - Corporate Slack / Microsoft Teams channels for stockout alerts.
  - PagerDuty for critical safety tooling shortages.
  - Manufacturing Execution Systems (MES) to pause assembly steps if required fasteners are missing.

---

## 11. Observability, DevOps & Data Migration

### 11.1 Schema Migrations & Database Versioning
- Managed using **Drizzle ORM** or **Prisma** with explicit, reversible migration files.
- Automated migration runner integrated into Cloudflare CI/CD pipeline via GitHub Actions.

### 11.2 Telemetry, Tracing & Cloudflare Logpush to SIEM
- End-to-end distributed tracing using OpenTelemetry standards.
- Real-time log export via **Cloudflare Logpush** to Datadog, AWS S3, or Splunk.
- Metric dashboards tracking:
  - Edge cache hit ratio (>98% target).
  - Sync latency per warehouse (<50ms p95).
  - Offline queue depth across all active mobile clients.

### 11.3 Zero-Downtime Migration from MVP LocalStorage
1. **Migration Tool:** A built-in client migration script detects legacy `inv_inventory_db` in `localStorage`.
2. **Schema Translation:** Translates unstructured JSON arrays into normalized SQL records.
3. **Ingestion & Validation:** Submits the legacy data bundle to `/api/v1/migration/import` as a single `LEGACY_IMPORT_BATCH` event.
4. **Local Purge:** Verifies server acknowledgment and transitions client storage seamlessly to WASM SQLite OPFS.

---

## 12. Procurement Workspace & Receiving Dock Engine

### 12.1 Dedicated Procurement Hub UI & Workflow Architecture
The application layout introduces a top-level workspace switcher: `[ Category Hub ]` | `[ Detailed Grid ]` | `[ 📦 Procurement Hub ]`.

```
+----------------------------------------------------------------------------------------------------+
|                                  PROCUREMENT HUB WORKSPACE                                         |
+--------------------------+---------------------------+-----------------------+---------------------+
| 1. Shop-Floor Needs      | 2. Active Orders Pipeline | 3. Receiving Dock     | 4. Vendor Catalog   |
|    & Low Stock Triggers  |    & Carrier Tracking     |    & Put-Away Bridge  |    & Expense Forms  |
+--------------------------+---------------------------+-----------------------+---------------------+
| • Stock <= Safety Stock  | • Kanban / Table Matrix   | • Barcode Scan Ingest | • Official REQ003   |
| • Scrapped/Damaged Tools | • Status: Draft -> In-Tx  | • Partial Qty Accept  | • Price History DB  |
| • Tech Requisitions      | • Tracking # / ETA Alert  | • Auto Stock Increment| • Vendor Lead Times |
+--------------------------+---------------------------+-----------------------+---------------------+
```

### 12.2 Two-Way Organic Integration with Physical Warehouse
Procurement operations are directly coupled to physical storage entities in the database:

```
[ Warehouse Physical Floor ]                               [ Procurement Pipeline ]
┌───────────────────────────┐                             ┌────────────────────────┐
│ Item: M6 Socket Cap Screw │ ── 1. Stock <= Safety ROP ─>│ Auto-Generated Draft   │
│ Location: Bin A-12-04     │                             │ Order #ORD-8821        │
│ Status: Low Stock Alert   │                             │ Qty: 500 EA            │
└─────────────▲─────────────┘                             └───────────┬────────────┘
              │                                                       │
              │  2. Dock Check-In: `STOCK_RECEIVE` Event              │
              └───────────────────────────────────────────────────────┘
```

1. **Warehouse -> Procurement Linkage:**
   - Every warehouse item card displays real-time incoming deliveries badge: `Inbound: 20 EA (PO #ORD-9102, ETA: Tomorrow)`.
   - Single-click action on low-stock item: **"Reorder Item"** automatically creates a requisition populated with Part Number, Vendor URL, Safety Stock target quantity, and Primary Bin destination.
2. **Procurement -> Warehouse Linkage:**
   - Each purchase order line item holds a mandatory foreign key `target_item_id` and `target_location_id`.
   - Modifying vendor prices automatically updates estimated replacement values in warehouse asset depreciation logs.

### 12.3 Automated Replenishment & Line-Worker Requisition Protocol
1. **Automated Deficit Detection Engine:**
   ```typescript
   interface ReplenishmentNeed {
       itemId: string;
       partNumber: string;
       currentStock: number;
       safetyStock: number;
       suggestedOrderQty: number;
       primaryVendor: string;
       targetBinLocation: string;
       urgency: 'CRITICAL_STOCKOUT' | 'LOW_STOCK' | 'TOOL_REPLACEMENT';
   }
   ```
2. **Shop-Floor Requisition Gateway:**
   - Technicians on the line can flag damaged tools (`Status: Scrapped`) or request specific consumables with a 2-tap mobile action.
   - Requisitions are automatically triaged into the Procurement Specialist's approval inbox with supervisor sign-off workflows.

### 12.4 Receiving Dock, Quality Inspection & Put-Away Bridge
When physical freight arrives at the facility receiving dock:
1. **Barcode / QR Intake:** Receiving clerk scans shipping label or PO barcode (`#ORD-XXXX`).
2. **Partial Receipts & Discrepancy Handling:**
   - Supports partial fulfillment (e.g., received 300 out of 500 ordered).
   - Rejection logging with mandatory reason classification (`DAMAGED_IN_TRANSIT`, `WRONG_SPECIFICATION`, `MISSING_CERTIFICATE`).
3. **Atomic Put-Away Transaction:**
   - The receiving clerk confirms put-away into the designated bin (e.g., `LOC-BIN-A12`).
   - The engine automatically emits a double-entry ledger event:
     ```sql
     INSERT INTO inventory_events (
         event_type, item_id, source_location, dest_location, quantity, actor_id, metadata
     ) VALUES (
         'STOCK_RECEIVE', 'ITEM-M6-SS', 'LOC-VENDOR-RECEIVING', 'LOC-BIN-A12', 300, 'clerk_42',
         '{"po_number": "ORD-8821", "carrier": "UPS", "tracking": "1Z9999999999999999"}'
     );
     ```
   - Item status instantly transitions from `Pending Delivery` to `Active on Floor` without manual warehouse re-entry.

### 12.5 Financial Compliance & Expense Request Artifact Generation
1. **Automated `Expense_Request.xlsx` (REQ003) Generation:**
   - Direct client-side generation using embedded ExcelJS / template streaming.
   - Enforces 100% compliance with corporate FSE billing codes, department cost centers, and active Excel formulas (`SUM(H15:H44)`).
2. **Vendor Performance & Spend Intelligence:**
   - Tracks actual lead times vs. quoted vendor lead times.
   - Historical unit-cost graphing across past quarters to detect price creep and supplier variance.

---

---

## 13. Phased Implementation Roadmap

### 13.1 Phase 1: Core Edge Backend & Database Migration (Weeks 1–3)
- [ ] Provision AWS Aurora PostgreSQL / Managed PostgreSQL cluster.
- [ ] Implement foundational schema migrations (`inventory_events`, `master_items`, `locations`).
- [ ] Configure Cloudflare Hyperdrive and link to Cloudflare Pages project.
- [ ] Build `/functions/api/v1/sync` REST endpoints for transaction ingestion.

### 13.2 Phase 2: Client WASM SQLite & Offline Outbox (Weeks 4–6)
- [ ] Integrate `@sqlite.org/sqlite-wasm` in a dedicated Web Worker with OPFS storage.
- [ ] Implement the client Transactional Outbox and Service Worker Background Sync.
- [ ] Build automatic migration utility to transition existing `localStorage` data into SQLite.

### 13.3 Phase 3: Real-Time Durable Objects Sync (Weeks 7–9)
- [ ] Deploy Cloudflare Durable Objects for facility zone coordination.
- [ ] Implement WebSocket bidirectional delta streaming.
- [ ] Implement Vector Clock conflict detection and bin lock arbitration.

### 13.4 Phase 4: Enterprise SSO, RBAC & ERP Connectors (Weeks 10–12)
- [ ] Configure Cloudflare Zero Trust SAML 2.0 / OIDC authentication (Okta / Azure AD).
- [ ] Implement RBAC middleware and cryptographic audit signature verification.
- [ ] Implement ERP Webhook connector engine (SAP / NetSuite / Coupa).
- [ ] Conduct end-to-end security penetration testing and load testing under high concurrency.

---

---
*End of Enterprise Architecture Specification.*
