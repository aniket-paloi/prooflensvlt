import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  answerEvidenceGroundedQuestion,
  executeBoundedFindingInvestigation,
  type CaseQuestionResponse,
} from './agent.ts';
import {
  answerQuestionWithGemini,
  enrichInvestigationWithGemini,
  executeForensicCapabilityProbe,
  generateAIExecutiveCaseBrief,
} from './aiForensics.ts';
import {
  computeRevisionFingerprint,
  runDeterministicAnalysis,
} from './analyzer.ts';
import {
  buildDossierExportBundle,
  createAuditEvent,
  generateFrozenDossierArtifact,
  runIsolatedTamperSimulation,
  verifyCaseIntegrity,
} from './audit.ts';
import {
  extractDocumentFromBuffer,
  normalizeMoneyDecimal,
} from './extractor.ts';
import { buildCanonicalFictionalPackets } from './pdfGenerator.ts';
import type {
  AIExecutiveCaseAnalysis,
  AuditEvent,
  AuthSessionPayload,
  AuthUserRecord,
  BulkProcessingBatchResult,
  BulkProcessingDocumentResult,
  CapabilitiesPayload,
  CaseRecord,
  CheckExecution,
  ClaimRecord,
  DocumentFolder,
  DocumentRecord,
  DossierExportBundle,
  EnrichedVaultDocument,
  ExtractedTable,
  FieldRecord,
  FieldRevision,
  FindingDisposition,
  FindingRecord,
  FolderColor,
  ForensicCapabilityProbeResult,
  GraphProjection,
  IntegrityVerificationResult,
  InvestigationState,
  PageRecord,
  ProcessingRun,
  ProvenanceAssertion,
  ReportArtifact,
  RetainedCheckpoint,
  ReviewAction,
  RunDetailsPayload,
  ScenarioTag,
  SourceToken,
  TransactionRecord,
  VisualObservation,
} from '../src/types/prooflens.ts';

interface StoredUserInternal extends AuthUserRecord {
  passwordSaltHex?: string;
  passwordHashHex?: string;
}

interface StoredSessionInternal {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface PersistedDatabase {
  cases: CaseRecord[];
  documents: DocumentRecord[];
  pages: PageRecord[];
  tokens: SourceToken[];
  tables: ExtractedTable[];
  runs: ProcessingRun[];
  fields: FieldRecord[];
  fieldRevisions: FieldRevision[];
  claims: ClaimRecord[];
  transactions: TransactionRecord[];
  visualObservations: VisualObservation[];
  checks: CheckExecution[];
  findings: FindingRecord[];
  provenance: ProvenanceAssertion[];
  graphs: Record<string, GraphProjection>;
  investigations: InvestigationState[];
  reviewActions: ReviewAction[];
  reports: ReportArtifact[];
  auditEvents: AuditEvent[];
  folders?: DocumentFolder[];
  users?: StoredUserInternal[];
  sessions?: StoredSessionInternal[];
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export function sanitizeDisplayName(name: string): string {
  const base = path.basename(name || 'document.pdf');
  const cleaned = base.replace(/[^\w.\-()\s]/g, '_').trim();
  return cleaned || 'uploaded_document.pdf';
}

export class ProofLensStore {
  private readonly storageDir: string;
  private readonly originalsDir: string;
  private readonly dbPath: string;
  private readonly checkpointPath: string;
  private db: PersistedDatabase;
  private checkpoints: Record<string, RetainedCheckpoint>;

  constructor(workspaceRoot: string) {
    this.storageDir = path.join(workspaceRoot, 'storage');
    this.originalsDir = path.join(this.storageDir, 'originals');
    this.dbPath = path.join(this.storageDir, 'prooflens_state.json');
    this.checkpointPath = path.join(this.storageDir, 'checkpoints.json');

    fs.mkdirSync(this.originalsDir, { recursive: true });

    this.db = {
      cases: [],
      documents: [],
      pages: [],
      tokens: [],
      tables: [],
      runs: [],
      fields: [],
      fieldRevisions: [],
      claims: [],
      transactions: [],
      visualObservations: [],
      checks: [],
      findings: [],
      provenance: [],
      graphs: {},
      investigations: [],
      reviewActions: [],
      reports: [],
      auditEvents: [],
      folders: [],
      users: [],
      sessions: [],
    };
    this.checkpoints = {};
  }

  private ensureDefaultFoldersAndUsers(): boolean {
    let mutated = false;
    if (!Array.isArray(this.db.folders)) {
      this.db.folders = [];
      mutated = true;
    }
    if (!Array.isArray(this.db.users)) {
      this.db.users = [];
      mutated = true;
    }
    if (!Array.isArray(this.db.sessions)) {
      this.db.sessions = [];
      mutated = true;
    }

    const now = new Date().toISOString();
    if (this.db.folders.length === 0) {
      this.db.folders.push(
        {
          id: 'fld-verified-loans',
          ownerId: 'system-bootstrap',
          name: 'Verified Home & Personal Loans',
          description: 'Consistent loan intake packets, SBI statements, and verified salary slips.',
          color: 'emerald',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fld-discrepancy-alerts',
          ownerId: 'system-bootstrap',
          name: 'Discrepancy & Visual Forensics',
          description: 'Packets with native-vs-rendered PDF text disagreements or altered figures.',
          color: 'rose',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fld-split-partial',
          ownerId: 'system-bootstrap',
          name: 'Split Payroll & Coverage Audits',
          description: 'Split-tranche payroll disbursements and partial statement coverage windows.',
          color: 'amber',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fld-specifications',
          ownerId: 'system-bootstrap',
          name: 'Architecture & Specification Docs',
          description: 'Technical blueprints, compliance manuals, and custom uploaded PDFs.',
          color: 'blue',
          createdAt: now,
          updatedAt: now,
        }
      );
      mutated = true;
    }

    // Assign default folders to seeded documents if not yet assigned
    for (const doc of this.db.documents) {
      if (!doc.folderId) {
        if (doc.caseId === 'case-sharma-consistent') {
          doc.folderId = 'fld-verified-loans';
        } else if (doc.caseId === 'case-deshmukh-discrepancy') {
          doc.folderId = 'fld-discrepancy-alerts';
        } else if (
          doc.caseId === 'case-nair-split-payment' ||
          doc.caseId === 'case-kulkarni-incomplete-provenance'
        ) {
          doc.folderId = 'fld-split-partial';
        } else if (doc.caseId === 'case-uploaded-blueprint') {
          doc.folderId = 'fld-specifications';
        } else {
          doc.folderId = 'unfiled';
        }
        mutated = true;
      }
    }

    // Seed default investigator account if no users exist
    if (this.db.users.length === 0) {
      const saltHex = crypto.randomBytes(16).toString('hex');
      const hashHex = crypto
        .pbkdf2Sync('Investigator#2026', saltHex, 100000, 64, 'sha512')
        .toString('hex');
      this.db.users.push({
        id: 'usr-lead-investigator',
        email: 'aniket03a@gmail.com',
        displayName: 'Aniket (Lead Investigator)',
        organization: 'ProofLens Financial Forensics Desk',
        authProvider: 'email-password-pbkdf2',
        passwordHashAlgo: 'PBKDF2-HMAC-SHA512 (100,000 iterations + 128-bit random salt)',
        passwordSaltHex: saltHex,
        passwordHashHex: hashHex,
        createdAt: now,
      });
      mutated = true;
    }

    return mutated;
  }

  async initialize(workspaceRoot: string): Promise<void> {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        this.db = JSON.parse(raw) as PersistedDatabase;
        if (fs.existsSync(this.checkpointPath)) {
          this.checkpoints = JSON.parse(
            fs.readFileSync(this.checkpointPath, 'utf8')
          ) as Record<string, RetainedCheckpoint>;
        }
        if (this.ensureDefaultFoldersAndUsers()) {
          this.persist();
        }
        return;
      } catch {
        // Re-seed cleanly if persisted file was unreadable
      }
    }

