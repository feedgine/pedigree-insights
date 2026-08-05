// App.tsx — top-level renderer shell. Owns the connection status, the selected
// animal, the active tab, the toolbar depth selectors, and export orchestration.
// Each report tab is a small view component that fetches its own data (via
// useResource) and reports readiness up, so App carries no per-report loading or
// data state.
//
// The four tabs are: Pedigree (bracket chart), Indented Tree (classic indented-text
// text pedigree, exportable to .txt), Linebreeding, and Foundation.
import React, { useCallback, useEffect, useState } from 'react';
import type { DbStatus } from '@/lib/ipc';
import {
  DEFAULT_GENERATIONS,
  LINEBREEDING_MAX_GENERATIONS,
} from '@/lib/pedigreeAlgorithm';
import {
  DEFAULT_HYPOTHETICAL_MATING_GENERATIONS,
  HYPOTHETICAL_MATING_MIN_GENERATIONS,
  HYPOTHETICAL_MATING_MAX_GENERATIONS,
} from '@/lib/hypotheticalMating';
import { exportChartPdf, exportChartPng } from '@/lib/chartExport';
import FirstRun from './components/FirstRun';
import SaveMenu, { type SaveFormat } from './components/SaveMenu';
import SearchPanel from './components/SearchPanel';
import PedigreeView from './components/PedigreeView';
import IndentedTreeView from './components/IndentedTreeView';
import LinebreedingView from './components/LinebreedingView';
import FoundationView from './components/FoundationView';
import HypotheticalMatingView from './components/HypotheticalMatingView';

type View = 'pedigree' | 'tree' | 'linebreeding' | 'foundation' | 'mating';

const TABS: { id: View; label: string }[] = [
  { id: 'pedigree', label: 'Pedigree' },
  { id: 'tree', label: 'Indented Tree' },
  { id: 'linebreeding', label: 'Linebreeding' },
  { id: 'foundation', label: 'Foundation' },
  { id: 'mating', label: 'Hypothetical Mating' },
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
const MATING_DEPTHS = Array.from(
  { length: HYPOTHETICAL_MATING_MAX_GENERATIONS - HYPOTHETICAL_MATING_MIN_GENERATIONS + 1 },
  (_, i) => i + HYPOTHETICAL_MATING_MIN_GENERATIONS,
); // 3..10

/** Depths offered for the indented text pedigree (spec: 5 / 10 / 20 gens). */
const TREE_DEPTHS = [5, 10, 20] as const;
const DEFAULT_TREE_GENERATIONS = 5;

export default function App(): React.ReactElement {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [pickingDb, setPickingDb] = useState(false);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [view, setView] = useState<View>('pedigree');

  // Toolbar depth selectors. Chart depth is persisted to config and shared by
  // the Pedigree tab; the tree (5/10/20) and linebreeding depths are session-local.
  const [chartGenerations, setChartGenerations] = useState(clampChart(DEFAULT_GENERATIONS));
  const [treeGenerations, setTreeGenerations] = useState<number>(DEFAULT_TREE_GENERATIONS);
  const [lbGenerations, setLbGenerations] = useState(6);
  const [matingGenerations, setMatingGenerations] = useState<number>(
    DEFAULT_HYPOTHETICAL_MATING_GENERATIONS,
  );

  // Whether the active view currently has exportable content (each view reports
  // this up); drives the Save button's enabled state.
  const [contentReady, setContentReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // The Indented Tree view lifts its rendered text up here so the toolbar's TXT
  // export can write exactly what is on screen. Empty unless the tree tab is
  // active and built.
  const [treeText, setTreeText] = useState('');

  const isChart = view === 'pedigree';
  // The Pedigree and Hypothetical Mating tabs both render a bracket chart
  // (.pttable), so they share the landscape one-page PDF + full-res PNG export.
  const isBracket = view === 'pedigree' || view === 'mating';

  useEffect(() => {
    window.api.getStatus().then(setDbStatus, () => setDbStatus(null));
    window.api.getConfig().then(
      (c) => setChartGenerations(clampChart(c.generations)),
      () => {}
    );
  }, []);

  // Reset readiness (and any lifted tree text) whenever the tab or subject
  // changes, so a switch can't leave the Save button enabled against stale
  // content before the newly mounted view reports in.
  useEffect(() => {
    setContentReady(false);
    setTreeText('');
  }, [view, subjectName]);

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
    () => runExport((o) => exportChartPdf({ landscape: isBracket, ...o })),
    [runExport, isBracket]
  );
  const onSavePng = useCallback(() => runExport((o) => exportChartPng(o)), [runExport]);

  const onSaveTxt = useCallback(async () => {
    if (!treeText) return;
    const base = subjectName || 'pedigree';
    setExporting(true);
    setExportMsg(null);
    try {
      await window.api.saveText(
        `PedigreeInsights - ${base} - ${treeGenerations}gen`,
        treeText
      );
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [treeText, subjectName, treeGenerations]);

  // Output formats for the Save… menu. PDF for every view; PNG only for the
  // bracket chart; TXT only for the indented text tree.
  const saveFormats: SaveFormat[] = [
    {
      id: 'pdf',
      label: 'PDF',
      hint: isBracket
        ? 'A4 / A3 · one page'
        : view === 'tree'
          ? 'A4 portrait · text'
          : 'A4 portrait',
      run: onPrint,
    },
    ...(isBracket
      ? [{ id: 'png', label: 'PNG', hint: 'whole chart · one image', run: onSavePng }]
      : []),
    ...(view === 'tree'
      ? [{ id: 'txt', label: 'TXT', hint: 'plain-text indented pedigree', run: onSaveTxt }]
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
        <span className="topbar__ver" title="app version">v{__APP_VERSION__}</span>
        {__APP_BUILD__ && __APP_BUILD__ !== `v${__APP_VERSION__}` && (
          <span className="topbar__build" title="git build — development / uncommitted work">
            {__APP_BUILD__}
          </span>
        )}
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
        {view === 'tree' && (
          <label className="depth">
            Generations:
            <select value={treeGenerations} onChange={(e) => setTreeGenerations(Number(e.target.value))}>
              {TREE_DEPTHS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
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
        {view === 'mating' && (
          <label className="depth">
            Generations:
            <select value={matingGenerations} onChange={(e) => setMatingGenerations(Number(e.target.value))}>
              {MATING_DEPTHS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="depth__range">({HYPOTHETICAL_MATING_MIN_GENERATIONS}–{HYPOTHETICAL_MATING_MAX_GENERATIONS})</span>
          </label>
        )}

        <SaveMenu formats={saveFormats} disabled={!contentReady} busy={exporting} />
        {exportMsg && (
          <span className="toolbar__note" role="status" onClick={() => setExportMsg(null)}>
            {exportMsg}
          </span>
        )}
      </div>

      <main className="stage">
        {!subjectName && view !== 'foundation' && view !== 'mating' && (
          <div className="empty-stage">
            Look up a dog by name to view its{' '}
            {view === 'linebreeding' ? 'linebreeding report' : 'pedigree'}.
          </div>
        )}

        {subjectName && view === 'pedigree' && (
          <PedigreeView
            subjectName={subjectName}
            generations={chartGenerations}
            onReady={setContentReady}
          />
        )}

        {subjectName && view === 'tree' && (
          <IndentedTreeView
            subjectName={subjectName}
            generations={treeGenerations}
            onReady={setContentReady}
            onText={setTreeText}
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

        {view === 'mating' && (
          <HypotheticalMatingView generations={matingGenerations} onReady={setContentReady} />
        )}
      </main>
    </div>
  );
}
