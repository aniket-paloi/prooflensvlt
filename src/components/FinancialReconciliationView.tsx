import { ArrowLeftRight, Calculator, ExternalLink, HelpCircle } from 'lucide-react';
import type {
  CheckExecution,
  DocumentRecord,
  FindingRecord,
  NormalizedBBox,
  TransactionRecord,
} from '../types/prooflens';
import { OutcomeStatusTag } from './StatusBadge';

interface FinancialReconciliationViewProps {
  checks: CheckExecution[];
  transactions: TransactionRecord[];
  findings: FindingRecord[];
  documents: DocumentRecord[];
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
  onOpenCompare: (finding: FindingRecord) => void;
}

export function FinancialReconciliationView({
  checks,
  transactions,
  findings,
  documents,
  onJumpToSource,
  onOpenCompare,
}: FinancialReconciliationViewProps) {
  const docMap = new Map(documents.map((d) => [d.id, d]));
  const financialChecks = checks.filter(
    (c) => c.category === 'financial-reconciliation'
  );
  const comparableFindings = findings.filter((f) => Boolean(f.compareData));

  return (
    <div className="space-y-6">
      {/* Deterministic Financial Checks & Decimal Formulas */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Deterministic Decimal Financial & Cross-Document Checks
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Base-10 Decimal.js · Typed claim alignment before comparison
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {financialChecks.map((chk) => (
            <div key={chk.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-bold text-slate-900 mr-2">
                    {chk.checkId}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {chk.checkName}
                  </span>
                </div>
                <OutcomeStatusTag outcome={chk.result} />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-3 font-mono tabular-nums text-xs text-slate-800 space-y-1">
                {chk.calculationSteps.map((step, idx) => (
                  <div key={idx}>{step}</div>
                ))}
              </div>

              {chk.scopedSearch && (
                <div className="p-3.5 rounded bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Scoped Negative Evidence Record (Not Proof of Non-Payment)
                    </span>
                  </div>
                  <p>{chk.scopedSearch.statementText}</p>
                  <div className="font-mono text-[11px] text-amber-900">
                    Scope: {chk.scopedSearch.submittedDocuments.join(', ')} (
                    {chk.scopedSearch.submittedPages}) · Window:{' '}
                    {chk.scopedSearch.dateWindow} · Account:{' '}
                    {chk.scopedSearch.accountScope} · Matcher:{' '}
                    {chk.scopedSearch.matcherVersion}
                  </div>
                  <div className="text-[11px] text-amber-800">
                    Limitation: {chk.scopedSearch.coverageLimitations}
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                {chk.assumptions.map((a, i) => (
                  <span key={i}>• {a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-Side Claim Alignment Pairs */}
      {comparableFindings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Cross-Document & Within-Document Alignment Pairs ({comparableFindings.length})
            </h3>
            <span className="text-xs text-slate-500">
              Click Compare to inspect source crops side-by-side
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {comparableFindings.map((f) => {
              const cmp = f.compareData!;
              return (
                <div
                  key={f.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/60"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {f.title}
                      </span>
                      <OutcomeStatusTag outcome={f.outcome} />
                    </div>
                    <div className="font-mono tabular-nums text-xs text-slate-700">
                      {cmp.leftLabel}: <strong>{cmp.leftNormalized}</strong> ({cmp.leftBasis}) vs.{' '}
                      {cmp.rightLabel}: <strong>{cmp.rightNormalized}</strong> ({cmp.rightBasis}) →{' '}
                      <span className="font-semibold">Delta: {cmp.deltaDecimal}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCompare(f)}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700" />
                    <span>Compare Crops</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Extracted Bank Statement Transactions (Row Order Preserved) */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Extracted Bank Statement Ledger Rows ({transactions.length})
          </h3>
          <span className="text-xs text-slate-500">
            Preserves extracted row order and duplicate-looking rows without silent removal
          </span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No bank statement ledger rows in this run.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Row</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Narration</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">Debit</th>
                  <th className="py-2.5 px-4 text-right">Credit</th>
                  <th className="py-2.5 px-4 text-right">Running Balance</th>
                  <th className="py-2.5 px-4 text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {transactions.map((txn) => {
                  const doc = docMap.get(txn.documentId);
                  return (
                    <tr
                      key={txn.id}
                      className={`hover:bg-slate-50/70 ${
                        txn.category === 'salary-candidate' ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        #{txn.rowIndex}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-800 whitespace-nowrap">
                        {txn.date}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {txn.narration}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {txn.category}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-slate-700">
                        {txn.direction === 'debit'
                          ? `₹${Number(txn.amountDecimal).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-800">
                        {txn.direction === 'credit'
                          ? `₹${Number(txn.amountDecimal).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-slate-800">
                        {txn.runningBalanceDecimal
                          ? `₹${Number(txn.runningBalanceDecimal).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onJumpToSource(
                              txn.documentId,
                              txn.pageNumber,
                              txn.bbox,
                              `Ledger Row #${txn.rowIndex}: ${txn.narration}`
                            )
                          }
                          className="text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>
                            {doc?.displayName.slice(0, 14)}… p.{txn.pageNumber}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