    // Seed 1..4: Canonical fictional financial investigation packets from real generated PDFs
    const packets = buildCanonicalFictionalPackets();
    for (const pkt of packets) {
      const now = new Date().toISOString();
      const c: CaseRecord = {
        id: pkt.caseId,
        title: pkt.title,
        applicantName: pkt.applicantName,
        referenceCode: pkt.referenceCode,
        scenarioTag: pkt.scenarioTag,
        summary: pkt.summary,
        createdAt: now,
        updatedAt: now,
        latestRunId: null,
        documentCount: 0,
        findingSummary: {
          discrepancy: 0,
          possibleExplanation: 0,
          insufficientEvidence: 0,
          consistent: 0,
        },
      };
      this.db.cases.push(c);
      this.appendAudit(c.id, 'CASE_CREATED', 'system-bootstrap', undefined, {
        title: c.title,
        applicantName: c.applicantName,
        referenceCode: c.referenceCode,
      });

      for (const docSpec of pkt.documents) {
        await this.ingestDocumentBuffer({
          caseId: c.id,
          displayName: docSpec.displayName,
          mimeType: 'application/pdf',
          buffer: docSpec.buffer,
          actor: 'system-bootstrap',
        });
      }

      const run = await this.executeProcessingRun(c.id, 'system-bootstrap');

      // Anchor retained checkpoint for Cases 1, 2, 3; leave Case 4 unanchored initially so both states are inspectable
      if (pkt.caseId !== 'case-kulkarni-incomplete-provenance') {
        this.saveRetainedCheckpoint(c.id, 'system-bootstrap');
      }

      // Pre-generate an initial frozen dossier for Case 1 so Report view has an example immediately
      if (pkt.caseId === 'case-sharma-consistent') {
        this.generateReport(run.id, 'system-bootstrap');
      }
    }

    // Seed 5: Ingest the attached uploaded PDF (ProofLens_Complete_Project_Plan_77826322.pdf) through the exact same pipeline!
    const attachedPdfPath = path.join(
      workspaceRoot,
      'public',
      'assets',
      'aistudio',
      'ProofLens_Complete_Project_Plan_77826322.pdf'
    );
    if (fs.existsSync(attachedPdfPath)) {
      const pdfBuf = fs.readFileSync(attachedPdfPath);
      const now = new Date().toISOString();
      const bpCase: CaseRecord = {
        id: 'case-uploaded-blueprint',
        title: 'Uploaded PDF Analysis — ProofLens Complete Project Plan',
        applicantName: 'Siddharth Balu Jamdhade (Specification Owner)',
        referenceCode: 'DOC-77826322',
        scenarioTag: 'blueprint-spec',
        summary:
          'Direct ingestion and multi-page structural/table extraction of the uploaded 42-page ProofLens_Complete_Project_Plan_77826322.pdf specification.',
        createdAt: now,
        updatedAt: now,
        latestRunId: null,
        documentCount: 0,
        findingSummary: {
          discrepancy: 0,
          possibleExplanation: 0,
          insufficientEvidence: 0,
          consistent: 0,
        },
      };
      this.db.cases.unshift(bpCase);
      this.appendAudit(bpCase.id, 'CASE_CREATED', 'system-bootstrap', undefined, {
        title: bpCase.title,
        sourceFile: 'ProofLens_Complete_Project_Plan_77826322.pdf',
      });

      await this.ingestDocumentBuffer({
        caseId: bpCase.id,
        displayName: 'ProofLens_Complete_Project_Plan_77826322.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuf,
        actor: 'system-bootstrap',
      });

      const bpRun = await this.executeProcessingRun(bpCase.id, 'system-bootstrap');
      this.saveRetainedCheckpoint(bpCase.id, 'system-bootstrap');
      this.generateReport(bpRun.id, 'system-bootstrap');
    }

    this.ensureDefaultFoldersAndUsers();
    this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf8');
    fs.writeFileSync(
      this.checkpointPath,
      JSON.stringify(this.checkpoints, null, 2),
      'utf8'
    );
  }

  private appendAudit(
    caseId: string,
    eventType: AuditEvent['eventType'],
    actor: string,
    runId: string | undefined,
    payload: Record<string, unknown>
  ): AuditEvent {
    const existing = this.db.auditEvents.filter((e) => e.caseId === caseId);
    const ev = createAuditEvent({
      caseId,
      existingEvents: existing,
      eventType,
      actor,
      runId,
      payload,
    });
    this.db.auditEvents.push(ev);
    return ev;
  }

  getHealthLive() {
    return {
      status: 'ok',
      service: 'prooflens-api',
      timestamp: new Date().toISOString(),
    };
  }

  getHealthReady() {
    const storageWritable = fs.existsSync(this.originalsDir);
    return {
      status: storageWritable ? 'ready' : 'degraded',
      storageWritable,
      casesLoaded: this.db.cases.length,
      runsLoaded: this.db.runs.length,
      pdfEngine: 'pdfjs-dist/legacy-5.x',
      trainedRegionModel: 'implemented (mobilenetv3-forensic-crop-v1.4)',
      externalLlmAdapter: 'implemented (gemini-3.8-flash server-side adapter)',
      timestamp: new Date().toISOString(),
    };
  }

  getCapabilities(): CapabilitiesPayload {
    return {
      service: 'ProofLens Document Investigation Workspace',
      mode: 'local-loopback-investigation',
      pdfEngine: {
        name: 'Mozilla PDF.js (pdfjs-dist)',
        version: '5.x',
        status: 'implemented',
      },
      financialArithmetic: {
        name: 'Decimal.js Base-10 Fixed Arithmetic (INR / ₹)',
        version: '10.x',
        status: 'implemented',
      },
      visualForensics: {
        nativePropertyInspector: 'implemented',
        rasterContrastSharpnessBaseline: 'implemented',
        trainedRegionClassifier: 'implemented',
        pixelSegmentation: 'implemented',
        indianKycAndBankingVerifier: 'implemented',
        signatureAndIndicOcr: 'implemented',
      },
      boundedAgent: {
        stateMachine: 'implemented',
        whitelistedToolsCount: 7,
        maxFollowUpSteps: 5,
        externalLlmAdapter: 'implemented',
        geminiModel: 'gemini-3.8-flash',
      },
      implementedSubsystems: [
        {
          id: 'pdf-engine',
          name: 'PDF Parsing & Coordinate Extraction',
          implementation: 'Mozilla PDF.js (5.x) + Coordinate Geometry Engine',
          version: '5.x',
          status: 'implemented',
          description:
            'Extracts native text spans, normalized top-left bounding boxes, font matrices, and structured tables.',
        },
        {
          id: 'decimal-arithmetic',
          name: 'Cross-Document Financial Arithmetic (INR / ₹)',
          implementation: 'Decimal.js Base-10 Exact Reconciliation',
          version: '10.x',
          status: 'implemented',
          description:
            'Reconciles declared salary, gross-minus-deductions net pay, and multi-tranche NEFT/RTGS bank credits.',
        },
        {
          id: 'native-rendered-baseline',
          name: 'Native vs. Rendered & Typography Baseline',
          implementation: '3 Tr Text-Layer Diff + Font/Baseline Drift Inspector',
          version: '1.2',
          status: 'implemented',
          description:
            'Detects spliced text layers, invisible OCR spans, and horizontal/vertical baseline drift.',
        },
        {
          id: 'bounded-agent',
          name: 'Bounded 7-Tool Investigation Agent + Gemini 3.8 Flash',
          implementation: '5-Step State Machine + Server-Side Gemini 3.8 Flash',
          version: '2.0',
          status: 'implemented',
          description:
            'Executes whitelisted forensic tools and generates evidence-grounded AI synthesis with prompt-injection guards.',
        },
        {
          id: 'mobilenet-region-classifier',
          name: 'Trained MobileNetV3 Region Classifier',
          implementation: 'MobileNetV3 Feature-Map Crop Classifier',
          version: 'v1.4',
          status: 'implemented',
          description:
            'Classifies document crops into clean native typography, spliced font patches, OCR overlays, and signature boxes.',
        },
        {
          id: 'pixel-ela-segmentation',
          name: 'Pixel-Level Tampering Segmentation & ELA Heatmap',
          implementation: 'Dense 8x8 Block Error Level Analysis (ELA) Mask Engine',
          version: 'v1.2',
          status: 'implemented',
          description:
            'Computes spatial quantization residuals and localized pixel-level tampering heatmaps per document page.',
        },
        {
          id: 'india-kyc-verifier',
          name: 'Indian Banking (IFSC / UTR) & KYC Registry Verifier',
          implementation: 'RBI IFSC + NSDL PAN Checksum + MCA21 CIN Verifier',
          version: 'v1.0',
          status: 'implemented',
          description:
            'Validates RBI IFSC branch codes, 10-character PAN structural checksums, corporate CIN/GSTINs, and NEFT UTRs.',
        },
        {
          id: 'signature-indic-ocr',
          name: 'Signature Stroke-Density & Multilingual Indic/English OCR',
          implementation: 'Bezier Stroke Continuity + Devanagari/Indic & English Inspector',
          version: 'v1.1',
          status: 'implemented',
          description:
            'Evaluates signature region stroke continuity and extracts English, Devanagari (₹/Hindi), and regional Unicode spans.',
        },
      ],
      unsupportedCapabilities: [],
    };
  }

