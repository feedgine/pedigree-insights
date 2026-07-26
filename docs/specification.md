---
title: PedigreeInsights Product Requirements (PRD)
type: Product Requirements Document
version: "1.9"
status: DRAFT — requires Yuliya's review
updated: 2026-07-26
license: MIT
reference_render: SNOWSHOES BOBBI AT LUELDAR 8G.png; Finnish KC (KoiraNet) certificate layout; Pedigree Online linebreeding report; PedigreePub export output (A4/A3 + PNG)
companion_docs:
  - stack-decision.md
  - schema-map.md
  - pedigree-algorithm.md
  - file-structure.md
  - open-items.md
history: "Полный changelog — Приложение A (в конце файла) и git-история репозитория; статус handoff — dev-docs WCD."
tags:
  - pedigree-insights
  - prd
---

# PedigreeInsights — Product Requirements (PRD)

This is the product-level specification for PedigreeInsights. It defines *what*
the product is, *who* it serves, and *what it must do*. Engineering detail (exact
schema, framework internals, traversal code) lives in the companion docs above.

PedigreeInsights was forked from the original **PedigreePoint** viewer on
2026-06-25 and is the package intended for GitHub. The original remains intact in
the sibling `pedigree-point/` folder.

## Роль этого документа (Entry-Point Contract)

- **Читатель:** владелец / ревьюер / разработчик.
- **Одна роль:** требования продукта — *что* PedigreeInsights делает, *для кого* и
  *что обязан* обеспечивать. Критерии приёмки — §11.
- **Не содержит:** детали реализации (*как*) и историю решений в теле. Инженерные
  детали (стек, экспорт-механика, IPC, схема, алгоритмы, структура файлов) — в
  companion-доках репозитория `docs/` (Приложение B). Полная история — Приложение A.
- **Источник истины:** этот файл — для требований; реализация — в репозитории и его
  `docs/`; статус handoff — `dev-docs/pedigree-insights/working-change-record.md`.

---

## 1. Summary

PedigreeInsights is a free, **open-source (MIT-licensed)** macOS desktop
**pedigree-database analysis tool**. It is **source-agnostic**: it reads any
SQLite database that exposes a pedigree table in the expected shape (see §8
"Source database contract"). **BreedMate** exports are the primary, fully-tested
format, so a breeder can analyse the data they already hold in BreedMate; any
other tool's SQLite export that matches the contract works equally well.

It began as an interactive pedigree-chart viewer and has grown into a small
**analysis tool with four report tabs plus a planning tool**:

1. **Pedigree** — a bracket pedigree chart (titles · name · DOB · reg).
2. **Indented Tree** — a BreedMate-style **indented text pedigree** (the "Family
   Tree" layout): the subject at the left margin, sire block above and dam block
   below, indented one level per generation. Each node is labelled with its
   generation (G0 = subject, G1, G2 …), name, registration and DOB; a summary
   header shows Sex, DOB, COI and AVK. Exportable to a plain-text **.txt** file.
3. **Linebreeding** — every ancestor that appears more than once across the sire
   and dam sides, with the generation/line of each cross, plus Blood %, Influence,
   AGR and COI; ranked by Blood % to surface the top influencers.
4. **Foundation** — import a list of foundation dogs and see, for any chosen dog,
   each foundation's presence and genetic contribution across all generations.

5. **Hypothetical Mating** — a *planning* tool: pick an existing dam and
   sire and preview the projected pedigree, COI/AVK and line-breeding of the
   potential litter — without adding anything to the database.

The app remains a **read-only** consumer of the `.db`. BreedMate (on Windows)
stays the source of truth for all data entry and editing; PedigreeInsights never
modifies the file.

---

## 2. Problem & motivation

BreedMate runs on **Windows only**. A breeder who works on a Mac but whose
pedigree data lives in a BreedMate `.db` has no native way to view or analyse
that data — they must keep Windows hardware (or a VM) purely to run one program.
That is an expensive, awkward barrier for what is, at heart, *reading* an
existing SQLite file.

PedigreeInsights removes that barrier and goes further: beyond simply rendering a
pedigree, it answers the questions a breeder actually asks of a pedigree — *where
does the line-breeding sit, and how much of which foundation dogs is behind this
animal?* — directly from the data BreedMate already holds, with no Windows
machine required. Being MIT-licensed, the wider breeder community can use,
inspect, and extend it freely.

---

## 3. Target user

The primary user is the breeder/kennel owner who maintains a BreedMate database
on a Mac and wants a better way to view and *study* pedigrees. This is a
single-user, single-machine, local tool — no accounts, no server, no cloud sync.
The user is comfortable installing a Mac app but is not necessarily technical.

---

## 4. Goals & non-goals

### Goals

- Give Mac breeders native access to existing BreedMate data without Windows.
- Render a clear, readable pedigree in two forms — a bracket chart and an
  indented text tree (the latter exportable to `.txt`) — for any selected animal.
- Surface line-breeding (repeated ancestors and their crosses) at a glance.
- Quantify foundation-dog presence and contribution across all generations.
- Read directly from the existing BreedMate `.db` without altering it.
- Run entirely locally; ship as free, open-source software under the **MIT license**.

### Non-goals

- Editing or writing animal records (read-only — see roadmap §9).
- Descendant/offspring charts (algorithm scaffold exists; not a deliverable yet).
- Health-test interpretation, breed-standard scoring, registration compliance.
- Multi-user, networking, cloud sync, or mobile.

---

## 5. Scope — the four reports + planning tool

A user opens the app, it connects to their BreedMate `.db`, they look up a dog by
name, and they switch between five tabs (four reports + a Hypothetical Mating planning tool). Looking up a dog by name is the minimum
supporting capability (matches Name or Registration).

| Tab | Purpose | Depth | Genetics |
|---|---|---|---|
| **Pedigree** | Bracket chart: titles · name · DOB · reg | 4–8 gens | none |
| **Indented Tree** | Indented **text** pedigree: G-label · name · reg · DOB, with a Sex/DOB/COI/AVK header | **5 / 10 / 20** gens | **displays STORED** COI/AVK from the DB ("Not available" if absent) in the header; no recompute |
| **Linebreeding** | Repeated ancestors + crosses | 4–20 gens | Blood %/Influence + COI/AGR/AVK **computed in-app (stored values ignored)**, ranked by Blood % |
| **Foundation** | Foundation-dog presence + contribution | all generations | contribution % **computed in-app** (stored values ignored) |
| **Hypothetical Mating** | Projected pedigree of a planned dam × sire litter | 3–10 gens (chart capped ≤8) | litter COI/AVK **computed in-app**; common ancestors highlighted |

Each tab is detailed in §6. A single **Save…** action exports the active report
(PDF for any view; PNG additionally for the Pedigree bracket chart; TXT for the
Indented Tree) — see §6.7.

---

## 6. User experience requirements

### 6.1 First launch and database connection

On first launch the app prompts the user to **locate the BreedMate `.db` file
with a native file picker** (§7.4). The chosen path is saved to a config file, so
subsequent launches open the same file automatically. The file can live anywhere,
and the user can re-point the app at a different file with the **Open DB** button
in the header. If the saved file
is missing on a later launch, the app falls back to the picker rather than
failing. If the file is not a usable BreedMate pedigree database (its `Pedigree`
table is missing required columns `Name`/`Sire`/`Dam`), the app shows a clear
message rather than a raw SQLite error.

### 6.2 Selecting an animal

A single name lookup (matching `Name` or `Registration`, case-insensitively)
identifies the subject; picking a result drives every tab.

### 6.3 Pedigree (the bracket chart)

The Pedigree tab renders the subject's ancestors as a **bracket grid**:
generations are columns (Parents on the left, deepening rightward), each ancestor
cell spans the rows of its subtree.

**Subject header (certificate style).** The subject is **not** a column in the
grid; it sits in a header block above the table — `Pedigree of: <Name>` with the
dog's titles, and its DOB, Sex, Breed, Reg No., Color, and COI · AVK (only fields
that have data). This mirrors a kennel-club pedigree certificate (Finnish KC
reference) and frees the grid to start at the **Parents** column.

