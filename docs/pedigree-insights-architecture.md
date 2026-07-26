# PedigreeInsights — architecture map (read me first)

Orientation for anyone (human or agent) starting work on this repo, so you do
**not** have to list every module and re-read the whole codebase each session.
This is the *how it fits together*; the PRD (`docs/specification.md`) is the
*what*, `docs/file-structure.md` is the raw file list, and `CLAUDE.md` is the
working contract + non-negotiable rules. When these disagree, `CLAUDE.md` and the
PRD win — update this file if you change structure.

Last updated 2026-07-26 (after the Hypothetical Mating feature).

## 1. What it is, in one breath

A **read-only**, offline **macOS** desktop app that opens a BreedMate-compatible
**SQLite** pedigree `.db` and answers breeders' questions about it: a bracket
**Pedigree** chart, an **Indented Tree** text pedigree, a **Linebreeding** report,
a **Foundation**-contribution report, and a **Hypothetical Mating** litter planner.
Electron + React + TypeScript; `better-sqlite3` (native) opened read-only.
MIT-licensed. It never writes to the `.db`.

## 2. The one architectural idea: pure core, thin shell, one data border

```
renderer (React)                main process (Electron)             source
────────────────                ───────────────────────            ──────
App.tsx (thin shell)            electron/main/index.ts  ──IPC──▶
 └ *View.tsx (per report)  ──▶   handlers (validate + clamp)
     useResource(fetch)          electron/main/database.ts ──▶  better-sqlite3 (READ-ONLY) ──▶ .db
                                   └ calls PURE src/lib/* with a lookup
```

- **`src/lib/*` is pure and DB-agnostic.** Every algorithm takes an
  `AnimalLookup = (name) => Animal | null` and knows nothing about SQLite, React
  or Electron. So the *same* code runs in the main process (lookup backed by
  better-sqlite3) and in unit tests (lookup backed by an in-memory `Map`). This is
  why the test suite can validate correctness with no database.
- **The DB is opened in exactly one place** — `electron/main/database.ts` —
  `readonly:true` + `PRAGMA query_only`. The renderer never touches it; it only
  calls `window.api.*` (see below). There is no write path anywhere.
- **`App.tsx` is a thin shell.** It owns only: connection status, the selected
  animal, the active tab, the toolbar depth selectors, and export orchestration.
  Each report tab is a self-contained `*View.tsx` that fetches its own data via
  the `useResource` hook and reports readiness up (`onReady`) to gate the Save
  button. **Adding a report = one new `*View.tsx` + one `TABS` entry + one render
  line** (+ an IPC channel + a `database.ts` method + pure `src/lib` logic).

## 3. Module responsibilities (the map)

Pure logic — `src/lib/` (unit-tested, no DB/UI/Electron):

| File | Responsibility |
|---|---|
| `schema.ts` | `Animal` type, `AnimalRow`, `toAnimal` (raw pass-through), sex/name normalizers, display formatters (`coiDisplay`, `pctFromFraction`, `pctFromPercent`, `nodeLabel`) |
| `queries.ts` | every SQL string; `buildSelectCols` (projection from `PRAGMA table_info`), `REQUIRED_COLUMNS`, source-contract enforcement |
| `pedigreeAlgorithm.ts` | `buildPedigreeTree` (the ancestor traversal), depth caps + cycle guards, `groupByGeneration`, `countAncestors` |
| `genetics.ts` | relationship-matrix engine — COI (Meuwissen-Luo), COR/AGR (Colleau), AVK (BigInt); `createGeneticsEngine` (inbreeding/coancestry/additiveRelationship), `applyGenetics`, cycle detect+break+warn |
| `linebreeding.ts` | `analyzeLinebreeding` — repeated ancestors, per-occurrence crosses, notation (`3S x 1S`), Blood %, Influence |
| `contribution.ts` | Foundation memoized DP (contribution % across all generations), `parseFoundationList` |
| `tableLayout.ts` | pure grid geometry for the bracket chart (`maxDepth`, `buildGrid`) |
| `indentedTree.ts` | ASCII indented text pedigree (single source for screen + `.txt` export) |
| `lineColors.ts` | assigns pastel hues to repeated ancestors (line families) — drives chart highlighting |
| `chartExport.ts` | renderer-side export prep (paper/scale math, `html-to-image` rasterization); pure math parts unit-tested |
| `layout.ts` | react-flow node/edge layout (legacy canvas; retained, unused by the table view) |
| `ipc.ts` | the shared IPC contract: channel names + `PedigreeApi` (`window.api`) types |
| **`hypotheticalMating.ts`** | **litter planner (§6.8): virtual-offspring lookup + `buildHypotheticalMating` orchestrator** |
| **`matingClassifier.ts`** | **Appendix-C line-breeding classifier (8 methods + outcross)** |
| **`matingChecks.ts`** | **warn-only sex/age checks (`asOf` injected)** |

Main process — `electron/main/` and `electron/preload/`:

| File | Responsibility |
|---|---|
| `index.ts` | app lifecycle, window, IPC handlers (validate + clamp, then call `database`), `timed()` perf logging, CSP |
| `database.ts` | the ONLY DB opener (read-only); one method per report, wiring pure `src/lib` to the live lookup |
| `export.ts` | file-writing IPC: PDF via `printToPDF`, PNG via a data URL, TXT |
| `validate.ts` | runtime guards at the IPC boundary (types vanish at runtime) |
| `menu.ts` | app menu (keeps edit/window roles for clipboard) |
| `config.ts` | persisted config (db path, generations, foundation list) |
| `preload/index.ts` | `contextBridge` exposing the typed `window.api`; forwards to IPC channels |