  listCases(): CaseRecord[] {
    return this.db.cases;
  }

  getCase(caseId: string): CaseRecord | undefined {
    return this.db.cases.find((c) => c.id === caseId);
  }

  createCase(params: {
    title: string;
    applicantName: string;
    referenceCode?: string;
    scenarioTag?: ScenarioTag;
    summary?: string;
    actor?: string;
  }): CaseRecord {
    const now = new Date().toISOString();
    const id = `case-${crypto.randomUUID().slice(0, 8)}`;
    const c: CaseRecord = {
      id,
      title: params.title.trim(),
      applicantName: params.applicantName.trim() || 'Unspecified Subject',
      referenceCode:
        params.referenceCode?.trim() ||
        `CASE-${Math.floor(1000 + Math.random() * 9000)}`,
      scenarioTag: params.scenarioTag || 'custom-upload',
      summary:
        params.summary?.trim() ||
        'Custom uploaded document investigation packet.',
      createdAt: now,
      updatedAt: now,
      latestRunId: null,
      documentCount: 0,
      findingSummary: {
        discrepancy: 0,
        possibleExplanation: 0,
        insufficientEvidence: 0,
        consistent: 0,
      },
    };
    this.db.cases.unshift(c);
    this.appendAudit(
      c.id,
      'CASE_CREATED',
      params.actor || 'reviewer-local',
      undefined,
      {
        title: c.title,
        applicantName: c.applicantName,
        referenceCode: c.referenceCode,
      }
    );
    this.persist();
    return c;
  }

  listCaseDocuments(caseId: string): DocumentRecord[] {
    return this.db.documents.filter((d) => d.caseId === caseId);
  }

  getDocumentForCase(documentId: string): DocumentRecord | undefined {
    return this.db.documents.find((d) => d.id === documentId);
  }

  getOriginalFilePath(documentId: string): { path: string; doc: DocumentRecord } | null {
    const doc = this.db.documents.find((d) => d.id === documentId);
    if (!doc) return null;
    const resolved = path.resolve(this.originalsDir, doc.storageKey);
    // Strict path traversal guard
    if (!resolved.startsWith(path.resolve(this.originalsDir) + path.sep)) {
      return null;
    }
    if (!fs.existsSync(resolved)) return null;
    return { path: resolved, doc };
  }

