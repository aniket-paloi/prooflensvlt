# ProofLens — Evidence-Driven Financial Document Investigation Workspace

[![Tests: 51 Passed](https://img.shields.io/badge/tests-51%20passed-10b981?style=flat-square)](backend/tests/)
[![Python: 3.11–3.13](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-18181b?style=flat-square)](https://www.python.org/)
[![Frontend: React 18 + TypeScript](https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-18181b?style=flat-square)](frontend/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)

ProofLens is an evidence-first document investigation workspace designed for retail loan packets and financial underwriting (Loan Application Forms, Consecutive Salary Slips, and Covering Bank Statements).

Rather than relying on black-box risk scores or speculative authenticity percentages that produce false positives, ProofLens grounds every finding in observable pixel coordinates, deterministic arithmetic ledgers, PDF stream operator audits, and multi-document cross-checks—keeping human underwriters in complete control.

---

## Live Applications

- **Development Environment:** [https://ais-dev-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app](https://ais-dev-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)
- **Production / Shared Preview:** [https://ais-pre-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app](https://ais-pre-gqstqya4d2tsof4id7fgwb-863038884571.asia-southeast1.run.app)

---

## Key Capabilities

1. **Dual-Layer Text & Stream Cross-Check**
   - Compares raw PDF content streams (`/Tj`, `/TJ`, `/Do`) against visible rendered text layers.
   - Detects invisible white-on-white text, font baseline displacements (e.g. 3.5px offset on tampered figures), and embedded instruction strings.

2. **Deterministic Financial Ledger Reconciliation**
   - Uses Python `Decimal` arithmetic for zero floating-point error across all ledger operations.
   - Verifies row-by-row running balance integrity, matches declared income to net credits, and automatically aggregates split or multi-deposit payroll disbursements.

3. **Visual Forensics & Lightweight Region Classifier**
   - OpenCV-based Laplacian sharpness variance, contrast boundary edge analysis, and Error Level Analysis (ELA) baselines.
   - Lightweight MobileNetV3 Small region classifier to flag candidate spliced crops and stamp anomalies without speculative accusation.

4. **PROV-O Aligned Evidence Graph**
   - Directed acyclic graph projecting the complete lineage of Documents → Pages → Fields → Claims → Transactions → Findings with explicit provenance categorizations (`KNOWN_DERIVATION`, `INDEPENDENT_ACQUISITION`).

5. **Reviewer Coverage Matrix & Immutable Corrections**
   - 4-state verification matrix (Verified, Discrepancy, Unverifiable, Pending).
   - In-line field correction propagation that recalculates dependent balances while preserving an immutable history of `FieldRevision` entries.

6. **Cryptographic Hash Chain & Offline Verification**
   - Every file ingestion, observation, and reviewer disposition appends to a canonical JSON SHA-256 event hash chain.
   - Retained offline checkpoints can be validated bit-for-bit by independent compliance reviewers.

7. **Simulation Lab & What-If Branching**
   - **FraudSim**: Isolated synthetic laboratory for testing controlled anomalies (salary splices, ledger gaps, ghost text) in a sandbox environment.
   - **What-If Sandbox**: Non-destructive counterfactual branching engine allowing reviewers to test alternative hypotheses without mutating official case records.

8. **Audit Dossier & Manifest Generation**
   - Generates official 6-section PDF audit reports with executive summaries, check matrices, and visual crop appendices via ReportLab.
   - Exports machine-readable canonical JSON manifests freezing the complete case state.

---

## User Interface & Design System

ProofLens features an editorial, high-clarity interface inspired by the Stoic iOS aesthetic:
- **Warm Paper Canvas:** `#FBFBF9`
- **Deep Ink Typography:** `#121212` / `#18181B`
- **Card Surfaces:** Pure white `#FFFFFF` with hairline borders `#E8E8E6` and generous rounded corners (`rounded-3xl` / `rounded-2xl`).
- **Reviewer Status Accents:** Subdued terracotta `#C85A32` for discrepancies, tranquil sage `#2D6A4F` for verified matches, warm ochre `#B8860B` for warnings.

### Included Application Views
- **Landing Page:** Minimalist overview highlighting core investigative pillars and direct entry points.
- **Reviewer Login:** Sovereign reviewer authentication configured for lead investigators.
- **Investigation Workspace:** 3-panel synchronized comparator with page navigation, zoom controls, and token bounding-box overlays.
- **Reconciliation View:** Payroll credit breakdown, gross-to-net tax spreads, and audited running balance ledgers.
- **Forensics View:** Stream vs. OCR text comparison, font baseline analysis, and MobileNetV3 crop scores.
- **Claim Graph:** Interactive dependency projection mapping claims, sources, and dispositions.
- **Coverage Matrix:** Full audit matrix with inline correction editor.
- **Dossier & Exports:** Report generator for 6-section PDF dossiers and JSON manifests.
- **Documents Manager:** Packet uploader with SHA-256 hash preservation.
- **Audit Timeline:** Real-time event log with SHA-256 hash chain verification.
- **Simulation Lab:** FraudSim testbed and What-If hypothesis sandbox.
- **Reviewer Analytics:** Disposition metrics and active-learning telemetry governance.

---

## Quick Start

### 1. One-Click Launchers (Windows)

- **Start Web App + Backend:** Double-click `start_prooflens.bat` (or run `run_prooflens.bat`).
  - Web UI opens at: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
  - Backend runs at: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Run All Tests:** Double-click `run_tests.bat`.

### 2. Manual Setup & Execution

#### Backend (FastAPI + SQLAlchemy)
```bash
# Ensure dependencies are installed
pip install fastapi uvicorn sqlalchemy pymupdf opencv-python-headless reportlab torch torchvision

# Start development server
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
- Interactive API Documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health Readiness Endpoint: [http://127.0.0.1:8000/health/ready](http://127.0.0.1:8000/health/ready)

#### Frontend (React 18 + Vite + Tailwind CSS)
```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
- Web Application: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

---

## Test Suite

Run the full pytest suite (51 unit and integration tests):

```bash
python -m pytest backend/tests -v
```

Execute the held-out blind evaluation benchmark:

```bash
python -c "from backend.evaluation.eval_suite import run_blind_evaluation; print(run_blind_evaluation())"
```

Verify the frontend TypeScript build:

```bash
cd frontend
npm run build
```

---

## Repository Structure

```text
ProofLens/
├── backend/
│   ├── app/
│   │   ├── agent/         # Bounded investigation state machine & tools
│   │   ├── analytics/     # Reviewer feedback analytics & governance policies
│   │   ├── api/           # PROV-O claim graph and custom projections
│   │   ├── audit/         # SHA-256 hash chain timeline & offline verifier
│   │   ├── core/          # Database engine, config, and audit primitives
│   │   ├── financial/     # Decimal ledger reconciliation & correction engine
│   │   ├── forensics/     # OpenCV visual baselines & MobileNetV3 adapter
│   │   ├── ingestion/     # PDF validation, SHA-256 byte preservation & routing
│   │   ├── lab/           # FraudSim isolated synthetic manipulation lab
│   │   ├── models/        # SQLAlchemy ORM models (Case, Document, Field, Claim, Finding)
│   │   ├── parsers/       # PyMuPDF token geometry, table binning & crosscheck
│   │   ├── reports/       # 6-section ReportLab PDF dossier & JSON manifest
│   │   ├── routers/       # FastAPI REST endpoints
│   │   ├── schemas/       # Pydantic v2 validation contracts
│   │   └── simulation/    # What-If hypothetical investigation branching
│   ├── evaluation/        # Held-out evaluation suite & empirical metrics
│   ├── generator/         # Synthetic packet generator & PDF builder
│   └── tests/             # 51 integration & unit tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/   # Stoic iOS Landing Page
│   │   │   ├── auth/      # Sovereign Reviewer Login Page
│   │   │   ├── workspace/ # 3-panel synchronized evidence comparator
│   │   │   ├── financial/ # Payroll reconciliation & balance ledger
│   │   │   ├── forensics/ # Stream crosscheck & region classifier view
│   │   │   ├── graph/     # PROV-O claim graph projection
│   │   │   ├── coverage/  # Audit check coverage matrix & correction editor
│   │   │   ├── dossier/   # PDF dossier viewer & JSON manifest export
│   │   │   ├── documents/ # Multi-document packet manager
│   │   │   ├── audit/     # Immutable SHA-256 audit timeline
│   │   │   ├── lab/       # FraudSim & What-If simulation sandbox
│   │   │   └── analytics/ # Telemetry & active learning governance
│   │   ├── services/      # Typed API client
│   │   ├── types/         # TypeScript data contracts
│   │   └── App.tsx        # Application root and navigation router
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── fictional_packets/ # Curated multi-document loan packets
│   └── manifests/         # Train, validation, and test split manifests
├── docs/
│   ├── architecture.md    # System architecture and data flow diagrams
│   ├── capability_matrix.md # Empirical precision/recall metrics & limitation scope
│   └── progress.md        # Comprehensive milestone execution tracker
├── ml/
│   ├── checkpoints/       # Trained MobileNetV3 Small region classifier weights
│   ├── dataset.py         # Candidate crop dataset pipeline
│   ├── train.py           # Model training pipeline
│   └── MODEL_CARD.md      # Model card, ethical framing, and limitations
├── start_prooflens.bat    # Windows batch launcher (backend + frontend + browser)
├── run_prooflens.bat      # Alternative batch launcher
└── run_tests.bat          # One-click Windows test suite runner
```

---

## License

ProofLens is distributed under the Apache-2.0 License. Third-party dependencies are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
