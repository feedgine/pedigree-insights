# PedigreeInsights

A free, open-source (MIT) **macOS** desktop **pedigree-database analysis tool**. It is **source-agnostic**: it reads any **SQLite** file that exposes a pedigree table in the expected shape (see [Database requirements](#database-requirements)). [BreedMate](https://www.breedmate.com/) exports are the primary, fully-tested format — BreedMate is Windows-only, so a Mac-based breeder can open their existing BreedMate SQLite file and study any animal's ancestry across four reports — a pedigree bracket chart, an indented text pedigree (exportable to `.txt`), line-breeding, and foundation contribution — with no Windows machine required.

PedigreeInsights is **read-only**. The source database remains the source of truth for all data entry; PedigreeInsights never modifies the file.

## Features

- Point the app at any pedigree SQLite database (e.g. a BreedMate `.db`) via a native file picker; the path is remembered.
- Look up a dog by name (or registration number).
- Four report tabs:
  - **Pedigree** — bracket chart showing Titles · Name · DOB · Reg.
  - **Indented Tree** — a BreedMate-style **indented text pedigree** (the "Family Tree" layout): the subject at the left margin, sire block above and dam block below, indenting one level per generation with `|` connectors. Each node is labelled with its generation (G0 = subject, G1, G2 …), Name, Registration and DOB; the header summarises Sex, DOB, COI and AVK. Line-bred ancestors are expanded once and later occurrences flagged `[repeat]`; unknown ancestors show as bare slots. **5 / 10 / 20 generations** (selector). Exportable to **.txt** (see Export) — what you see on screen is byte-identical to the saved file.
  - **Linebreeding** — ancestors appearing more than once across the sire and dam sides, with the generation/line of every cross; 4–20 generations. Columns mirror PedigreeOnline: Crosses, Lines (sire/dam split), **Blood %** (Wright's ½^generation contribution), **Influence** (the equivalent cross pair), **AGR** (additive genetic relationship to the subject) and **COI** (each ancestor's own inbreeding). Rows are ranked by Blood % to surface the **top influencers**.
  - **Foundation** — import a list of foundation dogs; for any chosen dog, see each foundation's presence and genetic contribution across all generations.
- Generation depth: **Pedigree** bracket chart 4–8; **Indented Tree** 5 / 10 / 20; **Linebreeding** 4–20; **Foundation** runs across all generations.
- **Export** any report with **Save…**: a single-page **PDF** (A4, or A3 landscape for a deep chart); for the bracket chart, a full-resolution **PNG** of the whole tree with no page limit; for the Indented Tree, a plain-text **.txt** file.
- Robust on imperfect data: traversal is iterative/cycle-guarded and never hangs; pedigree **cycles** (a dog within its own ancestry) are detected, broken for the math, and **surfaced as a warning** listing the offending dogs so the data can be corrected.
- The running **version** is shown in the app header (e.g. `v1.3.0`), read from `package.json` at build time.
- Read-only: BreedMate stays the source of truth; the `.db` is never modified.

## Database requirements

Any **SQLite** database works, provided it contains a pedigree table in this shape (BreedMate exports already match). The file is opened **read-only** and never modified.

**Mandatory**

- A table named **`Pedigree`**.
- **`Name`** (TEXT) — the unique identity of each animal.
- **`Sire`** and **`Dam`** (TEXT) — the parents, stored as the parent's **`Name` string** (not an integer id), matched case-insensitively. An unknown parent is blank/NULL, or a name with no matching row (the line simply ends there).

**Optional** — used when present, shown as "—" otherwise; never required:

- `Sex`, `DOB`, `Registration`, `PreTitle`, `PostTitle`, `Color`, `Breed`. (`Registration` is also used by search-by-registration.)
- `COI` / `AVK` — stored genetics values (BreedMate's long names `Inbreeding Coefficient` / `Relationship Coefficient` are also accepted). How these are used depends on the report — see [Genetics](#genetics).

If a database lacks the mandatory columns, the app reports a clear error rather than a cryptic SQLite failure.

## Genetics

The two **analytical** reports compute their own validated figures and **ignore any stored values**; the two **bracket-chart** views display the source data **as-is**.

- **Linebreeding** and **Foundation** reports — COI, AGR, AVK and Blood %/contribution are **always computed in-app** (`src/lib/genetics.ts` / `contribution.ts`); any `COI`/`AVK`/`AGR` stored in the database is **ignored and recalculated**. (The stored COI in real exports proved unreliable, so these reports never depend on it.)
  - **COI** — Meuwissen & Luo (1992), iterative, scalable to large/deep pedigrees.
  - **AGR** (subject ↔ ancestor) — Colleau's (2002) indirect method.
  - **AVK** (ancestor-loss) — distinct ÷ possible ancestors, **BigInt** denominator so 100+ generations never overflow.
  - **Blood %** — Wright's ½^generation contribution (structural).
- **Pedigree** bracket chart — displays the **stored** `COI` · `AVK` from the database verbatim when present ("—" otherwise), **without recomputation**, so the chart reflects exactly what the source file holds. (AGR is a pairwise subject↔ancestor figure and appears, computed, only in Linebreeding.) The **Indented Tree** likewise shows stored values in its header; the two analytical reports below recompute their own.

The compute engine is iterative (no deep recursion), detects/breaks/reports pedigree cycles with a warning, and is validated to machine precision against the exact tabular method plus hand-computable reference pedigrees (parent-offspring 0.25, full-sib 0.25, half-sib 0.125). Computed figures are labelled estimates, not externally certified values.

## Stack

Electron + React + TypeScript. The bracket charts render as a **CSS-grid table** (dense and print-predictable; the older `react-flow` node view is retained but unused). `better-sqlite3` (opened **read-only**, in the main process) is the database bridge. PDF export uses the Electron main process (`webContents.printToPDF`, for reliable A4/A3 landscape on macOS); PNG export uses `html-to-image`. Built with `electron-vite`; packaged with `electron-builder`.

## Requirements

- macOS on Apple Silicon (arm64) — the MVP build target.
- Node.js 18+ and npm.

## Develop

```bash
npm install        # also rebuilds better-sqlite3 for Electron (postinstall)
npm run dev        # launch the app in development with hot reload
```

## Build the .dmg

On an Apple Silicon Mac:

```bash
npm install
npm run dist       # electron-vite build → electron-builder --mac --arm64
```

The installable arm64 `.dmg` is written to `release/`.

The MVP build is **unsigned**. On first launch macOS Gatekeeper will block it; either right-click the app and choose **Open**, or clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/PedigreeInsights.app"
```

## Test

```bash
npm test               # unit + integration (Vitest)
npm run test:unit      # pure traversal/normalization logic
npm run test:integration   # queries against a fixture .db (read-only enforced)
```

Integration tests run against `tests/fixtures/DogSampleData.db`. Place a BreedMate sample database there (the repo's `.gitignore` permits `tests/fixtures/*.db`).

## How it works

- `src/lib/schema.ts` — typed `Animal` model + dirty-data normalizers (sex, name keys), mapped to the confirmed `Pedigree` columns.
- `src/lib/queries.ts` — every SQL string, with quoted column names matching the BreedMate schema.
- `src/lib/pedigreeAlgorithm.ts` — pure, depth-limited, cycle-guarded ancestor traversal (the correctness-critical module).
- `src/lib/linebreeding.ts` · `src/lib/contribution.ts` — repeated-ancestor/cross analysis (incl. Blood % and Influence) and the memoized Foundation contribution engine.
- `src/lib/genetics.ts` — in-app relationship-matrix genetics: COI (Meuwissen-Luo), AGR (Colleau indirect), AVK (BigInt ancestor-loss), with cycle detection. Iterative and validated; runs as a pre-report step.
- `src/lib/tableLayout.ts` — bracket-grid cell placement (rowSpan/col) for the chart table; `lineColors.ts` tints repeated ancestors.
- `src/lib/indentedTree.ts` — renders a traversal node as the BreedMate-style indented ASCII text pedigree + summary header; the single source of truth for both the on-screen Indented Tree report and the `.txt` export (they can never drift).
- `src/lib/chartExport.ts` — export orchestration: the one-page PDF plan and the PNG capture (with a canvas-safe pixel ratio).
- `electron/main/` — the only place the database is opened (read-only): IPC handlers (runtime-validated via `validate.ts`, timed for profiling), the PDF/PNG/TXT file writers (`export.ts`), the custom application menu (`menu.ts`), file picker, and config persistence.
- `electron/preload/` — narrow, typed `window.api` bridge (contextIsolation on).
- `src/App.tsx` is a **thin shell** (connection status, selected animal, active tab, toolbar depth selectors, export). Each report tab is a **self-contained view component** — `PedigreeView` · `IndentedTreeView` · `LinebreedingView` · `FoundationView` — that fetches its own data through the `src/hooks/useResource.ts` hook (loading/error + cancelled-guard) and reports readiness up. Adding a report is roughly one new `*View.tsx`, one `TABS` entry, and one render line; the hook lives in `src/hooks/` so `src/lib/` stays pure and main-process-safe.

`Sire`/`Dam` in BreedMate are **Name text strings**, not integer foreign keys, so traversal is a self-join on `Name`. See `docs/` for the confirmed schema map, stack decisions, and algorithm notes.

## Roadmap

- **Configurable source mapping** — accept any pedigree SQLite file whose table or columns are named differently (or that uses integer parent IDs) via a small table-name / column-alias mapping, fully generalising the [Database requirements](#database-requirements) beyond the currently-fixed `Pedigree` / `Name` / `Sire` / `Dam` names.
- **Whole-population genetics** — bulk COI/AGR for every dog (not just per report), using the same Meuwissen–Luo / Colleau routines with a sorted ancestor linked list for near-linear scale.
- **Per-cycle impact figure** in the cycle warning — how much breaking each edge moved the subject's COI, to flag high-impact data errors versus negligible ones.
- **In-app editing**, richer search/filter, an animal detail panel, and descendant (offspring) charts.

(See `docs/specification.md` §9 for the full roadmap.)

## Project status & compatibility

This is an actively evolving, personal project. **There are no
backward-compatibility guarantees.** The app may be reworked or rewritten at any
time, and its internals, behaviour, on-disk formats (saved config, foundation
list), and the database contract may change between versions without notice or a
migration path. Pin a specific commit or release if you need stability.

Forks are welcome under the MIT license — but if you fork or build on this, you
own and maintain that copy. The author provides the software "as is", with no
warranty and no responsibility for forks, downstream changes, or any work derived
from it (see [LICENSE](./LICENSE)).

## License

MIT — see [LICENSE](./LICENSE).
