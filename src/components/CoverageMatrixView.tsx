import { ExternalLink, ShieldAlert } from 'lucide-react';
import type {
  CheckExecution,
  DocumentRecord,
  NormalizedBBox,
  PageRecord,
} from '../types/prooflens';
import { OutcomeStatusTag } from './StatusBadge';

interface CoverageMatrixViewProps {
  checks: CheckExecution[];
  pages: PageRecord[];
  documents: DocumentRecord[];
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
}

export function CoverageMatrixView({
  checks,
  pages,
  documents,
  onJumpToSource,
}: CoverageMatrixViewProps) {
  const docMap = new Map(documents.map((d) => [d.id, d]));

  const uninspectedEntries = pages.flatMap((p) => {
    const doc = docMap.get(p.documentId);
    return p.uninspectedRegions.map((u, idx) => ({
      key: `${p.id}-u${idx}`,
      documentId: p.documentId,
      documentName: doc?.displayName || p.documentId,
      pageNumber: p.pageNumber,
      routingMode: p.routingMode,
      bbox: u.bbox,
      reason: u.reason,
    }));
  });

  return (
    <div className="space-y-6">
      {/* Explicit Epistemic Boundary Notice */}
      <div className="bg-white border border-slate-200 rounded-md p-4 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-700 space-y-1">
          <div className="font-semibold text-slate-900">
            Three-Axis Coverage Matrix: Applicability · Lifecycle · Result
          </div>
          <p>
            ProofLens separates whether a check is <span className="font-mono">applicable / not-applicable / unsupported</span>, its execution <span className="font-mono">lifecycle</span>, and its <span className="font-mono">result</span>. A green completed check confirms consistency within its stated parameters and submitted pages only — it never certifies whole-document authenticity.
          </p>
        </div>
      </div>

      {/* Checks Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Check Execution Coverage ({checks.length} Checks)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            Trained Region Classifier: not-trained (explicit incomplete state)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Check ID & Name</th>
                <th className="py-2.5 px-4">Applicability</th>
                <th className="py-2.5 px-4">Lifecycle</th>
                <th className="py-2.5 px-4">Outcome Result</th>
                <th className="py-2.5 px-4">Assumptions & Next Step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checks.map((chk) => (
                <tr key={chk.id} className="hover:bg-slate-50/70 align-top">
                  <td className="py-3 px-4">
                    <div className="font-mono font-semibold text-slate-900">
                      {chk.checkId}
                    </div>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {chk.checkName}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {chk.category}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {chk.applicability}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {chk.lifecycle}
                  </td>
                  <td className="py-3 px-4">
                    <OutcomeStatusTag outcome={chk.result} />
                  </td>
                  <td className="py-3 px-4 text-slate-600 space-y-1 max-w-md">
                    {chk.assumptions.map((a, i) => (
                      <div key={i}>• {a}</div>
                    ))}
                    {chk.nextStepSuggestion && (
                      <div className="text-blue-800 font-medium pt-1">
                        Next step: {chk.nextStepSuggestion}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Uninspected Regions & Unknown Coverage */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Explicitly Recorded Uninspected Regions & Unknown Coverage ({uninspectedEntries.length})
          </h3>
          <span className="text-xs text-slate-500">
            Excluded margins or un-OCR'd raster regions
          </span>
        </div>
        {uninspectedEntries.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No uninspected regions recorded.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Document & Page</th>
                  <th className="py-2.5 px-4">Routing Mode</th>
                  <th className="py-2.5 px-4">Normalized BBox</th>
                  <th className="py-2.5 px-4">Exclusion Reason</th>
                  <th className="py-2.5 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uninspectedEntries.slice(0, 30).map((u) => (
                  <tr key={u.key} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {u.documentName} · p.{u.pageNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {u.routingMode}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                      [{u.bbox.x.toFixed(2)}, {u.bbox.y.toFixed(2)}, {u.bbox.w.toFixed(2)}, {u.bbox.h.toFixed(2)}]
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{u.reason}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToSource(
                            u.documentId,
                            u.pageNumber,
                            u.bbox,
                            `Uninspected Region (p.${u.pageNumber})`
                          )
                        }
                        className="text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