Renderer — `src/` and `src/components/`:
- `App.tsx` (shell), `src/hooks/useResource.ts` (uniform loading/error + cancel guard).
- Views (fetch + readiness): `PedigreeView`, `IndentedTreeView`, `LinebreedingView`,
  `FoundationView`, **`HypotheticalMatingView`**.
- Presentation: `PedigreeTable` (bracket grid, used by Pedigree **and** Hypothetical
  Mating), `IndentedTree`, `LinebreedingReport`, `FoundationReport`,
  **`HypotheticalMatingReport`**, `SearchPanel` (reusable name lookup),
  `SaveMenu`, `FirstRun`, `AnimalCard` (legacy).
- `styles.css` (all styling), `globals.d.ts` (`__APP_VERSION__`).

## 4. Data flow for a report (concrete)

1. `SearchPanel` → `App` sets `subjectName`.
2. The active `*View` calls `useResource(() => window.api.getX(...), deps)`.
3. `preload` forwards to the `db:getX` channel.
4. `main/index.ts` validates + clamps args, calls `database.getX`.
5. `database.getX` builds a `lookup` bound to better-sqlite3 and calls the pure
   `src/lib` function; genetics are applied as a pre-report step where relevant.
6. The plain-object result crosses IPC back; the view renders it.

## 5. Invariants you must not break (see CLAUDE.md for the authority)

- **Read-only.** Never add a write path; the `.db` is opened read-only + `query_only`.
- **Every traversal is depth-limited AND cycle-guarded** (no view may hang on
  circular data). Cycles are *detected, broken for the math, and surfaced* as a
  warning (break-and-warn), never silently looped.
- **Genetics are computed in-app and labelled computed estimates**, validated to
  machine precision against textbook pedigrees (parent-offspring 0.25, full-sib
  0.25, half-sib 0.125). Never display them without validation.
- **Coefficient scales differ (the classic display bug):** stored **COI** is a
  FRACTION [0,1] → `pctFromFraction` (×100); stored **AVK** is already a PERCENT
  [0,100] → `pctFromPercent` (raw, ≤100%); the engine's COI/COR/Blood % are
  pre-scaled to percent → format WITHOUT another ×100. COR is the *additive*
  A-matrix relationship (0–200%), not Wright's R — do not cap it at 100%.
- **Column names are never assumed** — projection is built from `PRAGMA
  table_info`; a missing optional column degrades to NULL (source contract:
  mandatory `Pedigree` table + `Name`/`Sire`/`Dam`; the rest optional).
- **Additive changes, green tests.** Rewriting implementation is fine while tests
  stay green; breaking a passing test or a user-facing contract needs explicit
  agreement + a `⚠ BREAKING:` changelog note.

## 6. Hypothetical Mating (§6.8) — how it reuses everything

A **virtual offspring** (`makeMatingLookup`) resolves to an `Animal` whose sire/dam
are the two chosen dogs; every other name falls through to the real DB. So the
existing traversal, genetics, line-breeding analysis, colour-coding and export all
operate on the litter unchanged. The litter's COI **is** the coancestry of its
parents (computed by the same validated engine). Added on top: an Appendix-C
classifier (notes only; kennel-/selection-level methods not asserted) and warn-only
sex/age checks. The drawn bracket is capped at 8 generations for legibility
(`HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS`, the Pedigree tab's own max) while COI/AVK + common-ancestor
analysis use the full selected 3–10 depth. Details: `docs/hypothetical-mating.md`.

## 7. Tests & how to run

- `tests/unit/*` — pure logic against in-memory maps (fast, no DB). One file per
  `src/lib` module. **Run:** `npx vitest run tests/unit`.
- `tests/integration/database.test.ts` — real better-sqlite3 against a synthetic,
  PII-free fixture (`tests/fixtures/DogSampleData.db`); asserts read-only. **Needs
  the native module built for the host** (`npm rebuild better-sqlite3` via
  `pretest`). Run on the target Mac.
- Typecheck: `npx tsc --noEmit`. Build: `npx electron-vite build`; package:
  `npm run dist` (mac arm64).
- Current status: **114 unit tests + tsc clean** (2026-07-26).

## 8. Environment gotchas (when editing from a cloud/bridge sandbox)

- The mounted-folder bridge can **write** files but **cannot `unlink`/`rm`** them,
  so `electron-vite build` (which empties `out/`) and `git commit` (which manages
  `.git/index.lock`) can fail there. Run the build, the integration tests, and git
  operations **on the Mac** (clear a stale `.git/index.lock` with `rm` if present).
- `better-sqlite3` is native: rebuild it for whatever host actually runs the
  integration tests / the app.

## 9. Where to look when…

- *Changing what a report shows* → its `*View`/report component + the pure
  `src/lib` module it calls.
- *Changing genetics/traversal correctness* → `genetics.ts` / `pedigreeAlgorithm.ts`
  (+ their unit tests) — these are correctness-critical.
- *Adding/altering a DB field* → `queries.ts` (`PROJECTION`) + `schema.ts` +
  `docs/schema-map.md`.
- *Adding a report/tab* → §2 recipe above.
- *Export behaviour* → `chartExport.ts` (renderer) + `electron/main/export.ts`.

@author Yuliya Malinina <julia.malinina@gmail.com>
