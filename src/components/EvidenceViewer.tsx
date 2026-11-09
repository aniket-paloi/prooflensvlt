import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileWarning,
  Layers,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getStoredSessionToken } from '../api/client';
import type {
  DocumentRecord,
  FieldRecord,
  NormalizedBBox,
  PageRecord,
  SourceToken,
  VisualObservation,
} from '../types/prooflens';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface HighlightTarget {
  label: string;
  documentId: string;
  pageNumber: number;
  bbox?: NormalizedBBox;
  secondaryBbox?: NormalizedBBox;
  severity?: 'red' | 'amber' | 'green' | 'blue';
}

interface EvidenceViewerProps {
  document: DocumentRecord | undefined;
  pages: PageRecord[];
  tokens: SourceToken[];
  fields: FieldRecord[];
  visualObservations: VisualObservation[];
  activePageNumber: number;
  onPageChange: (page: number) => void;
  highlightTarget: HighlightTarget | null;
  onSelectFieldFromOverlay?: (field: FieldRecord) => void;
}

function rotateNormalizedBBox(
  b: NormalizedBBox,
  deg: number
): { left: number; top: number; width: number; height: number } {
  const normDeg = ((deg % 360) + 360) % 360;
  if (normDeg === 90) {
    return {
      left: 1 - (b.y + b.h),
      top: b.x,
      width: b.h,
      height: b.w,
    };
  }
  if (normDeg === 180) {
    return {
      left: 1 - (b.x + b.w),
      top: 1 - (b.y + b.h),
      width: b.w,
      height: b.h,
    };
  }
  if (normDeg === 270) {
    return {
      left: b.y,
      top: 1 - (b.x + b.w),
      width: b.h,
      height: b.w,
    };
  }
  return {
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
  };
}