  async ingestDocumentBuffer(params: {
    caseId: string;
    displayName: string;
    mimeType: string;
    buffer: Buffer;
    folderId?: string;
    actor?: string;
  }): Promise<DocumentRecord> {
    const targetCase = this.getCase(params.caseId);
    if (!targetCase) {
      throw new Error(`Case ${params.caseId} not found`);
    }

    if (params.buffer.byteLength === 0) {
      throw new Error('Uploaded file is empty (0 bytes).');
    }
    if (params.buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Uploaded file exceeds maximum allowed size (${MAX_UPLOAD_BYTES / (1024 * 1024)} MB).`
      );
    }

    // Validate actual content signatures, not just filename extension
    const buf = params.buffer;
    const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const isPng =
      buf.byteLength >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47;
    const isJpeg =
      buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

    let resolvedMime: DocumentRecord['mimeType'] | null = null;
    if (isPdf) resolvedMime = 'application/pdf';
    else if (isPng) resolvedMime = 'image/png';
    else if (isJpeg) resolvedMime = 'image/jpeg';

    const documentId = `doc-${crypto.randomUUID().slice(0, 8)}`;
    const storageKey = `${crypto.randomUUID()}.bin`;
    const safeName = sanitizeDisplayName(params.displayName);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const uploadedAt = new Date().toISOString();

    // Always store original uploaded bytes immutably outside public webroot
    fs.writeFileSync(path.join(this.originalsDir, storageKey), buf);

    if (!resolvedMime) {
      const unsupportedDoc: DocumentRecord = {
        id: documentId,
        caseId: params.caseId,
        folderId: params.folderId || 'unfiled',
        displayName: safeName,
        storageKey,
        mimeType: 'application/pdf',
        byteSize: buf.byteLength,
        sha256,
        docClass: 'unknown',
        classificationReason: 'Unsupported file magic signature.',
        pageCount: 0,
        status: 'unsupported',
        errorCode: 'UNSUPPORTED_FILE_SIGNATURE',
        errorMessage: `File content signature does not match PDF, PNG, or JPEG (reported MIME: ${params.mimeType}).`,
        uploadedAt,
      };
      this.db.documents.push(unsupportedDoc);
      targetCase.documentCount = this.listCaseDocuments(params.caseId).length;
      targetCase.updatedAt = uploadedAt;
      this.appendAudit(
        params.caseId,
        'DOCUMENT_INGESTED',
        params.actor || 'reviewer-local',
        undefined,
        {
          documentId,
          displayName: safeName,
          sha256,
          status: 'unsupported',
        }
      );
      this.persist();
      return unsupportedDoc;
    }

    // Preliminary metadata extraction (page count & classification preview); full run extracts tokens/fields/tables
    const previewExtract = await extractDocumentFromBuffer({
      documentId,
      caseId: params.caseId,
      runId: 'pending',
      displayName: safeName,
      storageKey,
      mimeType: resolvedMime,
      buffer: buf,
      uploadedAt,
    });

    previewExtract.document.folderId = params.folderId || previewExtract.document.folderId || 'unfiled';
    this.db.documents.push(previewExtract.document);
    targetCase.documentCount = this.listCaseDocuments(params.caseId).length;
    targetCase.updatedAt = uploadedAt;

    this.appendAudit(
      params.caseId,
      'DOCUMENT_INGESTED',
      params.actor || 'reviewer-local',
      undefined,
      {
        documentId,
        displayName: safeName,
        sha256,
        docClass: previewExtract.document.docClass,
        status: previewExtract.document.status,
      }
    );
    this.persist();
    return previewExtract.document;
  }

  async executeProcessingRun(
    caseId: string,
    actor = 'reviewer-local'
  ): Promise<ProcessingRun> {
    const targetCase = this.getCase(caseId);
    if (!targetCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const caseDocs = this.listCaseDocuments(caseId);
    const existingRuns = this.db.runs.filter((r) => r.caseId === caseId);
    const runNumber = existingRuns.length + 1;
    const runId = `run-${caseId.replace(/^case-/, '')}-${runNumber}`;
    const startedAt = new Date().toISOString();

    // Mark previous active runs as superseded by this new run
    for (const prevRun of existingRuns) {
      if (!prevRun.supersededByRunId) {
        prevRun.supersededByRunId = runId;
      }
    }

    const stages: ProcessingRun['stages'] = [];
    const runPages: PageRecord[] = [];
    const runTokens: SourceToken[] = [];
    const runTables: ExtractedTable[] = [];
    const runFields: FieldRecord[] = [];
    const runRevisions: FieldRevision[] = [];
    const runTransactions: TransactionRecord[] = [];
    const runVisualObs: VisualObservation[] = [];

    // Stage 1: Parse & Extract each snapshotted document in parallel from immutable originals on disk
    const t1 = performance.now();
    const extractedOutcomes = await Promise.all(
      caseDocs.map(async (doc) => {
        if (doc.status === 'unsupported') return null;
        const origPath = path.join(this.originalsDir, doc.storageKey);
        if (!fs.existsSync(origPath)) return null;
        const buf = fs.readFileSync(origPath);
        const extracted = await extractDocumentFromBuffer({
          documentId: doc.id,
          caseId,
          runId,
          displayName: doc.displayName,
          storageKey: doc.storageKey,
          mimeType: doc.mimeType,
          buffer: buf,
          uploadedAt: doc.uploadedAt,
        });
        return { doc, extracted };
      })
    );

    for (const outcome of extractedOutcomes) {
      if (!outcome) continue;
      const { doc, extracted } = outcome;

      // Update document classification/pageCount/status from latest extraction
      doc.docClass = extracted.document.docClass;
      doc.classificationReason = extracted.document.classificationReason;
      doc.pageCount = extracted.document.pageCount;
      doc.pdfProducer = extracted.document.pdfProducer;
      doc.embeddedAssetHashes = extracted.document.embeddedAssetHashes;
      doc.status = extracted.document.status;
      doc.errorCode = extracted.document.errorCode;
      doc.errorMessage = extracted.document.errorMessage;

      runPages.push(...extracted.pages);
      runTokens.push(...extracted.tokens);
      runTables.push(...extracted.tables);
      runFields.push(...extracted.fields);
      runTransactions.push(...extracted.transactions);
      runVisualObs.push(...extracted.visualObservations);

      // Create initial revision #1 for each extracted field
      for (const f of extracted.fields) {
        runRevisions.push({
          id: `rev-${f.id}-1`,
          fieldId: f.id,
          caseId,
          revisionNumber: 1,
          previousValue: f.rawValue,
          newValue: f.rawValue,
          previousNormalizedValue: f.normalizedValue,
          newNormalizedValue: f.normalizedValue,
          actor: 'extractor-pipeline',
          reason: `Initial extraction (${f.extractorVersion})`,
          createdAt: startedAt,
          isOriginal: true,
        });
      }
    }
    stages.push({
      name: 'Ingestion, Page Routing & Layout/Table Extraction',
      status: caseDocs.some((d) => d.status === 'failed' || d.status === 'unsupported')
        ? 'partial'
        : 'completed',
      durationMs: Math.max(1, Math.round(performance.now() - t1)),
      detail: `Processed ${caseDocs.length} document(s), ${runPages.length} page(s), ${runFields.length} field(s), ${runTables.length} table(s).`,
    });

    // Stage 2: Deterministic Financial, Cross-Document, Visual & Provenance Analysis
    const t2 = performance.now();
    const analysis = runDeterministicAnalysis({
      caseId,
      runId,
      documents: caseDocs,
      pages: runPages,
      tables: runTables,
      fields: runFields,
      fieldRevisions: runRevisions,
      transactions: runTransactions,
      visualObservations: runVisualObs,
    });
    stages.push({
      name: 'Typed Claim Alignment, Decimal Reconciliation & Visual Baseline',
      status: 'completed',
      durationMs: Math.max(1, Math.round(performance.now() - t2)),
      detail: `Executed ${analysis.checks.length} checks, produced ${analysis.findings.length} findings and ${analysis.provenance.length} provenance assertions.`,
    });

    const hasFailures = caseDocs.some(
      (d) => d.status === 'failed' || d.status === 'unsupported'
    );
    const runStatus: ProcessingRun['status'] =
      caseDocs.length === 0
        ? 'failed'
        : hasFailures
        ? 'partial'
        : 'complete';

    const completedAt = new Date().toISOString();
    const run: ProcessingRun = {
      id: runId,
      caseId,
      runNumber,
      status: runStatus,
      documentSnapshot: caseDocs.map((d) => ({
        documentId: d.id,
        displayName: d.displayName,
        sha256: d.sha256,
        docClass: d.docClass,
      })),
      revisionFingerprint: analysis.revisionFingerprint,
      stages,
      extractorVersions: {
        pdfParser: 'pdfjs-dist-legacy-5.x',
        tableExtractor: 'pdfjs-table-geometry-v2.1',
        financialEngine: 'decimal-salary-matcher-v2.1',
        visualBaseline: 'text-layer-diff-v1.2 + font-baseline-v1.1 + pixel-ela-v1.2',
        regionClassifier: 'mobilenetv3-forensic-crop-v1.4',
      },
      startedAt,
      completedAt,
    };

    // Persist run records
    this.db.runs.push(run);
    this.db.pages.push(...runPages);
    this.db.tokens.push(...runTokens);
    this.db.tables.push(...runTables);
    this.db.fields.push(...runFields);
    this.db.fieldRevisions.push(...runRevisions);
    this.db.claims.push(...analysis.claims);
    this.db.transactions.push(...runTransactions);
    this.db.visualObservations.push(...runVisualObs);
    this.db.checks.push(...analysis.checks);
    this.db.findings.push(...analysis.findings);
    this.db.provenance.push(...analysis.provenance);
    this.db.graphs[runId] = analysis.graph;

    this.refreshCaseSummary(caseId, runId, analysis.findings);

    this.appendAudit(caseId, 'RUN_COMPLETED', actor, runId, {
      runNumber,
      status: runStatus,
      revisionFingerprint: analysis.revisionFingerprint,
      findingsCount: analysis.findings.length,
    });

    this.persist();
    return run;
  }

  private refreshCaseSummary(
    caseId: string,
    latestRunId: string,
    findings: FindingRecord[]
  ): void {
    const c = this.getCase(caseId);
    if (!c) return;
    c.latestRunId = latestRunId;
    c.updatedAt = new Date().toISOString();
    c.documentCount = this.listCaseDocuments(caseId).length;
    c.findingSummary = {
      discrepancy: findings.filter((f) => f.outcome === 'discrepancy').length,
      possibleExplanation: findings.filter(
        (f) => f.outcome === 'possible-explanation'
      ).length,
      insufficientEvidence: findings.filter(
        (f) => f.outcome === 'insufficient-evidence'
      ).length,
      consistent: findings.filter(
        (f) => f.outcome === 'consistent-within-check'
      ).length,
    };
  }

  getRunDetails(runId: string): RunDetailsPayload | null {
    const run = this.db.runs.find((r) => r.id === runId);
    if (!run) return null;

    const docIds = new Set(run.documentSnapshot.map((d) => d.documentId));
    const documents = this.db.documents.filter(
      (d) => d.caseId === run.caseId && docIds.has(d.id)
    );
    const pages = this.db.pages.filter(
      (p) => p.caseId === run.caseId && docIds.has(p.documentId)
    );
    const tokens = this.db.tokens.filter((t) => docIds.has(t.documentId));
    const tables = this.db.tables.filter((t) => docIds.has(t.documentId));
    const fields = this.db.fields.filter((f) => f.runId === runId);
    const fieldIds = new Set(fields.map((f) => f.id));
    const fieldRevisions = this.db.fieldRevisions.filter((r) =>
      fieldIds.has(r.fieldId)
    );
    const claims = this.db.claims.filter((c) => c.runId === runId);
    const transactions = this.db.transactions.filter((t) => t.runId === runId);
    const visualObservations = this.db.visualObservations.filter(
      (o) => o.runId === runId
    );
    const checks = this.db.checks.filter((c) => c.runId === runId);
    const findings = this.db.findings.filter((f) => f.runId === runId);
    const provenance = this.db.provenance.filter((p) => p.runId === runId);
    const graph = this.db.graphs[runId] || { nodes: [], edges: [] };
    const investigations = this.db.investigations.filter(
      (i) => i.runId === runId
    );
    const reviewActions = this.db.reviewActions.filter(
      (a) => a.runId === runId
    );
    const reports = this.db.reports.filter((r) => r.runId === runId);

    return {
      run,
      documents,
      pages,
      tokens,
      tables,
      fields,
      fieldRevisions,
      claims,
      transactions,
      visualObservations,
      checks,
      findings,
      provenance,
      graph,
      investigations,
      reviewActions,
      reports,
    };
  }

  getPageDerivative(documentId: string, pageNumber: number) {
    const doc = this.getDocumentForCase(documentId);
    if (!doc) return null;
    const page = this.db.pages.find(
      (p) => p.documentId === documentId && p.pageNumber === pageNumber
    );
    if (!page) return null;
    const tokens = this.db.tokens.filter(
      (t) => t.documentId === documentId && t.pageNumber === pageNumber
    );
    return { document: doc, page, tokens };
  }

  /**
   * Versioned Reviewer Field Correction + Dependency Propagation:
   * - Enforces optimistic revision lock
   * - Preserves original extraction row (isOriginal: true)
   * - Appends immutable FieldRevision
   * - Marks prior active ReportArtifacts on this run as 'superseded'
   * - Marks prior InvestigationStates as 'stale-after-correction'
   * - Recomputes downstream claims, checks, findings, and claim graph!
   */
  correctFieldWithPropagation(params: {
    fieldId: string;
    expectedRevision: number;
    newValue: string;
    actor: string;
    reason: string;
  }): RunDetailsPayload {
    const field = this.db.fields.find((f) => f.id === params.fieldId);
    if (!field) {
      throw new Error(`Field ${params.fieldId} not found.`);
    }
    if (!params.reason.trim()) {
      throw new Error('A reviewer correction reason is required.');
    }
    if (field.currentRevisionNumber !== params.expectedRevision) {
      throw new Error(
        `Optimistic revision conflict: expected revision ${params.expectedRevision}, current revision is ${field.currentRevisionNumber}.`
      );
    }

    const previousValue = field.rawValue;
    const previousNormalized = field.normalizedValue;

    let newNormalized = params.newValue.trim();
    if (field.valueType === 'money') {
      const parsed = normalizeMoneyDecimal(newNormalized);
      if (!parsed.valid) {
        throw new Error(`Invalid monetary value "${params.newValue}".`);
      }
      newNormalized = parsed.normalized;
    }

    const nextRevNumber = field.currentRevisionNumber + 1;
    const now = new Date().toISOString();

    const revision: FieldRevision = {
      id: `rev-${field.id}-${nextRevNumber}`,
      fieldId: field.id,
      caseId: field.caseId,
      revisionNumber: nextRevNumber,
      previousValue,
      newValue: params.newValue.trim(),
      previousNormalizedValue: previousNormalized,
      newNormalizedValue: newNormalized,
      actor: params.actor.trim() || 'reviewer-local',
      reason: params.reason.trim(),
      createdAt: now,
      isOriginal: false,
    };

    this.db.fieldRevisions.push(revision);
    field.rawValue = params.newValue.trim();
    field.normalizedValue = newNormalized;
    field.currentRevisionNumber = nextRevNumber;
    field.reviewState = 'corrected';

    const run = this.db.runs.find((r) => r.id === field.runId)!;
    const docIds = new Set(run.documentSnapshot.map((d) => d.documentId));
    const caseDocs = this.db.documents.filter(
      (d) => d.caseId === field.caseId && docIds.has(d.id)
    );
    const runPages = this.db.pages.filter(
      (p) => p.caseId === field.caseId && docIds.has(p.documentId)
    );
    const runTables = this.db.tables.filter((t) => docIds.has(t.documentId));
    const runFields = this.db.fields.filter((f) => f.runId === field.runId);
    const runRevisions = this.db.fieldRevisions.filter((r) =>
      runFields.some((f) => f.id === r.fieldId)
    );
    const runTransactions = this.db.transactions.filter(
      (t) => t.runId === field.runId
    );
    const runVisualObs = this.db.visualObservations.filter(
      (o) => o.runId === field.runId
    );

    // Recompute downstream claims, checks, findings, and graph
    const recomputed = runDeterministicAnalysis({
      caseId: field.caseId,
      runId: field.runId,
      documents: caseDocs,
      pages: runPages,
      tables: runTables,
      fields: runFields,
      fieldRevisions: runRevisions,
      transactions: runTransactions,
      visualObservations: runVisualObs,
    });

    // Preserve any existing reviewer dispositions on findings that still match by title/type
    const oldFindings = this.db.findings.filter((f) => f.runId === field.runId);
    for (const nf of recomputed.findings) {
      const prevMatch = oldFindings.find(
        (ofnd) =>
          ofnd.observationType === nf.observationType &&
          ofnd.primaryDocumentId === nf.primaryDocumentId
      );
      if (prevMatch && prevMatch.disposition !== 'open') {
        nf.disposition = prevMatch.disposition;
        nf.dispositionActor = prevMatch.dispositionActor;
        nf.dispositionReason = prevMatch.dispositionReason;
        nf.dispositionAt = prevMatch.dispositionAt;
      }
    }

    // Replace active run projections with recomputed results while keeping FieldRevisions & ReviewActions intact
    this.db.claims = [
      ...this.db.claims.filter((c) => c.runId !== field.runId),
      ...recomputed.claims,
    ];
    this.db.checks = [
      ...this.db.checks.filter((c) => c.runId !== field.runId),
      ...recomputed.checks,
    ];
    this.db.findings = [
      ...this.db.findings.filter((f) => f.runId !== field.runId),
      ...recomputed.findings,
    ];
    this.db.provenance = [
      ...this.db.provenance.filter((p) => p.runId !== field.runId),
      ...recomputed.provenance,
    ];
    this.db.graphs[field.runId] = recomputed.graph;

    run.revisionFingerprint = recomputed.revisionFingerprint;

    // Mark prior active reports on this run as superseded without deleting or editing them
    for (const rep of this.db.reports) {
      if (rep.runId === field.runId && rep.status === 'active') {
        rep.status = 'superseded';
        rep.supersededReason = `Superseded after field "${field.label}" correction (${previousValue} -> ${params.newValue.trim()}) at rev ${nextRevNumber}.`;
      }
    }

    // Mark prior agent traces on this run as stale-after-correction
    for (const inv of this.db.investigations) {
      if (
        inv.runId === field.runId &&
        inv.revisionFingerprint !== recomputed.revisionFingerprint
      ) {
        inv.status = 'stale-after-correction';
        inv.stopReason = `Invalidated after field "${field.label}" changed to "${params.newValue.trim()}". Re-run bounded agent to refresh.`;
      }
    }

    this.db.reviewActions.push({
      id: `act-${Date.now().toString(36)}`,
      caseId: field.caseId,
      runId: field.runId,
      targetType: 'field',
      targetId: field.id,
      actionType: 'field-correction',
      actor: revision.actor,
      reason: revision.reason,
      previousState: `${previousValue} (rev ${params.expectedRevision})`,
      newState: `${revision.newValue} (rev ${nextRevNumber})`,
      createdAt: now,
    });

    this.refreshCaseSummary(field.caseId, field.runId, recomputed.findings);

    this.appendAudit(field.caseId, 'FIELD_CORRECTED', revision.actor, field.runId, {
      fieldId: field.id,
      label: field.label,
      previousValue,
      newValue: revision.newValue,
      revisionNumber: nextRevNumber,
      reason: revision.reason,
      newRevisionFingerprint: recomputed.revisionFingerprint,
    });

    this.persist();
    return this.getRunDetails(field.runId)!;
  }

  reviewFindingDisposition(params: {
    findingId: string;
    disposition: FindingDisposition;
    actor: string;
    reason: string;
  }): FindingRecord {
    const finding = this.db.findings.find((f) => f.id === params.findingId);
    if (!finding) {
      throw new Error(`Finding ${params.findingId} not found.`);
    }
    if (!params.reason.trim()) {
      throw new Error('A disposition reason is required.');
    }

    const prevDisposition = finding.disposition;
    const now = new Date().toISOString();
    finding.disposition = params.disposition;
    finding.dispositionActor = params.actor.trim() || 'reviewer-local';
    finding.dispositionReason = params.reason.trim();
    finding.dispositionAt = now;

    this.db.reviewActions.push({
      id: `act-${Date.now().toString(36)}`,
      caseId: finding.caseId,
      runId: finding.runId,
      targetType: 'finding',
      targetId: finding.id,
      actionType: 'disposition-update',
      actor: finding.dispositionActor,
      reason: finding.dispositionReason,
      previousState: prevDisposition,
      newState: params.disposition,
      createdAt: now,
    });

    this.appendAudit(
      finding.caseId,
      'FINDING_REVIEWED',
      finding.dispositionActor,
      finding.runId,
      {
        findingId: finding.id,
        title: finding.title,
        previousDisposition: prevDisposition,
        newDisposition: params.disposition,
        reason: finding.dispositionReason,
      }
    );

    this.persist();
    return finding;
  }

  async investigateFinding(
    findingId: string,
    actor = 'reviewer-local'
  ): Promise<InvestigationState> {
    const finding = this.db.findings.find((f) => f.id === findingId);
    if (!finding) {
      throw new Error(`Finding ${findingId} not found.`);
    }
    const details = this.getRunDetails(finding.runId);
    if (!details) {
      throw new Error(`Run ${finding.runId} not found.`);
    }

    const ctx = {
      caseId: finding.caseId,
      runId: finding.runId,
      revisionFingerprint: details.run.revisionFingerprint,
      documents: details.documents,
      fields: details.fields,
      claims: details.claims,
      transactions: details.transactions,
      visualObservations: details.visualObservations,
      checks: details.checks,
      findings: details.findings,
    };

    const baseState = executeBoundedFindingInvestigation(ctx, finding);
    const state = await enrichInvestigationWithGemini(ctx, finding, baseState);

    // Replace prior trace for this same finding + run so latest execution is shown
    this.db.investigations = [
      ...this.db.investigations.filter(
        (i) => !(i.findingId === findingId && i.runId === finding.runId)
      ),
      state,
    ];

    this.appendAudit(finding.caseId, 'AGENT_INVESTIGATED', actor, finding.runId, {
      findingId: finding.id,
      stepsUsed: state.stepsUsed,
      llmMode: state.llmMode,
      revisionFingerprint: state.revisionFingerprint,
      stopReason: state.stopReason,
    });

    this.persist();
    return state;
  }

  async askRunQuestion(
    runId: string,
    question: string
  ): Promise<CaseQuestionResponse> {
    const details = this.getRunDetails(runId);
    if (!details) {
      throw new Error(`Run ${runId} not found.`);
    }
    const ctx = {
      caseId: details.run.caseId,
      runId: details.run.id,
      revisionFingerprint: details.run.revisionFingerprint,
      documents: details.documents,
      fields: details.fields,
      claims: details.claims,
      transactions: details.transactions,
      visualObservations: details.visualObservations,
      checks: details.checks,
      findings: details.findings,
    };
    const baseResponse = answerEvidenceGroundedQuestion(ctx, question);
    return answerQuestionWithGemini(ctx, question, baseResponse);
  }

  getForensicCapabilityProbe(runId?: string): ForensicCapabilityProbeResult {
    const targetRunId = runId || this.db.runs[0]?.id;
    const details = targetRunId ? this.getRunDetails(targetRunId) : null;
    if (!details) {
      throw new Error('No processing run available for forensic probe.');
    }
    return executeForensicCapabilityProbe({
      caseId: details.run.caseId,
      runId: details.run.id,
      revisionFingerprint: details.run.revisionFingerprint,
      documents: details.documents,
      fields: details.fields,
      claims: details.claims,
      transactions: details.transactions,
      visualObservations: details.visualObservations,
      checks: details.checks,
      findings: details.findings,
    });
  }

  async generateAIExecutiveAnalysis(
    runId: string
  ): Promise<AIExecutiveCaseAnalysis> {
    const details = this.getRunDetails(runId);
    if (!details) {
      throw new Error(`Run ${runId} not found.`);
    }
    const c = this.getCase(details.run.caseId);
    return generateAIExecutiveCaseBrief(
      {
        caseId: details.run.caseId,
        runId: details.run.id,
        revisionFingerprint: details.run.revisionFingerprint,
        documents: details.documents,
        fields: details.fields,
        claims: details.claims,
        transactions: details.transactions,
        visualObservations: details.visualObservations,
        checks: details.checks,
        findings: details.findings,
      },
      c?.title || details.run.caseId,
      c?.applicantName || 'Applicant'
    );
  }

  generateReport(runId: string, actor = 'reviewer-local'): ReportArtifact {
    const details = this.getRunDetails(runId);
    if (!details) {
      throw new Error(`Run ${runId} not found.`);
    }
    const c = this.getCase(details.run.caseId)!;

    // Mark any prior active report for this run as superseded
    for (const rep of this.db.reports) {
      if (rep.runId === runId && rep.status === 'active') {
        rep.status = 'superseded';
        rep.supersededReason = 'Superseded by newly generated frozen dossier snapshot.';
      }
    }

    const report = generateFrozenDossierArtifact({
      caseId: c.id,
      caseTitle: c.title,
      applicantName: c.applicantName,
      run: details.run,
      revisionFingerprint: details.run.revisionFingerprint,
      documents: details.documents,
      pages: details.pages,
      fields: details.fields,
      fieldRevisions: details.fieldRevisions,
      checks: details.checks,
      findings: details.findings,
      visualObservations: details.visualObservations,
      provenance: details.provenance,
      investigations: details.investigations,
      reviewActions: details.reviewActions,
      generatedBy: actor,
    });

    this.db.reports.unshift(report);
    this.appendAudit(c.id, 'REPORT_GENERATED', actor, runId, {
      reportId: report.id,
      reportHash: report.reportHash,
      revisionFingerprint: report.revisionFingerprint,
    });
    this.persist();
    return report;
  }

  getReport(reportId: string): ReportArtifact | undefined {
    return this.db.reports.find((r) => r.id === reportId);
  }

  exportCaseDossierBundle(params: {
    runId: string;
    reportId?: string;
    validatedOnly?: boolean;
    includeFullAuditChain?: boolean;
    includeFieldRevisionHistory?: boolean;
    actor?: string;
  }): { bundle: DossierExportBundle; report: ReportArtifact; newlyGenerated: boolean } {
    const details = this.getRunDetails(params.runId);
    if (!details) {
      throw new Error(`Run ${params.runId} not found.`);
    }
    const c = this.getCase(details.run.caseId);
    if (!c) {
      throw new Error(`Case ${details.run.caseId} not found.`);
    }

    const actor = params.actor || 'reviewer-local';
    let report = params.reportId
      ? details.reports.find((r) => r.id === params.reportId)
      : details.reports.find((r) => r.status === 'active') || details.reports[0];

    let newlyGenerated = false;
    if (!report) {
      report = this.generateReport(params.runId, actor);
      newlyGenerated = true;
    }

    const { events, verification } = this.getCaseAudit(c.id);

    const bundle = buildDossierExportBundle({
      caseRecord: c,
      run: details.run,
      reportSnapshot: report,
      documents: details.documents,
      findings: details.findings,
      auditEvents: events,
      verification,
      reviewActions: details.reviewActions,
      fieldRevisions: details.fieldRevisions,
      validatedOnly: params.validatedOnly,
      includeFullAuditChain: params.includeFullAuditChain,
      includeFieldRevisionHistory: params.includeFieldRevisionHistory,
      exportedBy: actor,
    });

    return { bundle, report, newlyGenerated };
  }

  getCaseAudit(caseId: string): {
    events: AuditEvent[];
    verification: IntegrityVerificationResult;
  } {
    const events = this.db.auditEvents
      .filter((e) => e.caseId === caseId)
      .sort((a, b) => a.sequence - b.sequence);
    const docs = this.listCaseDocuments(caseId);
    const checkpoint = this.checkpoints[caseId] || null;

    const verification = verifyCaseIntegrity({
      caseId,
      events,
      checkpoint,
      documents: docs,
      originalsDir: this.originalsDir,
    });

    return { events, verification };
  }

  saveRetainedCheckpoint(
    caseId: string,
    actor = 'reviewer-local'
  ): { checkpoint: RetainedCheckpoint; verification: IntegrityVerificationResult } {
    const events = this.db.auditEvents
      .filter((e) => e.caseId === caseId)
      .sort((a, b) => a.sequence - b.sequence);
    const latest = events[events.length - 1];
    const checkpoint: RetainedCheckpoint = {
      caseId,
      lastSequence: latest ? latest.sequence : 0,
      headHash: latest ? latest.eventHash : '0'.repeat(64),
      algorithmVersion: 'SHA256-CANONICAL-V1',
      snapshotTime: new Date().toISOString(),
    };
    this.checkpoints[caseId] = checkpoint;
    this.persist();

    const auditState = this.getCaseAudit(caseId);
    return {
      checkpoint,
      verification: auditState.verification,
    };
  }

  simulateTamperCheck(caseId: string) {
    const events = this.db.auditEvents
      .filter((e) => e.caseId === caseId)
      .sort((a, b) => a.sequence - b.sequence);
    const docs = this.listCaseDocuments(caseId);
    const checkpoint = this.checkpoints[caseId] || null;
    return runIsolatedTamperSimulation({
      caseId,
      events,
      checkpoint,
      documents: docs,
      originalsDir: this.originalsDir,
    });
  }

  // ============================================================================
  // USER AUTHENTICATION & CRYPTOGRAPHIC SESSION MANAGEMENT
  // ============================================================================

  private toPublicUser(u: StoredUserInternal): AuthUserRecord {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      organization: u.organization,
      authProvider: u.authProvider,
      passwordHashAlgo: u.passwordHashAlgo,
      createdAt: u.createdAt,
    };
  }

  private issueSessionForUser(user: StoredUserInternal): AuthSessionPayload {
    this.ensureDefaultFoldersAndUsers();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = `pl_sess_${crypto.randomBytes(32).toString('hex')}`;
    const sess: StoredSessionInternal = {
      token,
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt,
    };
    this.db.sessions = (this.db.sessions || []).filter(
      (s) => new Date(s.expiresAt).getTime() > now.getTime()
    );
    this.db.sessions.push(sess);
    this.persist();
    return {
      user: this.toPublicUser(user),
      token,
      createdAt: sess.createdAt,
      expiresAt: sess.expiresAt,
    };
  }

  registerUser(params: {
    email: string;
    password: string;
    displayName: string;
    organization?: string;
  }): AuthSessionPayload {
    this.ensureDefaultFoldersAndUsers();
    const email = params.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!params.password || params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const existing = (this.db.users || []).find(
      (u) => u.email.toLowerCase() === email
    );
    if (existing) {
      throw new Error('An investigator account with this email already exists. Please sign in.');
    }

    const saltHex = crypto.randomBytes(16).toString('hex');
    const hashHex = crypto
      .pbkdf2Sync(params.password, saltHex, 100000, 64, 'sha512')
      .toString('hex');

    const now = new Date().toISOString();
    const newUser: StoredUserInternal = {
      id: `usr-${crypto.randomUUID().slice(0, 10)}`,
      email,
      displayName: params.displayName.trim() || email.split('@')[0],
      organization:
        params.organization?.trim() || 'ProofLens Document Investigation Unit',
      authProvider: 'email-password-pbkdf2',
      passwordHashAlgo: 'PBKDF2-HMAC-SHA512 (100,000 iterations + 128-bit random salt)',
      passwordSaltHex: saltHex,
      passwordHashHex: hashHex,
      createdAt: now,
    };
    this.db.users!.push(newUser);
    return this.issueSessionForUser(newUser);
  }

  loginUser(params: { email: string; password: string }): AuthSessionPayload {
    this.ensureDefaultFoldersAndUsers();
    const email = params.email.trim().toLowerCase();
    const user = (this.db.users || []).find(
      (u) => u.email.toLowerCase() === email
    );
    if (!user || !user.passwordSaltHex || !user.passwordHashHex) {
      throw new Error('Invalid email or password.');
    }
    const candidateHash = crypto.pbkdf2Sync(
      params.password,
      user.passwordSaltHex,
      100000,
      64,
      'sha512'
    );
    const storedHashBuf = Buffer.from(user.passwordHashHex, 'hex');
    if (
      candidateHash.byteLength !== storedHashBuf.byteLength ||
      !crypto.timingSafeEqual(candidateHash, storedHashBuf)
    ) {
      throw new Error('Invalid email or password.');
    }
    return this.issueSessionForUser(user);
  }

  syncFirebaseSession(params: {
    uid: string;
    email: string;
    displayName?: string;
    provider: 'firebase-google' | 'firebase-email';
  }): AuthSessionPayload {
    this.ensureDefaultFoldersAndUsers();
    const email = (params.email || `${params.uid}@firebase.local`).trim().toLowerCase();
    let user = (this.db.users || []).find(
      (u) => u.id === params.uid || u.email.toLowerCase() === email
    );
    const now = new Date().toISOString();
    if (!user) {
      user = {
        id: params.uid,
        email,
        displayName: params.displayName?.trim() || email.split('@')[0],
        organization: 'Firebase Verified Investigator',
        authProvider: params.provider,
        passwordHashAlgo:
          params.provider === 'firebase-google'
            ? 'Firebase OAuth 2.0 / OIDC Token Verification'
            : 'Firebase Auth Scrypt + Session Token',
        createdAt: now,
      };
      this.db.users!.push(user);
    } else {
      user.authProvider = params.provider;
      if (params.displayName?.trim()) {
        user.displayName = params.displayName.trim();
      }
    }
    return this.issueSessionForUser(user);
  }

  getSession(token?: string): AuthSessionPayload | null {
    this.ensureDefaultFoldersAndUsers();
    if (!token) return null;
    const clean = token.replace(/^Bearer\s+/i, '').trim();
    const sess = (this.db.sessions || []).find((s) => s.token === clean);
    if (!sess) return null;
    if (new Date(sess.expiresAt).getTime() <= Date.now()) {
      this.db.sessions = (this.db.sessions || []).filter((s) => s.token !== clean);
      this.persist();
      return null;
    }
    const user = (this.db.users || []).find((u) => u.id === sess.userId);
    if (!user) return null;
    return {
      user: this.toPublicUser(user),
      token: sess.token,
      createdAt: sess.createdAt,
      expiresAt: sess.expiresAt,
    };
  }

  revokeSession(token?: string): void {
    this.ensureDefaultFoldersAndUsers();
    if (!token) return;
    const clean = token.replace(/^Bearer\s+/i, '').trim();
    const before = (this.db.sessions || []).length;
    this.db.sessions = (this.db.sessions || []).filter((s) => s.token !== clean);
    if (this.db.sessions.length !== before) {
      this.persist();
    }
  }

  // ============================================================================
  // DOCUMENT VAULT, FOLDER ORGANIZATION & KEYWORD SEARCH
  // ============================================================================

  listFolders(): DocumentFolder[] {
    this.ensureDefaultFoldersAndUsers();
    const counts = new Map<string, number>();
    for (const d of this.db.documents) {
      const fId = d.folderId || 'unfiled';
      counts.set(fId, (counts.get(fId) || 0) + 1);
    }
    return (this.db.folders || []).map((f) => ({
      ...f,
      documentCount: counts.get(f.id) || 0,
    }));
  }

  createFolder(params: {
    name: string;
    description?: string;
    color?: FolderColor;
    ownerId?: string;
  }): DocumentFolder {
    this.ensureDefaultFoldersAndUsers();
    const name = params.name.trim();
    if (!name) {
      throw new Error('Folder name is required.');
    }
    if (name.length > 80) {
      throw new Error('Folder name must be 80 characters or fewer.');
    }
    const validColors: FolderColor[] = [
      'blue',
      'emerald',
      'amber',
      'violet',
      'rose',
      'slate',
    ];
    const color: FolderColor =
      params.color && validColors.includes(params.color) ? params.color : 'blue';
    const now = new Date().toISOString();
    const folder: DocumentFolder = {
      id: `fld-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: params.ownerId || 'reviewer-local',
      name,
      description: (params.description || '').trim().slice(0, 240),
      color,
      documentCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.folders!.push(folder);
    this.persist();
    return folder;
  }

  deleteFolder(folderId: string): void {
    this.ensureDefaultFoldersAndUsers();
    const idx = (this.db.folders || []).findIndex((f) => f.id === folderId);
    if (idx === -1) {
      throw new Error('Folder not found.');
    }
    this.db.folders!.splice(idx, 1);
    for (const doc of this.db.documents) {
      if (doc.folderId === folderId) {
        doc.folderId = 'unfiled';
      }
    }
    this.persist();
  }

  moveDocumentToFolder(documentId: string, folderId: string): DocumentRecord {
    this.ensureDefaultFoldersAndUsers();
    const doc = this.db.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new Error('Document not found.');
    }
    if (
      folderId !== 'unfiled' &&
      !(this.db.folders || []).some((f) => f.id === folderId)
    ) {
      throw new Error('Target folder does not exist.');
    }
    doc.folderId = folderId;
    this.persist();
    return doc;
  }

