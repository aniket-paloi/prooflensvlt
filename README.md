# ProofLens — Evidence-Driven Document Investigation Workspace

ProofLens is an enterprise document verification and forensic audit platform built for credit underwriters, fraud analysts, and compliance teams. Unlike black-box automated rejection systems that output uninterpretable authenticity scores, ProofLens provides deterministic, coordinate-mapped evidence, cross-document financial claim reconciliation, visual layer forensics, and cryptographic audit trails.

Designed specifically for Indian underwriting workflows with native Indian Rupee (INR ₹) financial parsing, Lakhs/Crores notation, and support for multi-source salary slips, ITR filings, and bank statements.

---

## Key Capabilities

### 1. Deterministic Claims & Financial Reconciliation
- **Decimal-Exact Math**: Uses base-10 decimal arithmetic (`decimal.js`) to prevent floating-point rounding errors in financial variance checks.
- **Dimensional Alignment**: Normalizes monthly vs. annual figures, gross vs. net earnings, and Indian currency notations before cross-referencing employer salary slips with bank statement credits.
- **Alternative Explanations**: Automatically checks for common legitimate variances (split salary credits, weekend processing delays, statutory deductions) before raising fraud alerts.

### 2. Forensic Inspection & Visual Layer Forensics
- **Coordinate-Mapped Evidence**: Every extracted field anchors to exact page coordinates `[x, y, width, height]` for instant side-by-side document verification.
- **Visual Anomaly Detection**: Highlights font baselines, kerning inconsistencies, sharpness variance, and compression artifacts across suspected PDF text edits.
- **Human-in-the-Loop Corrections**: Reviewers can override, correct, or reject individual field extractions with structured reasoning recorded in the immutable log.

### 3. Document Vault & Real-Time Filter Engine
- **Instant Search**: 0ms client-side filtering matching filenames, original upload names, and MIME content types (`application/pdf`, images, Google Docs) in real-time.
- **Folder Taxonomy & Organization**: Color-coded workspace folders for case files, unfiled document buckets, and bulk move operations.
- **Batch Processing**: Multi-select document queueing for parallel extraction and OCR pipeline execution.

### 4. Interactive Financial Visualizations
- Interactive visual analysis across document sets powered by Recharts (Bar, Line, Pie, and Area charts).
- Dynamic dimension selection: Net pay comparisons, transaction credit breakdowns, month-over-month variances, and deduction splits.

### 5. Multi-Channel Dossier Export
- **Google Docs Export**: Generates structured, styled investigation case dossiers directly to Google Docs using the Google Docs REST API (`batchUpdate`).
- **Google Drive Import**: Browse and import docs directly from connected Google Drive accounts.
- **Signed PDF & JSON Bundles**: Client-side compiled audit dossiers (jsPDF) bundled with full verification trees and tamper-evident metadata.

### 6. Cryptographic Integrity & Audit Trails
- Monotonically increasing SHA-256 hash chains for all reviewer corrections, dispositions, and status changes.
- Dual-layer storage: High-throughput local persistence synchronized with Cloud SQL (PostgreSQL) and Firebase Firestore.

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                       React 19 Frontend                     │
│  (Tailwind CSS, Recharts, Lucide Icons, Google Docs OAuth)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON API
┌──────────────────────────────▼──────────────────────────────┐
│                  Express.js Backend Server                  │
│       (Upload Pipeline, Forensic Engine, Session Auth)      │
└──────────┬───────────────────┬───────────────────┬──────────┘
           │                   │                   │
┌──────────▼─────────┐ ┌───────▼───────────┐ ┌─────▼──────────┐
│ Cloud SQL Postgres │ │ Firebase Auth &   │ │ Google Docs &  │
│    (Drizzle ORM)   │ │ Firestore DB      │ │ Drive API      │
└────────────────────┘ └───────────────────┘ └────────────────┘
```

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Lucide React, Motion
- **Backend**: Node.js, Express, Multer, `tsx`
- **Database & Persistence**:
  - Cloud SQL (PostgreSQL) with Drizzle ORM
  - Firebase Firestore with Attribute-Based Access Control (ABAC) rules
- **Authentication**:
  - PBKDF2-HMAC-SHA512 session tokens (100,000 iterations)
  - Google OAuth 2.0 with Google Docs & Drive scopes
  - Firebase Authentication
- **Export & Document Processing**: Google Docs REST API v1, jsPDF, PDF.js

---

## Database Schema (PostgreSQL via Drizzle)

The Cloud SQL schema manages structured records for auditing, vault documents, and dossier exports:

| Table | Purpose |
|---|---|
| `users` | Investigator credentials, display name, organization, and role |
| `vault_folders` | User-created document folder taxonomy with color tags |
| `investigation_cases` | Case dossier headers, risk rating, applicant metadata |
| `vault_documents` | Document catalog, MIME type, file size, SHA-256 checksums |
| `audit_events` | Tamper-evident log chain containing investigator actions |
| `google_docs_exports` | Registry of Google Docs exports linked to case IDs and URLs |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Google Cloud project with Cloud SQL and OAuth configured (or local mock fallback)

### Environment Configuration

Copy `.env.example` to `.env` and fill in your environment parameters:

```bash
# Server Port
PORT=3000

# Cloud SQL PostgreSQL connection (Optional if using local fallback)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Google Cloud OAuth & Service Account (if syncing server-side)
GOOGLE_PROJECT_ID=core-module-bc9s2
```

### Installation

```bash
# Install dependencies
npm install

# Run development server (runs full-stack Express + Vite on port 3000)
npm run dev
```

The application will be live at `http://localhost:3000`.

### Production Build

```bash
# Compile TypeScript and bundle frontend assets
npm run build

# Start production server
npm start
```

### Code Quality & Validation

```bash
# Run TypeScript compilation and strict type checks
npm run lint

# Check security rules and bundle integrity
npm run build
```

---

## Security Model

1. **In-Memory OAuth Tokens**: Google Workspace access tokens are held exclusively in volatile memory for the duration of the session and are never written to `localStorage` or `sessionStorage`.
2. **Password Hashing**: Local reviewer authentication uses salted PBKDF2 with SHA-512 and 100,000 key derivation iterations.
3. **ABAC Security Rules**: Firestore access is strictly partitioned by user UID; PII is isolated into owner-only subcollections (`/users/{uid}/private/info`).
4. **Append-Only Auditing**: Reviewer edits cannot overwrite previous verification logs; each correction generates an incremental cryptographic block in the audit trail.

---

## License

Internal Enterprise Software. All rights reserved.
