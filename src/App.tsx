import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Cpu,
  Edit3,
  FilePlus2,
  FileText,
  FileWarning,
  FolderOpen,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  getStoredSessionToken,
  prooflensApi,
  setStoredSessionToken,
} from './api/client';
import { AuthModal } from './components/AuthModal';
import { BoundedCopilotPanel } from './components/BoundedCopilotPanel';
import { CapabilitiesModal } from './components/CapabilitiesModal';
import { ClaimGraphView } from './components/ClaimGraphView';
import { CompareEvidenceModal } from './components/CompareEvidenceModal';
import { CoverageMatrixView } from './components/CoverageMatrixView';
import { DataVisualizationView } from './components/DataVisualizationView';
import { DocumentsDataView } from './components/DocumentsDataView';
import { DocumentVaultView } from './components/DocumentVaultView';
import { DossierReportView } from './components/DossierReportView';
import {
  EvidenceViewer,
  type HighlightTarget,
} from './components/EvidenceViewer';
import { FieldCorrectionModal } from './components/FieldCorrectionModal';
import { IntegrityHistoryView } from './components/IntegrityHistoryView';
import { FinancialReconciliationView } from './components/FinancialReconciliationView';
import { FilkoDashboardView } from './components/FilkoDashboardView';
import { LandingPageView } from './components/LandingPageView';
import { LoginPageView } from './components/LoginPageView';
import { DispositionText, OutcomeStatusTag } from './components/StatusBadge';
import { UploadCaseModal } from './components/UploadCaseModal';
import type {
  AuditEvent,
  AuthSessionPayload,
  CaseRecord,
  FieldRecord,
  FindingDisposition,
  FindingRecord,
  IntegrityVerificationResult,
  InvestigationState,
  NormalizedBBox,
  ReportArtifact,
  RunDetailsPayload,
} from './types/prooflens';

type TopView = 'landing' | 'cases' | 'vault' | 'investigation' | 'login';
type InvestigationTab =
  | 'overview'
  | 'documents'
  | 'visualize'
  | 'financial'
  | 'graph'
  | 'coverage'
  | 'history'
  | 'report';

