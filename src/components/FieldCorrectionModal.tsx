import { useEffect, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import type { FieldRecord, FieldRevision } from '../types/prooflens';

interface FieldCorrectionModalProps {
  field: FieldRecord | null;
  revisions: FieldRevision[];
  onClose: () => void;
  onSubmitCorrection: (params: {
    fieldId: string;
    expectedRevision: number;
    newValue: string;
    actor: string;
    reason: string;
  }) => Promise<void>;
}

export function FieldCorrectionModal({
  field,
  revisions,
  onClose,
  onSubmitCorrection,
}: FieldCorrectionModalProps) {
  const [newValue, setNewValue] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [actor, setActor] = useState<string>('senior-underwriter');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!field) return;
    setNewValue(field.rawValue);
    setReason('');
    setError('');
    inputRef.current?.focus();
  }, [field]);

  if (!field) return null;

  const fieldHistory = revisions
    .filter((r) => r.fieldId === field.id)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) {
      setError('Corrected value cannot be empty.');
      return;
    }
    if (!reason.trim()) {
      setError('A reviewer reason is mandatory for audit traceability.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmitCorrection({
        fieldId: field.id,
        expectedRevision: field.currentRevisionNumber,
        newValue: newValue.trim(),
        actor: actor.trim() || 'reviewer-local',
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save correction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full overflow-hidden shadow-lg">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="correction-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              Correct Field & Propagate Dependencies
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {field.label} · Current Rev {field.currentRevisionNumber} · Page {field.pageNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close correction dialog"
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Original Preserved Value vs Current Value */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded p-3 text-xs">
            <div>
              <div className="text-slate-500">Original Extraction (Rev 1)</div>
              <div className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                {fieldHistory[0]?.previousValue || field.rawValue}
              </div>
            </div>
            <div>
              <div className="text-slate-500">
                Active Value (Rev {field.currentRevisionNumber})
              </div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {field.rawValue}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="corrected-value-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Corrected Value
            </label>
            <input
              ref={inputRef}
              id="corrected-value-input"
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded bg-white text-slate-900"
              placeholder="e.g. INR 68,000.00"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reviewer-actor-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Reviewer Identity
              </label>
              <input
                id="reviewer-actor-input"
                type="text"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="expected-rev-display"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Optimistic Lock Revision
              </label>
              <input
                id="expected-rev-display"
                type="text"
                readOnly
                value={`Revision #${field.currentRevisionNumber} -> #${
                  field.currentRevisionNumber + 1
                }`}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded bg-slate-50 text-slate-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="correction-reason-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Correction Reason (Required)
            </label>
            <textarea
              id="correction-reason-input"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
              placeholder="e.g. Verified against bank statement NEFT salary credit (₹68,000.00) and underlying native PDF text layer."
            />
          </div>

          {/* Downstream Dependency Propagation Impact Preview */}
          <div className="bg-amber-50/70 border border-amber-200 rounded p-3 text-xs text-amber-950 space-y-1">
            <div className="font-semibold">Downstream Propagation Preview</div>
            <ul className="list-disc pl-4 space-y-0.5 text-amber-900">
              <li>
                Preserves original extracted value (Rev 1) in immutable revision history.
              </li>
              <li>
                Recomputes dependent Decimal financial checks (CHK-03, CHK-05) and updates findings.
              </li>
              <li>
                Marks any prior active Dossier Reports on this run as{' '}
                <span className="font-mono font-semibold">superseded</span> without deleting them.
              </li>
              <li>
                Corrected values are reviewer assertions with provenance, not authenticity certificates.
              </li>
            </ul>
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Revision History List */}
          {fieldHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                <History className="w-3.5 h-3.5" />
                <span>Immutable Revision History ({fieldHistory.length})</span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1.5 text-xs">
                {fieldHistory.map((rev) => (
                  <div
                    key={rev.id}
                    className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-800">
                        Rev {rev.revisionNumber}: {rev.newValue}
                      </span>
                      <span className="text-slate-500 ml-2">({rev.reason})</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {rev.actor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? 'Propagating Revision...'
                : 'Save Revision & Recompute Checks'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
