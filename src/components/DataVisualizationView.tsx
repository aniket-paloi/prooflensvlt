import { useMemo, useState } from 'react';
import {
  BarChart3,
  ExternalLink,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DocumentRecord,
  ExtractedTable,
  FieldRecord,
  NormalizedBBox,
  PageRecord,
  TransactionRecord,
} from '../types/prooflens';

interface DataVisualizationViewProps {
  documents: DocumentRecord[];
  pages: PageRecord[];
  fields: FieldRecord[];
  transactions: TransactionRecord[];
  tables: ExtractedTable[];
  onJumpToSource: (
    documentId: string,
    pageNumber: number,
    bbox?: NormalizedBBox,
    label?: string
  ) => void;
}

type ChartType = 'bar' | 'pie' | 'line';
type DatasetSource = 'fields' | 'transactions' | 'tables' | 'pages';
type AggregationMode = 'sum' | 'avg' | 'count' | 'raw';

const CHART_PALETTE = [
  '#1d4ed8', // blue-700
  '#047857', // emerald-700
  '#b45309', // amber-700
  '#6d28d9', // purple-700
  '#0f766e', // teal-700
  '#be123c', // rose-700
  '#334155', // slate-700
  '#4338ca', // indigo-700
];

function parseNumericCell(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val !== 'string') return 0;
  const cleaned = val.replace(/[₹$,%\s,]/g, '').trim();
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed) && cleaned !== '') return parsed;
  const firstMatch = val.match(/-?\d+(?:\.\d+)?/);
  return firstMatch ? Number(firstMatch[0]) : 0;
}