**Generation headers.** A header row labels the columns: `Parents`,
`Grandparents`, `G Grandparents`, `G G Grandparents`, … one per generation.

**Cell content.** Championship **titles** render small and muted on their own
line; the **registered name** always starts on a fresh line in a prominent bold;
below it, **Reg No.** and **DOB** in a small font. (The bracket chart itself does
not print COI/AVK per cell — inbreeding metrics live in the Indented Tree header
and the Linebreeding report.)

**Legibility (a hard requirement).** Title strings in this breed are long
(`C.I.B. FI CH SE CH … BALTW-00 …`). Cells therefore **grow vertically to fit
their content** — names, titles and multiple registration numbers wrap freely and
are never truncated (the full label is also a hover tooltip). Column widths are
fixed (so the bracket stays aligned and print is predictable); rows expand. This
follows the Finnish-KC approach rather than clipping.

**Repeated ancestors are fully drawn.** A line-bred ancestor that occupies more
than one box is expanded box-for-box at every occurrence, exactly as a printed
pedigree shows it (chart "expand-all" mode). The only collapse is a genuine data
error — a dog listed inside its own ancestry — which is stopped by the per-path
cycle guard and marked with a small ↺ (see pedigree-algorithm.md).

**Monochrome.** The charts are monochrome (white cells, grey borders, black
text); sex is not colour-coded here. (Sex is shown as a small dot in the
Linebreeding/Foundation tables.)

**Depth.** 4 generations by default, adjustable **4–8** (deeper bracket charts
are not legible; deep analysis lives in the Linebreeding/Foundation reports).

### 6.3a Indented Tree (the text pedigree)

The Indented Tree tab renders the subject's ancestry as a **BreedMate-style
indented text pedigree** (the "Family Tree" export layout), shown in a monospace
block so the ASCII alignment holds. Unlike the bracket chart it is *text* — which
is exactly what makes it exportable to a plain `.txt` file (§6.7).

**Layout.** The subject sits at the left margin; its **sire block is drawn above**
and its **dam block below**, indenting one generation-column (4 characters) deeper
per level. A vertical `|` connector runs on the side of each node that faces the
parent's spine, giving the classic sideways-tree look. Each node reads
`G{gen} {Name} {Registration} ({DOB})` — the **generation label** (G0 = subject,
G1 = parents, G2 = grandparents, …) takes the place of championship titles per the
2026-07-20 spec; registration and DOB are appended when present. A leading
**summary header** shows `Pedigree of:`, Sex, Date of Birth, **COI**, **AVK**, and
the generation depth.

