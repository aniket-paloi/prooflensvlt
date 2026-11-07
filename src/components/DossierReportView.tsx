import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FilePlus2,
  FileText,
  History,
  ShieldCheck,
} from 'lucide-react';
import { prooflensApi } from '../api/client';
import {
  exportDossierToGoogleDoc,
  type GoogleDocExportResult,
} from '../api/googleDocs';
import type {
  AuditEvent,
  CaseRecord,
  DocumentRecord,
  DossierExportBundle,
  FieldRevision,
  FindingRecord,
  IntegrityVerificationResult,
  ProcessingRun,
  ReportArtifact,
  ReviewAction,
  RunDetailsPayload,
} from '../types/prooflens';
import {
  downloadDossierBundleAsJson,
  downloadDossierBundleAsPdf,
} from '../utils/dossierPdfExport';

interface DossierReportViewProps {
  caseTitle: string;
  run: ProcessingRun;
  reports: ReportArtifact[];
  findings?: FindingRecord[];
  documents?: DocumentRecord[];
  auditEvents?: AuditEvent[];
  auditVerification?: IntegrityVerificationResult | null;
  reviewActions?: ReviewAction[];
  fieldRevisions?: FieldRevision[];
  caseRecord?: CaseRecord;
  runDetails?: RunDetailsPayload;
  actor?: string;
  onReportGenerated: (report: ReportArtifact) => void;
}

