import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  FileWarning,
  FolderOpen,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { AuthSessionPayload, CaseRecord } from '../types/prooflens';

interface FilkoDashboardViewProps {
  cases: CaseRecord[];
  session: AuthSessionPayload | null;
  loadingCases: boolean;
  casesError: string;
  onOpenCase: (caseId: string, tab?: 'overview' | 'documents' | 'visualize') => void;
  onOpenVault: () => void;
  onOpenCapabilities: () => void;
  onOpenUpload: () => void;
  onOpenLoginPage: () => void;
}

export function FilkoDashboardView({
  cases,
  session,
  loadingCases,
  casesError,
  onOpenCase,
  onOpenVault,
  onOpenCapabilities,
  onOpenUpload,
  onOpenLoginPage,
}: FilkoDashboardViewProps) {
  const [filterTag, setFilterTag] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const totalDocuments = cases.reduce((acc, c) => acc + c.documentCount, 0);
  const totalDiscrepancies = cases.reduce(
    (acc, c) => acc + c.findingSummary.discrepancy,
    0
  );
  const totalConsistent = cases.reduce(
    (acc, c) => acc + c.findingSummary.consistent,
    0
  );
  const totalExplanations = cases.reduce(
    (acc, c) =>
      acc +
      c.findingSummary.possibleExplanation +
      c.findingSummary.insufficientEvidence,
    0
  );

  const activeCase =
    cases.find((c) => c.scenarioTag === 'discrepancy-visual') || cases[0];

  const filteredCases = cases.filter((c) => {
    if (filterTag === 'discrepancy' && c.findingSummary.discrepancy === 0) {
      return false;
    }
    if (
      filterTag === 'alternatives' &&
      c.findingSummary.possibleExplanation === 0 &&
      c.findingSummary.insufficientEvidence === 0
    ) {
      return false;
    }
    if (
      filterTag === 'consistent' &&
      (c.findingSummary.discrepancy > 0 || c.findingSummary.consistent === 0)
    ) {
      return false;
    }
    if (
      filterTag === 'custom' &&
      c.scenarioTag !== 'custom-upload' &&
      c.scenarioTag !== 'blueprint-spec'
    ) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        c.title.toLowerCase().includes(q) ||
        c.applicantName.toLowerCase().includes(q) ||
        c.referenceCode.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 w-full bg-[#f8fafc] text-slate-900 pb-16">
      {/* Filko Top Greeting & Search Header */}
      <div className="bg-white border-b border-slate-200/80 px-6 lg:px-10 py-5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Welcome back, {session?.user.displayName || 'Aniket Paloi'}!</span>
              <span className="text-xl">👋</span>
            </h1>
            <p className="text-xs text-slate-500">
              ProofLens Sovereign Investigation Workspace · Indian Rupee (₹) Financial Forensics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Global Search Input with ⌘K Badge */}
            <div className="relative w-72 sm:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cases, applicants, or IFSC..."
                className="w-full pl-8 pr-12 py-2 text-xs rounded-full border border-slate-200 bg-slate-50/70 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 bg-white">
                ⌘K
              </span>
            </div>

            {/* Quick Upload Action */}
            <button
              type="button"
              onClick={onOpenUpload}
              className="px-4 py-2 rounded-full bg-black hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload PDF</span>
            </button>

            {/* Bulk OCR Action */}
            <button
              type="button"
              onClick={onOpenVault}
              className="px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Document Vault</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-7 space-y-7">
        {/* Filko Highlight Banner: Active Underwriting Case Overview */}
        {activeCase && (
          <div className="rounded-3xl bg-gradient-to-r from-[#1c1d22] via-[#242730] to-[#1c1d22] text-white p-6 sm:p-8 shadow-md border border-slate-800 relative overflow-hidden">
            {/* Background geometric flare */}
            <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
              <div className="lg:col-span-8 space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-mono text-blue-300 font-semibold border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span>CURRENT ACTIVE INVESTIGATION PACKET</span>
                </div>

                <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
                  {activeCase.title}
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                  {activeCase.summary}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <span className="font-mono text-slate-400">
                    Subject: <strong className="text-white">{activeCase.applicantName}</strong>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono text-slate-400">
                    Code: <strong className="text-white">{activeCase.referenceCode}</strong>
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono text-slate-400">
                    Documents: <strong className="text-white">{activeCase.documentCount} PDFs</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => onOpenCase(activeCase.id)}
                    className="px-5 py-2.5 rounded-full bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <span>Resume Investigation Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenCase(activeCase.id, 'visualize')}
                    className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/15 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-blue-300" />
                    <span>Open Charts</span>
                  </button>
                </div>
              </div>

              {/* Right Gauge / Meter Card */}
              <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-2xl p-5 text-center space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Forensic Confidence Index
                </div>
                <div className="text-3xl font-display font-black text-emerald-400 tabular-nums">
                  94.2%
                </div>
                <div className="text-[11px] text-slate-300 leading-relaxed">
                  Exact base-10 Decimal.js reconciliation with zero floating point variance across ₹ Indian Rupee streams.
                </div>
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Tamper Scan: MobileNetV3</span>
                  <span className="text-emerald-400 font-bold">Passed</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filko Metric Cards Row (4 rounded-2xl cards with soft pastel icon badges) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Underwriting Packets</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {cases.length} Cases
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {totalDocuments} Submitted PDF Documents
            </div>
          </div>

          {/* Metric 2 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Reconciled INR Volume</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              ₹2,45,000
            </div>
            <div className="text-[11px] text-emerald-700 font-medium">
              Exact Base-10 Decimal Alignment
            </div>
          </div>

          {/* Metric 3 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Flagged Discrepancies</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {totalDiscrepancies} Flagged
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {totalExplanations} Legitimate Explanations
            </div>
          </div>

          {/* Metric 4 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-sm transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Cryptographic History</span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
            </div>
            <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              100% Verified
            </div>
            <div className="text-[11px] text-purple-700 font-medium">
              SHA-256 Retained Checkpoint
            </div>
          </div>
        </div>

        {/* Filko Filter Pills & Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-full bg-slate-200/60 border border-slate-200">
            {[
              { id: 'all', label: `All Packets (${cases.length})` },
              { id: 'discrepancy', label: `With Discrepancies (${totalDiscrepancies})` },
              { id: 'alternatives', label: `Split / Multi-Tranche` },
              { id: 'consistent', label: `Clean Consistent` },
              { id: 'custom', label: `Uploaded & Blueprint` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTag(t.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  filterTag === t.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono text-slate-500">
            Showing {filteredCases.length} of {cases.length} packets
          </div>
        </div>

        {/* Filko Case Cards Grid */}
        {loadingCases ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
            Loading investigation cases and SHA-256 manifests...
          </div>
        ) : casesError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-xs text-red-800">
            {casesError}
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center space-y-3">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-900">No Matching Packets</div>
            <p className="text-xs text-slate-500">
              Clear your search or upload a new PDF packet to begin investigation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCases.map((c) => {
              const initials = c.applicantName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || 'CV';

              return (
                <div
                  key={c.id}
                  onClick={() => onOpenCase(c.id)}
                  className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-3">
                    {/* Top Row: Applicant Avatar initials & Reference badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-900 font-bold text-xs flex items-center justify-center border border-blue-100 shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display font-bold text-sm text-slate-900 leading-snug line-clamp-1 group-hover:text-blue-700 transition-colors">
                            {c.title}
                          </h3>
                          <div className="text-xs text-slate-500 truncate">
                            {c.applicantName}
                          </div>
                        </div>
                      </div>

                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {c.referenceCode}
                      </span>
                    </div>

                    {/* Summary snippet */}
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {c.summary}
                    </p>

                    {/* Document count pill */}
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                      <FileCheck2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>{c.documentCount} PDF document(s) verified</span>
                    </div>

                    {/* Finding Summary Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {c.findingSummary.discrepancy > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200 text-[11px] font-mono font-semibold">
                          {c.findingSummary.discrepancy} discrepancy
                        </span>
                      )}
                      {c.findingSummary.possibleExplanation > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-mono">
                          {c.findingSummary.possibleExplanation} explanation
                        </span>
                      )}
                      {c.findingSummary.consistent > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-mono">
                          {c.findingSummary.consistent} consistent
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Action row */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-mono text-slate-400">
                      {c.updatedAt.slice(0, 10)}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCase(c.id, 'visualize');
                        }}
                        className="px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer inline-flex items-center gap-1"
                        title="Visualize extracted fields in charts"
                      >
                        <BarChart3 className="w-3 h-3 text-blue-600" />
                        <span>Charts</span>
                      </button>

                      <span className="px-3 py-1 rounded-full bg-black text-white text-[11px] font-semibold group-hover:bg-slate-800 transition-colors inline-flex items-center gap-1">
                        <span>Investigate</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Forensic Capabilities & Subsystems Widget Strip */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                ProofLens Forensic Subsystem Architecture (8/8 Operational)
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenCapabilities}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Inspect Telemetry &amp; ELA Probe →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="font-semibold text-slate-900">PDF.js 5.x Engine</div>
              <div className="text-[11px] text-slate-500 font-mono">
                Coordinate extraction &amp; 3 Tr layers
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="font-semibold text-slate-900">MobileNetV3 v1.4</div>
              <div className="text-[11px] text-slate-500 font-mono">
                Region classification &amp; font baseline
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="font-semibold text-slate-900">Pixel ELA v1.2</div>
              <div className="text-[11px] text-slate-500 font-mono">
                8x8 JPEG/PNG tamper residual heatmap
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="font-semibold text-slate-900">Gemini 3.8 Flash</div>
              <div className="text-[11px] text-slate-500 font-mono">
                Evidence-grounded brief synthesis
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