export function DataVisualizationView({
  documents,
  pages,
  fields,
  transactions,
  tables,
  onJumpToSource,
}: DataVisualizationViewProps) {
  const docMap = useMemo(
    () => new Map(documents.map((d) => [d.id, d])),
    [documents]
  );

  // Default to transactions if present, otherwise fields or tables
  const [datasetSource, setDatasetSource] = useState<DatasetSource>(() => {
    if (transactions.length > 0) return 'transactions';
    if (fields.some((f) => parseNumericCell(f.normalizedValue) > 0))
      return 'fields';
    if (tables.length > 0) return 'tables';
    return 'pages';
  });

  const [selectedTableId, setSelectedTableId] = useState<string>(
    tables[0]?.id || ''
  );
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [aggregation, setAggregation] = useState<AggregationMode>('sum');

  // Build normalized rows and column definitions for the active dataset
  const { rawRows, categoryColumns, numericColumns, datasetTitle } =
    useMemo(() => {
      if (datasetSource === 'fields') {
        const rows = fields.map((f) => {
          const doc = docMap.get(f.documentId);
          const numericAmount = parseNumericCell(f.normalizedValue);
          return {
            _id: f.id,
            _docId: f.documentId,
            _page: f.pageNumber,
            _bbox: f.bbox,
            'Field Label': f.label,
            'Document Name': doc?.displayName || f.documentId,
            'Salary Basis': f.salaryBasis || 'unspecified',
            Period: f.period || 'unspecified',
            'Source Layer': f.sourceLayer,
            'Normalized Amount (₹)': numericAmount,
            'Revision Number': f.currentRevisionNumber,
            'Field Count': 1,
          };
        });
        return {
          rawRows: rows,
          categoryColumns: [
            'Field Label',
            'Document Name',
            'Salary Basis',
            'Period',
            'Source Layer',
          ],
          numericColumns: [
            'Normalized Amount (₹)',
            'Revision Number',
            'Field Count',
          ],
          datasetTitle: 'Extracted Document Fields & Monetary Claims (₹)',
        };
      }

      if (datasetSource === 'transactions') {
        const rows = transactions.map((tx) => {
          const doc = docMap.get(tx.documentId);
          const amt = parseNumericCell(tx.amountDecimal);
          return {
            _id: tx.id,
            _docId: tx.documentId,
            _page: tx.pageNumber,
            _bbox: tx.bbox,
            Date: tx.date,
            Narration:
              tx.narration.length > 28
                ? `${tx.narration.slice(0, 28)}…`
                : tx.narration,
            Category: tx.category,
            Direction: tx.direction.toUpperCase(),
            'Document Name': doc?.displayName || tx.documentId,
            'Transaction Amount (₹)': amt,
            'Credit Amount (₹)': tx.direction === 'credit' ? amt : 0,
            'Debit Amount (₹)': tx.direction === 'debit' ? amt : 0,
            'Running Balance (₹)': parseNumericCell(
              tx.runningBalanceDecimal || '0'
            ),
            'Transaction Count': 1,
          };
        });
        return {
          rawRows: rows,
          categoryColumns: [
            'Date',
            'Narration',
            'Category',
            'Direction',
            'Document Name',
          ],
          numericColumns: [
            'Transaction Amount (₹)',
            'Credit Amount (₹)',
            'Debit Amount (₹)',
            'Running Balance (₹)',
            'Transaction Count',
          ],
          datasetTitle: 'Extracted Bank Statement Ledger Transactions (₹)',
        };
      }

      if (datasetSource === 'tables') {
        const activeTable =
          tables.find((t) => t.id === selectedTableId) || tables[0];
        if (!activeTable) {
          return {
            rawRows: [],
            categoryColumns: ['Column'],
            numericColumns: ['Row Count'],
            datasetTitle: 'Extracted PDF Table',
          };
        }
        const headers = activeTable.headers;
        const rows = activeTable.rows.map((r) => {
          const record: Record<string, unknown> = {
            _id: `${activeTable.id}-r${r.rowIndex}`,
            _docId: activeTable.documentId,
            _page: activeTable.pageNumber,
            _bbox: r.cells[0]?.bbox || activeTable.bbox,
            'Row Index': `Row #${r.rowIndex}`,
            'Row Count': 1,
          };
          headers.forEach((h, colIdx) => {
            const cellText = r.cells[colIdx]?.text || '—';
            record[h] = cellText;
            record[`${h} (Numeric)`] = parseNumericCell(cellText);
            record[`${h} (Char Length)`] = cellText.length;
          });
          return record;
        });

        const catCols = [...headers, 'Row Index'];
        const numCols = [
          ...headers.map((h) => `${h} (Numeric)`),
          'Row Count',
          ...headers.map((h) => `${h} (Char Length)`),
        ];

        return {
          rawRows: rows,
          categoryColumns: catCols,
          numericColumns: numCols,
          datasetTitle: `Extracted PDF Table: ${activeTable.caption} (Page ${activeTable.pageNumber})`,
        };
      }

      // datasetSource === 'pages'
      const rows = pages.map((p) => {
        const doc = docMap.get(p.documentId);
        const pageFieldsCount = fields.filter(
          (f) => f.documentId === p.documentId && f.pageNumber === p.pageNumber
        ).length;
        return {
          _id: p.id,
          _docId: p.documentId,
          _page: p.pageNumber,
          _bbox: undefined,
          'Page Label': `${doc?.displayName.slice(0, 16) || 'Doc'} · P.${p.pageNumber}`,
          'Document Name': doc?.displayName || p.documentId,
          'Routing Mode': p.routingMode,
          'Token Count': p.tokenCount,
          'Native Text Length': p.nativeTextLength,
          'Extracted Fields Count': pageFieldsCount,
        };
      });
      return {
        rawRows: rows,
        categoryColumns: ['Page Label', 'Document Name', 'Routing Mode'],
        numericColumns: [
          'Token Count',
          'Native Text Length',
          'Extracted Fields Count',
        ],
        datasetTitle: 'Page-Level Extraction & Token Density Metrics',
      };
    }, [
      datasetSource,
      fields,
      transactions,
      tables,
      pages,
      selectedTableId,
      docMap,
    ]);

  const [xColumn, setXColumn] = useState<string>('');
  const [yColumn, setYColumn] = useState<string>('');

  const activeXColumn = categoryColumns.includes(xColumn)
    ? xColumn
    : categoryColumns[0] || '';
  const activeYColumn = numericColumns.includes(yColumn)
    ? yColumn
    : numericColumns[0] || '';

  // Aggregate or map data according to user's selected X column, Y column, and aggregation mode
  const chartData = useMemo(() => {
    if (!activeXColumn || !activeYColumn || rawRows.length === 0) return [];

    if (aggregation === 'raw') {
      return rawRows.slice(0, 25).map((r, idx) => {
        const rec = r as Record<string, unknown>;
        return {
          name: String(rec[activeXColumn] ?? `Item ${idx + 1}`),
          value: Number(rec[activeYColumn] ?? 0),
          _docId: String(rec._docId || ''),
          _page: Number(rec._page || 1),
          _bbox: rec._bbox as NormalizedBBox | undefined,
        };
      });
    }

    const groups = new Map<
      string,
      {
        sum: number;
        count: number;
        _docId: string;
        _page: number;
        _bbox?: NormalizedBBox;
      }
    >();

    for (const r of rawRows) {
      const rec = r as Record<string, unknown>;
      const key = String(rec[activeXColumn] ?? 'Unspecified');
      const numVal = Number(rec[activeYColumn] ?? 0);
      const existing = groups.get(key);
      if (existing) {
        existing.sum += numVal;
        existing.count += 1;
      } else {
        groups.set(key, {
          sum: numVal,
          count: 1,
          _docId: String(rec._docId || ''),
          _page: Number(rec._page || 1),
          _bbox: rec._bbox as NormalizedBBox | undefined,
        });
      }
    }

    return Array.from(groups.entries()).map(([name, stats]) => {
      let computed = stats.sum;
      if (aggregation === 'avg') {
        computed = stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0;
      } else if (aggregation === 'count') {
        computed = stats.count;
      } else {
        computed = Number(stats.sum.toFixed(2));
      }
      return {
        name,
        value: computed,
        count: stats.count,
        _docId: stats._docId,
        _page: stats._page,
        _bbox: stats._bbox,
      };
    });
  }, [rawRows, activeXColumn, activeYColumn, aggregation]);

  const summaryStats = useMemo(() => {
    if (chartData.length === 0) {
      return { total: 0, max: 0, min: 0, count: 0 };
    }
    const vals = chartData.map((d) => d.value);
    const total = vals.reduce((a, b) => a + b, 0);
    return {
      total: Number(total.toFixed(2)),
      max: Math.max(...vals),
      min: Math.min(...vals),
      count: chartData.length,
    };
  }, [chartData]);

  const isCurrencyMetric = activeYColumn.includes('₹');

  const formatMetric = (val: number) => {
    if (isCurrencyMetric) {
      return `₹${val.toLocaleString('en-IN')}`;
    }
    return val.toLocaleString('en-IN');
  };

  return (
    <div className="space-y-6">
      {/* Control Header Card */}
      <div className="bg-white border border-slate-200 rounded-md p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-700" />
              <span>Interactive Extracted Data Visualization Studio</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose a chart type (Bar, Pie, or Line) and specify the X-Axis category column and Y-Axis value column from the extracted PDF data.
            </p>
          </div>

          {/* Chart Type Selector (Bar, Pie, Line) */}
          <div
            role="group"
            aria-label="Chart Type Selector"
            className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md"
          >
            {(
              [
                { id: 'bar', label: 'Bar Chart', icon: BarChart3 },
                { id: 'pie', label: 'Pie Chart', icon: PieChartIcon },
                { id: 'line', label: 'Line Chart', icon: LineChartIcon },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChartType(item.id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    chartType === item.id
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column & Dataset Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Dataset Source */}
          <div>
            <label
              htmlFor="viz-dataset-source"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              1. Extracted Data Source
            </label>
            <select
              id="viz-dataset-source"
              value={datasetSource}
              onChange={(e) => {
                setDatasetSource(e.target.value as DatasetSource);
                setXColumn('');
                setYColumn('');
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900 font-medium"
            >
              <option value="fields">
                Extracted Fields ({fields.length} rows)
              </option>
              <option value="transactions">
                Bank Ledger Transactions ({transactions.length} rows)
              </option>
              <option value="tables">
                Extracted PDF Tables ({tables.length} tables)
              </option>
              <option value="pages">
                Page Token & Extraction Metrics ({pages.length} pages)
              </option>
            </select>
          </div>

          {/* Optional Table Selector when 'tables' is active */}
          {datasetSource === 'tables' && tables.length > 0 && (
            <div>
              <label
                htmlFor="viz-table-select"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Select Extracted PDF Table
              </label>
              <select
                id="viz-table-select"
                value={selectedTableId}
                onChange={(e) => {
                  setSelectedTableId(e.target.value);
                  setXColumn('');
                  setYColumn('');
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    P.{t.pageNumber}: {t.caption} ({t.rows.length}r)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 2. Category / X-Axis Column */}
          <div>
            <label
              htmlFor="viz-x-column"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              2. Category / Label Column (X-Axis)
            </label>
            <select
              id="viz-x-column"
              value={activeXColumn}
              onChange={(e) => setXColumn(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900 font-medium"
            >
              {categoryColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Value / Y-Axis Column */}
          <div>
            <label
              htmlFor="viz-y-column"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              3. Value / Metric Column (Y-Axis)
            </label>
            <select
              id="viz-y-column"
              value={activeYColumn}
              onChange={(e) => setYColumn(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900 font-medium"
            >
              {numericColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Aggregation Mode */}
          <div>
            <label
              htmlFor="viz-aggregation"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              4. Column Aggregation
            </label>
            <select
              id="viz-aggregation"
              value={aggregation}
              onChange={(e) =>
                setAggregation(e.target.value as AggregationMode)
              }
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
            >
              <option value="sum">Sum by {activeXColumn}</option>
              <option value="avg">Average by {activeXColumn}</option>
              <option value="count">Count of Records by {activeXColumn}</option>
              <option value="raw">Individual Unaggregated Rows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <div className="text-[11px] text-slate-500">
            Plotted Categories / Points
          </div>
          <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
            {summaryStats.count}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <div className="text-[11px] text-slate-500">
            Cumulative {activeYColumn}
          </div>
          <div className="font-mono text-base font-bold text-blue-700 mt-0.5">
            {formatMetric(summaryStats.total)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <div className="text-[11px] text-slate-500">Peak Value</div>
          <div className="font-mono text-base font-bold text-emerald-700 mt-0.5">
            {formatMetric(summaryStats.max)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <div className="text-[11px] text-slate-500">Minimum Value</div>
          <div className="font-mono text-base font-bold text-slate-800 mt-0.5">
            {formatMetric(summaryStats.min)}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Canvas */}
      <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {datasetTitle}
            </h3>
            <p className="text-xs font-mono text-slate-500">
              X-Axis: <span className="text-slate-800">{activeXColumn}</span> ·
              Y-Axis: <span className="text-slate-800">{activeYColumn}</span> (
              {aggregation.toUpperCase()})
            </p>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded">
            No extracted data rows available for this dataset source. Try switching to Extracted Fields or Page Metrics.
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 24, left: 16, bottom: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#334155' }}
                    tickFormatter={(v) =>
                      isCurrencyMetric
                        ? `₹${Number(v).toLocaleString('en-IN')}`
                        : Number(v).toLocaleString('en-IN')
                    }
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatMetric(Number(val ?? 0)),
                      activeYColumn,
                    ]}
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '6px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="value"
                    name={activeYColumn}
                    fill="#1d4ed8"
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((_, idx) => (
                      <Cell
                        key={`bar-cell-${idx}`}
                        fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 24, left: 16, bottom: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#334155' }}
                    tickFormatter={(v) =>
                      isCurrencyMetric
                        ? `₹${Number(v).toLocaleString('en-IN')}`
                        : Number(v).toLocaleString('en-IN')
                    }
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatMetric(Number(val ?? 0)),
                      activeYColumn,
                    ]}
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '6px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={activeYColumn}
                    stroke="#1d4ed8"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#1d4ed8' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie
                    data={chartData.filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={({ name, value }) =>
                      `${String(name).slice(0, 18)}: ${formatMetric(Number(value))}`
                    }
                  >
                    {chartData.map((_, idx) => (
                      <Cell
                        key={`pie-cell-${idx}`}
                        fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatMetric(Number(val ?? 0)),
                      activeYColumn,
                    ]}
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '6px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Plotted Data Table with Source-Page Jump */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Plotted Data Points & Source Provenance ({chartData.length} rows)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Click any row to highlight the underlying source coordinate in the PDF viewer
          </span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">{activeXColumn} (Category)</th>
                <th className="py-2.5 px-4">{activeYColumn} (Value)</th>
                <th className="py-2.5 px-4">Source Page</th>
                <th className="py-2.5 px-4 text-right">Locate in PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chartData.map((row, idx) => {
                const doc = docMap.get(row._docId);
                return (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{
                          backgroundColor:
                            CHART_PALETTE[idx % CHART_PALETTE.length],
                        }}
                      />
                      {row.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {formatMetric(row.value)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {doc?.displayName || row._docId} · Page {row._page}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {row._docId && (
                        <button
                          type="button"
                          onClick={() =>
                            onJumpToSource(
                              row._docId,
                              row._page,
                              row._bbox,
                              `${row.name}: ${formatMetric(row.value)}`
                            )
                          }
                          className="text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Inspect Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
