import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  HelpCircle,
  Info,
  XCircle,
} from 'lucide-react';
import type { CheckResultStatus, FindingDisposition } from '../types/prooflens';

export function OutcomeStatusTag({
  outcome,
}: {
  outcome: CheckResultStatus | string;
}) {
  switch (outcome) {
    case 'consistent-within-check':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>Consistent within check</span>
        </span>
      );
    case 'discrepancy':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <XCircle className="w-3.5 h-3.5 text-red-700 shrink-0" aria-hidden="true" />
          <span>Discrepancy</span>
        </span>
      );
    case 'possible-explanation':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
          <span>Possible explanation</span>
        </span>
      );
    case 'insufficient-evidence':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50/70 border border-amber-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <HelpCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
          <span>Insufficient evidence</span>
        </span>
      );
    case 'unable-to-assess':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <FileWarning className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
          <span>Unable to assess</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
          <Info className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
          <span>{outcome}</span>
        </span>
      );
  }
}

export function DispositionText({
  disposition,
}: {
  disposition: FindingDisposition;
}) {
  const labels: Record<FindingDisposition, string> = {
    open: 'Open (Unreviewed)',
    'observation-confirmed': 'Observation Confirmed',
    'further-verification-needed': 'Further Verification Needed',
    'false-alert': 'False Alert (Retained)',
    resolved: 'Resolved',
  };
  return (
    <span className="text-xs font-medium text-slate-700">
      {labels[disposition] || disposition}
    </span>
  );
}
