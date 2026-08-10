# 5S Tool Command Center v3

A single-file, zero-backend Progressive Web App (PWA) for industrial inventory management, 5S compliance, and tool tracking.

## Overview
This system operates entirely on the client-side within a single `index.html` file. Data persists in the browser's `localStorage` with JSON import/export functionality. It features Role-Based Access Control (RBAC), SHA-256 encrypted PIN logins, and a dual-language (English/Russian) interface.

## Deployment Architecture (CI/CD)
The codebase is managed via Git and GitHub. When new features are pushed to the `main` branch, **Cloudflare Pages** automatically builds and hosts the PWA in a secure, private environment. This guarantees zero-downtime continuous delivery without the overhead of maintaining a traditional backend server or database.

## Key Features

### 1. Advanced Barcode & QR Integration
- **Hardware Integration:** Supports Keyboard Wedge barcode scanners (under 30ms latency) with a global event listener.
- **Mobile Support:** Built-in PWA QR scanner uses native device cameras (Android 13/17) or software decoders (iOS) for scanning physical QR labels.
- **Labels:** Generates three distinct label formats (A, B, C) featuring Code39 and QR codes, ready for printing.

### 2. Comprehensive Inventory Lifecycle
- **Serialized & Bulk Tracking:** Track expensive assets individually with auto-generated Class prefixes (e.g., DW-DRILL-001) or manage consumable bins with minimum stock alerts.
- **Immutable Audit Trails:** The `Tool ID` acts as an immutable primary key. A dedicated **System Audit Log** tracks every critical event (issuance, return, editing, retirement).
- **Address Storage Allocation:** Assign specific `Zone | Rack | Shelf-Bin` coordinates directly upon tool creation or transfer. 
- **Decommissioning Archive:** Tools with >75% wear are retired and removed from active dashboards but preserved in the Archive.

### 3. Analytics & 5S Auditing
- **Interactive Dashboards:** Click-to-filter visual charts and a Production Culture Radar that grades workstations based on their inventory condition.
- **Care Score:** Employees are graded (0-100) based on return condition history ("Good", "Damaged", "Needs Maintenance").
- **5S Audit Reports:** Automated reports detailing compliance metrics, top retirement root causes, and automated **Procurement Recommendations**.
- **Visual Timelines:** Photos taken of tool conditions are chronologically embedded directly into the transaction history for clear visual auditing.

### 4. Enterprise Integrations
- **SOP Manuals:** Built-in standard operating procedures (Torque, Battery, 5S) printable as clean forms.
- **Expense Requests:** Automatically populates the official REQ003 Expense Request template in `.xlsx` format for automated procurement logic.
- **Full XLSX Export:** Dumps the entire state (Active, Archive, Audit Logs, Personnel) into a formatted multi-sheet Excel workbook.

## Design & Engineering
Engineered by **Igor Tolipov** · *by Design*