export default function App() {
  const [topView, setTopView] = useState<TopView>('landing');
  const [activeTab, setActiveTab] = useState<InvestigationTab>('overview');

  // Authentication & Session state
  const [authSession, setAuthSession] = useState<AuthSessionPayload | null>(
    null
  );
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loadingCases, setLoadingCases] = useState<boolean>(true);
  const [casesError, setCasesError] = useState<string>('');
  const [caseFilter, setCaseFilter] = useState<string>('all');
  const [caseSearch, setCaseSearch] = useState<string>('');

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<RunDetailsPayload | null>(null);
  const [loadingRun, setLoadingRun] = useState<boolean>(false);
  const [runError, setRunError] = useState<string>('');

  // Viewer state
  const [activeDocumentId, setActiveDocumentId] = useState<string>('');
  const [activePageNumber, setActivePageNumber] = useState<number>(1);
  const [highlightTarget, setHighlightTarget] =
    useState<HighlightTarget | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    null
  );

  // Resizable 3-pane widths on desktop (percentages for left doc pane & right findings pane)
  const [leftPanePct, setLeftPanePct] = useState<number>(21);
  const [rightPanePct, setRightPanePct] = useState<number>(31);

  // Modals & Copilot panel
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState<boolean>(false);
  const [copilotOpen, setCopilotOpen] = useState<boolean>(false);
  const [compareFinding, setCompareFinding] = useState<FindingRecord | null>(
    null
  );
  const [editingField, setEditingField] = useState<FieldRecord | null>(null);

  // Inline Disposition Form state
  const [dispositionDraft, setDispositionDraft] = useState<{
    findingId: string;
    disposition: FindingDisposition;
    reason: string;
  } | null>(null);
  const [savingDisposition, setSavingDisposition] = useState<boolean>(false);

  // Audit & Checkpoint state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditVerification, setAuditVerification] =
    useState<IntegrityVerificationResult | null>(null);

  useEffect(() => {
    const token = getStoredSessionToken();
    if (token) {
      prooflensApi
        .getCurrentSession()
        .then((res) => {
          if (res.session) {
            setAuthSession(res.session);
          } else {
            setStoredSessionToken(null);
          }
        })
        .catch(() => {
          // Non-fatal
        });
    }
  }, []);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setCasesError('');
    try {
      const res = await prooflensApi.listCases();
      setCases(res.cases);
    } catch (err) {
      setCasesError(
        err instanceof Error ? err.message : 'Failed to load investigation cases.'
      );
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const loadAuditForCase = useCallback(async (caseId: string) => {
    try {
      const res = await prooflensApi.getCaseAudit(caseId);
      setAuditEvents(res.events);
      setAuditVerification(res.verification);
    } catch {
      // Non-fatal
    }
  }, []);

  const applyRunDetails = useCallback(
    (details: RunDetailsPayload, focusFirstFinding = true) => {
      setRunDetails(details);
      const firstDoc = details.documents[0];
      if (firstDoc) {
        setActiveDocumentId((prev) =>
          focusFirstFinding || !details.documents.some((d) => d.id === prev)
            ? firstDoc.id
            : prev
        );
      }
      const firstFinding = details.findings[0];
      if (firstFinding) {
        setSelectedFindingId((prev) =>
          focusFirstFinding || !details.findings.some((f) => f.id === prev)
            ? firstFinding.id
            : prev
        );
        if (focusFirstFinding && firstFinding.primaryDocumentId) {
          setActiveDocumentId(firstFinding.primaryDocumentId);
          setActivePageNumber(firstFinding.primaryPageNumber || 1);
          setHighlightTarget({
            label: firstFinding.title,
            documentId: firstFinding.primaryDocumentId,
            pageNumber: firstFinding.primaryPageNumber || 1,
            bbox: firstFinding.primaryBbox,
            secondaryBbox: firstFinding.secondaryBbox,
            severity:
              firstFinding.severity === 'slate' ? 'blue' : firstFinding.severity,
          });
        }
      } else {
        setSelectedFindingId(null);
        setHighlightTarget(null);
      }
    },
    []
  );

  const openCaseInvestigation = useCallback(
    async (caseId: string, tab: InvestigationTab = 'overview') => {
      setSelectedCaseId(caseId);
      setTopView('investigation');
      setActiveTab(tab);
      setLoadingRun(true);
      setRunError('');
      setActivePageNumber(1);
      try {
        const res = await prooflensApi.getCase(caseId);
        if (res.runDetails) {
          applyRunDetails(res.runDetails);
        } else {
          setRunDetails(null);
        }
        await loadAuditForCase(caseId);
      } catch (err) {
        setRunError(
          err instanceof Error ? err.message : 'Failed to load case details.'
        );
      } finally {
        setLoadingRun(false);
      }
    },
    [applyRunDetails, loadAuditForCase]
  );

  const handleJumpToSource = useCallback(
    (
      documentId: string,
      pageNumber: number,
      bbox?: NormalizedBBox,
      label?: string
    ) => {
      setActiveDocumentId(documentId);
      setActivePageNumber(pageNumber);
      setHighlightTarget({
        label: label || `Page ${pageNumber} Region`,
        documentId,
        pageNumber,
        bbox,
        severity: 'blue',
      });
      setActiveTab('overview');
    },
    []
  );

  const handleSelectFinding = (f: FindingRecord) => {
    setSelectedFindingId(f.id);
    if (f.primaryDocumentId) {
      setActiveDocumentId(f.primaryDocumentId);
      setActivePageNumber(f.primaryPageNumber || 1);
      setHighlightTarget({
        label: f.title,
        documentId: f.primaryDocumentId,
        pageNumber: f.primaryPageNumber || 1,
        bbox: f.primaryBbox,
        secondaryBbox:
          f.secondaryDocumentId === f.primaryDocumentId &&
          f.secondaryPageNumber === f.primaryPageNumber
            ? f.secondaryBbox
            : undefined,
        severity: f.severity === 'slate' ? 'blue' : f.severity,
      });
    }
  };

  const handleFieldCorrectionSubmit = async (payload: {
    fieldId: string;
    expectedRevision: number;
    newValue: string;
    actor: string;
    reason: string;
  }) => {
    const res = await prooflensApi.correctField(payload.fieldId, {
      expectedRevision: payload.expectedRevision,
      newValue: payload.newValue,
      actor: authSession?.user.email || payload.actor,
      reason: payload.reason,
    });
    applyRunDetails(res.runDetails, false);
    if (selectedCaseId) {
      await loadAuditForCase(selectedCaseId);
    }
    await loadCases();
  };

  const handleSaveDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispositionDraft || !dispositionDraft.reason.trim()) return;
    setSavingDisposition(true);
    try {
      const res = await prooflensApi.reviewFinding(dispositionDraft.findingId, {
        disposition: dispositionDraft.disposition,
        actor: authSession?.user.email || 'senior-underwriter',
        reason: dispositionDraft.reason.trim(),
      });
      setRunDetails((prev) =>
        prev
          ? {
              ...prev,
              findings: prev.findings.map((f) =>
                f.id === res.finding.id ? res.finding : f
              ),
            }
          : prev
      );
      setDispositionDraft(null);
      if (selectedCaseId) {
        await loadAuditForCase(selectedCaseId);
      }
    } finally {
      setSavingDisposition(false);
    }
  };

  const handleTriggerReRun = async () => {
    if (!selectedCaseId) return;
    setLoadingRun(true);
    try {
      const res = await prooflensApi.triggerRun(selectedCaseId);
      applyRunDetails(res.runDetails);
      await loadAuditForCase(selectedCaseId);
      await loadCases();
    } finally {
      setLoadingRun(false);
    }
  };

  const startPaneDrag = (side: 'left' | 'right', startX: number) => {
    const startLeft = leftPanePct;
    const startRight = rightPanePct;
    const containerW = Math.max(960, window.innerWidth);

    const onMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientX - startX) / containerW) * 100;
      if (side === 'left') {
        setLeftPanePct(
          Math.max(15, Math.min(32, Number((startLeft + deltaPct).toFixed(1))))
        );
      } else {
        setRightPanePct(
          Math.max(24, Math.min(42, Number((startRight - deltaPct).toFixed(1))))
        );
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (caseFilter === 'discrepancy' && c.findingSummary.discrepancy === 0) {
        return false;
      }
      if (
        caseFilter === 'alternatives' &&
        c.findingSummary.possibleExplanation === 0 &&
        c.findingSummary.insufficientEvidence === 0
      ) {
        return false;
      }
      if (
        caseFilter === 'blueprint' &&
        c.scenarioTag !== 'blueprint-spec' &&
        c.scenarioTag !== 'custom-upload'
      ) {
        return false;
      }
      if (caseSearch.trim()) {
        const q = caseSearch.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.applicantName.toLowerCase().includes(q) ||
          c.referenceCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cases, caseFilter, caseSearch]);

  const activeCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  const activeDocument = useMemo(
    () => runDetails?.documents.find((d) => d.id === activeDocumentId),
    [runDetails, activeDocumentId]
  );

  const centerPanePct = Math.max(32, 100 - leftPanePct - rightPanePct);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Bar — Filko Minimalist High-End Nav */}
      <header className="bg-white border-b border-slate-200/80 px-6 h-16 flex items-center justify-between gap-6 shrink-0">
        {/* Zone 1: Single-Line Brand Wordmark with Geometric Emblem */}
        <button
          type="button"
          onClick={() => setTopView('landing')}
          className="flex items-center gap-2.5 cursor-pointer group text-left shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center p-1 shadow-xs group-hover:scale-105 transition-transform overflow-hidden">
            <img
              src="/assets/aistudio/image_d1982cd2.png"
              alt="ProofLens Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-display font-extrabold text-lg text-slate-900 tracking-tight">
            prooflens.
          </span>
        </button>

        {/* Zone 2: 5 Clean Filko-Styled Navigation Pills */}
        <nav
          aria-label="Primary Navigation"
          className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100/80 border border-slate-200/80 text-xs font-semibold overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setTopView('landing')}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              topView === 'landing'
                ? 'bg-black text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => setTopView('cases')}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              topView === 'cases'
                ? 'bg-black text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setTopView('vault')}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              topView === 'vault'
                ? 'bg-black text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Document Vault
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedCaseId) {
                setTopView('investigation');
              } else if (cases[0]) {
                openCaseInvestigation(cases[0].id);
              }
            }}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              topView === 'investigation'
                ? 'bg-black text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Investigation Workspace
          </button>
          <button
            type="button"
            onClick={() => setTopView('login')}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              topView === 'login'
                ? 'bg-black text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            {authSession ? authSession.user.displayName : 'Sign In'}
          </button>
        </nav>

        {/* Zone 3: Primary Action Button */}
        <div className="shrink-0 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 rounded-full bg-black hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>+ Upload PDF</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      {topView === 'landing' ? (
        <LandingPageView
          cases={cases}
          session={authSession}
          onEnterWorkspace={() => setTopView('cases')}
          onOpenCase={(caseId) => openCaseInvestigation(caseId)}
          onOpenLoginPage={() => setTopView('login')}
          onOpenVault={() => setTopView('vault')}
          onOpenCapabilities={() => setCapabilitiesOpen(true)}
          onOpenUpload={() => setUploadModalOpen(true)}
        />
      ) : topView === 'login' ? (
        <LoginPageView
          session={authSession}
          onSessionChange={(newSess) => setAuthSession(newSess)}
          onContinueToWorkspace={() => setTopView('cases')}
        />
      ) : topView === 'vault' ? (
        <DocumentVaultView
          onOpenDocumentInWorkspace={async (caseId, docId, tab = 'overview') => {
            await openCaseInvestigation(caseId, tab);
            setActiveDocumentId(docId);
            setActivePageNumber(1);
          }}
          onCaseUploaded={async (newCase, newRunDetails) => {
            await loadCases();
            setSelectedCaseId(newCase.id);
            setTopView('investigation');
            setActiveTab('visualize');
            applyRunDetails(newRunDetails);
            await loadAuditForCase(newCase.id);
          }}
        />
      ) : topView === 'cases' ? (
        <FilkoDashboardView
          cases={cases}
          session={authSession}
          loadingCases={loadingCases}
          casesError={casesError}
          onOpenCase={(caseId, tab = 'overview') => openCaseInvestigation(caseId, tab)}
          onOpenVault={() => setTopView('vault')}
          onOpenCapabilities={() => setCapabilitiesOpen(true)}
          onOpenUpload={() => setUploadModalOpen(true)}
          onOpenLoginPage={() => setTopView('login')}
        />
      ) : (
        /* Investigation Workspace View */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Case Context & 7-Tab Sub-Navigation */}
          <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <label htmlFor="active-case-select" className="sr-only">
                Active Case
              </label>
              <select
                id="active-case-select"
                value={selectedCaseId || ''}
                onChange={(e) => openCaseInvestigation(e.target.value, activeTab)}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white text-slate-900 max-w-xs truncate"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>

              {runDetails && (
                <div className="text-xs text-slate-500 font-mono tabular-nums flex flex-wrap items-center gap-2">
                  <span>Run #{runDetails.run.runNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>status={runDetails.run.status}</span>
                  <span aria-hidden="true">·</span>
                  <span>rev={runDetails.run.revisionFingerprint.slice(0, 8)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {runDetails.run.completedAt.replace('T', ' ').slice(0, 19)} UTC
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCapabilitiesOpen(true)}
                className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Inspect MobileNetV3 Region Classifier, 8x8 Pixel ELA Heatmap, and Indian KYC/IFSC Telemetry"
              >
                <Cpu className="w-3.5 h-3.5 text-blue-700" />
                <span>Capabilities &amp; ELA Probe</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerReRun}
                disabled={loadingRun}
                className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Create a new immutable processing run snapshot against current documents"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingRun ? 'animate-spin' : ''}`}
                />
                <span>New Run Snapshot</span>
              </button>

              <button
                type="button"
                onClick={() => setCopilotOpen((v) => !v)}
                className={`px-3 py-1.5 rounded border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  copilotOpen
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>AI Copilot &amp; Agent</span>
              </button>
            </div>
          </div>

          {/* 8 Investigation Tabs (including Visualize Data) */}
          <div
            role="tablist"
            aria-label="Investigation Workspace Sections"
            className="bg-slate-100/80 border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto shrink-0"
          >
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'documents', label: 'Documents' },
                { id: 'visualize', label: 'Visualize Data' },
                { id: 'financial', label: 'Financial' },
                { id: 'graph', label: 'Graph' },
                { id: 'coverage', label: 'Coverage' },
                { id: 'history', label: 'History' },
                { id: 'report', label: 'Report' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-blue-700 text-blue-700 bg-white font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.id === 'visualize' && (
                  <BarChart3 className="w-3.5 h-3.5 text-blue-700" />
                )}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Main Investigation Content + Collapsible Copilot Side Panel */}
          <div className="flex-1 flex min-h-0 relative">
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {loadingRun ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Loading run snapshot, normalized page geometry, and Decimal checks...
                </div>
              ) : runError ? (
                <div className="m-6 p-4 rounded border border-red-200 bg-red-50 text-xs text-red-800">
                  {runError}
                </div>
              ) : !runDetails ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  No processing run found for this case.
                </div>
              ) : activeTab === 'overview' ? (
                /* Resizable 3-Pane Laptop Workspace: ~20% Docs/Fields | ~50% Viewer | ~30% Findings */
                <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                  {/* Left Pane: Document & Extracted Field Tree (~20%) */}
                  <aside
                    aria-label="Document and Extracted Field Navigator"
                    style={{ '--left-w': `${leftPanePct}%` } as React.CSSProperties}
                    className="w-full lg:[width:var(--left-w)] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col max-h-64 lg:max-h-none overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/70">
                      <div className="text-xs font-semibold text-slate-900">
                        Documents ({runDetails.documents.length})
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto shrink-0">
                      {runDetails.documents.map((doc) => {
                        const isSelected = doc.id === activeDocumentId;
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => {
                              setActiveDocumentId(doc.id);
                              setActivePageNumber(1);
                              setHighlightTarget(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-start gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50/70 text-blue-950 font-semibold'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            {doc.status === 'failed' ||
                            doc.status === 'unsupported' ? (
                              <FileWarning className="w-3.5 h-3.5 text-red-700 mt-0.5 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-blue-700 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{doc.displayName}</div>
                              <div className="text-[11px] font-mono text-slate-500">
                                {doc.docClass} · {doc.pageCount}p
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Extracted Fields for Active Document (or All Run Fields) */}
                    <div className="px-3 py-2 border-y border-slate-200 bg-slate-50/70 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        Extracted Fields ({runDetails.fields.length})
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        click to locate
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                      {runDetails.fields.length === 0 ? (
                        <div className="p-4 text-xs text-slate-500">
                          No structured fields extracted.
                        </div>
                      ) : (
                        runDetails.fields.map((f) => {
                          const doc = runDetails.documents.find(
                            (d) => d.id === f.documentId
                          );
                          return (
                            <div
                              key={f.id}
                              className={`px-3 py-2 text-xs hover:bg-slate-50 ${
                                f.reviewState === 'corrected'
                                  ? 'bg-amber-50/40'
                                  : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleJumpToSource(
                                      f.documentId,
                                      f.pageNumber,
                                      f.bbox,
                                      `${f.label}: ${f.rawValue}`
                                    )
                                  }
                                  className="text-left min-w-0 flex-1 cursor-pointer"
                                >
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {f.label}
                                  </div>
                                  <div className="font-mono font-medium text-slate-900 truncate">
                                    {f.rawValue}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingField(f)}
                                  title="Edit field value and propagate revision"
                                  className="px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>v{f.currentRevisionNumber}</span>
                                </button>
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                                {doc?.displayName} · p.{f.pageNumber}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </aside>

                  {/* Left Resize Handle (Desktop) */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize document panel"
                    onMouseDown={(e) => startPaneDrag('left', e.clientX)}
                    className="hidden lg:block w-1 bg-slate-200 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
                  />

                  {/* Center Pane: Interactive PDF.js & Image Evidence Viewer (~50%) */}
                  <section
                    aria-label="Source Document Evidence Viewer"
                    style={{ '--center-w': `${centerPanePct}%` } as React.CSSProperties}
                    className="w-full lg:[width:var(--center-w)] flex-1 min-w-0 min-h-[460px] flex flex-col overflow-hidden"
                  >
                    <EvidenceViewer
                      document={activeDocument}
                      pages={runDetails.pages}
                      tokens={runDetails.tokens}
                      fields={runDetails.fields}
                      visualObservations={runDetails.visualObservations}
                      activePageNumber={activePageNumber}
                      onPageChange={setActivePageNumber}
                      highlightTarget={highlightTarget}
                      onSelectFieldFromOverlay={(fld) => setEditingField(fld)}
                    />
                  </section>

                  {/* Right Resize Handle (Desktop) */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize findings panel"
                    onMouseDown={(e) => startPaneDrag('right', e.clientX)}
                    className="hidden lg:block w-1 bg-slate-200 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
                  />

                  {/* Right Pane: Findings, Explanations, Compare & Reviewer Disposition (~30%) */}
                  <aside
                    aria-label="Investigation Findings and Reviewer Actions"
                    style={{ '--right-w': `${rightPanePct}%` } as React.CSSProperties}
                    className="w-full lg:[width:var(--right-w)] shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        Findings & Observations ({runDetails.findings.length})
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        click to inspect source
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
                      {runDetails.findings.length === 0 ? (
                        <div className="p-6 text-xs text-slate-500">
                          No findings produced for this run.
                        </div>
                      ) : (
                        runDetails.findings.map((f) => {
                          const isSelected = selectedFindingId === f.id;
                          const isDrafting =
                            dispositionDraft?.findingId === f.id;
                          return (
                            <div
                              key={f.id}
                              onClick={() => handleSelectFinding(f)}
                              className={`p-3.5 space-y-2.5 transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50/40'
                                  : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <OutcomeStatusTag outcome={f.outcome} />
                                <DispositionText disposition={f.disposition} />
                              </div>

                              <h3 className="text-xs font-semibold text-slate-900 leading-snug">
                                {f.title}
                              </h3>

                              <p className="text-xs text-slate-700 leading-relaxed">
                                {f.summary}
                              </p>

                              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded p-2">
                                <span className="font-semibold text-slate-700">
                                  Uncertainty:{' '}
                                </span>
                                {f.uncertainty}
                              </div>

                              {/* Action Row: Compare, Bounded Agent, Reviewer Disposition */}
                              <div
                                className="flex flex-wrap items-center gap-1.5 pt-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {f.compareData && (
                                  <button
                                    type="button"
                                    onClick={() => setCompareFinding(f)}
                                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <ArrowLeftRight className="w-3 h-3 text-blue-700" />
                                    <span>Compare</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFindingId(f.id);
                                    setCopilotOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Bot className="w-3 h-3 text-blue-700" />
                                  <span>Agent Follow-Up</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setDispositionDraft(
                                      isDrafting
                                        ? null
                                        : {
                                            findingId: f.id,
                                            disposition:
                                              f.disposition === 'open'
                                                ? 'observation-confirmed'
                                                : f.disposition,
                                            reason: f.dispositionReason || '',
                                          }
                                    )
                                  }
                                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                  <span>Disposition</span>
                                </button>
                              </div>

                              {f.dispositionReason && !isDrafting && (
                                <div className="text-[11px] font-mono text-slate-600">
                                  Reviewer ({f.dispositionActor}): &quot;
                                  {f.dispositionReason}&quot;
                                </div>
                              )}

                              {/* Inline Reviewer Disposition Form */}
                              {isDrafting && dispositionDraft && (
                                <form
                                  onSubmit={handleSaveDisposition}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-2.5 rounded border border-slate-300 bg-white space-y-2 text-xs"
                                >
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                      Reviewer Disposition (Retains Detector Record)
                                    </label>
                                    <select
                                      value={dispositionDraft.disposition}
                                      onChange={(e) =>
                                        setDispositionDraft({
                                          ...dispositionDraft,
                                          disposition: e.target
                                            .value as FindingDisposition,
                                        })
                                      }
                                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                    >
                                      <option value="observation-confirmed">
                                        Observation Confirmed (Not Auto-Fraud)
                                      </option>
                                      <option value="further-verification-needed">
                                        Further Verification Needed
                                      </option>
                                      <option value="false-alert">
                                        False Alert (Benign Explanation)
                                      </option>
                                      <option value="resolved">Resolved</option>
                                      <option value="open">Open</option>
                                    </select>
                                  </div>
                                  <div>
                                    <input
                                      type="text"
                                      required
                                      value={dispositionDraft.reason}
                                      onChange={(e) =>
                                        setDispositionDraft({
                                          ...dispositionDraft,
                                          reason: e.target.value,
                                        })
                                      }
                                      placeholder="Mandatory reviewer reason..."
                                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setDispositionDraft(null)}
                                      className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={
                                        savingDisposition ||
                                        !dispositionDraft.reason.trim()
                                      }
                                      className="px-2.5 py-1 rounded bg-blue-700 text-white text-[11px] font-medium hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                                    >
                                      Save Disposition
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </aside>
                </div>
              ) : (
                /* Scrollable Tab Views: Documents, Financial, Graph, Coverage, History, Report */
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-6xl mx-auto">
                    {activeTab === 'documents' && (
                      <DocumentsDataView
                        documents={runDetails.documents}
                        pages={runDetails.pages}
                        fields={runDetails.fields}
                        tables={runDetails.tables}
                        claims={runDetails.claims}
                        onJumpToSource={handleJumpToSource}
                        onEditField={(fld) => setEditingField(fld)}
                        onOpenVisualize={() => setActiveTab('visualize')}
                      />
                    )}

                    {activeTab === 'visualize' && (
                      <DataVisualizationView
                        documents={runDetails.documents}
                        pages={runDetails.pages}
                        fields={runDetails.fields}
                        transactions={runDetails.transactions}
                        tables={runDetails.tables}
                        onJumpToSource={handleJumpToSource}
                      />
                    )}

                    {activeTab === 'financial' && (
                      <FinancialReconciliationView
                        checks={runDetails.checks}
                        transactions={runDetails.transactions}
                        findings={runDetails.findings}
                        documents={runDetails.documents}
                        onJumpToSource={handleJumpToSource}
                        onOpenCompare={(f) => setCompareFinding(f)}
                      />
                    )}

                    {activeTab === 'graph' && (
                      <ClaimGraphView
                        graph={runDetails.graph}
                        provenance={runDetails.provenance}
                        onJumpToSource={handleJumpToSource}
                      />
                    )}

                    {activeTab === 'coverage' && (
                      <CoverageMatrixView
                        checks={runDetails.checks}
                        pages={runDetails.pages}
                        documents={runDetails.documents}
                        onJumpToSource={handleJumpToSource}
                      />
                    )}

                    {activeTab === 'history' && selectedCaseId && (
                      <IntegrityHistoryView
                        caseId={selectedCaseId}
                        events={auditEvents}
                        verification={auditVerification}
                        reviewActions={runDetails.reviewActions}
                        onRefreshAudit={() => loadAuditForCase(selectedCaseId)}
                      />
                    )}

                    {activeTab === 'report' && (
                      <DossierReportView
                        caseTitle={activeCase?.title || runDetails.run.caseId}
                        run={runDetails.run}
                        reports={runDetails.reports}
                        findings={runDetails.findings}
                        documents={runDetails.documents}
                        auditEvents={auditEvents}
                        auditVerification={auditVerification}
                        reviewActions={runDetails.reviewActions}
                        fieldRevisions={runDetails.fieldRevisions}
                        caseRecord={activeCase || undefined}
                        runDetails={runDetails}
                        actor={authSession?.user.displayName || authSession?.user.email || 'reviewer'}
                        onReportGenerated={(newReport: ReportArtifact) => {
                          setRunDetails((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  reports: [
                                    newReport,
                                    ...prev.reports.map((r) =>
                                      r.status === 'active'
                                        ? {
                                            ...r,
                                            status: 'superseded' as const,
                                            supersededReason:
                                              'Superseded by newly generated frozen dossier snapshot.',
                                          }
                                        : r
                                    ),
                                  ],
                                }
                              : prev
                          );
                          if (selectedCaseId) {
                            loadAuditForCase(selectedCaseId);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Bounded Investigation Copilot Side Panel */}
            {copilotOpen && runDetails && (
              <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 xl:static xl:w-96 shrink-0 shadow-xl xl:shadow-none">
                <BoundedCopilotPanel
                  runId={runDetails.run.id}
                  revisionFingerprint={runDetails.run.revisionFingerprint}
                  findings={runDetails.findings}
                  investigations={runDetails.investigations}
                  selectedFindingId={selectedFindingId}
                  onInvestigationComplete={(invState: InvestigationState) => {
                    setRunDetails((prev) =>
                      prev
                        ? {
                            ...prev,
                            investigations: [
                              ...prev.investigations.filter(
                                (i) => i.findingId !== invState.findingId
                              ),
                              invState,
                            ],
                          }
                        : prev
                    );
                    if (selectedCaseId) {
                      loadAuditForCase(selectedCaseId);
                    }
                  }}
                  onClose={() => setCopilotOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        session={authSession}
        onSessionChange={(newSess) => setAuthSession(newSess)}
      />

      <UploadCaseModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onCaseProcessed={async (newCase, newRunDetails) => {
          await loadCases();
          setSelectedCaseId(newCase.id);
          setTopView('investigation');
          setActiveTab('overview');
          applyRunDetails(newRunDetails);
          await loadAuditForCase(newCase.id);
        }}
      />

      <CompareEvidenceModal
        finding={compareFinding}
        documents={runDetails?.documents || []}
        onClose={() => setCompareFinding(null)}
        onJumpToSource={handleJumpToSource}
      />

      <FieldCorrectionModal
        field={editingField}
        revisions={runDetails?.fieldRevisions || []}
        onClose={() => setEditingField(null)}
        onSubmitCorrection={handleFieldCorrectionSubmit}
      />

      <CapabilitiesModal
        isOpen={capabilitiesOpen}
        onClose={() => setCapabilitiesOpen(false)}
        activeRunId={runDetails?.run.id}
      />
    </div>
  );
}