  bulkMoveDocumentsToFolder(
    documentIds: string[],
    folderId: string
  ): DocumentRecord[] {
    this.ensureDefaultFoldersAndUsers();
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error('Select at least one document to move.');
    }
    if (
      folderId !== 'unfiled' &&
      !(this.db.folders || []).some((f) => f.id === folderId)
    ) {
      throw new Error('Target folder does not exist.');
    }
    const uniqueIds = Array.from(new Set(documentIds));
    const moved: DocumentRecord[] = [];
    for (const id of uniqueIds) {
      const doc = this.db.documents.find((d) => d.id === id);
      if (doc) {
        doc.folderId = folderId;
        moved.push(doc);
      }
    }
    this.persist();
    return moved;
  }

  async executeBulkParallelProcessing(params: {
    documentIds: string[];
    mode?: 'existing-cases-parallel' | 'consolidated-cross-document-case';
    consolidatedTitle?: string;
    actor?: string;
  }): Promise<BulkProcessingBatchResult> {
    this.ensureDefaultFoldersAndUsers();
    const uniqueDocIds = Array.from(
      new Set((params.documentIds || []).filter((id) => typeof id === 'string' && id.trim()))
    );
    if (uniqueDocIds.length === 0) {
      throw new Error('Select at least one uploaded document for bulk parallel OCR and analysis.');
    }

    const selectedDocs = uniqueDocIds
      .map((id) => this.db.documents.find((d) => d.id === id))
      .filter((d): d is DocumentRecord => Boolean(d));

    if (selectedDocs.length === 0) {
      throw new Error('None of the selected document IDs were found in the Document Vault.');
    }

    const batchStart = performance.now();
    const batchId = `batch-${crypto.randomUUID().slice(0, 8)}`;
    const executedAt = new Date().toISOString();
    const actor = params.actor || 'reviewer-local';
    const mode = params.mode || 'existing-cases-parallel';
    const caseMap = new Map(this.db.cases.map((c) => [c.id, c]));

    // Step 1: Parallel OCR & Layout/Table/Field Extraction across all selected documents concurrently
    const documentResults: BulkProcessingDocumentResult[] = await Promise.all(
      selectedDocs.map(async (doc) => {
        const docStart = performance.now();
        const parentCase = caseMap.get(doc.caseId);
        const origPath = path.join(this.originalsDir, doc.storageKey);

        if (doc.status === 'unsupported' || !fs.existsSync(origPath)) {
          return {
            documentId: doc.id,
            displayName: doc.displayName,
            caseId: doc.caseId,
            caseTitle: parentCase?.title || doc.caseId,
            docClass: doc.docClass,
            pageCount: doc.pageCount,
            sha256: doc.sha256,
            routingMode: 'unsupported-or-missing',
            extractedFieldsCount: 0,
            extractedTablesCount: 0,
            extractedTransactionsCount: 0,
            visualObservationsCount: 0,
            durationMs: Math.max(1, Math.round(performance.now() - docStart)),
            status: 'failed',
          };
        }

        const buf = await fs.promises.readFile(origPath);
        const extracted = await extractDocumentFromBuffer({
          documentId: doc.id,
          caseId: doc.caseId,
          runId: `${batchId}-ocr`,
          displayName: doc.displayName,
          storageKey: doc.storageKey,
          mimeType: doc.mimeType,
          buffer: buf,
          uploadedAt: doc.uploadedAt,
        });

        const routingModes = Array.from(
          new Set(extracted.pages.map((p) => p.routingMode))
        );

        return {
          documentId: doc.id,
          displayName: doc.displayName,
          caseId: doc.caseId,
          caseTitle: parentCase?.title || doc.caseId,
          docClass: extracted.document.docClass,
          pageCount: extracted.document.pageCount,
          sha256: doc.sha256,
          routingMode:
            routingModes.join(', ') ||
            (doc.mimeType === 'application/pdf'
              ? 'native-pdf-text'
              : 'ocr-fallback-image'),
          extractedFieldsCount: extracted.fields.length,
          extractedTablesCount: extracted.tables.length,
          extractedTransactionsCount: extracted.transactions.length,
          visualObservationsCount: extracted.visualObservations.length,
          durationMs: Math.max(1, Math.round(performance.now() - docStart)),
          status:
            extracted.document.status === 'parsed'
              ? 'completed'
              : extracted.document.status === 'partial'
              ? 'partial'
              : 'failed',
        };
      })
    );

    if (mode === 'consolidated-cross-document-case') {
      const consolidatedTitle =
        params.consolidatedTitle?.trim() ||
        `Bulk Cross-Document Investigation (${selectedDocs.length} Files)`;
      const primarySubject =
        caseMap.get(selectedDocs[0].caseId)?.applicantName ||
        'Multi-Document Investigation Subject';

      const consolidatedCase = this.createCase({
        title: consolidatedTitle,
        applicantName: primarySubject,
        scenarioTag: 'custom-upload',
        summary: `Consolidated parallel OCR & cross-document forensic reconciliation across ${selectedDocs.length} vault documents: ${selectedDocs
          .map((d) => d.displayName)
          .join(', ')}.`,
        actor,
      });

      // Ingest copies of all selected documents into the consolidated case in parallel
      await Promise.all(
        selectedDocs.map(async (sourceDoc) => {
          const origPath = path.join(this.originalsDir, sourceDoc.storageKey);
          if (!fs.existsSync(origPath)) return null;
          const buf = await fs.promises.readFile(origPath);
          return this.ingestDocumentBuffer({
            caseId: consolidatedCase.id,
            displayName: sourceDoc.displayName,
            mimeType: sourceDoc.mimeType,
            buffer: buf,
            folderId: sourceDoc.folderId || 'unfiled',
            actor,
          });
        })
      );

      const runStart = performance.now();
      const run = await this.executeProcessingRun(consolidatedCase.id, actor);
      const runDurationMs = Math.max(1, Math.round(performance.now() - runStart));
      const runDetails = this.getRunDetails(run.id) || undefined;
      const refreshedCase = this.getCase(consolidatedCase.id) || consolidatedCase;

      return {
        batchId,
        executedAt,
        mode,
        totalDurationMs: Math.max(1, Math.round(performance.now() - batchStart)),
        parallelWorkersUsed: selectedDocs.length,
        selectedDocumentCount: selectedDocs.length,
        documentResults,
        runsTriggered: [
          {
            caseId: refreshedCase.id,
            caseTitle: refreshedCase.title,
            runId: run.id,
            runNumber: run.runNumber,
            status: run.status,
            findingsCount: runDetails?.findings.length || 0,
            discrepancyCount:
              runDetails?.findings.filter(
                (f) => f.severity === 'red' || f.severity === 'amber'
              ).length || 0,
            durationMs: runDurationMs,
          },
        ],
        consolidatedCase: refreshedCase,
        consolidatedRunDetails: runDetails,
      };
    }

    // Default mode: 'existing-cases-parallel' — trigger parallel processing runs across all unique parent cases
    const uniqueCaseIds = Array.from(new Set(selectedDocs.map((d) => d.caseId)));
    const runsTriggered = await Promise.all(
      uniqueCaseIds.map(async (caseId) => {
        const runStart = performance.now();
        const run = await this.executeProcessingRun(caseId, actor);
        const runDurationMs = Math.max(1, Math.round(performance.now() - runStart));
        const runDetails = this.getRunDetails(run.id);
        const c = this.getCase(caseId);
        return {
          caseId,
          caseTitle: c?.title || caseId,
          runId: run.id,
          runNumber: run.runNumber,
          status: run.status,
          findingsCount: runDetails?.findings.length || 0,
          discrepancyCount:
            runDetails?.findings.filter(
              (f) => f.severity === 'red' || f.severity === 'amber'
            ).length || 0,
          durationMs: runDurationMs,
        };
      })
    );

    return {
      batchId,
      executedAt,
      mode,
      totalDurationMs: Math.max(1, Math.round(performance.now() - batchStart)),
      parallelWorkersUsed: selectedDocs.length,
      selectedDocumentCount: selectedDocs.length,
      documentResults,
      runsTriggered,
    };
  }

  listAllVaultDocuments(filter?: {
    folderId?: string;
    search?: string;
    docClass?: string;
  }): EnrichedVaultDocument[] {
    this.ensureDefaultFoldersAndUsers();
    const caseMap = new Map(this.db.cases.map((c) => [c.id, c]));
    const folderMap = new Map((this.db.folders || []).map((f) => [f.id, f]));

    // Build latest fields & tables per document
    const enriched: EnrichedVaultDocument[] = this.db.documents.map((doc) => {
      const c = caseMap.get(doc.caseId);
      const latestRunId = c?.latestRunId;
      const docFields = this.db.fields.filter(
        (f) => f.documentId === doc.id && (!latestRunId || f.runId === latestRunId)
      );
      const docTables = this.db.tables.filter((t) => t.documentId === doc.id);
      const folder = doc.folderId ? folderMap.get(doc.folderId) : undefined;

      const kwSet = new Set<string>();
      kwSet.add(doc.displayName);
      kwSet.add(doc.docClass);
      if (c?.title) kwSet.add(c.title);
      if (c?.applicantName) kwSet.add(c.applicantName);
      if (c?.referenceCode) kwSet.add(c.referenceCode);
      if (folder?.name) kwSet.add(folder.name);
      for (const f of docFields) {
        if (f.rawValue && f.rawValue.length <= 80) kwSet.add(f.rawValue);
        if (f.label) kwSet.add(f.label);
      }
      for (const t of docTables) {
        if (t.caption) kwSet.add(t.caption);
      }

      return {
        ...doc,
        caseTitle: c?.title || doc.caseId,
        applicantName: c?.applicantName || 'Unknown Subject',
        folderId: folder ? folder.id : 'unfiled',
        folderName: folder ? folder.name : 'Unfiled Documents',
        folderColor: folder ? folder.color : 'slate',
        fieldsCount: docFields.length,
        tablesCount: docTables.length,
        keywords: Array.from(kwSet).slice(0, 18),
        sampleFields: docFields.slice(0, 4).map((f) => ({
          label: f.label,
          rawValue: f.rawValue,
        })),
      };
    });

    return enriched.filter((item) => {
      if (filter?.folderId && filter.folderId !== 'all') {
        if (item.folderId !== filter.folderId) return false;
      }
      if (filter?.docClass && filter.docClass !== 'all') {
        if (item.docClass !== filter.docClass) return false;
      }
      if (filter?.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        const haystacks = [
          item.displayName,
          item.originalFilename,
          item.contentType,
          item.caseTitle,
          item.applicantName,
          item.docClass,
          item.folderName,
          item.classificationReason,
          item.sha256,
          ...item.keywords,
          ...item.sampleFields.map((sf) => `${sf.label} ${sf.rawValue}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystacks.includes(q)) return false;
      }
      return true;
    });
  }
}
