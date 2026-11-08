# ProofLens — Evidence-Driven Financial Document Investigation Workspace

[![Vite: 8.3](https://img.shields.io/badge/vite-8.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React: 19](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript: 7.0](https://img.shields.io/badge/typescript-7.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloud SQL: PostgreSQL](https://img.shields.io/badge/cloud_sql-PostgreSQL%2016-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://cloud.google.com/sql)
[![Firebase: Firestore & Auth](https://img.shields.io/badge/firebase-Auth%20%26%20Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)

ProofLens is an evidence-first financial document investigation workspace designed for credit underwriters, fraud examiners, and compliance officers evaluating retail loan packets (Loan Application Forms, Consecutive Salary Slips, and Covering Bank Statements).

Rather than relying on black-box risk scores or speculative authenticity percentages that produce false positives, ProofLens grounds every finding in observable pixel coordinates, deterministic arithmetic ledgers, visual layer forensics, and multi-document cross-checks—keeping human underwriters in complete sovereign control.

---

## Live Deployments

- **Live Application:** [Launch ProofLens Workspace](https://ais-pre-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)
- **Development Environment:** [Open Dev Environment](https://ais-dev-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)

---

## Key Capabilities

1. **Deterministic Financial Ledger Reconciliation**
   - Base-10 Decimal arithmetic (`decimal.js`) ensuring zero floating-point rounding errors across Indian Rupee (INR ₹) transactions.
   - Reconciles declared monthly/annual income against net salary credits, statutory deductions (PF, TDS, Professional Tax), and multi-tranche split payroll disbursements.

2. **Coordinate-Anchored Evidence & Visual Forensics**
   - Every extracted claim, table cell, and transaction is mapped to exact page bounding boxes `[x, y, width, height]` on the original PDF or scan.
   - Inspects font baseline displacements, kerning anomalies, sharpness variance, and compression boundary irregularities.

3. **Document Vault & Real-Time Filter Engine**
   - Instant client-side search across filenames (`displayName`, `originalFilename`) and content types (`application/pdf`, images, Google Docs).
   - Folder taxonomy with color-coded tags and multi-file bulk parallel OCR processing.

4. **Interactive Financial Analytics**
   - Recharts-powered data visualization engine allowing underwriters to dynamically switch chart types (Bar, Line, Area, Pie) and compare declared vs. credited income.

5. **Multi-Channel Dossier Export**
   - **Google Docs**: Exports formatted investigation dossiers directly to Google Docs using the Google Docs REST API (`documents.create` and `batchUpdate`).
   - **Google Drive**: In-app Drive browser to import external docs directly into case packets.
   - **Signed PDF & JSON Manifests**: Complete tamper-evident audit dossiers compiled client-side with full evidence coordinate appendices.

6. **Cryptographic SHA-256 Audit Chain**
   - Monotonically increasing SHA-256 hash chains committing every field correction, reviewer disposition, and risk assessment.
   - Dual-persistence across Cloud SQL PostgreSQL and Firebase Firestore.

---

## Architecture & Tech Stack

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        React 19 + TypeScript SPA                       │
│      (Tailwind CSS v4, Recharts, Lucide Icons, Google Docs OAuth)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON API
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Express Full-Stack Server                        │
│          (Document Ingestion, Forensic Analysis, Session Auth)         │
└──────────────┬────────────────────┬────────────────────┬───────────────┘
               │                    │                    │
┌──────────────▼──────┐ ┌───────────▼──────────┐ ┌───────▼───────────────┐
│ Cloud SQL Postgres  │ │ Firebase Firestore   │ │ Google Workspace API  │
│ (Drizzle ORM & pg)  │ │ (ABAC Security Rules)│ │ (Docs & Drive v1)     │
└─────────────────────┘ └──────────────────────┘ └───────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Recharts, Motion, Lucide React
- **Backend**: Node.js, Express, Multer, `tsx`
- **Databases**:
  - Cloud SQL (PostgreSQL 16) with Drizzle ORM
  - Firebase Firestore Enterprise with Attribute-Based Access Control (`firestore.rules`)
- **Authentication**:
  - PBKDF2-HMAC-SHA512 session tokens (100,000 iterations)
  - Firebase Authentication & Google OAuth 2.0 with in-memory token caching

---

## Relational Database Schema (Cloud SQL / Drizzle)

The PostgreSQL database maintains structured records for underwriting audits and vault documents:

| Table | Purpose |
|---|---|
| `users` | Investigator profiles, roles, and session timestamps |
| `vault_folders` | User folder taxonomy for organizing loan packets |
| `investigation_cases` | Case headers, risk assessments, and applicant metadata |
| `vault_documents` | File catalog, MIME types, file sizes, and SHA-256 checksums |
| `audit_events` | Tamper-evident cryptographic audit logs |
| `google_docs_exports` | Registry linking case dossiers to Google Docs URLs |

---

## Getting Started

### Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Run full-stack dev server (Express + Vite on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Production Build

```bash
# Typecheck and build frontend assets
npm run build

# Start production server
npm start
```

### Code Quality

```bash
# Run TypeScript compilation and strict validation
npm run lint
```

---

## Security Invariants

1. **In-Memory OAuth Token Isolation**: Google Workspace access tokens are stored strictly in volatile memory and are never serialized to `localStorage` or cookies.
2. **Deterministic Financial Math**: Eliminates IEEE 754 floating-point inaccuracies through base-10 Decimal math.
3. **Hardened Firestore Security Rules**: Enforces zero-trust default-deny access with isolated user PII subcollections (`users/{uid}/private/info`).

---

## License

Distributed under the Apache-2.0 License. See `LICENSE` for details.
