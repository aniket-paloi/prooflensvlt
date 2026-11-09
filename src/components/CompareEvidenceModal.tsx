import { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ArrowRight, ExternalLink, X } from 'lucide-react';
import { getStoredSessionToken } from '../api/client';
import type {
  DocumentRecord,
  FindingRecord,
  NormalizedBBox,
} from '../types/prooflens';
import { OutcomeStatusTag } from './StatusBadge';

function SourceCropPreview({
  document,
  pageNumber,
  bbox,
}: {
  document: DocumentRecord | undefined;
  pageNumber: number;
  bbox?: NormalizedBBox;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!document || document.mimeType !== 'application/pdf') return;
    let cancelled = false;
    let pdfInst: pdfjsLib.PDFDocumentProxy | null = null;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    async function renderCrop() {
      if (!document) return;
      try {
        const token = getStoredSessionToken();
        loadingTask = pdfjsLib.getDocument({
          url: `/api/documents/${encodeURIComponent(document.id)}/file`,
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        pdfInst = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdfInst.getPage(
          Math.max(1, Math.min(pageNumber, pdfInst.numPages))
        );
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.35 });
        const fullCanvas = window.document.createElement('canvas');
        fullCanvas.width = Math.floor(viewport.width);
        fullCanvas.height = Math.floor(viewport.height);
        const fCtx = fullCanvas.getContext('2d');
        if (!fCtx) return;
        await page.render({ canvas: fullCanvas, canvasContext: fCtx, viewport }).promise;
        if (cancelled) return;

        const outCanvas = canvasRef.current;
        if (!outCanvas) return;
        const oCtx = outCanvas.getContext('2d');
        if (!oCtx) return;

        // Crop a generous contextual band around the target bbox so surrounding labels remain visible
        const cropX = bbox
          ? Math.max(0, Math.floor((bbox.x - 0.16) * fullCanvas.width))
          : 0;
        const cropY = bbox
          ? Math.max(0, Math.floor((bbox.y - 0.08) * fullCanvas.height))
          : 0;
        const cropW = bbox
          ? Math.min(
              fullCanvas.width - cropX,
              Math.max(260, Math.floor((bbox.w + 0.36) * fullCanvas.width))
            )
          : fullCanvas.width;
        const cropH = bbox
          ? Math.min(
              fullCanvas.height - cropY,
              Math.max(110, Math.floor((bbox.h + 0.16) * fullCanvas.height))
            )
          : Math.min(220, fullCanvas.height);

        outCanvas.width = cropW;
        outCanvas.height = cropH;
        oCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Draw target highlight rectangle inside the cropped context
        if (bbox) {
          const rx = bbox.x * fullCanvas.width - cropX;
          const ry = bbox.y * fullCanvas.height - cropY;
          const rw = Math.max(16, bbox.w * fullCanvas.width);
          const rh = Math.max(12, bbox.h * fullCanvas.height);
          oCtx.strokeStyle = '#1d4ed8';
          oCtx.lineWidth = 2;
          oCtx.fillStyle = 'rgba(29, 78, 216, 0.12)';
          oCtx.fillRect(rx, ry, rw, rh);
          oCtx.strokeRect(rx, ry, rw, rh);
        }
      } catch {
        // Fallback handled gracefully
      }
    }

    renderCrop();
    return () => {
      cancelled = true;
      loadingTask?.destroy().catch(() => {});
    };
  }, [document, pageNumber, bbox]);

  if (!document) {
    return (
      <div className="h-28 bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-xs text-slate-500">
        Source document unavailable
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded overflow-hidden">
      <canvas ref={canvasRef} className="max-w-full h-auto block mx-auto" />
    </div>
  );
}

interface CompareEvidenceModalProps {
  finding: FindingRecord | null;
  documents: DocumentRecord[];
  onClose: () => void;
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
}

