# Hypothetical Mating — engineering companion (PRD §6.8)

Implementation notes for the **Hypothetical Mating** planning tab. Product
requirements live in the PRD (`pedigree-insights-specification.md` §6.8 / §11 /
Appendix C — authoritative copy in the WORKSPACE hub); this file is the *how*.

Status: **implemented, tsc-clean, 114/114 unit tests green** (2026-07-26).
Build + native integration tests to be re-run on the target Mac.
`[DRAFT — requires Yuliya's review]`

## Idea: a virtual offspring, everything else reused

The tab previews a litter for a chosen **dam × sire** without writing anything to
the database. Rather than special-case a "litter", `makeMatingLookup` wraps the
base `AnimalLookup` so one synthetic offspring — `PLANNED_LITTER_NAME` — resolves
to an `Animal` whose `Sire`/`Dam` are the two selected dogs; every other Name
falls through to the real DB. That lets the existing, validated code operate on
the litter unchanged:

- **Chart** — `buildPedigreeTree(matingLookup, litter, gens, expandAll=true)`; the
  repeated-ancestor colour-coding (`computeLineColors`, used by `PedigreeTable`)
  paints the *common ancestors* automatically (they are exactly the ancestors that
  recur on both the sire and dam sides).
- **Litter COI / AVK + common ancestors** — `analyzeLinebreeding` + `applyGenetics`
  on the litter. The litter's inbreeding **is** the coancestry of its parents, and
  the validated Meuwissen-Luo / Colleau engine (`genetics.ts`) computes it as the
  offspring's F — so `report.subjectCoi` == `coancestry(sire, dam)` (asserted in
  `tests/unit/hypotheticalMating.test.ts`).

No new genetics, schema, or DB-contract code — only composition.

## Module map (all additive)

| File | Role |
|---|---|
| `src/lib/hypotheticalMating.ts` | virtual-offspring lookup + `buildHypotheticalMating()` orchestrator + `HypotheticalMatingReport` type + analysis depth window (3–10, default 5) and chart cap (`HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS = 8`) |
| `src/lib/matingClassifier.ts` | Appendix-C classifier (8 methods + outcross) over the line-breeding rows |
| `src/lib/matingChecks.ts` | warn-only sex/age checks (`asOf` injected for determinism) |
| `src/components/HypotheticalMatingView.tsx` | self-contained view: two parent pickers + `useResource` fetch + `onReady` |
| `src/components/HypotheticalMatingReport.tsx` | header (parents, litter COI/AVK, warnings, classification, common-ancestor list) + `PedigreeTable` |

Wiring: IPC channel `db:getHypotheticalMating` (`ipc.ts` → `preload` → `main/index.ts`
validated + clamped → `database.getHypotheticalMating` → `new Date()` for `asOf`);
`App.tsx` gets one `TABS` entry, a 3–10 depth selector, and shares the Pedigree
tab's landscape one-page PDF + full-res PNG export (both render `.pttable`).

## Line-breeding classification (Appendix C) — honesty first

`classifyLinebreeding` returns **notes, never hard claims**, and grades them:

- `match` (detectable from the pedigree): **Onstott doubling-up** (ancestor on both
  sides), **Brackett Rule-of-Five** (an ancestor at gens 2 & 3), **half-sib** /
  **full-sib** / **parent–offspring backcross** (from the parents' own parents).
- `possible` (only partly inferable): **tail-line matriarchal (Wycliffe)** — a
  repeated ancestor on the unbroken bottom (all-dam) line; **Morgan three-in/one-out**
  — a close backcross is present but the three-generation pattern needs the history.
- **Not asserted** (Q-HM-1): Oppenheimer (a selection philosophy) and the
  kennel-level rotations (clan/quad, three-line) can't be judged from one pedigree,
  so they are deliberately **not** emitted — `unknown` is not a claim.
- **Outcross / line-cross** when there is no (or only ≥5-gen-deep) common ancestry.

Cross notation reuses the Linebreeding report's form (e.g. `2S x 3S`).

## Warn-only checks (never block)

`checkMating(dam, sire, asOf)`: sex mismatch (dam should be F, sire M) and age
windows (dam 1–8, sire 1–12 years, as of `asOf`). Missing Sex/DOB → "unknown" →
no warning. DOB parsing accepts ISO and BreedMate `M/D/YYYY`.

## Export

The projected pedigree is a standard `.pttable`, so PDF (one-page A4/A3 landscape)
and PNG reuse `chartExport.ts` unchanged. `@media print` strips the pickers and the
analysis header so the PDF is the bracket itself, matching the Pedigree tab.

## Chart depth is capped (legibility)

The projected pedigree is an **expand-all bracket** (2^gen cells), so — like the
Pedigree tab (§6.3) — the drawn chart is capped at
`HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS = 8` — the same maximum the Pedigree tab
uses. On a line-bred population, 10 generations is ~1024 rows: the near cells become enormous (a parent spans half the
grid, its text tiny and centred), and the one-page PDF fit shrinks the text until it
overlaps — i.e. an unusable export. The selector still drives the FULL analysis
(litter COI is computed over the entire pedigree regardless; AVK, common ancestors
and classification use the selected 3–10), but the bracket only draws the first 8
generations, with an on-screen note when `chartGenerations < generations`. The chart
pane is rendered exactly like the Pedigree tab (definite-height box, self-scrolling
`.pttable`) so its one-page PDF/PNG export is identical. For deep
line-breeding detail, the Linebreeding tab goes to 20.

## Open items

- **Q-HM-1** — precedence when several patterns match: currently all are surfaced
  (paper-ambiguous ones flagged `possible`); refine against real dogs.
- **PDF scope** — the exported PDF is the projected pedigree only; litter COI/AVK
  live in the on-screen header (and could later be folded into the chart caption).
- Verify on the target Mac (build + native `better-sqlite3` integration tests).

@author Yuliya Malinina <julia.malinina@gmail.com>