export function DossierReportView({
  caseTitle,
  run,
  reports,
  findings = [],
  documents = [],
  auditEvents = [],
  auditVerification = null,
  reviewActions = [],
  fieldRevisions = [],
  caseRecord,
  runDetails,
  actor,
  onReportGenerated,
}: DossierReportViewProps) {
  const [generating, setGenerating] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<
    'pdf' | 'json' | 'gdoc' | null
  >(null);
  const [selectedReportId, setSelectedReportId] = useState<string>(
    reports[0]?.id || ''
  );

  // Export scope options
  const [validatedOnly, setValidatedOnly] = useState<boolean>(false);
  const [includeFullAuditChain, setIncludeFullAuditChain] =
    useState<boolean>(true);
  const [includeFieldRevisionHistory, setIncludeFieldRevisionHistory] =
    useState<boolean>(true);

  const [lastExportedBundle, setLastExportedBundle] =
    useState<DossierExportBundle | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string>('');
  const [googleDocResult, setGoogleDocResult] =
    useState<GoogleDocExportResult | null>(null);

  const canGenerate =
    run.status !== 'failed' && run.documentSnapshot.length > 0;

  const activeReport =
    reports.find((r) => r.id === selectedReportId) || reports[0] || null;

  const docMap = new Map(documents.map((d) => [d.id, d]));

  const strictlyValidatedCount = findings.filter(
    (f) => f.disposition !== 'open' || f.outcome === 'consistent-within-check'
  ).length;

  const displayedFindings = validatedOnly
    ? findings.filter(
        (f) =>
          f.disposition !== 'open' || f.outcome === 'consistent-within-check'
      )
    : findings;

  const handleGenerateSnapshot = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setExportError('');
    try {
      const { report } = await prooflensApi.generateReport(run.id);
      onReportGenerated(report);
      setSelectedReportId(report.id);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Failed to generate dossier snapshot.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleExportGoogleDoc = async () => {
    if (!canGenerate) return;
    setExportingFormat('gdoc');
    setExportError('');
    setGoogleDocResult(null);
    try {
      const activeCaseRecord: CaseRecord = caseRecord || {
        id: run.caseId,
        referenceCode: run.caseId.slice(0, 8).toUpperCase(),
        title: caseTitle,
        applicantName: 'Applicant Subject',
        summary: 'Investigation case evaluated by ProofLens forensic pipeline.',
        scenarioTag: 'discrepancy-visual',
        documentCount: documents.length,
        latestRunId: run.id,
        createdAt: run.startedAt,
        updatedAt: run.completedAt || run.startedAt,
        findingSummary: {
          discrepancy: findings.filter((f) => f.severity === 'red').length,
          possibleExplanation: findings.filter((f) => f.severity === 'amber').length,
          consistent: findings.filter((f) => f.severity === 'green').length,
          insufficientEvidence: 0,
        },
      };

      const activeRunPayload: RunDetailsPayload = runDetails || {
        run,
        reports,
        documents,
        pages: [],
        tokens: [],
        tables: [],
        fields: [],
        fieldRevisions,
        claims: [],
        transactions: [],
        visualObservations: [],
        checks: [],
        findings,
        provenance: [],
        graph: { nodes: [], edges: [] },
        investigations: [],
        reviewActions,
      };

      const result = await exportDossierToGoogleDoc({
        caseRecord: activeCaseRecord,
        runDetails: activeRunPayload,
        actor: actor || 'senior-underwriter',
      });
      setGoogleDocResult(result);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Failed to export dossier to Google Docs.'
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportDossier = async (format: 'pdf' | 'json') => {
    if (!canGenerate) return;
    setExportingFormat(format);
    setExportError('');
    try {
      const res = await prooflensApi.exportDossierBundle(run.id, {
        reportId: activeReport?.id,
        validatedOnly,
        includeFullAuditChain,
        includeFieldRevisionHistory,
      });

      if (res.newlyGenerated) {
        onReportGenerated(res.report);
        setSelectedReportId(res.report.id);
      }
      setLastExportedBundle(res.bundle);

      if (format === 'pdf') {
        downloadDossierBundleAsPdf(res.bundle);
      } else {
        downloadDossierBundleAsJson(res.bundle);
      }
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Failed to export structured dossier bundle.'
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const handleCopyJson = async () => {
    if (!lastExportedBundle) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(lastExportedBundle, null, 2)
      );
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Header & Structured Export Studio */}
      <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-slate-900">
              Frozen Investigation Dossier & Structured Audit/Findings Exporter
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Export the current case Dossier as a structured <strong>JSON</strong> or <strong>PDF</strong> bundle containing the 6-section forensic report, all validated findings with reviewer dispositions and source coordinates, and the complete SHA-256 hash-linked audit history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateSnapshot}
              disabled={!canGenerate || generating}
              title={
                !canGenerate
                  ? 'Disabled: run has no valid parsed documents to snapshot.'
                  : 'Freeze a new 6-section dossier snapshot from the current run & field revisions'
              }
              className="px-3.5 py-2 rounded border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-blue-700" />
              <span>
                {generating ? 'Freezing Snapshot...' : 'Generate Frozen Dossier'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canGenerate || exportingFormat !== null}
              onClick={() => handleExportDossier('pdf')}
              className="px-3.5 py-2 rounded bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exportingFormat === 'pdf'
                  ? 'Building Dossier PDF...'
                  : 'Export Dossier PDF'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canGenerate || exportingFormat !== null}
              onClick={() => handleExportDossier('json')}
              className="px-3.5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileJson className="w-3.5 h-3.5 text-blue-300" />
              <span>
                {exportingFormat === 'json'
                  ? 'Building JSON...'
                  : 'Export Structured JSON'}
              </span>
            </button>

            <button
              type="button"
              disabled={!canGenerate || exportingFormat !== null}
              onClick={handleExportGoogleDoc}
              className="px-3.5 py-2 rounded bg-[#0F9D58] hover:bg-[#0b8043] text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
              title="Export dossier report as an official Google Doc"
            >
              <ExternalLink className="w-3.5 h-3.5 text-white" />
              <span>
                {exportingFormat === 'gdoc'
                  ? 'Creating Google Doc...'
                  : 'Export to Google Docs'}
              </span>
            </button>
          </div>
        </div>

        {/* Export Configuration Options Bar */}
        <div className="pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="dossier-findings-scope"
                className="text-[11px] font-semibold text-slate-700"
              >
                Findings Scope:
              </label>
              <select
                id="dossier-findings-scope"
                value={validatedOnly ? 'validated-only' : 'all-findings'}
                onChange={(e) =>
                  setValidatedOnly(e.target.value === 'validated-only')
                }
                className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-slate-50 text-slate-900"
              >
                <option value="all-findings">
                  All Evaluated & Validated Findings ({findings.length})
                </option>
                <option value="validated-only">
                  Strictly Validated / Confirmed Findings Only ({strictlyValidatedCount})
                </option>
              </select>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFullAuditChain}
                onChange={(e) => setIncludeFullAuditChain(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>
                Include Full SHA-256 Audit History ({auditEvents.length} events)
              </span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFieldRevisionHistory}
                onChange={(e) =>
                  setIncludeFieldRevisionHistory(e.target.checked)
                }
                className="rounded border-slate-300 text-blue-700"
              />
              <span>
                Include Field Revisions & Dispositions ({fieldRevisions.length}{' '}
                revs)
              </span>
            </label>
          </div>

          {lastExportedBundle && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Bundle SHA-256: {lastExportedBundle.bundleDigestSha256.slice(0, 16)}…
              </span>
              <button
                type="button"
                onClick={() => setShowJsonPreview((v) => !v)}
                className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
              >
                {showJsonPreview ? 'Hide JSON Bundle' : 'Inspect JSON Bundle'}
              </button>
            </div>
          )}
        </div>

        {googleDocResult && (
          <div className="p-3.5 rounded-md border border-emerald-300 bg-emerald-50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <div className="truncate">
                <span className="font-semibold text-emerald-950">
                  Google Doc Created Successfully!
                </span>
                <span className="text-emerald-800 ml-2 font-medium truncate">
                  {googleDocResult.docTitle}
                </span>
              </div>
            </div>
            <a
              href={googleDocResult.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-semibold inline-flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
            >
              <span>Open in Google Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {exportError && (
          <div className="p-2.5 rounded border border-red-200 bg-red-50 text-xs text-red-800">
            {exportError}
          </div>
        )}

        {showJsonPreview && lastExportedBundle && (
          <div className="border border-slate-300 rounded-md overflow-hidden bg-slate-950 text-slate-100">
            <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-[11px] text-slate-300">
                {lastExportedBundle.schemaVersion} ·{' '}
                {lastExportedBundle.validatedFindings.length} findings ·{' '}
                {lastExportedBundle.auditHistory.events.length} audit events
              </span>
              <button
                type="button"
                onClick={handleCopyJson}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedJson ? 'Copied!' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="p-3.5 text-[11px] font-mono overflow-x-auto max-h-80 overflow-y-auto">
              {JSON.stringify(lastExportedBundle, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Snapshot Version Selector */}
      {reports.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-md p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 mr-1">
            Frozen Snapshots ({reports.length}):
          </span>
          {reports.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setSelectedReportId(rep.id)}
              className={`px-2.5 py-1 rounded border text-xs font-mono flex items-center gap-1.5 cursor-pointer ${
                activeReport?.id === rep.id
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{rep.id}</span>
              <span
                className={
                  rep.status === 'active'
                    ? 'text-emerald-700'
                    : 'text-amber-800'
                }
              >
                [{rep.status}]
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Report Body or Empty State for Sections 01-06 */}
      {!activeReport ? (
        <div className="bg-white border border-slate-200 rounded-md p-8 text-center space-y-2.5">
          <FileText className="w-6 h-6 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-900">
            No Frozen Dossier Snapshot Generated Yet
          </div>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            {canGenerate
              ? 'Click "Generate Frozen Dossier", "Export Dossier PDF", or "Export Structured JSON" above to freeze Sections 01–06 alongside the Validated Findings Register and Full Cryptographic Audit History shown below.'
              : 'Report generation is disabled because this run contains no valid parsed documents.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-6">
          {/* Status & Hash Banner */}
          <div className="pb-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {activeReport.status === 'active' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                )}
                <h3 className="text-base font-bold text-slate-900">
                  Dossier Snapshot: {activeReport.id} — {caseTitle}
                </h3>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded border ${
                    activeReport.status === 'active'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {activeReport.status.toUpperCase()}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-500 mt-1">
                Generated {activeReport.generatedAt} by{' '}
                {activeReport.generatedBy} · Run {activeReport.runId} · Rev
                Fingerprint {activeReport.revisionFingerprint}
              </div>
            </div>
            <div className="text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
              Report SHA-256: {activeReport.reportHash.slice(0, 24)}…
            </div>
          </div>

          {activeReport.status === 'superseded' &&
            activeReport.supersededReason && (
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-950">
                <span className="font-semibold">
                  Historical Superseded Snapshot:{' '}
                </span>
                {activeReport.supersededReason} Generate a new frozen dossier to
                reflect the latest field revisions.
              </div>
            )}

          {/* Section 1: Document Overview */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              01. Document Overview & Ingestion Hashes
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed">
              {activeReport.sections.documentOverview.summary}
            </p>
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Document</th>
                    <th className="py-2 px-3">Schema Class</th>
                    <th className="py-2 px-3">Pages & Routing</th>
                    <th className="py-2 px-3">Post-Ingestion SHA-256</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {activeReport.sections.documentOverview.documents.map(
                    (d, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-sans font-medium text-slate-900">
                          {d.displayName}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {d.docClass}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {d.pageCount}p · {d.routing}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{d.sha256}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Extracted Information */}
          <section className="space-y-2 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              02. Extracted Information & Typed Claim Semantics
            </h4>
            <p className="text-xs text-slate-700">
              {activeReport.sections.extractedInformation.summary}
            </p>
            <div className="overflow-x-auto border border-slate-200 rounded max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Field</th>
                    <th className="py-2 px-3">Raw Value</th>
                    <th className="py-2 px-3">Normalized Value</th>
                    <th className="py-2 px-3">Basis / Unit / Period</th>
                    <th className="py-2 px-3">Source Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {activeReport.sections.extractedInformation.fields.map(
                    (f, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {f.label}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {f.rawValue}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                          {f.normalizedValue}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                          {f.basis} / {f.unit} / {f.period}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                          {f.sourceRef}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Contextual & Financial Analysis */}
          <section className="space-y-2 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              03. Contextual & Financial Analysis (Decimal Arithmetic)
            </h4>
            <p className="text-xs text-slate-700">
              {activeReport.sections.contextualAnalysis.summary}
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded p-3 font-mono text-[11px] text-slate-800 space-y-1">
              {activeReport.sections.contextualAnalysis.calculations.map(
                (c, i) => (
                  <div key={i}>• {c}</div>
                )
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="border border-slate-200 rounded p-3 text-xs space-y-1">
                <div className="font-semibold text-slate-900">
                  Alternative Explanations Checked
                </div>
                {activeReport.sections.contextualAnalysis.alternatives.map(
                  (a, i) => (
                    <div key={i} className="text-slate-600">
                      • {a}
                    </div>
                  )
                )}
              </div>
              <div className="border border-slate-200 rounded p-3 text-xs space-y-1">
                <div className="font-semibold text-slate-900">
                  Scoped Negative Evidence
                </div>
                {activeReport.sections.contextualAnalysis.scopedNegativeEvidence.map(
                  (s, i) => (
                    <div key={i} className="text-slate-600">
                      • {s}
                    </div>
                  )
                )}
              </div>
            </div>
          </section>

          {/* Section 4: Visual Forensic Findings */}
          <section className="space-y-2 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              04. Visual & Text-Layer Forensic Findings
            </h4>
            <p className="text-xs text-slate-700">
              {activeReport.sections.visualForensicFindings.summary}
            </p>
            {activeReport.sections.visualForensicFindings.observations.length >
              0 && (
              <div className="space-y-2">
                {activeReport.sections.visualForensicFindings.observations.map(
                  (o, i) => (
                    <div
                      key={i}
                      className="border border-slate-200 rounded p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>{o.method}</span>
                        <span className="font-mono text-[11px] text-slate-600">
                          {o.sourceRef} · signal {o.strength}
                        </span>
                      </div>
                      <div className="text-slate-800">{o.measured}</div>
                      <div className="text-[11px] text-slate-500">
                        Limits: {o.limits}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Section 5: Evidence & Traceability */}
          <section className="space-y-2 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              05. Evidence & Traceability Index
            </h4>
            <p className="text-xs text-slate-700">
              {activeReport.sections.evidenceTraceability.summary}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="border border-slate-200 rounded p-3 space-y-1">
                <div className="font-semibold text-slate-900">Provenance</div>
                {activeReport.sections.evidenceTraceability.provenance.map(
                  (p, i) => (
                    <div key={i} className="text-slate-600 text-[11px]">
                      • {p}
                    </div>
                  )
                )}
              </div>
              <div className="border border-slate-200 rounded p-3 space-y-1">
                <div className="font-semibold text-slate-900">
                  Bounded Agent Traces
                </div>
                {activeReport.sections.evidenceTraceability.agentTraces.map(
                  (t, i) => (
                    <div
                      key={i}
                      className="text-slate-600 font-mono text-[11px]"
                    >
                      • {t}
                    </div>
                  )
                )}
              </div>
              <div className="border border-slate-200 rounded p-3 space-y-1">
                <div className="font-semibold text-slate-900">
                  Reviewer Dispositions
                </div>
                {activeReport.sections.evidenceTraceability.reviewerDispositions.map(
                  (r, i) => (
                    <div key={i} className="text-slate-600 text-[11px]">
                      • {r}
                    </div>
                  )
                )}
              </div>
            </div>
          </section>

          {/* Section 6: Investigation Summary & Limitations */}
          <section className="space-y-2 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              06. Investigation Summary, Coverage & Explicit Limitations
            </h4>
            <p className="text-xs text-slate-800 font-medium">
              {activeReport.sections.investigationSummary.summary}
            </p>
            <div className="text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
              {activeReport.sections.investigationSummary.coverageSummary}
            </div>
            <div className="text-xs text-slate-600 space-y-1 pt-1">
              {activeReport.sections.investigationSummary.limitations.map(
                (l, i) => (
                  <div key={i}>• {l}</div>
                )
              )}
            </div>
          </section>
        </div>
      )}

      {/* Section 7: Validated Findings & Dispositions Register (Always visible & included in Export) */}
      <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              07. Validated Findings & Reviewer Dispositions Register (
              {displayedFindings.length} of {findings.length} Findings)
            </h3>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Included in PDF & JSON Dossier Exports
          </span>
        </div>

        {displayedFindings.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded border border-slate-200">
            No findings match the current validation filter. Switch Findings Scope to &quot;All Evaluated &amp; Validated Findings&quot; or record a reviewer disposition in the Overview tab.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Finding & Check ID</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Validation / Disposition</th>
                  <th className="py-2.5 px-3">Summary & Uncertainty</th>
                  <th className="py-2.5 px-3">Source Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {displayedFindings.map((f) => {
                  const isValidated =
                    f.disposition !== 'open' ||
                    f.outcome === 'consistent-within-check';
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="font-semibold text-slate-900">
                          {f.title}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                          {f.id} ·{' '}
                          {f.linkedCheckExecutionIds[0] || f.observationType}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            f.outcome === 'discrepancy'
                              ? 'bg-red-50 border-red-200 text-red-800'
                              : f.outcome === 'consistent-within-check'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          {f.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-[11px] font-semibold text-slate-900">
                          {f.disposition}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isValidated
                            ? f.disposition !== 'open'
                              ? `Reviewer (${f.dispositionActor || 'local'})`
                              : 'System Validated'
                            : 'Open / Unreviewed'}
                        </div>
                        {f.dispositionReason && (
                          <div className="text-[11px] text-slate-600 italic mt-0.5 max-w-[200px] truncate">
                            &quot;{f.dispositionReason}&quot;
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-md">
                        <div className="text-slate-800">{f.summary}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          <span className="font-medium">Uncertainty:</span>{' '}
                          {f.uncertainty}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        <div>
                          {docMap.get(f.primaryDocumentId)?.displayName ||
                            f.primaryDocumentId}{' '}
                          p.{f.primaryPageNumber}
                        </div>
                        {f.secondaryDocumentId && f.secondaryPageNumber && (
                          <div className="text-slate-500">
                            {docMap.get(f.secondaryDocumentId)?.displayName ||
                              f.secondaryDocumentId}{' '}
                            p.{f.secondaryPageNumber}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 8: Full Cryptographic Audit History & SHA-256 Chain (Always visible & included in Export) */}
      <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              08. Full Cryptographic Audit History & SHA-256 Hash Chain (
              {auditEvents.length} Events · {reviewActions.length} Review Actions)
            </h3>
          </div>
          {auditVerification && (
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">
              Chain Status: {auditVerification.status} · Head #
              {auditVerification.latestSequence} (
              {auditVerification.latestHeadHash.slice(0, 12)}…)
            </span>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2 px-3">Seq</th>
                <th className="py-2 px-3">Timestamp (UTC)</th>
                <th className="py-2 px-3">Event Type</th>
                <th className="py-2 px-3">Actor</th>
                <th className="py-2 px-3">Prev Hash → Event SHA-256</th>
                <th className="py-2 px-3">Canonical Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {auditEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/70">
                  <td className="py-2 px-3 font-semibold text-slate-900 tabular-nums">
                    #{ev.sequence}
                  </td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                    {ev.createdAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="py-2 px-3 text-blue-800 font-semibold whitespace-nowrap">
                    {ev.eventType}
                  </td>
                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                    {ev.actor}
                  </td>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                    {ev.prevHash.slice(0, 10)}… →{' '}
                    <span className="text-slate-900 font-medium">
                      {ev.eventHash.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-600 max-w-xs truncate">
                    {ev.payloadCanonicalJson}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
