// App.tsx — top-level renderer shell. Owns the connection status, the selected
// animal, the active tab, the toolbar depth selectors, and export orchestration.
// Each report tab is a small view component that fetches its own data (via
// useResource) and reports readiness up, so App carries no per-report loading or
// data state.
import React, { useCallback, useEffect, useState } from 'react';
import type { DbStatus } from '@/lib/ipc';
import {
  DEFAULT_GENERATIONS,
  LINEBREEDING_MAX_GENERATIONS,
} from '@/lib/pedigreeAlgorithm';
import { exportChartPdf, exportChartPng } from '@/lib/chartExport';
import FirstRun from './components/FirstRun';
import SaveMenu, { type SaveFormat } from './components/SaveMenu';
import SearchPanel from './components/SearchPanel';
import PedigreeView from './components/PedigreeView';
import LinebreedingView from './components/LinebreedingView';
import FoundationView from './components/FoundationView';

type View = 'pedigree' | 'tree' | 'linebreeding' | 'foundation';

const TABS: { id: View; label: string }[] = [
  { id: 'pedigree', label: 'Pedigree' },
  { id: 'tree', label: 'PedigreeTree' },
  { id: 'linebreeding', label: 'Linebreeding' },
  { id: 'foundation', label: 'Foundation' },
];

const CHART_MIN_GENERATIONS = 4;
const CHART_MAX_GENERATIONS = 8; // bracket charts are most legible up to 8 gens
const CHART_DEPTHS = Array.from(
  { length: CHART_MAX_GENERATIONS - CHART_MIN_GENERATIONS + 1 },
  (_, i) => i + CHART_MIN_GENERATIONS
); // 4..8
const clampChart = (n: number) =>
  Math.min(CHART_MAX_GENERATIONS, Math.max(CHART_MIN_GENERATIONS, n));
const LB_DEPTHS = Array.from({ length: LINEBREEDING_MAX_GENERATIONS - 3 }, (_, i) => i + 4); // 4..20

export default function App(): React.ReactElement {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [pickingDb, setPickingDb] = useState(false);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [view, setView] = useState<View>('pedigree');

  // Toolbar depth selectors. Chart depth is persisted to config; the two chart
  // tabs share it. Linebreeding depth is session-local.
  const [chartGenerations, setChartGenerations] = useState(clampChart(DEFAULT_GENERATIONS));
  const [lbGenerations, setLbGenerations] = useState(6);

  // Whether the active view currently has exportable content (each view reports
  // this up); drives the Save button's enabled state.
  const [contentReady, setContentReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const isChart = view === 'pedigree' || view === 'tree';

  useEffect(() => {
    window.api.getStatus().then(setDbStatus, () => setDbStatus(null));
    window.api.getConfig().then(
      (c) => setChartGenerations(clampChart(c.generations)),
      () => {}
    );
  }, []);

  const runExport = useCallback(
    async (
      fn: (opts: { defaultName: string }) => Promise<{ warning?: string } | unknown>
    ) => {
      const defaultName = subjectName
        ? `PedigreeInsights-${subjectName}`
        : 'PedigreeInsights';
      setExporting(true);
      setExportMsg(null);
      try {
        const res = await fn({ defaultName });
        const warning =
          res && typeof res === 'object' && 'warning' in res
            ? (res as { warning?: string }).warning
            : undefined;
        if (warning) setExportMsg(warning);
      } catch (err) {
        setExportMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setExporting(false);
      }
    },
    [subjectName]
  );

  const onPrint = useCallback(
    () => runExport((o) => exportChartPdf({ landscape: isChart, ...o })),
    [runExport, isChart]
  );
  const onSavePng = useCallback(() => runExport((o) => exportChartPng(o)), [runExport]);

  // Output formats for the Save… menu. PDF for every view; PNG only for the
  // bracket charts. Add a format here (e.g. SVG) to expose it in the menu.
  const saveFormats: SaveFormat[] = [
    {
      id: 'pdf',
      label: 'PDF',
      hint: isChart ? 'A4 / A3 · one page' : 'A4 portrait',
      run: onPrint,
    },
    ...(isChart
      ? [{ id: 'png', label: 'PNG', hint: 'whole chart · one image', run: onSavePng }]
      : []),
  ];

  const pick = useCallback(async () => {
    setPickingDb(true);
    try {
      setDbStatus(await window.api.pickDatabase());
    } finally {
      setPickingDb(false);
    }
  }, []);

  const onChartDepth = useCallback((value: number) => {
    setChartGenerations(value);
    window.api.setGenerations(value);
  }, []);

  if (!dbStatus?.connected) {
    return <FirstRun onPick={pick} error={dbStatus?.error ?? null} busy={pickingDb} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">PedigreeInsights</span>
        <span className="topbar__db">
          DB: {dbStatus.fileName} <span className="pill">read-only</span>
        </span>
        <button className="btn btn--ghost" onClick={pick}>
          Open DB
        </button>
      </header>

      <div className="toolbar">
        <SearchPanel onSelect={setSubjectName} />
        <div className="viewtabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === t.id}
              className={`viewtab${view === t.id ? ' viewtab--active' : ''}`}
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isChart && (
          <label className="depth">
            Generations:
            <select value={chartGenerations} onChange={(e) => onChartDepth(Number(e.target.value))}>
              {CHART_DEPTHS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="depth__range">({CHART_MIN_GENERATIONS}–{CHART_MAX_GENERATIONS})</span>
          </label>
        )}
        {view === 'linebreeding' && (
          <label className="depth">
            Generations:
            <select value={lbGenerations} onChange={(e) => setLbGenerations(Number(e.target.value))}>
              {LB_DEPTHS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="depth__range">(4–{LINEBREEDING_MAX_GENERATIONS})</span>
          </label>
        )}
        {view === 'foundation' && (
          <span className="depth depth__range">All generations</span>
        )}

        <SaveMenu formats={saveFormats} disabled={!contentReady} busy={exporting} />
        {exportMsg && (
          <span className="toolbar__note" role="status" onClick={() => setExportMsg(null)}>
            {exportMsg}
          </span>
        )}
      </div>

      <main className="stage">
        {!subjectName && view !== 'foundation' && (
          <div className="empty-stage">
            Look up a dog by name to view its{' '}
            {view === 'linebreeding' ? 'linebreeding report' : 'pedigree'}.
          </div>
        )}

        {subjectName && isChart && (
          <PedigreeView
            subjectName={subjectName}
            generations={chartGenerations}
            variant={view === 'tree' ? 'tree' : 'pedigree'}
            onReady={setContentReady}
          />
        )}

        {subjectName && view === 'linebreeding' && (
          <LinebreedingView
            subjectName={subjectName}
            generations={lbGenerations}
            onReady={setContentReady}
          />
        )}

        {view === 'foundation' && (
          <FoundationView subjectName={subjectName} onReady={setContentReady} />
        )}
      </main>
    </div>
  );
}