export function CompareEvidenceModal({
  finding,
  documents,
  onClose,
  onJumpToSource,
}: CompareEvidenceModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!finding) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finding, onClose]);

  if (!finding || !finding.compareData) return null;

  const cmp = finding.compareData;
  const leftDoc = documents.find((d) => d.id === finding.primaryDocumentId);
  const rightDoc = documents.find(
    (d) => d.id === (finding.secondaryDocumentId || finding.primaryDocumentId)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-lg">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2
                id="compare-modal-title"
                className="text-base font-semibold text-slate-900 truncate"
              >
                Compare Evidence: {finding.title}
              </h2>
              <OutcomeStatusTag outcome={finding.outcome} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side source crops, raw/normalized values, aligned periods, and exact Decimal calculation
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close compare dialog"
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Two-Column Source Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            {/* Left Source */}
            <div className="border border-slate-200 rounded-md p-4 bg-white flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-900">
                    {cmp.leftLabel}
                  </span>
                  {leftDoc && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToSource(
                          leftDoc.id,
                          cmp.leftPage,
                          cmp.leftBbox,
                          cmp.leftLabel
                        );
                        onClose();
                      }}
                      className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Open p.{cmp.leftPage}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 mb-3 font-mono">
                  {cmp.leftDocumentName} · Page {cmp.leftPage}
                </div>

                <SourceCropPreview
                  document={leftDoc}
                  pageNumber={cmp.leftPage}
                  bbox={cmp.leftBbox}
                />
              </div>

              <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Raw Extracted</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                    {cmp.leftRaw}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Normalized Value</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {cmp.leftNormalized}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Aligned Period</dt>
                  <dd className="font-mono tabular-nums text-slate-700 mt-0.5">
                    {cmp.leftPeriod || 'unspecified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Semantic Basis</dt>
                  <dd className="text-slate-700 mt-0.5">{cmp.leftBasis}</dd>
                </div>
              </dl>
            </div>

            {/* Right Source */}
            <div className="border border-slate-200 rounded-md p-4 bg-white flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-900">
                    {cmp.rightLabel}
                  </span>
                  {rightDoc && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToSource(
                          rightDoc.id,
                          cmp.rightPage,
                          cmp.rightBbox,
                          cmp.rightLabel
                        );
                        onClose();
                      }}
                      className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Open p.{cmp.rightPage}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 mb-3 font-mono">
                  {cmp.rightDocumentName} · Page {cmp.rightPage}
                </div>

                <SourceCropPreview
                  document={rightDoc}
                  pageNumber={cmp.rightPage}
                  bbox={cmp.rightBbox}
                />
              </div>

              <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Raw Extracted</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                    {cmp.rightRaw}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Normalized Value</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {cmp.rightNormalized}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Aligned Period</dt>
                  <dd className="font-mono tabular-nums text-slate-700 mt-0.5">
                    {cmp.rightPeriod || 'unspecified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Semantic Basis</dt>
                  <dd className="text-slate-700 mt-0.5">{cmp.rightBasis}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Decimal Calculation Strip */}
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50">
            <div className="text-xs font-semibold text-slate-900 mb-1.5">
              Deterministic Decimal Calculation & Alignment Result
            </div>
            <div className="font-mono tabular-nums text-xs text-slate-800 bg-white border border-slate-200 rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{cmp.decimalFormula}</span>
              <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span>Delta: {cmp.deltaDecimal}</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">{cmp.conclusion}</p>
          </div>

          {/* Alternative Explanations Evaluated */}
          {finding.alternativeExplanations.length > 0 && (
            <div className="border border-slate-200 rounded-md p-4 bg-white">
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Alternative Explanations Evaluated
              </h3>
              <div className="divide-y divide-slate-100">
                {finding.alternativeExplanations.map((alt) => (
                  <div key={alt.id} className="py-2 first:pt-0 last:pb-0 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{alt.title}</span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {alt.status}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{alt.rationale}</p>
                    <p className="text-slate-500 mt-0.5">
                      Remaining uncertainty: {alt.remainingUncertainty}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Note: Compare view displays extracted evidence pairs; reviewer corrections are applied on individual source fields.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
