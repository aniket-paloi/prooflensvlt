# ProofLens — Evidence-Driven Financial Document Investigation Workspace

[![React: 19](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript: 5.8](https://img.shields.io/badge/typescript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite: 6](https://img.shields.io/badge/vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Cloud SQL: PostgreSQL 16](https://img.shields.io/badge/cloud_sql-PostgreSQL%2016-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://cloud.google.com/sql)
[![Firebase: Firestore & Auth](https://img.shields.io/badge/firebase-Auth%20%26%20Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)

> ProofLens is an evidence-first financial document investigation workspace combining deterministic Indian Rupee (₹) ledger reconciliation, coordinate-mapped visual forensics, and cryptographic audit trails for retail loan underwriting.

---

## Live Deployments

- **Live Application:** [Launch ProofLens Workspace](https://ais-pre-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)
- **Development Environment:** [Open Dev Environment](https://ais-dev-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)

---

## Project Structure

```text
prooflens/
├── server.ts                             # Express + Vite SSR entry point & full-stack API route router
├── server/                               # Backend forensic analysis, ingestion & ledger store
│   ├── store.ts                          # In-memory ProofLens repository with JSON persistence
│   ├── analyzer.ts                       # INR base-10 Decimal claims engine & multi-document cross-checks
│   ├── extractor.ts                      # PDF token extractor, coordinate mapper & regex parsers
│   ├── aiForensics.ts                    # Visual layer forensics (ELA, font baseline offsets, sharpness)
│   ├── audit.ts                          # Monotonic SHA-256 hash-chain audit ledger
│   ├── agent.ts                          # Bounded AI investigation copilot & reasoning tools
│   └── pdfGenerator.ts                   # 6-section case audit report generator
├── src/                                  # React 19 Frontend application
│   ├── App.tsx                           # Top-level view router and authenticated app shell
│   ├── main.tsx                          # React client DOM mount
│   ├── index.css                         # Tailwind CSS v4 styling & typography
│   ├── firebase.ts                       # Firebase client SDK initialization & OAuth providers
│   ├── api/
│   │   ├── client.ts                     # Typed HTTP client for ProofLens REST API endpoints
│   │   └── googleDocs.ts                 # Google Docs API v1 export & Drive browser integration
│   ├── components/
│   │   ├── LandingPageView.tsx           # Stoic minimalist landing page with capability pillars
│   │   ├── LoginPageView.tsx             # Glassmorphism reviewer authentication & session view
│   │   ├── FilkoDashboardView.tsx        # Executive dashboard with metrics & case packet cards
│   │   ├── DocumentVaultView.tsx         # Real-time search vault & bulk parallel OCR pipeline
│   │   ├── EvidenceViewer.tsx            # 3-panel synchronized evidence comparator with crops
│   │   ├── FinancialReconciliationView.tsx # INR gross/net & split payroll ledger checks
│   │   ├── ClaimGraphView.tsx            # Interactive PROV-O dependency & claim graph
│   │   ├── CoverageMatrixView.tsx        # 4-state verification matrix & field correction editor
│   │   ├── DossierReportView.tsx         # Multi-channel exporter (Google Docs, PDF, JSON)
│   │   ├── DataVisualizationView.tsx     # Dynamic Recharts financial analytics (Bar/Line/Pie)
│   │   ├── IntegrityHistoryView.tsx      # Immutable SHA-256 cryptographic audit timeline
│   │   ├── BoundedCopilotPanel.tsx       # Side-panel reasoning companion & investigation copilot
│   │   ├── UploadCaseModal.tsx           # Multi-file PDF packet ingestion modal
│   │   ├── CapabilitiesModal.tsx         # Subsystems architecture & forensic diagnostic probe
│   │   ├── FieldCorrectionModal.tsx      # Reviewer field correction modal with reason capture
│   │   ├── CompareEvidenceModal.tsx      # Side-by-side evidence token cross-comparison modal
│   │   ├── DocumentsDataView.tsx         # Extracted document field table and metadata view
│   │   ├── AuthModal.tsx                 # In-app authentication & credential modal
│   │   └── StatusBadge.tsx               # Unified review status & severity badge components
│   ├── db/
│   │   ├── schema.ts                     # Relational PostgreSQL table definitions (Drizzle ORM)
│   │   ├── queries.ts                    # Type-safe Cloud SQL queries & non-blocking sync helpers
│   │   ├── index.ts                      # Cloud SQL pg.Pool connection management
│   │   └── drizzle.config.ts             # Drizzle Kit migration & introspect configuration
│   ├── lib/
│   │   └── firebase-admin.ts             # Server-side Firebase Admin SDK initialization
│   ├── middleware/
│   │   └── auth.ts                       # Firebase ID token verification Express middleware
│   ├── types/
│   │   └── prooflens.ts                  # Canonical TypeScript domain contracts & data models
│   └── utils/
│       └── dossierPdfExport.ts           # Client-side signed PDF report generator (jsPDF)
├── storage/                              # Persistent state storage & ingested PDF byte preserves
│   ├── prooflens_state.json              # Serialized cases, documents, runs, and audit blocks
│   ├── checkpoints.json                  # Retained offline cryptographic verification checkpoints
│   └── originals/                        # Content-addressed binary document storage (.bin)
├── public/                               # Static assets, logos, and PDF.js worker distribution
│   ├── assets/aistudio/                  # Geometric app logo & visual assets
│   └── pdf.worker.min.mjs                # Standalone PDF.js worker script
├── firestore.rules                       # Hardened ABAC security rules for Firebase Firestore
├── firebase-blueprint.json               # Intermediate representation (IR) schema definition
├── firebase-applet-config.json           # Provisioned Firebase project & database credentials
├── package.json                          # Project dependencies & build scripts
├── tsconfig.json                         # TypeScript compiler configuration
└── vite.config.ts                        # Vite build tool and development server configuration
```

---

## License

Distributed under the Apache-2.0 License. See `LICENSE` for details.