export function EvidenceViewer({
  document,
  pages,
  tokens,
  fields,
  visualObservations,
  activePageNumber,
  onPageChange,
  highlightTarget,
  onSelectFieldFromOverlay,
}: EvidenceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [showAllFields, setShowAllFields] = useState<boolean>(true);
  const [showUninspected, setShowUninspected] = useState<boolean>(true);
  const [showTextLayerDrawer, setShowTextLayerDrawer] = useState<boolean>(false);
  const [renderStatus, setRenderStatus] = useState<
    'idle' | 'loading' | 'rendered' | 'error'
  >('idle');
  const [renderError, setRenderError] = useState<string>('');
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number }>({
    w: 612,
    h: 792,
  });

  const currentPageMeta = useMemo(
    () =>
      pages.find(
        (p) => p.documentId === document?.id && p.pageNumber === activePageNumber
      ),
    [pages, document?.id, activePageNumber]
  );

  const pageFields = useMemo(
    () =>
      fields.filter(
        (f) => f.documentId === document?.id && f.pageNumber === activePageNumber
      ),
    [fields, document?.id, activePageNumber]
  );

  const pageObservations = useMemo(
    () =>
      visualObservations.filter(
        (o) => o.documentId === document?.id && o.pageNumber === activePageNumber
      ),
    [visualObservations, document?.id, activePageNumber]
  );

  const pageTokens = useMemo(
    () =>
      tokens.filter(
        (t) => t.documentId === document?.id && t.pageNumber === activePageNumber
      ),
    [tokens, document?.id, activePageNumber]
  );

  useEffect(() => {
    if (!document || document.status === 'failed' || document.status === 'unsupported') {
      setRenderStatus('idle');
      return;
    }

    if (document.mimeType !== 'application/pdf') {
      // Raster PNG/JPEG image
      const w = currentPageMeta?.width || 900;
      const h = currentPageMeta?.height || 1200;
      const maxDisplayW = 680 * zoom;
      const scale = Math.min(1.5, maxDisplayW / w);
      setCanvasDims({
        w: rotation % 180 === 0 ? Math.round(w * scale) : Math.round(h * scale),
        h: rotation % 180 === 0 ? Math.round(h * scale) : Math.round(w * scale),
      });
      setRenderStatus('rendered');
      return;
    }

    let cancelled = false;
    let pdfInstance: pdfjsLib.PDFDocumentProxy | null = null;

    async function renderPdfPage() {
      if (!document) return;
      setRenderStatus('loading');
      setRenderError('');
      try {
        const token = getStoredSessionToken();
        const loadingTask = pdfjsLib.getDocument({
          url: `/api/documents/${encodeURIComponent(document.id)}/file`,
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        pdfInstance = await loadingTask.promise;
        if (cancelled) return;

        const safePageNum = Math.max(
          1,
          Math.min(activePageNumber, pdfInstance.numPages)
        );
        const page = await pdfInstance.getPage(safePageNum);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1.0, rotation });
        const targetWidth = 660 * zoom;
        const effectiveScale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: effectiveScale, rotation });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        setCanvasDims({
          w: Math.floor(viewport.width),
          h: Math.floor(viewport.height),
        });

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) {
          setRenderStatus('rendered');
        }
      } catch (err) {
        if (!cancelled) {
          setRenderStatus('error');
          setRenderError(
            err instanceof Error ? err.message : 'Failed to render PDF page.'
          );
        }
      }
    }

    renderPdfPage();
    return () => {
      cancelled = true;
      if (pdfInstance) {
        pdfInstance.loadingTask.destroy().catch(() => {});
      }
    };
  }, [document, activePageNumber, zoom, rotation, currentPageMeta?.width, currentPageMeta?.height]);

  if (!document) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50/70">
        <p className="text-sm font-medium text-slate-700">No document selected</p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Select a document from the left pane or click any finding to inspect its source page and bounding-box evidence.
        </p>
      </div>
    );
  }

  if (document.status === 'failed' || document.status === 'unsupported') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-red-50/30">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-2 text-red-800 font-semibold text-sm">
            <FileWarning className="w-4 h-4 text-red-700 shrink-0" />
            <span>
              {document.status === 'failed'
                ? 'Document Read Failure'
                : 'Unsupported File Format'}
            </span>
          </div>
          <p className="text-xs text-slate-700 mt-2 leading-relaxed">
            {document.errorMessage ||
              'This file could not be parsed. Failed or encrypted documents never produce empty successful extractions.'}
          </p>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono tabular-nums text-slate-500 space-y-1">
            <div>File: {document.displayName}</div>
            <div>Error code: {document.errorCode || 'PARSE_FAILURE'}</div>
            <div>SHA-256: {document.sha256.slice(0, 24)}…</div>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, document.pageCount);
  const activeTargetOnThisPage =
    highlightTarget &&
    highlightTarget.documentId === document.id &&
    highlightTarget.pageNumber === activePageNumber
      ? highlightTarget
      : null;

  return (
    <div className="h-full flex flex-col bg-slate-100/70">
      {/* Viewer Controls Toolbar */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-900 truncate max-w-[200px]">
            {document.displayName}
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
            {currentPageMeta?.routingMode || document.docClass}
          </span>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, activePageNumber - 1))}
            disabled={activePageNumber <= 1}
            aria-label="Previous page"
            className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 px-1.5 text-xs font-mono tabular-nums text-slate-700">
            <span>p.</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={activePageNumber}
              aria-label="Page number"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1 && v <= totalPages) {
                  onPageChange(v);
                }
              }}
              className="w-11 px-1 py-0.5 text-center border border-slate-200 rounded bg-white text-xs font-mono"
            />
            <span className="text-slate-400">/ {totalPages}</span>
          </div>
          <button
            type="button"
            onClick={() =>
              onPageChange(Math.min(totalPages, activePageNumber + 1))
            }
            disabled={activePageNumber >= totalPages}
            aria-label="Next page"
            className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom, Rotation & Layer Toggles */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
            aria-label="Zoom out"
            title="Zoom out"
            className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono tabular-nums text-slate-600 px-1 whitespace-nowrap">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.25).toFixed(2))))}
            aria-label="Zoom in"
            title="Zoom in"
            className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate page 90 degrees"
            title={`Rotate 90° (current: ${rotation}°)`}
            className="px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <RotateCw className="w-3 h-3" />
            <span>{rotation}°</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAllFields((v) => !v)}
            className={`px-2 py-1 rounded border text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              showAllFields
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
            title="Toggle extracted field bounding boxes"
          >
            <Eye className="w-3 h-3" />
            <span>Boxes</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTextLayerDrawer((v) => !v)}
            className={`px-2 py-1 rounded border text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              showTextLayerDrawer
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
            title="Inspect raw native PDF tokens and rendering modes (0 Tr vs 3 Tr)"
          >
            <Layers className="w-3 h-3" />
            <span>Text Layer</span>
          </button>
        </div>
      </div>

      {/* Optional Native Text Layer & Uninspected Region Strip */}
      {showTextLayerDrawer && (
        <div className="px-3 py-2.5 bg-slate-900 text-slate-100 border-b border-slate-700 text-xs max-h-44 overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-slate-200">
              Page {activePageNumber} Native PDF Token & Rendering-Mode Inspector ({pageTokens.length} tokens)
            </span>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showUninspected}
                onChange={(e) => setShowUninspected(e.target.checked)}
              />
              <span>Show uninspected regions</span>
            </label>
          </div>
          {pageTokens.length === 0 ? (
            <p className="text-slate-400">
              No native PDF text tokens on this page (raster image or unparsed page).
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px]">
              {pageTokens.slice(0, 24).map((tok) => (
                <div
                  key={tok.id}
                  className={`px-2 py-1 rounded border ${
                    tok.renderingMode === 3
                      ? 'bg-amber-950/60 border-amber-700/70 text-amber-200'
                      : 'bg-slate-800/80 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">"{tok.text}"</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {tok.renderingMode === 3 ? '3 Tr (Invisible)' : '0 Tr (Visible)'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {tok.fontName} {tok.fontSize}pt · [{tok.bbox.x.toFixed(2)}, {tok.bbox.y.toFixed(2)}]
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Target Banner */}
      {activeTargetOnThisPage && (
        <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between text-xs text-blue-900">
          <span className="font-medium truncate">
            Focused evidence: {activeTargetOnThisPage.label}
          </span>
          {activeTargetOnThisPage.bbox && (
            <span className="font-mono tabular-nums text-[11px] text-blue-700 shrink-0">
              bbox [{activeTargetOnThisPage.bbox.x.toFixed(3)},{' '}
              {activeTargetOnThisPage.bbox.y.toFixed(3)},{' '}
              {activeTargetOnThisPage.bbox.w.toFixed(3)},{' '}
              {activeTargetOnThisPage.bbox.h.toFixed(3)}]
            </span>
          )}
        </div>
      )}

      {/* Scrollable Page Canvas + Normalized [0, 1] Geometry Overlays */}
      <div className="flex-1 overflow-auto p-5 flex justify-center items-start">
        {renderStatus === 'error' ? (
          <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md text-xs text-red-800">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 text-red-700" />
              <span>Page Render Error</span>
            </div>
            <p>{renderError}</p>
          </div>
        ) : (
          <div
            className="relative bg-white shadow-sm border border-slate-300 select-none shrink-0"
            style={{
              width: `${canvasDims.w}px`,
              height: `${canvasDims.h}px`,
            }}
          >
            {document.mimeType === 'application/pdf' ? (
              <canvas ref={canvasRef} className="block" />
            ) : (
              <img
                src={`/api/documents/${encodeURIComponent(document.id)}/file${
                  getStoredSessionToken()
                    ? `?token=${encodeURIComponent(getStoredSessionToken()!)}`
                    : ''
                }`}
                alt={document.displayName}
                className="w-full h-full object-contain block"
              />
            )}

            {/* Uninspected Regions Overlay */}
            {showUninspected &&
              currentPageMeta?.uninspectedRegions.map((uninsp, idx) => {
                const r = rotateNormalizedBBox(uninsp.bbox, rotation);
                return (
                  <div
                    key={`uninsp-${idx}`}
                    title={`Uninspected region: ${uninsp.reason}`}
                    style={{
                      left: `${r.left * 100}%`,
                      top: `${r.top * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                    }}
                    className="absolute border border-dashed border-slate-400/80 bg-slate-200/25 pointer-events-none"
                  />
                );
              })}

            {/* Extracted Field Clickable Bounding Boxes */}
            {showAllFields &&
              pageFields.map((fld) => {
                const r = rotateNormalizedBBox(fld.bbox, rotation);
                const isCorrected = fld.reviewState === 'corrected';
                return (
                  <button
                    key={fld.id}
                    type="button"
                    onClick={() => onSelectFieldFromOverlay?.(fld)}
                    title={`${fld.label}: ${fld.rawValue} (click to inspect/edit)`}
                    style={{
                      left: `${r.left * 100}%`,
                      top: `${r.top * 100}%`,
                      width: `${Math.max(0.02, r.width) * 100}%`,
                      height: `${Math.max(0.015, r.height) * 100}%`,
                    }}
                    className={`absolute border transition-colors cursor-pointer ${
                      isCorrected
                        ? 'border-amber-600 bg-amber-400/15 hover:bg-amber-400/25'
                        : 'border-blue-500/60 bg-blue-500/8 hover:bg-blue-500/20'
                    }`}
                  />
                );
              })}

            {/* Visual Observations Overlay Boxes */}
            {pageObservations.map((obs) => {
              const r = rotateNormalizedBBox(obs.sourceBbox, rotation);
              return (
                <div
                  key={obs.id}
                  title={`${obs.methodName}: ${obs.measuredValue}`}
                  style={{
                    left: `${r.left * 100}%`,
                    top: `${r.top * 100}%`,
                    width: `${Math.max(0.03, r.width) * 100}%`,
                    height: `${Math.max(0.018, r.height) * 100}%`,
                  }}
                  className={`absolute border-2 pointer-events-none ${
                    obs.severity === 'red'
                      ? 'border-red-600 bg-red-500/15'
                      : obs.severity === 'amber'
                      ? 'border-amber-600 bg-amber-400/15'
                      : 'border-emerald-600/70 bg-emerald-400/10'
                  }`}
                />
              );
            })}

            {/* Primary Focused Highlight Box */}
            {activeTargetOnThisPage?.bbox && (() => {
              const r = rotateNormalizedBBox(activeTargetOnThisPage.bbox, rotation);
              const colorCls =
                activeTargetOnThisPage.severity === 'red'
                  ? 'border-red-600 bg-red-500/20 ring-2 ring-red-500/40'
                  : activeTargetOnThisPage.severity === 'amber'
                  ? 'border-amber-600 bg-amber-500/20 ring-2 ring-amber-500/40'
                  : 'border-blue-700 bg-blue-600/20 ring-2 ring-blue-600/40';
              return (
                <div
                  style={{
                    left: `${r.left * 100}%`,
                    top: `${r.top * 100}%`,
                    width: `${Math.max(0.03, r.width) * 100}%`,
                    height: `${Math.max(0.02, r.height) * 100}%`,
                  }}
                  className={`absolute border-2 rounded-xs pointer-events-none ${colorCls}`}
                />
              );
            })()}

            {/* Secondary Comparison Highlight Box (when on same page) */}
            {activeTargetOnThisPage?.secondaryBbox && (() => {
              const r = rotateNormalizedBBox(
                activeTargetOnThisPage.secondaryBbox,
                rotation
              );
              return (
                <div
                  style={{
                    left: `${r.left * 100}%`,
                    top: `${r.top * 100}%`,
                    width: `${Math.max(0.03, r.width) * 100}%`,
                    height: `${Math.max(0.02, r.height) * 100}%`,
                  }}
                  className="absolute border-2 border-dashed border-slate-700 bg-slate-500/15 rounded-xs pointer-events-none"
                />
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
