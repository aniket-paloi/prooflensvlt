import {
  BarChart3,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileWarning,
  Table2,
} from 'lucide-react';
import type {
  ClaimRecord,
  DocumentRecord,
  ExtractedTable,
  FieldRecord,
  NormalizedBBox,
  PageRecord,
} from '../types/prooflens';

interface DocumentsDataViewProps {
  documents: DocumentRecord[];
  pages: PageRecord[];
  fields: FieldRecord[];
  tables: ExtractedTable[];
  claims: ClaimRecord[];
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
  onEditField: (field: FieldRecord) => void;
  onOpenVisualize?: () => void;
}

export function DocumentsDataView({
  documents,
  pages,
  fields,
  tables,
  claims,
  onJumpToSource,
  onEditField,
  onOpenVisualize,
}: DocumentsDataViewProps) {
  const docMap = new Map(documents.map((d) => [d.id, d]));

  return (
    <div className="space-y-6">
      {/* Ingested Document Manifest */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Ingested Source Documents & Post-Ingestion Integrity ({documents.length})
            </h2>
            <span className="text-xs text-slate-500">
              SHA-256 verifies byte integrity after upload; originals are never overwritten
            </span>
          </div>
          {onOpenVisualize && (
            <button
              type="button"
              onClick={onOpenVisualize}
              className="px-3 py-1.5 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Visualize Extracted Data</span>
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Document Name</th>
                <th className="py-2.5 px-4">Classified Schema</th>
                <th className="py-2.5 px-4">Pages & Routing</th>
                <th className="py-2.5 px-4">PDF Producer / Software</th>
                <th className="py-2.5 px-4">Post-Ingestion SHA-256</th>
                <th className="py-2.5 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => {
                const docPages = pages.filter((p) => p.documentId === doc.id);
                const routingSummary =
                  docPages[0]?.routingMode || doc.status;
                return (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        {doc.status === 'failed' || doc.status === 'unsupported' ? (
                          <FileWarning className="w-4 h-4 text-red-700 shrink-0" />
                        ) : (
                          <FileCheck2 className="w-4 h-4 text-blue-700 shrink-0" />
                        )}
                        <span>{doc.displayName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {doc.classificationReason}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                      {doc.docClass} ({doc.status})
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {doc.pageCount}p · {routingSummary}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {doc.pdfProducer || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {doc.sha256.slice(0, 20)}…
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToSource(doc.id, 1, undefined, doc.displayName)
                        }
                        className="text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extracted Source-Linked Fields & Typed Claims */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Extracted Fields & Typed Claim Semantics ({fields.length} Fields · {claims.length} Typed Claims)
          </h3>
          <span className="text-xs text-slate-500">
            Click any coordinate to highlight on source page, or edit to propagate corrections
          </span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Field Label</th>
                <th className="py-2.5 px-4">Raw Value</th>
                <th className="py-2.5 px-4">Normalized & Semantics</th>
                <th className="py-2.5 px-4">Source & Method</th>
                <th className="py-2.5 px-4">Rev</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((f) => {
                const doc = docMap.get(f.documentId);
                return (
                  <tr
                    key={f.id}
                    className={`hover:bg-slate-50/70 ${
                      f.reviewState === 'corrected' ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {f.label}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800">
                      {f.rawValue}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <span className="font-semibold text-slate-900">
                        {f.normalizedValue}
                      </span>
                      {(f.salaryBasis || f.unit || f.period) && (
                        <div className="text-[11px] text-slate-500">
                          basis={f.salaryBasis || 'n/a'} · unit={f.unit || 'n/a'} · period={f.period || 'n/a'}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">
                        {doc?.displayName} · p.{f.pageNumber}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {f.sourceLayer} · {f.extractionScore === null ? 'native span (no OCR prob)' : `score ${f.extractionScore}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      v{f.currentRevisionNumber}{' '}
                      {f.reviewState === 'corrected' && (
                        <span className="text-amber-800 font-semibold">
                          (edited)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToSource(
                            f.documentId,
                            f.pageNumber,
                            f.bbox,
                            `${f.label}: ${f.rawValue}`
                          )
                        }
                        className="text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditField(f)}
                        className="text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preserved-Geometry Extracted Tables */}
      {tables.length > 0 && (
        <div className="space-y-4">
          {tables.map((tbl) => {
            const doc = docMap.get(tbl.documentId);
            return (
              <div
                key={tbl.id}
                className="bg-white border border-slate-200 rounded-md overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-blue-700 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {tbl.caption}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-500">
                        {doc?.displayName} · Page {tbl.pageNumber} · {tbl.rows.length} rows · {tbl.extractorVersion}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToSource(
                        tbl.documentId,
                        tbl.pageNumber,
                        tbl.bbox,
                        tbl.caption
                      )
                    }
                    className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Highlight Table Region</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                        <th className="py-2 px-3 w-12">Row</th>
                        {tbl.headers.map((h, i) => (
                          <th key={i} className="py-2 px-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tbl.rows.map((row) => (
                        <tr key={row.rowIndex} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono text-slate-400 tabular-nums">
                            #{row.rowIndex}
                          </td>
                          {row.cells.map((cell) => (
                            <td
                              key={cell.colIndex}
                              onClick={() =>
                                onJumpToSource(
                                  tbl.documentId,
                                  tbl.pageNumber,
                                  cell.bbox,
                                  `${cell.header}: ${cell.text}`
                                )
                              }
                              title="Click cell to highlight exact bounding box on page"
                              className="py-2 px-3 text-slate-800 hover:text-blue-700 cursor-pointer"
                            >
                              {cell.text}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
