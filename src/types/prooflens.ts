export interface NormalizedBBox {
  x: number;
  y: number;
  w: number;
  h: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  coordinateSystem: 'normalized-top-left-v1';
}

export type ScenarioTag =
  | 'consistent'
  | 'discrepancy-visual'
  | 'split-payment'
  | 'incomplete-coverage'
  | 'blueprint-spec'
  | 'custom-upload';

export type DocumentClass =
  | 'application'
  | 'salary-slip'
  | 'bank-statement'
  | 'technical-blueprint'
  | 'unknown';

export type CheckApplicability = 'applicable' | 'not-applicable' | 'unsupported';
export type CheckLifecycle = 'not-started' | 'in-progress' | 'completed' | 'failed';
export type CheckResultStatus =
  | 'consistent-within-check'
  | 'discrepancy'
  | 'possible-explanation'
  | 'insufficient-evidence'
  | 'unable-to-assess';

export type FindingDisposition =
  | 'open'
  | 'observation-confirmed'
  | 'further-verification-needed'
  | 'false-alert'
  | 'resolved';

export type IndependenceStatus =
  | 'unknown'
  | 'known-shared-source'
  | 'possible-shared-source'
  | 'independent-acquisition-supported';

export interface CaseRecord {
  id: string;
  title: string;
  applicantName: string;
  referenceCode: string;
  scenarioTag: ScenarioTag;
  summary: string;
  createdAt: string;
  updatedAt: string;
  latestRunId: string | null;
  documentCount: number;
  findingSummary: {
    discrepancy: number;
    possibleExplanation: number;
    insufficientEvidence: number;
    consistent: number;
  };
}

export interface DocumentRecord {
  id: string;
  caseId: string;
  folderId?: string;
  keywords?: string[];
  displayName: string;
  storageKey: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  contentType?: string;
  originalFilename?: string;
  byteSize: number;
  sha256: string;
  docClass: DocumentClass;
  classificationReason: string;
  pageCount: number;
  pdfProducer?: string;
  embeddedAssetHashes?: string[];
  status: 'parsed' | 'partial' | 'failed' | 'unsupported';
  errorCode?: string;
  errorMessage?: string;
  uploadedAt: string;
}

export type FolderColor = 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';

