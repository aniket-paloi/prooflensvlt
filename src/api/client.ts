import type {
  AIExecutiveCaseAnalysis,
  AuditEvent,
  AuthSessionPayload,
  BulkProcessingBatchResult,
  CapabilitiesPayload,
  CaseRecord,
  DocumentFolder,
  DocumentRecord,
  DossierExportBundle,
  EnrichedVaultDocument,
  FindingDisposition,
  FindingRecord,
  FolderColor,
  ForensicCapabilityProbeResult,
  IntegrityVerificationResult,
  InvestigationState,
  ProcessingRun,
  ReportArtifact,
  RetainedCheckpoint,
  RunDetailsPayload,
  ScenarioTag,
} from '../types/prooflens';

const SESSION_STORAGE_KEY = 'prooflens_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredSessionToken();
  const headers = new Headers(options?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const prooflensApi = {
  getHealthReady: () =>
    apiRequest<{
      status: string;
      storageWritable: boolean;
      casesLoaded: number;
      runsLoaded: number;
      pdfEngine: string;
      trainedRegionModel: string;
      externalLlmAdapter: string;
      timestamp: string;
    }>('/api/health/ready'),

  getCapabilities: () => apiRequest<CapabilitiesPayload>('/api/capabilities'),

  // Auth & Session Management
  register: (payload: {
    email: string;
    password: string;
    displayName: string;
    organization?: string;
  }) =>
    apiRequest<{ session: AuthSessionPayload }>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    apiRequest<{ session: AuthSessionPayload }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  syncFirebaseAuth: (payload: {
    uid: string;
    email: string;
    displayName?: string;
    provider: 'firebase-google' | 'firebase-email';
  }) =>
    apiRequest<{ session: AuthSessionPayload }>('/api/auth/firebase-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getCurrentSession: () =>
    apiRequest<{ session: AuthSessionPayload }>('/api/auth/me'),

  logout: () =>
    apiRequest<{ status: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Document Vault & Folders
  listFolders: () => apiRequest<{ folders: DocumentFolder[] }>('/api/folders'),

  createFolder: (payload: {
    name: string;
    description?: string;
    color?: FolderColor;
    ownerId?: string;
  }) =>
    apiRequest<{ folder: DocumentFolder; folders: DocumentFolder[] }>(
      '/api/folders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  deleteFolder: (folderId: string) =>
    apiRequest<{ folders: DocumentFolder[] }>(
      `/api/folders/${encodeURIComponent(folderId)}`,
      {
        method: 'DELETE',
      }
    ),

  listVaultDocuments: (params?: {
    folderId?: string;
    search?: string;
    docClass?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.folderId) qs.set('folderId', params.folderId);
    if (params?.search) qs.set('search', params.search);
    if (params?.docClass) qs.set('docClass', params.docClass);
    const queryStr = qs.toString();
    return apiRequest<{
      documents: EnrichedVaultDocument[];
      folders: DocumentFolder[];
    }>(`/api/documents${queryStr ? `?${queryStr}` : ''}`);
  },

  moveDocumentToFolder: (documentId: string, folderId: string) =>
    apiRequest<{ document: DocumentRecord; folders: DocumentFolder[] }>(
      `/api/documents/${encodeURIComponent(documentId)}/folder`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      }
    ),

  bulkMoveDocumentsToFolder: (documentIds: string[], folderId: string) =>
    apiRequest<{
      movedCount: number;
      documents: DocumentRecord[];
      folders: DocumentFolder[];
    }>('/api/documents/bulk-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds, folderId }),
    }),

  bulkProcessDocuments: (payload: {
    documentIds: string[];
    mode?: 'existing-cases-parallel' | 'consolidated-cross-document-case';
    consolidatedTitle?: string;
    actor?: string;
  }) =>
    apiRequest<{
      batch: BulkProcessingBatchResult;
      folders: DocumentFolder[];
    }>('/api/documents/bulk-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  uploadToVault: async (params: {
    files: File[];
    folderId?: string;
    title?: string;
    applicantName?: string;
  }) => {
    const formData = new FormData();
    for (const f of params.files) {
      formData.append('files', f);
    }
    if (params.folderId) formData.append('folderId', params.folderId);
    if (params.title) formData.append('title', params.title);
    if (params.applicantName) formData.append('applicantName', params.applicantName);
    return apiRequest<{
      case: CaseRecord;
      documents: DocumentRecord[];
      runDetails: RunDetailsPayload;
      folders: DocumentFolder[];
    }>('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  listCases: () => apiRequest<{ cases: CaseRecord[] }>('/api/cases'),

  createCase: (payload: {
    title: string;
    applicantName: string;
    referenceCode?: string;
    scenarioTag?: ScenarioTag;
    summary?: string;
  }) =>
    apiRequest<{ case: CaseRecord }>('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getCase: (caseId: string) =>
    apiRequest<{
      case: CaseRecord;
      documents: DocumentRecord[];
      runDetails: RunDetailsPayload | null;
    }>(`/api/cases/${encodeURIComponent(caseId)}`),

  uploadDocuments: async (caseId: string, files: File[], folderId?: string) => {
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    if (folderId) {
      formData.append('folderId', folderId);
    }
    return apiRequest<{ documents: DocumentRecord[] }>(
      `/api/cases/${encodeURIComponent(caseId)}/documents`,
      {
        method: 'POST',
        body: formData,
      }
    );
  },

  triggerRun: (caseId: string) =>
    apiRequest<{ run: ProcessingRun; runDetails: RunDetailsPayload }>(
      `/api/cases/${encodeURIComponent(caseId)}/runs`,
      {
        method: 'POST',
      }
    ),

  getRunDetails: (runId: string) =>
    apiRequest<RunDetailsPayload>(`/api/runs/${encodeURIComponent(runId)}`),

  correctField: (
    fieldId: string,
    payload: {
      expectedRevision: number;
      newValue: string;
      actor: string;
      reason: string;
    }
  ) =>
    apiRequest<{ runDetails: RunDetailsPayload }>(
      `/api/fields/${encodeURIComponent(fieldId)}/revisions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  reviewFinding: (
    findingId: string,
    payload: {
      disposition: FindingDisposition;
      actor: string;
      reason: string;
    }
  ) =>
    apiRequest<{ finding: FindingRecord }>(
      `/api/findings/${encodeURIComponent(findingId)}/reviews`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),

  investigateFinding: (findingId: string, actor = 'reviewer-local') =>
    apiRequest<{ investigation: InvestigationState }>(
      `/api/findings/${encodeURIComponent(findingId)}/investigate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      }
    ),

  askRunQuestion: (runId: string, question: string) =>
    apiRequest<{
      status: 'answered' | 'refused-prompt-injection' | 'insufficient-evidence';
      question: string;
      answer: string;
      citedIds: string[];
      limitations: string;
      toolUsed: string;
    }>(`/api/runs/${encodeURIComponent(runId)}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    }),

  getForensicProbe: (runId = 'latest') =>
    apiRequest<{ probe: ForensicCapabilityProbeResult }>(
      `/api/runs/${encodeURIComponent(runId)}/forensic-probe`
    ),

  generateAIExecutiveAnalysis: (runId: string) =>
    apiRequest<{ analysis: AIExecutiveCaseAnalysis }>(
      `/api/runs/${encodeURIComponent(runId)}/ai-analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    ),

  generateReport: (runId: string, actor = 'reviewer-local') =>
    apiRequest<{ report: ReportArtifact }>(
      `/api/runs/${encodeURIComponent(runId)}/reports`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      }
    ),

  exportDossierBundle: (
    runId: string,
    payload?: {
      reportId?: string;
      validatedOnly?: boolean;
      includeFullAuditChain?: boolean;
      includeFieldRevisionHistory?: boolean;
      actor?: string;
    }
  ) =>
    apiRequest<{
      bundle: DossierExportBundle;
      report: ReportArtifact;
      newlyGenerated: boolean;
    }>(`/api/runs/${encodeURIComponent(runId)}/dossier-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),

  getCaseAudit: (caseId: string) =>
    apiRequest<{
      events: AuditEvent[];
      verification: IntegrityVerificationResult;
    }>(`/api/cases/${encodeURIComponent(caseId)}/audit`),

  saveCheckpoint: (caseId: string, actor = 'reviewer-local') =>
    apiRequest<{
      checkpoint: RetainedCheckpoint;
      verification: IntegrityVerificationResult;
    }>(`/api/cases/${encodeURIComponent(caseId)}/audit/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor }),
    }),

  simulateTamperCheck: (caseId: string) =>
    apiRequest<{
      simulatedMutation: string;
      verificationResult: IntegrityVerificationResult;
    }>(`/api/cases/${encodeURIComponent(caseId)}/audit/simulate-tamper`, {
      method: 'POST',
    }),
};
