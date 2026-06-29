---
title: file-structure
status: reflects the actual PedigreeInsights tree (Electron + electron-vite)
updated: 2026-06-29
---

## Layout: published repo vs. private artefacts

Design docs **are** published (they help contributors): the `docs/` set ships in the
repo. Two things are kept **private**:

- `CLAUDE.md` — AI/dev guidance. It stays at the repo root so Claude Code auto-loads
  it locally, but it is **git-ignored** so it is never pushed to GitHub.
- The **process/governance artefacts** — the Task-to-Handoff working change record,
  the compliance gap report, and test-run evidence — live one level up under
  `dev-docs/`, outside the repo entirely.

```
pedigreepoint/                         ← workspace container
├── dev-docs/
│   └── pedigree-insights/             ← PRIVATE process artefacts (NOT published)
│       ├── working-change-record.md   ← Task-to-Handoff working change record (former PRD §0)
│       ├── task-to-handoff-compliance.md  ← Task-to-Handoff gap report
│       └── evidence/                  ← stored test-run logs
└── pedigree-insights/                 ← THE PUBLISHED REPO (below)
```

## Published repository root (`pedigree-insights/`)

```
pedigree-insights/
├── CLAUDE.md                         ← Claude Code / dev context (PRIVATE — git-ignored, not pushed)
├── README.md                         ← human-facing project docs
├── LICENSE                           ← MIT
├── package.json                      ← scripts + deps (electron-vite, better-sqlite3, react, html-to-image)
├── electron.vite.config.ts           ← electron-vite build config (main/preload/renderer)
├── electron-builder.yml              ← packaging (mac arm64 dmg, appId, asarUnpack)
├── tsconfig.json · vitest.config.ts  ← TS + test config
├── index.html                        ← renderer entry
│
├── docs/                             ← design docs (published, but never shipped in the app bundle)
│   ├── specification.md              ← product PRD
│   ├── schema-map.md                 ← confirmed Pedigree columns (+ COI/AVK name variation)
│   ├── stack-decision.md             ← framework choices
│   ├── pedigree-algorithm.md         ← traversal logic notes
│   ├── file-structure.md             ← this file
│   └── open-items.md                 ← decisions / open questions
│
├── electron/                         ← main + preload (the ONLY place the DB is opened)
│   ├── main/
│   │   ├── index.ts                  ← app lifecycle, window, IPC handlers (validated + timed), CSP
│   │   ├── database.ts               ← PedigreeDatabase (better-sqlite3, read-only)
│   │   ├── export.ts                 ← PDF (printToPDF) + PNG file-save IPC handlers
│   │   ├── validate.ts               ← runtime IPC payload guards (assert/req helpers)
│   │   └── config.ts                 ← saved db path, depth, foundation list (userData JSON)
│   └── preload/
│       └── index.ts                  ← typed window.api bridge (contextIsolation on)
│
├── src/                              ← React + TypeScript renderer
│   ├── App.tsx                       ← top-level state; the four-tab shell
│   ├── main.tsx · styles.css
│   ├── components/
│   │   ├── FirstRun.tsx              ← first-launch / file-picker screen
│   │   ├── SearchPanel.tsx           ← name/registration lookup
│   │   ├── PedigreeTable.tsx         ← bracket chart (Pedigree & PedigreeTree variants)
│   │   ├── LinebreedingReport.tsx    ← repeated-ancestor crosses table
│   │   ├── FoundationReport.tsx      ← foundation import + contribution table
│   │   ├── SaveMenu.tsx              ← "Save…" dropdown; data-driven export-format picker
│   │   ├── PedigreeChart.tsx         ← legacy react-flow node (retained, unused by table view)
│   │   └── AnimalCard.tsx            ← legacy react-flow card (retained, unused)
│   └── lib/                          ← pure, DB-agnostic logic (also runs in unit tests)
│       ├── schema.ts                 ← Animal interface + normalizers (sex, keys, nodeLabel)
│       ├── queries.ts                ← every SQL string + schema-adaptive projection
│       ├── ipc.ts                    ← shared IPC channel names + window.api types
│       ├── pedigreeAlgorithm.ts      ← ancestor tree (default de-dup + chart expand-all), caps
│       ├── linebreeding.ts           ← repeated-ancestor / crosses analysis
│       ├── contribution.ts           ← memoized contribution DP + Foundation report + list parser
│       ├── lineColors.ts             ← line-family colour assignment for repeated ancestors
│       ├── tableLayout.ts            ← bracket-grid cell placement (rowSpan/col)
│       ├── chartExport.ts            ← export orchestration: one-page PDF plan, PNG capture + ratio clamp
│       └── layout.ts                 ← legacy react-flow node/edge layout (unused by table view)
│
├── tests/
│   ├── unit/                         ← pure-logic tests (no real DB)
│   │   ├── pedigreeAlgorithm.test.ts · linebreeding.test.ts · contribution.test.ts
│   │   ├── queries.test.ts · tableLayout.test.ts · layout.test.ts · lineColors.test.ts
│   │   ├── chartExport.test.ts       ← pure PDF page-planning + PNG pixel-ratio math
│   └── integration/
│       └── database.test.ts          ← real better-sqlite3 against the fixture + synthetic DBs
│   └── fixtures/DogSampleData.db      ← read-only sample (schema fixture; not user data)
│
└── (build output, git-ignored): node_modules/ · out/ · release/
```

## Key conventions

- **All SQL lives in `src/lib/queries.ts`.** Column names must match
  `docs/schema-map.md`; the genetics columns are selected via
  `buildSelectCols` (adapts to `Inbreeding Coefficient`/`Relationship Coefficient`
  vs `COI`/`AVK`, else NULL).
- **`src/lib/` is pure and DB-agnostic** (takes an `AnimalLookup`), so the same
  traversal/analysis code runs in the Electron main process and in Vitest with an
  in-memory map. `pedigreeAlgorithm.ts`, `linebreeding.ts`, and `contribution.ts`
  are the correctness-critical modules.
- **The renderer never touches the database.** It calls `window.api` (preload),
  which forwards to the main-process IPC handlers; only `electron/main/database.ts`
  opens better-sqlite3 (read-only).
- **Export is split renderer/main:** `src/lib/chartExport.ts` measures the chart
  and prepares the page/image (one-page A4/A3 PDF plan; PNG capture with a
  canvas-safe pixel ratio); `electron/main/export.ts` writes the file. The
  `SaveMenu` format list is data-driven, so new formats need no new toolbar UI.
- **Main-process IPC is validated at runtime** (`electron/main/validate.ts`) and
  the heavy reports are timed (`[perf]` logs in `index.ts`) — types are
  compile-time only, and the perf logs gate any future worker isolation.
- **Bracket charts use a CSS-grid table** (`PedigreeTable` + `tableLayout.ts`),
  not react-flow. The `PedigreeChart`/`AnimalCard`/`layout.ts` react-flow files
  are retained but unused by the current table view.
- **`docs/` is published but not shipped** — it helps contributors but is excluded
  from the app bundle (packaging only includes `out/**` and `package.json`; see
  `electron-builder.yml`). **`CLAUDE.md` is private** (git-ignored, kept at root for
  local Claude Code), and the process artefacts (working change record, compliance
  report, test-run evidence) live outside the repo in `../dev-docs/pedigree-insights/`.