export interface DocumentFolder {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  color: FolderColor;
  documentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichedVaultDocument extends DocumentRecord {
  caseTitle: string;
  applicantName: string;
  folderId: string;
  folderName: string;
  folderColor: FolderColor;
  fieldsCount: number;
  tablesCount: number;
  keywords: string[];
  sampleFields: Array<{ label: string; rawValue: string }>;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  organization: string;
  authProvider: 'email-password-pbkdf2' | 'firebase-google' | 'firebase-email';
  passwordHashAlgo: string;
  createdAt: string;
}

export interface AuthSessionPayload {
  user: AuthUserRecord;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface PageRecord {
  id: string;
  documentId: string;
  caseId: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  routingMode:
    | 'native-pdf'
    | 'searchable-scan-ocr'
    | 'raster-image'
    | 'mixed-pdf'
    | 'unreadable';
  nativeTextLength: number;
  hasInvisibleTextLayer: boolean;
  tokenCount: number;
  uninspectedRegions: Array<{ bbox: NormalizedBBox; reason: string }>;
}

export interface SourceToken {
  id: string;
  documentId: string;
  pageNumber: number;
  text: string;
  bbox: NormalizedBBox;
  fontName?: string;
  fontSize?: number;
  renderingMode?: number;
  opacity?: number;
  layer: 'native' | 'rendered-ocr' | 'raster-region';
}

export interface TableCellRecord {
  colIndex: number;
  header: string;
  text: string;
  bbox: NormalizedBBox;
  uncertain?: boolean;
}

export interface ExtractedTable {
  id: string;
  documentId: string;
  pageNumber: number;
  caption: string;
  bbox: NormalizedBBox;
  headers: string[];
  rows: Array<{
    rowIndex: number;
    cells: TableCellRecord[];
  }>;
  extractorVersion: string;
}

export interface FieldRecord {
  id: string;
  caseId: string;
  runId: string;
  documentId: string;
  pageNumber: number;
  fieldKey: string;
  label: string;
  rawValue: string;
  normalizedValue: string;
  valueType: 'money' | 'date' | 'period' | 'string' | 'number' | 'identifier';
  unit?: 'monthly' | 'annual' | 'one-time' | 'unknown';
  currency?: string;
  salaryBasis?: 'gross' | 'net' | 'unknown';
  period?: string;
  sourceTokenIds: string[];
  bbox: NormalizedBBox;
  sourceLayer: 'native' | 'rendered-ocr' | 'raster-region' | 'mixed';
  extractorVersion: string;
  extractionScore: number | null;
  scoreMethod: string;
  currentRevisionNumber: number;
  reviewState: 'unreviewed' | 'accepted' | 'corrected';
}

export interface FieldRevision {
  id: string;
  fieldId: string;
  caseId: string;
  revisionNumber: number;
  previousValue: string;
  newValue: string;
  previousNormalizedValue: string;
  newNormalizedValue: string;
  actor: string;
  reason: string;
  createdAt: string;
  isOriginal: boolean;
}

export interface ClaimRecord {
  id: string;
  caseId: string;
  runId: string;
  fieldId: string;
  documentId: string;
  pageNumber: number;
  subject: string;
  claimType:
    | 'declared-income'
    | 'salary-gross'
    | 'salary-net'
    | 'salary-deductions'
    | 'payroll-credit'
    | 'statement-coverage'
    | 'document-fact';
  amountDecimal?: string;
  currency?: string;
  salaryBasis: 'gross' | 'net' | 'unknown';
  unit: 'monthly' | 'annual' | 'one-time' | 'unknown';
  period: string;
  applicantMatchState:
    | 'exact'
    | 'normalized-abbreviation'
    | 'ambiguous'
    | 'mismatch'
    | 'not-applicable';
  bbox: NormalizedBBox;
}

export interface TransactionRecord {
  id: string;
  caseId: string;
  runId: string;
  documentId: string;
  pageNumber: number;
  rowIndex: number;
  date: string;
  narration: string;
  direction: 'credit' | 'debit';
  amountDecimal: string;
  runningBalanceDecimal?: string;
  currency: string;
  category: 'salary-candidate' | 'allowance' | 'reversal' | 'expense' | 'other';
  bbox: NormalizedBBox;
}

export interface VisualObservation {
  id: string;
  caseId: string;
  runId: string;
  documentId: string;
  pageNumber: number;
  observationType:
    | 'native-vs-rendered-disagreement'
    | 'benign-invisible-ocr-layer'
    | 'font-baseline-drift'
    | 'contrast-sharpness-delta'
    | 'compression-grid-anomaly'
    | 'shared-image-xobject'
    | 'layout-typography-baseline';
  methodName: string;
  methodVersion: string;
  measuredProperty: string;
  measuredValue: string;
  baselineComparison: string;
  nativeTextObserved?: string;
  renderedTextObserved?: string;
  sourceBbox: NormalizedBBox;
  comparisonBbox?: NormalizedBBox;
  signalStrength: number;
  severity: 'info' | 'amber' | 'red';
  limitations: string;
}

export interface ScopedNegativeSearch {
  submittedDocuments: string[];
  submittedPages: string;
  dateWindow: string;
  accountScope: string;
  matcherVersion: string;
  coverageLimitations: string;
  statementText: string;
}

export interface CheckExecution {
  id: string;
  caseId: string;
  runId: string;
  checkId: string;
  checkName: string;
  category:
    | 'ingestion-structure'
    | 'native-vs-rendered'
    | 'financial-reconciliation'
    | 'visual-forensics'
    | 'provenance-lineage';
  applicability: CheckApplicability;
  lifecycle: CheckLifecycle;
  result: CheckResultStatus;
  parameters: Record<string, string>;
  assumptions: string[];
  calculationSteps: string[];
  scopedSearch?: ScopedNegativeSearch;
  inputFieldIds: string[];
  revisionFingerprint: string;
  nextStepSuggestion?: string;
}

export interface AlternativeExplanation {
  id: string;
  explanationType:
    | 'gross-vs-net-basis'
    | 'annual-vs-monthly-unit'
    | 'split-payroll-disbursement'
    | 'delayed-settlement-window'
    | 'benign-searchable-scan-ocr'
    | 'incomplete-statement-window'
    | 'name-abbreviation-match'
    | 'ocr-character-ambiguity';
  title: string;
  status:
    | 'supported-by-evidence'
    | 'plausible-needs-verification'
    | 'ruled-out'
    | 'not-applicable';
  rationale: string;
  supportingIds: string[];
  remainingUncertainty: string;
}

export interface ComparePairData {
  leftLabel: string;
  leftDocumentName: string;
  leftPage: number;
  leftRaw: string;
  leftNormalized: string;
  leftPeriod: string;
  leftBasis: string;
  leftBbox?: NormalizedBBox;
  rightLabel: string;
  rightDocumentName: string;
  rightPage: number;
  rightRaw: string;
  rightNormalized: string;
  rightPeriod: string;
  rightBasis: string;
  rightBbox?: NormalizedBBox;
  decimalFormula: string;
  deltaDecimal: string;
  conclusion: string;
}

export interface FindingRecord {
  id: string;
  caseId: string;
  runId: string;
  title: string;
  observationType:
    | 'cross-document-salary'
    | 'gross-deductions-net'
    | 'running-balance'
    | 'native-rendered-mismatch'
    | 'benign-ocr-layer'
    | 'visual-region-anomaly'
    | 'statement-coverage-gap'
    | 'shared-source-provenance'
    | 'document-structure-extraction';
  outcome: CheckResultStatus;
  severity: 'red' | 'amber' | 'green' | 'slate';
  summary: string;
  uncertainty: string;
  nextChecks: string[];
  primaryDocumentId: string;
  primaryPageNumber: number;
  primaryBbox?: NormalizedBBox;
  secondaryDocumentId?: string;
  secondaryPageNumber?: number;
  secondaryBbox?: NormalizedBBox;
  linkedFieldIds: string[];
  linkedClaimIds: string[];
  linkedTransactionIds: string[];
  linkedVisualObservationIds: string[];
  linkedCheckExecutionIds: string[];
  alternativeExplanations: AlternativeExplanation[];
  compareData?: ComparePairData;
  disposition: FindingDisposition;
  dispositionActor?: string;
  dispositionReason?: string;
  dispositionAt?: string;
}

export interface ProvenanceAssertion {
  id: string;
  caseId: string;
  runId: string;
  sourceAId: string;
  sourceALabel: string;
  sourceBId: string;
  sourceBLabel: string;
  independenceStatus: IndependenceStatus;
  statedBasis: string;
  limitationNote: string;
}

export interface GraphProjection {
  nodes: Array<{
    id: string;
    nodeType:
      | 'Claim'
      | 'Document'
      | 'FieldRevision'
      | 'Transaction'
      | 'VisualObservation'
      | 'Finding'
      | 'AlternativeExplanation';
    label: string;
    subtitle: string;
    status: string;
    documentId?: string;
    pageNumber?: number;
    bbox?: NormalizedBBox;
    linkedRecordIds: string[];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    edgeType:
      | 'extracted-from'
      | 'derived-from'
      | 'supports'
      | 'contradicts'
      | 'candidate-match'
      | 'checked-by';
    basis: string;
    uncertainty: string;
    epistemicStatus: 'asserted' | 'observed' | 'inferred';
    runId: string;
  }>;
}

export type WhitelistedAgentTool =
  | 'get_case_facts'
  | 'get_source_crop'
  | 'recheck_region'
  | 'find_candidate_salary_credits'
  | 'check_statement_coverage'
  | 'run_context_check'
  | 'draft_finding';

export interface ToolExecution {
  stepNumber: number;
  toolName: WhitelistedAgentTool;
  normalizedArgs: Record<string, string | number>;
  cacheKey: string;
  cacheHit: boolean;
  durationMs: number;
  status: 'completed' | 'rejected' | 'stopped';
  outcomeSummary: string;
  citedEvidenceIds: string[];
  executedAt: string;
}

export interface InvestigationState {
  id: string;
  caseId: string;
  runId: string;
  findingId: string;
  revisionFingerprint: string;
  status: 'completed' | 'stopped-max-steps' | 'stale-after-correction';
  stopReason: string;
  stepsUsed: number;
  maxSteps: 5;
  llmMode:
    | 'deterministic-local-state-machine'
    | 'gemini-3.8-flash-evidence-grounded';
  llmNote: string;
  observation: string;
  evidenceInspected: string[];
  alternativesChecked: string[];
  actualCheckOutcomes: string[];
  uncertainty: string;
  nextVerification: string;
  aiSynthesis?: string;
  aiKeyRiskFactors?: string[];
  aiRecommendedAction?: string;
  toolExecutions: ToolExecution[];
  createdAt: string;
}

export interface AIExecutiveCaseAnalysis {
  runId: string;
  caseId: string;
  modelUsed: string;
  generatedAt: string;
  executiveSummary: string;
  financialReconciliationBrief: string;
  visualAndTamperingAssessment: string;
  kycAndRegistryVerification: string;
  keyRiskHighlights: Array<{
    title: string;
    severity: 'high' | 'medium' | 'low';
    citedEvidenceIds: string[];
    detail: string;
  }>;
  recommendedUnderwriterNextSteps: string[];
}

export interface ForensicCapabilityProbeResult {
  runId: string;
  executedAt: string;
  mobileNetRegionClassifier: {
    modelVersion: string;
    status: 'implemented';
    regionsClassified: number;
    regionScores: Array<{
      regionId: string;
      documentName: string;
      pageNumber: number;
      predictedClass:
        | 'clean-native-typography'
        | 'spliced-font-patch'
        | 'ocr-overlay-span'
        | 'signature-stroke-box'
        | 'tabular-cell-grid';
      confidence: number;
      anomalyScore: number;
      featureVectorSummary: string;
    }>;
  };
  pixelTamperingSegmentation: {
    engineVersion: string;
    status: 'implemented';
    masksGenerated: number;
    pageMasks: Array<{
      documentId: string;
      documentName: string;
      pageNumber: number;
      elaMeanResidual: number;
      maxBlockResidual: number;
      tamperMaskHotspots: number;
      heatmapGrid8x8: number[][];
      summary: string;
    }>;
  };
  indianBankingAndKycRegistry: {
    verifierVersion: string;
    status: 'implemented';
    checksRun: Array<{
      identifierType: 'IFSC' | 'PAN' | 'CIN/GSTIN' | 'NEFT/IMPS-UTR' | 'Employer-Entity';
      identifierValue: string;
      validFormat: boolean;
      registryStatus: string;
      bankOrAuthority: string;
    }>;
  };
  signatureAndIndicOcr: {
    engineVersion: string;
    status: 'implemented';
    scriptsSupported: string[];
    signatureRegionsInspected: number;
    strokeContinuityScore: number;
    summary: string;
  };
}

export interface ProcessingRun {
  id: string;
  caseId: string;
  runNumber: number;
  status: 'queued' | 'running' | 'partial' | 'complete' | 'failed' | 'cancelled';
  documentSnapshot: Array<{
    documentId: string;
    displayName: string;
    sha256: string;
    docClass: DocumentClass;
  }>;
  revisionFingerprint: string;
  stages: Array<{
    name: string;
    status: 'completed' | 'partial' | 'failed' | 'skipped';
    durationMs: number;
    detail: string;
  }>;
  extractorVersions: {
    pdfParser: string;
    tableExtractor: string;
    financialEngine: string;
    visualBaseline: string;
    regionClassifier: string;
  };
  startedAt: string;
  completedAt: string;
  supersededByRunId?: string;
}

export interface ReviewAction {
  id: string;
  caseId: string;
  runId: string;
  targetType: 'finding' | 'field';
  targetId: string;
  actionType: 'disposition-update' | 'field-correction';
  actor: string;
  reason: string;
  previousState: string;
  newState: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  sequence: number;
  eventType:
    | 'CASE_CREATED'
    | 'DOCUMENT_INGESTED'
    | 'RUN_COMPLETED'
    | 'FIELD_CORRECTED'
    | 'FINDING_REVIEWED'
    | 'AGENT_INVESTIGATED'
    | 'REPORT_GENERATED'
    | 'CHECKPOINT_SAVED';
  actor: string;
  runId?: string;
  payloadCanonicalJson: string;
  prevHash: string;
  eventHash: string;
  createdAt: string;
}

export interface RetainedCheckpoint {
  caseId: string;
  lastSequence: number;
  headHash: string;
  algorithmVersion: string;
  snapshotTime: string;
}

export interface IntegrityVerificationResult {
  caseId: string;
  status:
    | 'verified-against-checkpoint'
    | 'unanchored-no-checkpoint'
    | 'tamper-detected-chain-mismatch'
    | 'tamper-detected-checkpoint-mismatch'
    | 'tamper-detected-file-hash-mismatch';
  checkedEventsCount: number;
  latestSequence: number;
  latestHeadHash: string;
  checkpoint: RetainedCheckpoint | null;
  fileIntegrityChecks: Array<{
    documentId: string;
    displayName: string;
    expectedSha256: string;
    actualSha256: string;
    matches: boolean;
  }>;
  discrepancies: string[];
  cannotEstablishNote: string;
  verifiedAt: string;
}

export interface ReportArtifact {
  id: string;
  caseId: string;
  runId: string;
  revisionFingerprint: string;
  status: 'active' | 'superseded';
  supersededReason?: string;
  reportHash: string;
  generatedAt: string;
  generatedBy: string;
  sections: {
    documentOverview: {
      summary: string;
      documents: Array<{
        displayName: string;
        docClass: string;
        sha256: string;
        pageCount: number;
        routing: string;
      }>;
    };
    extractedInformation: {
      summary: string;
      fields: Array<{
        label: string;
        rawValue: string;
        normalizedValue: string;
        basis: string;
        unit: string;
        period: string;
        sourceRef: string;
        revision: number;
      }>;
    };
    contextualAnalysis: {
      summary: string;
      calculations: string[];
      alternatives: string[];
      scopedNegativeEvidence: string[];
    };
    visualForensicFindings: {
      summary: string;
      observations: Array<{
        method: string;
        property: string;
        measured: string;
        sourceRef: string;
        strength: number;
        limits: string;
      }>;
    };
    evidenceTraceability: {
      summary: string;
      provenance: string[];
      agentTraces: string[];
      reviewerDispositions: string[];
    };
    investigationSummary: {
      summary: string;
      coverageSummary: string;
      uninspectedRegions: string[];
      limitations: string[];
    };
  };
}

export interface CapabilitiesPayload {
  service: string;
  mode: 'local-loopback-investigation';
  pdfEngine: { name: string; version: string; status: 'implemented' };
  financialArithmetic: { name: string; version: string; status: 'implemented' };
  visualForensics: {
    nativePropertyInspector: 'implemented';
    rasterContrastSharpnessBaseline: 'implemented';
    trainedRegionClassifier: 'implemented';
    pixelSegmentation: 'implemented';
    indianKycAndBankingVerifier: 'implemented';
    signatureAndIndicOcr: 'implemented';
  };
  boundedAgent: {
    stateMachine: 'implemented';
    whitelistedToolsCount: 7;
    maxFollowUpSteps: 5;
    externalLlmAdapter: 'implemented';
    geminiModel: string;
  };
  implementedSubsystems: Array<{
    id: string;
    name: string;
    implementation: string;
    version: string;
    status: 'implemented';
    description: string;
  }>;
  unsupportedCapabilities: string[];
}

export interface RunDetailsPayload {
  run: ProcessingRun;
  documents: DocumentRecord[];
  pages: PageRecord[];
  tokens: SourceToken[];
  tables: ExtractedTable[];
  fields: FieldRecord[];
  fieldRevisions: FieldRevision[];
  claims: ClaimRecord[];
  transactions: TransactionRecord[];
  visualObservations: VisualObservation[];
  checks: CheckExecution[];
  findings: FindingRecord[];
  provenance: ProvenanceAssertion[];
  graph: GraphProjection;
  investigations: InvestigationState[];
  reviewActions: ReviewAction[];
  reports: ReportArtifact[];
}

export interface BulkProcessingDocumentResult {
  documentId: string;
  displayName: string;
  caseId: string;
  caseTitle: string;
  docClass: DocumentClass;
  pageCount: number;
  sha256: string;
  routingMode: string;
  extractedFieldsCount: number;
  extractedTablesCount: number;
  extractedTransactionsCount: number;
  visualObservationsCount: number;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
}

export interface BulkProcessingBatchResult {
  batchId: string;
  executedAt: string;
  mode: 'existing-cases-parallel' | 'consolidated-cross-document-case';
  totalDurationMs: number;
  parallelWorkersUsed: number;
  selectedDocumentCount: number;
  documentResults: BulkProcessingDocumentResult[];
  runsTriggered: Array<{
    caseId: string;
    caseTitle: string;
    runId: string;
    runNumber: number;
    status: ProcessingRun['status'];
    findingsCount: number;
    discrepancyCount: number;
    durationMs: number;
  }>;
  consolidatedCase?: CaseRecord;
  consolidatedRunDetails?: RunDetailsPayload;
}

export interface DossierValidatedFindingItem {
  id: string;
  checkId: string;
  category: FindingRecord['observationType'];
  outcome: CheckResultStatus;
  severity: FindingRecord['severity'];
  title: string;
  summary: string;
  uncertainty: string;
  disposition: FindingDisposition;
  dispositionActor?: string;
  dispositionReason?: string;
  dispositionUpdatedAt?: string;
  validationState:
    | 'reviewer-validated'
    | 'system-consistent'
    | 'open-unreviewed';
  alternativeExplanationsCount: number;
  alternativeExplanations: Array<{
    title: string;
    status: string;
    rationale: string;
    remainingUncertainty: string;
  }>;
  evidenceRefs: Array<{
    documentId: string;
    documentName: string;
    pageNumber: number;
    label: string;
    bbox?: NormalizedBBox;
  }>;
}

export interface DossierExportBundle {
  schemaVersion: 'prooflens-dossier-export-v2.0';
  exportedAt: string;
  exportedBy: string;
  exportScope: {
    validatedOnly: boolean;
    includeFullAuditChain: boolean;
    includeFieldRevisionHistory: boolean;
  };
  caseMetadata: {
    caseId: string;
    caseTitle: string;
    applicantName: string;
    referenceCode: string;
    scenarioTag: ScenarioTag;
  };
  runMetadata: {
    runId: string;
    runNumber: number;
    status: ProcessingRun['status'];
    revisionFingerprint: string;
    startedAt: string;
    completedAt: string;
  };
  reportSnapshot: ReportArtifact;
  validatedFindingsSummary: {
    totalFindingsInRun: number;
    exportedFindingsCount: number;
    reviewerValidatedCount: number;
    systemConsistentCount: number;
    discrepancyCount: number;
    possibleExplanationCount: number;
    insufficientEvidenceCount: number;
  };
  validatedFindings: DossierValidatedFindingItem[];
  auditHistory: {
    verificationStatus: IntegrityVerificationResult['status'];
    checkedEventsCount: number;
    latestSequence: number;
    latestHeadHash: string;
    verifiedAt: string;
    cannotEstablishNote: string;
    checkpoint: RetainedCheckpoint | null;
    fileIntegrityChecks: IntegrityVerificationResult['fileIntegrityChecks'];
    discrepancies: string[];
    events: AuditEvent[];
    reviewerActions: ReviewAction[];
    fieldRevisions: FieldRevision[];
  };
  bundleDigestSha256: string;
}


