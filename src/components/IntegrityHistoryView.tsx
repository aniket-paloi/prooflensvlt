import { useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  FlaskConical,
  History,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { prooflensApi } from '../api/client';
import type {
  AuditEvent,
  IntegrityVerificationResult,
  ReviewAction,
} from '../types/prooflens';

interface IntegrityHistoryViewProps {
  caseId: string;
  events: AuditEvent[];
  verification: IntegrityVerificationResult | null;
  reviewActions: ReviewAction[];
  onRefreshAudit: () => Promise<void>;
}

export function IntegrityHistoryView({
  caseId,
  events,
  verification,
  reviewActions,
  onRefreshAudit,
}: IntegrityHistoryViewProps) {
  const [anchoring, setAnchoring] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [tamperSimOutput, setTamperSimOutput] = useState<{
    simulatedMutation: string;
    verificationResult: IntegrityVerificationResult;
  } | null>(null);

  const handleSaveCheckpoint = async () => {
    setAnchoring(true);
    try {
      await prooflensApi.saveCheckpoint(caseId);
      await onRefreshAudit();
    } finally {
      setAnchoring(false);
    }
  };

  const handleRunTamperSimulation = async () => {
    setSimulating(true);
    try {
      const res = await prooflensApi.simulateTamperCheck(caseId);
      setTamperSimOutput(res);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Retained Checkpoint & Chain Verification Status Card */}
      <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {verification?.status === 'verified-against-checkpoint' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              ) : verification?.status === 'unanchored-no-checkpoint' ? (
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-700 shrink-0" />
              )}
              <h2 className="text-sm font-semibold text-slate-900">
                Integrity Timeline & Separately Retained Checkpoint Verification
              </h2>
            </div>
            <div className="text-xs font-mono text-slate-700">
              Status:{' '}
              <span className="font-semibold">
                {verification?.status || 'loading...'}
              </span>{' '}
              · Events checked: {verification?.checkedEventsCount ?? 0} · Head sequence:{' '}
              #{verification?.latestSequence ?? 0}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveCheckpoint}
              disabled={anchoring}
              className="px-3 py-1.5 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Anchor className="w-3.5 h-3.5" />
              <span>
                {anchoring
                  ? 'Saving Checkpoint...'
                  : verification?.checkpoint
                  ? 'Update Retained Checkpoint'
                  : 'Anchor Retained Checkpoint'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleRunTamperSimulation}
              disabled={simulating}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FlaskConical className="w-3.5 h-3.5 text-amber-700" />
              <span>
                {simulating
                  ? 'Running Copy Test...'
                  : 'Test Tamper Detection (Isolated Copy)'}
              </span>
            </button>
          </div>
        </div>

        {/* Checkpoint Details & Head Hash */}
        {verification && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded p-3 text-xs font-mono">
            <div>
              <div className="text-slate-500">Current Audit Log Head</div>
              <div className="text-slate-900 mt-0.5 break-all">
                Seq #{verification.latestSequence} · {verification.latestHeadHash}
              </div>
            </div>
            <div>
              <div className="text-slate-500">
                Separately Retained Checkpoint (storage/checkpoints.json)
              </div>
              {verification.checkpoint ? (
                <div className="text-slate-900 mt-0.5 break-all">
                  Seq #{verification.checkpoint.lastSequence} ·{' '}
                  {verification.checkpoint.headHash} (
                  {verification.checkpoint.algorithmVersion})
                </div>
              ) : (
                <div className="text-amber-800 mt-0.5">
                  Unanchored: no separate retained checkpoint recorded for this case yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* File Byte Integrity Checks */}
        {verification && verification.fileIntegrityChecks.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-800">
              Original File Byte SHA-256 Re-Verification ({verification.fileIntegrityChecks.length} files)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {verification.fileIntegrityChecks.map((f) => (
                <div
                  key={f.documentId}
                  className="px-3 py-2 rounded border border-slate-200 bg-white flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {f.displayName}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate">
                      SHA-256: {f.actualSha256.slice(0, 20)}…
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold shrink-0 ${
                      f.matches ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {f.matches ? 'BYTES MATCH' : 'HASH MISMATCH'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Isolated Tamper Simulation Output */}
        {tamperSimOutput && (
          <div className="p-3.5 rounded border border-red-200 bg-red-50/50 space-y-1.5 text-xs">
            <div className="font-semibold text-red-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-700" />
              <span>
                Isolated In-Memory Tamper Test Result:{' '}
                {tamperSimOutput.verificationResult.status}
              </span>
            </div>
            <p className="text-slate-700">{tamperSimOutput.simulatedMutation}</p>
            <ul className="list-disc pl-4 font-mono text-[11px] text-red-800">
              {tamperSimOutput.verificationResult.discrepancies.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Threat-Model Boundary Disclosure */}
        {verification && (
          <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
            {verification.cannotEstablishNote}
          </div>
        )}
      </div>

      {/* Reviewer Actions & Corrections Log */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Reviewer Corrections & Disposition History ({reviewActions.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Original extractions and detector records are never deleted
          </span>
        </div>
        {reviewActions.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No manual field corrections or finding dispositions recorded on this run yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Timestamp (UTC)</th>
                  <th className="py-2.5 px-4">Action Type</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">State Transition</th>
                  <th className="py-2.5 px-4">Recorded Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviewActions.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {act.createdAt.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800">
                      {act.actionType}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{act.actor}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-900">
                      {act.previousState} → {act.newState}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{act.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Canonical Hash-Linked Audit Event Chain */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Canonical Hash-Linked Audit Chain ({events.length} Events)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            SHA256(seq|type|actor|timestamp|prevHash|canonicalPayload)
          </span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">Seq</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Actor & UTC Time</th>
                <th className="py-2.5 px-3">Prev Hash → Event Hash</th>
                <th className="py-2.5 px-3">Canonical Envelope Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/70 align-top">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 tabular-nums">
                    #{ev.sequence}
                  </td>
                  <td className="py-2.5 px-3 text-blue-800 font-semibold whitespace-nowrap">
                    {ev.eventType}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                    <div>{ev.actor}</div>
                    <div className="text-[10px] text-slate-400">
                      {ev.createdAt.replace('T', ' ').slice(0, 19)}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    <div>prev: {ev.prevHash.slice(0, 12)}…</div>
                    <div className="text-slate-900 font-medium">
                      curr: {ev.eventHash.slice(0, 12)}…
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-md break-all">
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