**De-dup traversal + `[repeat]`.** The text tree uses the **de-dup** traversal
(not the chart's expand-all): each ancestor is expanded **at most once** — the
first occurrence is drawn in full, and any later occurrence (line-breeding) is
shown but flagged `[repeat]` and **not** re-expanded. This keeps even a
20-generation line-bred tree bounded as text (the fully-expanded chart would
double every generation). Unknown/foundation ancestors render as a **bare `+--`
slot**, exactly like the BreedMate export.

**Genetics.** The header's COI and AVK are the **stored** values from the database
shown **verbatim** ("Not available" if absent); the Indented Tree never recomputes
them (§7.3) — it is a faithful view of the source record, like the Pedigree chart.

**Depth.** Selectable **5 / 10 / 20 generations** (default 5). The traversal cap is
raised to `PEDIGREE_TREE_MAX_GENERATIONS = 20` for this report (the shared bracket
cap stays 13); recursion is still depth-limited and cycle-guarded (§6.6).

**Export.** The exact text on screen is produced by a single builder
(`src/lib/indentedTree.ts`) and is what the **TXT** export writes — the on-screen
report and the saved file can never drift. See §6.7.

### 6.4 Linebreeding report

Lists every ancestor that appears **more than once** across the sire and dam
sides of the subject, modelled on the Pedigree Online linebreeding report.

- **Depth 4–20 generations** (selector). Per-path enumeration of crosses stays
  fast and meaningful to ~20 generations; beyond that the cross count explodes
  (measured on the 37k-dog database) and the converging **contribution** view in
  Foundation is the right tool — see open-items.md #13.
- **Min crosses** filter (default 2 — the "inbreds" filter).
- **Columns:** Name · Crosses (the cross list, e.g. `3S x 1S`, where the letter
  is the subject side S/D and the case encodes the ancestor's sex) · # (count) ·
  Lines (count split `(sire)(dam)`) · **Blood %** · **Influence** · **AGR** · **COI**.
  Rows are **ranked by Blood %** (genetic contribution) — the "top influencers"
  ordering, matching Pedigree Online.
- **Header:** the subject's COI, AVK and the count/percentage of unique ancestors
  in N generations. The unique-ancestor denominator is the true ancestor-slot
  count 2^(g+1)−2 (an earlier 2^g−1 under-counted by ~half).
- **Genetics (all computed in-app, labelled estimates):**
  - **Blood %** = Wright's Σ ½^generation contribution — *structural*, deterministic.
  - **Influence** = the equivalent cross pair (n×n / n×(n+1), or `< 7x7`) that
    represents the Blood % contribution. Reverse-engineered from and verified
    against the Pedigree Online reference report (all 46 rows reproduce).
  - **AGR** = additive genetic relationship subject↔ancestor — Colleau's indirect
    method (src/lib/genetics.ts).
  - **COI** = each ancestor's own inbreeding — Meuwissen & Luo (src/lib/genetics.ts).
- **Cycle warning:** if any ancestor appears within its own ancestry (a data
  error), a non-blocking banner lists the offending dogs; the edge is broken so
  COI/AGR still compute (break-and-warn — §6.6).

### 6.5 Foundation report

Quantifies how much of an imported list of **foundation dogs** stands behind a
chosen subject, across **all generations**.

- **Import:** the user loads a `.txt`/`.csv` list (one name per line, or the
  first CSV column). The app parses, de-duplicates, validates names against the
  database, and reports how many matched. The list is saved to config.
- **Per foundation dog:** In DB? · Present in this pedigree? · Closest generation
  · Crosses (within a depth cap) · **Contribution %**.
- **Summary:** "X of Y foundation dogs present (Z%)" and a combined contribution
  (a simple sum, with a caveat that overlapping founders can double-count).
- **Engine:** a memoized layered DP computes contribution and presence across all
  generations in milliseconds, regardless of how interbred the dog is (it is
  bounded by a finite safety cap and is cycle-safe). See §7.3 and contribution.ts.

### 6.6 Robustness for real-world data

BreedMate data can contain entry errors, including circular ancestry. No view may
hang or crash on such data. Every traversal is **depth-limited AND loop-guarded**
(per-path for the chart/contribution walks, global de-dup for ancestor counts);
the genetics engine is **iterative and visited-bounded**. This is a hard product
requirement, not just an implementation detail.

**Cycle handling (break-and-warn — owner-confirmed default).** The genetics step
explicitly **detects** pedigree cycles (a dog within its own ancestry; 19 exist in
the sample DB, incl. dogs listed as their own parent), **breaks** the offending
edge so the COI/AGR math stays a valid DAG, and **surfaces a warning** naming the
offending dogs so the data can be corrected — it never silently loops or hides the
issue. Break-and-warn is preferred over hard-stop because cycles cluster in popular
ancestors, so stopping would block reports for many descendants over often-deep,
negligible errors.

### 6.7 Exporting a report (Save…)

A single **Save…** control in the toolbar opens a small **format menu**. The menu
is data-driven so further formats can be added without new buttons. Today it
offers:

- **PDF** — for every view.
- **PNG** — additionally for the Pedigree bracket chart.
- **TXT** — additionally for the Indented Tree (plain-text pedigree).

**PDF — one-page certificate.** The Pedigree chart exports **A4/A3 landscape** with
the **entire bracket fit onto a single page**. The app measures the rendered chart
and scales it to fit both the width and height of the sheet; it uses **A4**, and
**bumps to A3** when A4 would force an unreadably small scale. The result is a
one-page overview (text is small at 8 generations, but the whole tree is present
and printable) rather than a tall chart sliced across many pages. Text reports
(Indented Tree / Linebreeding / Foundation) export **A4 portrait** and may run to
several pages.

**TXT — the indented text pedigree.** The Indented Tree tab additionally offers a
**.txt** export: a native Save dialog writes the on-screen report verbatim as a
UTF-8 text file (built by `src/lib/indentedTree.ts`, so file and screen are
byte-identical). Read-only posture is unaffected — this writes a user-chosen file
outside the database, never the `.db`.

Printing is performed by the **Electron main process** (`printToPDF`), *not* the
renderer's `window.print()`: on macOS `window.print()` ignores the CSS `@page`
orientation, which previously forced a wide chart to print portrait and clip. The
main-process path forces page size and orientation deterministically. The user
then chooses the destination in a native save dialog.

**PNG — full-resolution, no page limit.** PNG rasterizes the **whole chart as one
image**, which is the right tool for a deep pedigree whose detail must stay
legible (the approach the external **PedigreePub** tool uses as its workaround for
page limits). The pixel ratio is **clamped to the browser canvas limits**
(≤ 32,000 px per side, ≤ 256 MP) so a very large chart can never silently render
blank; if the resolution had to be reduced, the toolbar shows a brief notice
suggesting PDF for a crisp full-size copy.

> Note on layout: the bracket grid uses fixed column widths and content-growing
> rows, so a full 8-generation chart is intrinsically tall. The PDF therefore
> trades size for a single page, and PNG covers the "large and legible" case. A
> future **PedigreePub-style layout repack** (tapering column widths, thin packed
> deep rows) — see §9 — would let the PDF itself be both one-page and legible.

---

### 6.8 Hypothetical Mating (planning a litter)

The Hypothetical Mating tab **previews a potential litter** before any real
breeding. The user picks an existing **dam** and **sire** from the database; the
app projects the pedigree of their hypothetical offspring and analyses it. Nothing
is written to the database — this is a planning view only.

**Selecting the parents.** Two lookups (by Name / Registration) choose a **dam**
and a **sire**, both of which must already exist in the database. Entering a new
animal here is out of scope (roadmap §9).

**Projected pedigree.** The app builds a virtual offspring whose sire and dam
subtrees are the two selected animals' pedigrees, and renders the combined pedigree
up to the selected depth (default 5). The "repeated ancestors fully drawn /
cycle-guarded" behaviour of §6.3 applies. The selected depth (**3–10**) drives the
litter COI/AVK and common-ancestor analysis, but the **drawn bracket chart is capped
at 8 generations** for legibility: a deeper expand-all bracket is not readable and
cannot be exported to one page (on a line-bred population, 10 generations is ~1024
rows) — the same legibility limit as the Pedigree chart (§6.3). On a deep pedigree the
chart therefore shows the first 8 generations (with an on-screen note) while the
numbers use the full selected depth; the litter COI is computed over the entire
pedigree regardless of the selector.

**Analysis.**

- **Common ancestors** on both the sire and dam sides are **highlighted and
  colour-coded** (duplicated names share a colour), so line-breeding is visible at
  a glance.
- **Litter COI and AVK** are computed in-app for the planned offspring (its COI
  equals the relationship between the chosen parents), labelled computed estimates
  as in §7.3.
- **Line-breeding classification.** The pedigree is matched against the breeder
  reference set of **8 line-breeding methods + outcross** (Appendix C); any match is
  surfaced as a **note**, with the cross written in the **same notation as the
  Linebreeding report** (§6.4 — e.g. `3S x 1S`, the II-III position form) where
  applicable.

**Checks (warnings only — never blocking).** The app warns, but still builds the
preview, if: the two picks are not one female + one male (**sex mismatch**); or an
animal is outside its breeding-age window (**dam 1–8 years, sire 1–12 years**),
measured as of today. Missing `Sex` or `DOB` is treated as **"unknown"** and raises
no warning for that field.

**Recessive DNA health tests (warn-only).** When BOTH parents have a readable
result for an optional health-test column (currently `PRA-rcd4-C2orf71` and
`SAMS-KCNJ10`), a note flags the litter's recessive-inheritance risk — **carrier ×
carrier ⇒ ~25% affected**, affected × carrier ⇒ ~50%, affected × clear ⇒ every
puppy a carrier; unreadable or absent results raise no warning. The sire's and
dam's marker values are shown on their cells in the projected pedigree chart.

**Export.** The projected pedigree exports to **PDF or PNG** (as in §6.7). **No
record is ever added to the database.**

---

## 7. Confirmed product decisions

### 7.1 Write access — READ-ONLY

The app does not modify the `.db`. The file is opened read-only and a
`PRAGMA query_only` is set as defence in depth. In-app editing remains a roadmap
item (§9).

### 7.2 Generation depth — per report

- **Pedigree (bracket chart):** default 4, adjustable **4–8**.
- **Indented Tree (text pedigree):** **5 / 10 / 20** (default 5;
  `PEDIGREE_TREE_MAX_GENERATIONS = 20`). De-dup traversal keeps a deep tree bounded.
- **Linebreeding:** **4–20** (`LINEBREEDING_MAX_GENERATIONS = 20`).
- **Foundation:** **all generations**, bounded by a finite safety cap
  (`CONTRIBUTION_MAX_GENERATIONS = 64`; real lines run out far sooner, the cap
  only guarantees termination on circular data).
- The default ancestor-traversal cap is `MAX_GENERATIONS_CAP = 13`; the deeper
  views raise it explicitly (Indented Tree → 20, Linebreeding → 20). Every request
  is clamped to its view's cap; recursion is never unbounded (CLAUDE.md).

### 7.3 Genetics policy — COI/AGR/AVK computed in-app (validated), updated 2026-06-27

**History.** Through v1.1 a dog's own COI was kept strictly external (computed by a
separate script, displayed read-only) because genetics output must be validated.
In v1.3 this was **reversed** after investigation showed the stored BreedMate COI
column is unreliable — capped near ~0.4 % (a dog Pedigree Online rates at 28 % was
stored as 0.30 %). Hiding/displaying a bad value is worse than computing a correct
one, so — **owner-approved 2026-06-27** — COI/AGR/AVK are now computed in-app by a
dedicated, validated module (`src/lib/genetics.ts`), as a pre-report step.

Quantities and methods (all labelled *computed estimates*, not externally certified):

- **COI** (Coefficient of Inbreeding) — **Meuwissen & Luo (1992)**, iterative,
  parents-first; scalable to large populations / deep pedigrees.
- **AGR** (Additive Genetic Relationship, subject↔ancestor) — **Colleau (2002)**
  indirect method (A·e_subject in two linear sweeps; no matrix formed).
- **AVK** (Ancestor-Loss Coefficient) — distinct ÷ possible ancestors, with a
  **BigInt** denominator (2^(g+1)−2 overflows float64 past generation 52).
- **Blood %** (Wright's ½^gen contribution) — the separate *structural* estimate,
  also used by the Foundation report (contribution.ts); distinct from COI/AGR.

**Per-report split (where stored values are used).** The decision to recompute
applies to the **analytical** reports; the **chart** views still mirror the source
data verbatim:

- **Linebreeding** and **Foundation** — COI/AGR/AVK and Blood %/contribution are
  **always computed in-app; any stored `COI`/`AVK`/`AGR` in the database is
  ignored and recalculated.** These reports never depend on stored genetics.
- **Pedigree** bracket chart and the **Indented Tree** text pedigree — display the
  **stored** `COI`/`AVK` from the database **verbatim** when present (the Indented
  Tree shows them in its summary header, "Not available" otherwise), with **no
  recomputation**, so they show exactly what the source file holds. (Neither shows
  AGR; it is a pairwise subject↔ancestor figure shown, computed, only in
  Linebreeding.) Rationale: these two views are a faithful *view* of the source
  record, while the analytical reports are independent computed analyses.

**Validation requirement (met).** The in-app results are validated to machine
precision (≤4e-15) against the exact tabular method on the 37k-dog DB **and**
against hand-computable reference pedigrees with known F (parent-offspring 0.25,
full-sib 0.25, half-sib 0.125) — see tests/unit/genetics.test.ts. The engine is
iterative (no deep recursion) and detects/breaks/reports pedigree cycles (§6.6).
The earlier recursive coancestry engine was replaced: it did not scale and gave
wrong values (depth-truncated memo → AGR < Blood %).

### 7.4 Database file location — FILE PICKER, PATH SAVED TO CONFIG

On first launch a native file picker selects the `.db`; the chosen path is
persisted to config and reused on later launches, surviving the file being moved
(re-pick to update).

---

## 8. Constraints & data contract

- **License:** MIT — free to use, inspect, and extend. No proprietary BreedMate
  code is reused; the app only reads the user's own `.db`.
- **Platform:** local macOS desktop app (Apple Silicon / arm64 MVP target),
  single user, offline. Exists because BreedMate is Windows-only.
- **Data source:** any pedigree **SQLite** database that meets the *Source database
  contract* below (BreedMate `.db` being the primary tested format).
  PedigreeInsights consumes the file; it does not create it.

- **Source database contract (source-agnostic).** The app depends only on the
  following; everything else BreedMate-specific is incidental. Enforced via
  `PRAGMA table_info` at connect time (`queries.ts` `REQUIRED_COLUMNS` /
  `buildSelectCols`); a missing mandatory column yields a clear error, a missing
  optional column degrades to NULL.

  *Mandatory:*
  - a table named **`Pedigree`**;
  - **`Name`** (TEXT) — the unique identity of each animal;
  - **`Sire`** and **`Dam`** (TEXT) — each holds the parent's **`Name` string**
    (NOT an integer FK), matched case-insensitively; an unknown parent is
    blank/NULL or a name with no matching row (the line ends). Traversal is a
    self-join on `Name`.

  *Optional (used if present, else "—"):* `Sex`, `DOB`, `Registration` (also used
  by search), `PreTitle`, `PostTitle`, `Color`, `Breed`, and the stored genetics
  columns `COI` / `AVK` (or BreedMate's `Inbreeding Coefficient` /
  `Relationship Coefficient`). Stored genetics are shown only on the Pedigree
  chart and in the Indented Tree header; the analytical reports recompute and
  ignore them (§7.3). Optional **DNA health-test** columns `PRA-rcd4-C2orf71` and
  `SAMS-KCNJ10` are read when present (text, shown verbatim) and drive the
  Hypothetical Mating parent display + carrier check (§6.8); absent → ignored.

  *Not yet generalised (roadmap §9):* the table name `Pedigree` and the column
  names above are currently fixed; a database using different table/column names
  or integer parent IDs needs a mapping layer.
- **Schema variation (confirmed 2026-06-25):** the genetics columns are named
  `Inbreeding Coefficient` / `Relationship Coefficient` in the bundled sample but
  `COI` / `AVK` in real exports. The data layer reads `PRAGMA table_info` at
  connect time and selects whichever names exist (else NULL), so a real database
  opens correctly without assuming one spelling.
- **Реализация (стек, экспорт, IPC-hardening, perf-инструментирование, read-before-build):** вынесено в Приложение B и companion-доки (`stack-decision.md`, `file-structure.md`, `pedigree-algorithm.md`, `schema-map.md`, `CLAUDE.md`).

---

## 9. Roadmap (not committed)

- **In-app editing** of animal records (read + write).
- **Hypothetical Mating with entered (non-DB) animals** — allow a planned parent not yet in the database (today both parents must already exist).
- **Richer search & filter** (breed, registration, multi-field).
- **Animal detail panel** when a node is selected.
- **Descendant (offspring) charts** — scaffold exists in pedigree-algorithm.md.
- **Colour-coding of repeated ancestors** in the bracket charts (pastel tints, as
  on some kennel-club certificates) — easy now that repeats are fully drawn.
- **Whole-population genetics** (bulk COI/AGR for every dog, not just per-report):
  the same Meuwissen-Luo/Colleau routines with a sorted ancestor linked list for
  near-linear scale. *(Per-report COI/AGR/AVK and Blood %/Influence shipped in
  v1.3 — §6.4/§7.3.)*
- **Per-cycle impact figure** in the cycle warning (how much breaking each edge
  moved the subject's COI), to flag high-impact data errors vs negligible ones.
- **Configurable source mapping** — let the user point the app at a database whose
  table or columns are named differently (or that uses integer parent IDs), via a
  small table-name/column-alias mapping, fully generalising the Source database
  contract (§8) beyond the currently-fixed `Pedigree`/`Name`/`Sire`/`Dam` names.
- **Photo display** in the subject header (BreedMate `Photo` is a file path,
  usually to the original Windows machine, so not reliably displayable today).
- **PedigreePub-style chart repack** — tapering column widths + thin packed deep
  rows so a deep bracket fits one page *legibly*, letting the PDF be both one-page
  and readable (today the PDF is one-page-but-small and PNG covers full detail;
  §6.7).
- **Architecture (deferred, measure-first):** if reports grow in number, fold the
  per-report wiring into a single code-defined **report catalogue** + generic
  execute API (still hardcoded, just centralized once), and add an **export
  catalogue** distinguishing rendered-document (PDF/PNG) from tabular (CSV/XLSX)
  outputs. Move a report's DB work to a **UtilityProcess** *only if* the `[perf]`
  measurements show it blocks the UI (above ~1 s); add a database-adapter
  abstraction only when a second DB format becomes a real requirement. No plugin
  framework or DB-stored report metadata is planned.

Delivered since v1.0 of the original viewer: report export (Save… → PDF one-page
A4/A3 landscape, full-resolution PNG, and — v1.2 — plain-text TXT for the Indented
Tree); the four-tab report set (with the Indented Tree text pedigree replacing the
former PedigreeTree bracket tab in v1.2); the Foundation contribution engine;
runtime IPC validation and performance instrumentation.

---

## 10. Open items affecting this PRD

Resolved product decisions are in §7; engineering items are tracked in
open-items.md (notably #11 COI/AVK naming, #13 Linebreeding depth, #14
contribution DP, #15 contribution-vs-COI policy).

- `[DRAFT — verify]` Linebreeding cross-notation case convention (S/s, D/d) and
  the exact "Influence/closest" formula, against a known reference dog.
- `[DRAFT — verify]` `[Titles]`/`[Obedience]` → `PreTitle`/`PostTitle` mapping
  against a real titled dog.
- `[UNKNOWN — verify]` Whether the app must handle more than one `.db` at once
  (currently a single configured database).

---

## 11. Acceptance criteria

The product is in good shape when, on the target Mac:

```
[ ] App launches; first run prompts a file picker, then reopens the saved .db path.
[ ] A non-BreedMate / column-missing file yields a clear message, not a raw SQLite error.
[ ] A real export whose genetics columns are named COI/AVK opens and reads correctly.
[ ] Look up a dog by name; the four tabs all populate for the selection.
[ ] Pedigree tab: subject in a header block; grid starts at Parents with generation headers.
[ ] Long titles/names and multiple reg numbers are never clipped (cells grow; tooltip shows full).
[ ] Repeated ancestors are fully drawn in the chart; a true ancestry loop is stopped (↺), not hung.
[ ] Indented Tree tab renders the text pedigree (G-labels, sire-above/dam-below, summary header);
    line-bred ancestors show once and are flagged [repeat]; unknown ancestors show as bare slots.
[ ] Pedigree depth selectable 4–8; Indented Tree 5/10/20; Linebreeding 4–20; Foundation all generations.
[ ] Save… → TXT of the Indented Tree writes a .txt file identical to the on-screen text.
[ ] Linebreeding lists repeated ancestors with crosses/lines; min-crosses filter works.
[ ] Foundation: importing a list reports matched/unmatched; a chosen dog shows per-founder
    presence + contribution %, and a "X of Y present" summary.
[ ] Contribution % is correct (parents = 50%, grandparents = 25%; verified on the real DB).
[ ] App never writes to the .db (verified read-only); never computes a dog's own COI.
[ ] App does not hang or crash on circular/duplicate ancestry.
[ ] Save… → PDF of a chart is a SINGLE landscape page (A4, or A3 for a deep chart),
    with the whole bracket present and not clipped (verified on the target Mac).
[ ] Save… → PDF of a text report is A4 portrait and readable.
[ ] Save… → PNG of a chart is one full-resolution image of the whole tree; an
    over-large chart triggers the resolution-reduced notice rather than a blank image.
[ ] The main process rejects malformed IPC payloads (bad reportId/params) without crashing.
```

**Hypothetical Mating (§6.8):**

```
[ ] Pick an existing dam and sire; the tab shows a projected pedigree (analysis 3–10 gens;
    the drawn bracket is capped at 8 gens for legibility, with a note when it is capped).
[ ] Common ancestors on both sides are highlighted / colour-coded.
[ ] Litter COI and AVK are shown (computed in-app, labelled estimates).
[ ] A recognised line-breeding pattern (Appendix C) is noted, with cross notation as in Linebreeding.
[ ] Sex mismatch or out-of-age-window (dam 1–8, sire 1–12) shows a WARNING but still builds the preview.
[ ] Missing Sex/DOB is treated as "unknown" (no false warning); never blocks.
[ ] When both parents have a readable DNA result (e.g. PRA-rcd4-C2orf71 / SAMS-KCNJ10),
    a carrier×carrier (or Affected) recessive-risk WARNING shows; unreadable/absent → none.
[ ] The sire and dam DNA marker values appear on their cells in the projected chart.
[ ] Save… exports the projected pedigree to PDF/PNG; NO record is written to the .db.
```

---

## 12. Automated testing strategy

Testing pins the spec's hardest guarantees (never write to the `.db`, never hang
on cycles, ancestor counts and contributions that are correct). Vitest covers the
unit and integration layers against a read-only fixture derived from
`DogSampleData.db`; Playwright is the intended end-to-end layer for the packaged
app.

### 12.1 Unit tests — pure logic, no real DB

Targets: `pedigreeAlgorithm.ts`, `indentedTree.ts`, `linebreeding.ts`,
`contribution.ts`, `queries.ts`, layout helpers — exercised against in-memory
animal maps.

```
[ ] Ancestor traversal resolves Sire/Dam by Name and groups by generation.
[ ] Depth limit and cycle guard (default de-dup mode) terminate and count once.
[ ] Chart "expand-all" mode fully draws a repeated ancestor at every occurrence,
    while still halting a true ancestry loop.
[ ] Indented text tree: sideways ASCII layout (sire-above/dam-below, 4-col indent,
    | connectors), G-labels, DOB formatting, [repeat] on line-bred ancestors,
    summary header (COI/AVK "Not available" when absent).
[ ] Linebreeding: common-ancestor crosses, notation, lines split, min-crosses filter,
    final-generation flag, cycle safety.
[ ] Contribution DP: parents = 1/2, grandparents = 1/4, repeats sum; converges and
    terminates on a self-referential pedigree.
[ ] Foundation report: presence, contribution, closest gen; case-insensitive matching;
    list parsing (CSV first column, header skip, de-dup).
[ ] Schema projection: buildSelectCols adapts to long-name vs short-name (COI/AVK)
    genetics columns, and falls back to NULL when neither exists.
[ ] Sex normalization, name keying, COI display helper.
```

### 12.2 Integration tests — real SQLite, real schema

Target: `PedigreeDatabase` / `queries.ts` against the fixture and against tiny
synthetic databases built per schema shape.

```
[ ] Opens the fixture read-only; an attempted write throws and the file is byte-identical.
[ ] getAnimal returns expected rows; ancestor counts are regression-locked to verified figures.
[ ] Linebreeding unique-ancestor counts match the verified figures at depths 3/5/10.
[ ] A synthetic SHORT-name (COI/AVK) DB and a LONG-name DB both read genetics correctly;
    a no-genetics DB degrades to null; a DB missing a required column throws a clear error.
```

### 12.3 End-to-end (packaged app) — intended

```
[ ] First launch picker → load → persist path; second launch reuses it.
[ ] Each tab renders for a selected dog; depth selectors behave per §7.2.
[ ] Importing a foundation list updates the Foundation report.
[ ] No hang on a circular pedigree; Print/PDF works.
```

### 12.4 Status

As of 2026-07-20 (app v1.2.0) the unit + integration layers are implemented and
green: **91 unit tests** across the modules above, including the new
`indentedTree.test.ts` (8 tests) and `chartExport.test.ts` (the pure PDF
page-planning and PNG pixel-ratio math), plus the integration suite; `tsc
--noEmit` is clean. (The v1.1 baseline was 71→83 unit tests.) The native
`better-sqlite3` integration tests must be re-run on the target Mac. The
end-to-end layer is intended, not yet built.


---

## Приложение A. История изменений (changelog)

- "2026-07-26 (v1.9) — Hypothetical Mating gains optional recessive DNA health-test columns (PRA-rcd4-C2orf71, SAMS-KCNJ10): the sire's/dam's results are shown on their cells in the projected chart, and a warn-only carrier×carrier (and Affected) recessive-risk check is added; absent/unreadable results never warn. Optional source-contract columns (§6.8/§8/§11)."
- "2026-07-26 (v1.8) — Hypothetical Mating: the projected-pedigree CHART is capped at 8 generations for legibility (the Pedigree tab's own max) (a deeper expand-all bracket is unreadable and cannot export to one page); the selected 3–10 depth still drives litter COI/AVK and the common-ancestor analysis, and the litter COI is computed over the full pedigree regardless (§5/§6.8/§11)."
- "2026-07-25 (v1.8) — New feature **Hypothetical Mating** (planning tab): projected pedigree of a selected existing dam × sire, litter COI/AVK, highlighted common ancestors, line-breeding classification vs the owner-provided 8-method reference (Appendix C), sex/age warnings (dam 1–8, sire 1–12, warn-only), PDF/PNG export, no DB writes. Requirements §1/§5/§6.8/§11/Appendix C; intake + change spec in the WCR change section (§1, §5, §6.8, §9, §11)."
- "2026-07-25 (v1.7) — Doc restructure: тело — только требования; полный changelog → это Приложение A; §8 implementation detail → Приложение B + companion-указатели; добавлен Entry-Point Contract role block."
- "2026-07-20 (v1.6) — App v1.2.0: the **PedigreeTree bracket tab is REPLACED by an Indented Tree report** — a BreedMate-style indented TEXT pedigree (subject at the left margin, sire block above / dam block below, 4-col indent per generation with `|` connectors; nodes labelled G0/G1/G2… · Name · Reg · DOB; summary header Sex/DOB/COI/AVK). Depth selector **5 / 10 / 20** (was 4–8). Uses DE-DUP traversal (each ancestor expanded once, repeats flagged `[repeat]`) at a raised cap `PEDIGREE_TREE_MAX_GENERATIONS = 20`, so a deep line-bred tree stays bounded as text. New **TXT** export in the Save… menu writes the on-screen text byte-identically. Pedigree, Linebreeding, Foundation tabs unchanged. Additive code: new `src/lib/indentedTree.ts`, `components/IndentedTree.tsx`, IPC `db:getPedigreeTree` + `file:saveText`; no pre-existing test changed (§1, §5, §6.3, §6.7, §7.2, §7.3, §11, §12)."
- "2026-06-29 (v1.5) — Doc split: design docs (this PRD + companions) are published in the repo under docs/ (renamed from agent_docs/). CLAUDE.md is kept private (git-ignored at repo root). The Task-to-Handoff Working Change Record (former §0), the compliance gap report, and test-run evidence live in the private dev-docs/pedigree-insights/ outside the repo. PRD restored to a clean product spec."
- "2026-06-29 (v1.4) — Conformed to the Setronica Task-to-Handoff standard via a Working Change Record + gap report (now kept in dev-docs/pedigree-insights/; see working-change-record.md and task-to-handoff-compliance.md). Honest handoff status: NOT ready pending owner review + remote/CI."
- "2026-06-14 — DB location: config-file-path → file picker on first launch, path saved to config (§6.1, §7.4)"
- "2026-06-14 — COI: fully out-of-scope → externally computed, displayed read-only if available (§4, §7.3, §9)"
- "2026-06-14 — Stack: Tauri default → Electron + better-sqlite3 confirmed (§8)"
- "2026-06-14 — Engineering blockers resolved via DogSampleData.db inspection — schema [DOCUMENTED] (§8, §10)"
- "2026-06-14 — Added §12 Automated testing strategy (unit / integration / end-to-end)"
- "2026-06-14 (v0.5) — Visual layout captured from reference render SNOWSHOES BOBBI AT LUELDAR 8G.png"
- "2026-06-25 (v1.0) — Forked PedigreePoint → PedigreeInsights for GitHub packaging (kept original in ../pedigree-point)"
- "2026-06-25 (v1.1) — Scope expanded from single viewer to FOUR report tabs: Pedigree, PedigreeTree, Linebreeding, Foundation (§5, §6)"
- "2026-06-25 (v1.1) — Bracket chart redesigned: subject lifted into a certificate-style header; generation column headers; cells grow to fit (no truncation); titles small/name prominent; repeated ancestors fully drawn; monochrome (§6.3)"
- "2026-06-25 (v1.1) — Depths: Pedigree/PedigreeTree 4–8; Linebreeding 4–20; Foundation all generations (§7.2)"
- "2026-06-25 (v1.1) — COI/AVK column name varies by BreedMate export (Inbreeding Coefficient/Relationship Coefficient vs COI/AVK); detected at connect time (§8, schema-map.md)"
- "2026-06-25 (v1.1) — Genetics policy refined: per-dog COI stays external/display-only; CONTRIBUTION % (Wright's ½^gen) is computed in-app for Foundation/Linebreeding, labelled a computed estimate (§7.3)"
- "2026-06-27 (v1.2) — Export reworked into a single **Save…** menu (extensible format picker) replacing the Print/PDF button. PDF is now rendered by the Electron MAIN process (printToPDF), because macOS ignores the CSS @page orientation under window.print(); charts export A4/A3 LANDSCAPE with the WHOLE bracket fit onto ONE page (A3 chosen when A4 would be unreadably small). New **PNG** export rasterizes the entire chart as one image with no page limit. Text reports export A4 portrait. (§5, §6.7, §8, §11)"
- "2026-06-27 (v1.2) — Export approach benchmarked against the external **PedigreePub** tool (its A3-when-too-wide + save-as-PNG workarounds); PNG pixel-ratio is clamped to the browser canvas limit with a user notice (§6.7)"
- "2026-06-27 (v1.3) — Linebreeding report completed to PedigreeOnline parity: **Blood %** (Wright's ½^gen contribution) and **Influence** (equivalent cross pair) are now COMPUTED in-app (structural estimates); rows RANKED by Blood % to surface top influencers; unique-ancestor denominator corrected to 2^(g+1)−2 (§6.4)"
- "2026-06-27 (v1.3) — Genetics policy REVERSED: COI/AGR/AVK are now COMPUTED IN-APP by a validated module (src/lib/genetics.ts), not an external script — the stored BreedMate COI proved unreliable. COI = Meuwissen & Luo (1992); AGR = Colleau (2002) indirect; AVK = ancestor-loss with BigInt denominator. Validated to machine precision vs the exact tabular method + hand pedigrees. Owner-approved 2026-06-27 (§4, §5, §7.3, §9)"
- "2026-06-27 (v1.3) — Pedigree CYCLES (a dog within its own ancestry; 19 found in the sample DB) are detected, broken for the math, and surfaced as a non-blocking warning listing offending dogs (break-and-warn, owner-confirmed default) (§6.4, §6.6)"
- "2026-06-27 (v1.3) — Repositioned as a SOURCE-AGNOSTIC pedigree-database analysis tool: documented the minimal Source database contract (mandatory table `Pedigree` + `Name`/`Sire`/`Dam`; the rest optional). BreedMate remains the primary tested format (§1, §8)"
- "2026-06-27 (v1.3) — Genetics use clarified per report: Linebreeding & Foundation always RECOMPUTE and IGNORE stored COI/AVK/AGR; Pedigree & PedigreeTree DISPLAY stored COI/AVK verbatim (no recompute) (§5, §7.3)"
- "2026-06-27 (v1.2) — UI: the 'Change…' database button renamed **'Open DB'** (§6.1)"
- "2026-06-27 (v1.2) — Hardening: **runtime validation** added at the IPC boundary in the main process (types vanish at runtime); **timing instrumentation** wraps the heavy reports to profile real durations before any worker-process isolation is considered (§8, §9)"
- "2026-06-27 (v1.2) — Refactor: export logic extracted into dedicated modules (src/lib/chartExport.ts, electron/main/export.ts, electron/main/validate.ts, components/SaveMenu.tsx); new dependency html-to-image (§8, file-structure.md)"

---

## Приложение B. Реализация — где смотреть

Продуктовые требования — выше. Инженерные детали (перенесены сюда из §8) и полные
описания живут в companion-доках репозитория `docs/`: `stack-decision.md`,
`schema-map.md`, `pedigree-algorithm.md`, `file-structure.md`, `open-items.md`;
рабочие правила — в `CLAUDE.md`.

### Инженерные заметки (перенесено из §8)

- **Read-before-build rules (CLAUDE.md):** column names are never assumed;
  recursion is always depth-limited and loop-guarded; new code is `[DRAFT]` until
  Yuliya's review.
- **Stack:** Electron + React + TypeScript; `better-sqlite3` opened **read-only**
  as the bridge (native module, in the main process only). The bracket charts are
  rendered with a CSS-grid table (not react-flow) so they stay dense and print
  predictably. Built with electron-vite; packaged with electron-builder.
- **Export:** PDF is produced in the main process via `webContents.printToPDF`
  (deterministic A4/A3 + landscape); PNG via **`html-to-image`** (added
  dependency) rasterizing the chart DOM. The renderer prepares the page/image
  (`src/lib/chartExport.ts`) and the main process writes the file
  (`electron/main/export.ts`); the format menu lives in `components/SaveMenu.tsx`.
- **IPC hardening:** TypeScript types are compile-time only, so the main process
  applies **runtime validation** at the IPC boundary (`electron/main/validate.ts`)
  — rejecting wrong-typed, out-of-range, or oversized payloads before they reach
  the database or filesystem. This is defensive robustness, not a security claim:
  the renderer never supplies file paths (those come from main-process dialogs)
  and the DB is read-only with parameterized queries.
- **Performance instrumentation:** the heavy reports (`getPedigree`,
  `getLinebreeding`, `getFoundation`) log their wall-clock duration (`[perf] …`).
  `better-sqlite3` is synchronous and runs in the main process, so this exists to
  measure real durations and decide *whether* any report ever needs moving to a
  worker/UtilityProcess — measurement first, not by default (§9).

---

## Приложение C. Linebreeding Strategy Reference (8 методов + outcross)

Справочник классификации родословной для Hypothetical Mating (IN-4, §6.8). Каждый
метод имеет детектируемую *сигнатуру*; классификация ведётся по родословной. Полные
разборы — в `project.breeding-blueprint`.

1. **Brackett "Rule of Five"** — concentrate one magnificent dog placed at the
   2nd + 3rd generations (a 2-3 or 3-2 cross; positions sum to 5). *Signature:*
   one ancestor doubled close-up as a grand/great-grandparent, ~18–25 % blood.
2. **Oppenheimer phenotype-first ("20 Principles")** — intense linebreeding
   *filtered* by physical type: only double an ancestor if both living partners
   actually show that ancestor's virtues (compensatory mating). *Signature:* not
   readable from paper alone — a selection philosophy; infer from breeder notes.
3. **Onstott "Doubling-Up"** — an ancestor counts as linebred only when doubled on
   *both* sire and dam sides, forcing homozygosity. *Signature:* the same pillar
   ancestors appear on both sides; the core mechanism of most real linebreeding.
4. **Clan / Quad-Pedigree (Lanting)** — kennel split into 4 branches each fixed for
   one structural piece, rotated. *Signature:* kennel-level; four internally
   linebred families crossed systematically.
5. **Tail-line matriarchal (Wycliffe / Jean Lyle)** — breed along the unbroken
   dam → granddam → great-granddam line; studs chosen only if their dam traces to
   the same foundation bitch. *Signature:* concentration down the bottom line of
   the pedigree.
6. **Three-in / one-out (Morgan)** — three generations of daughter-back-to-father
   backcross, then one unrelated outcross to restore vigour, then fold back in.
   *Signature:* repeated close backcrosses; the standalone outcross step = the
   "one-out."
7. **Half-sibling cross** — mate two dogs sharing one parent (usually paternal
   half-sibs); safe close cross, COI ~12.5 %, 25 % of the shared parent's genome
   concentrated. *Signature:* one shared parent, two different other-parents.
8. **Three-line family rotation** — closed pool split into 3 lines, rotated
   (M line1 × F line2 → F offspring × M line3 → back to line1). *Signature:*
   kennel-level closed-loop rotation preserving a family look with retained vigour.

**Outcross / line-cross (the "none of the above").** Two distinct lines joined over
only a shared *deep* foundation. *Signature:* very low pedigree COI that stays low
at depth, high AVK, broad founder base, closest doublings only 5+ generations back.
Not one of the 8, but the correct classification for a *paper* diversity / reset
animal — though DNA may still show high genomic homozygosity, and such a dog can
still be highly prepotent.

---

*Status: DRAFT — requires Yuliya's review. Forked from PedigreePoint 2026-06-25.
Engineering decisions remain governed by the companion docs and the
non-negotiable rules in CLAUDE.md.*
