// App.tsx — top-level renderer state machine. Decides first-run vs. main view,
// owns the selected animal and the four report tabs. All data comes through
// window.api (IPC); the renderer never touches the database directly.
import React, { useCallback, useEffect, useState } from 'react';
import type { DbStatus } from '@/lib/ipc';
import type { PedigreeTreeNode } from '@/lib/pedigreeAlgorithm';
import {
  DEFAULT_GENERATIONS,
  LINEBREEDING_MAX_GENERATIONS,
} from '@/lib/pedigreeAlgorithm';
import type { LinebreedingReport as LbReport } from '@/lib/linebreeding';
import { DEFAULT_MIN_CROSSES } from '@/lib/linebreeding';
import type { FoundationReport as FndReport } from '@/lib/contribution';
import { exportChartPdf, exportChartPng } from '@/lib/chartExport';
import FirstRun from './components/FirstRun';
import SaveMenu, { type SaveFormat } from './components/SaveMenu';
import SearchPanel from './components/SearchPanel';
import PedigreeTable from './components/PedigreeTable';
import LinebreedingReport from './components/LinebreedingReport';
import FoundationReport from './components/FoundationReport';

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
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('pedigree');

  // Bracket-chart depth (shared by Pedigree + PedigreeTree). Clamped to 4..8.
  const [generations, setGenerations] = useState(clampChart(DEFAULT_GENERATIONS));
  const [tree, setTree] = useState<PedigreeTreeNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  // Linebreeding.
  const [lbGenerations, setLbGenerations] = useState(6);
  const [minCrosses, setMinCrosses] = useState(DEFAULT_MIN_CROSSES);
  const [lbReport, setLbReport] = useState<LbReport | null>(null);
  const [loadingLb, setLoadingLb] = useState(false);

  // Foundation.
  const [foundationNames, setFoundationNames] = useState<string[]>([]);
  const [fndReport, setFndReport] = useState<FndReport | null>(null);
  const [loadingFnd, setLoadingFnd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const isChart = view === 'pedigree' || view === 'tree';

  // On mount: resolve saved path, depth, and foundation list.
  useEffect(() => {
    window.api.getStatus().then(setStatus);
    window.api.getConfig().then((c) => {
      setGenerations(clampChart(c.generations));
      setFoundationNames(c.foundationNames ?? []);
    });
  }, []);

  // Chart export (PDF / PNG). All the page-fitting and rasterization logic lives
  // in lib/chartExport; here we only manage the busy flag, file name, and any
  // notice the export wants to surface (e.g. PNG resolution was clamped).
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const runExport = useCallback(
    async (
      fn: (opts: { defaultName: string }) => Promise<{ warning?: string } | unknown>
    ) => {
      const defaultName = selected
        ? `PedigreeInsights-${selected}`
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
      } finally {
        setExporting(false);
      }
    },
    [selected]
  );

  const onPrint = useCallback(
    () => runExport((o) => exportChartPdf({ landscape: isChart, ...o })),
    [runExport, isChart]
  );
  const onSavePng = useCallback(
    () => runExport((o) => exportChartPng(o)),
    [runExport]
  );

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
    setBusy(true);
    setStatus(await window.api.pickDatabase());
    setBusy(false);
  }, []);

  // Bracket-chart tree — loaded for the two chart tabs.
  useEffect(() => {
    if (!selected || !isChart) {
      setTree(null);
      return;
    }
    let cancelled = false;
    setLoadingTree(true);
    window.api.getPedigree(selected, generations).then((t) => {
      if (!cancelled) {
        setTree(t);
        setLoadingTree(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, generations, isChart]);

  // Linebreeding report.
  useEffect(() => {
    if (!selected || view !== 'linebreeding') {
      setLbReport(null);
      return;
    }
    let cancelled = false;
    setLoadingLb(true);
    window.api.getLinebreeding(selected, lbGenerations, minCrosses).then((r) => {
      if (!cancelled) {
        setLbReport(r);
        setLoadingLb(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, lbGenerations, minCrosses, view]);

  // Foundation report (re-runs when the subject or the saved list changes).
  useEffect(() => {
    if (!selected || view !== 'foundation' || foundationNames.length === 0) {
      setFndReport(null);
      return;
    }
    let cancelled = false;
    setLoadingFnd(true);
    window.api.getFoundation(selected).then((r) => {
      if (!cancelled) {
        setFndReport(r);
        setLoadingFnd(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, view, foundationNames]);

  const onChartDepth = useCallback((value: number) => {
    setGenerations(value);
    window.api.setGenerations(value);
  }, []);

  const onImportFoundation = useCallback(async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await window.api.importFoundation();
      if (!res.canceled) {
        setFoundationNames(res.names);
        const unmatchedNote =
          res.unmatched.length > 0
            ? ` ${res.unmatched.length} not found: ${res.unmatched.slice(0, 5).join(', ')}${
                res.unmatched.length > 5 ? '…' : ''
              }`
            : '';
        setImportMsg(
          `Loaded ${res.names.length} names — ${res.matched} matched the database.${unmatchedNote}`
        );
      }
    } finally {
      setImporting(false);
    }
  }, []);

  const onClearFoundation = useCallback(async () => {
    await window.api.clearFoundation();
    setFoundationNames([]);
    setFndReport(null);
    setImportMsg(null);
  }, []);

  if (!status?.connected) {
    return <FirstRun onPick={pick} error={status?.error ?? null} busy={busy} />;
  }

  const printDisabled =
    isChart ? !tree || loadingTree
    : view === 'linebreeding' ? !lbReport || loadingLb
    : !fndReport || loadingFnd;

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">PedigreeInsights</span>
        <span className="topbar__db">
          DB: {status.fileName} <span className="pill">read-only</span>
        </span>
        <button className="btn btn--ghost" onClick={pick}>
          Open DB
        </button>
      </header>

      <div className="toolbar">
        <SearchPanel onSelect={setSelected} />
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
            <select value={generations} onChange={(e) => onChartDepth(Number(e.target.value))}>
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

        <SaveMenu formats={saveFormats} disabled={printDisabled} busy={exporting} />
        {exportMsg && (
          <span className="toolbar__note" role="status" onClick={() => setExportMsg(null)}>
            {exportMsg}
          </span>
        )}
      </div>

      <main className="stage">
        {!selected && view !== 'foundation' && (
          <div className="empty-stage">
            Look up a dog by name to view its{' '}
            {view === 'linebreeding' ? 'linebreeding report' : 'pedigree'}.
          </div>
        )}

        {selected && view === 'pedigree' && (
          <>
            {loadingTree && <div className="empty-stage">Building pedigree…</div>}
            {tree && !loadingTree && <PedigreeTable tree={tree} variant="pedigree" />}
          </>
        )}

        {selected && view === 'tree' && (
          <>
            {loadingTree && <div className="empty-stage">Building pedigree tree…</div>}
            {tree && !loadingTree && <PedigreeTable tree={tree} variant="tree" />}
          </>
        )}

        {selected && view === 'linebreeding' && (
          <>
            {loadingLb && <div className="empty-stage">Analyzing linebreeding…</div>}
            {lbReport && !loadingLb && (
              <LinebreedingReport
                report={lbReport}
                minCrosses={minCrosses}
                onMinCrossesChange={setMinCrosses}
              />
            )}
          </>
        )}

        {view === 'foundation' && (
          <FoundationReport
            report={fndReport}
            foundationNames={foundationNames}
            importing={importing}
            importMsg={importMsg}
            hasSubject={!!selected}
            onImport={onImportFoundation}
            onClear={onClearFoundation}
          />
        )}
      </main>
    </div>
  );
}
