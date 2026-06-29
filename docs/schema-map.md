---
title: schema-map
status: DOCUMENTED
source: direct inspection of DogSampleData.db (BreedMate export)
confirmed: 2026-06-14
updated: 2026-06-27
verification: PRAGMA table_info against the sample .db — column names below are the real SQLite identifiers
sql_quoting: column names contain spaces, dots, slashes and a leading-underscore convention — always quote them (e.g. "Studbook No.")
---

## Source-agnostic note (2026-06-27)

The full column catalogue below documents the **BreedMate export** (the primary
tested format). The app itself is **source-agnostic** and depends on only a small
subset — the "Source database contract" (specification.md §8):

- **Mandatory:** a table named `Pedigree` with `Name`, `Sire`, `Dam` (TEXT;
  `Sire`/`Dam` hold the parent's `Name` string, not an integer id).
- **Optional:** Sex, DOB, Registration, PreTitle, PostTitle, Color, Breed, and the
  stored genetics columns `COI`/`AVK` (BreedMate long names also accepted) — each
  degrades to NULL/"—" if absent (`queries.ts` `buildSelectCols`).

Everything else in this file is BreedMate-specific reference, not a requirement.
The table name `Pedigree` and these column names are currently fixed in code; a
future mapping layer (roadmap §9) would let differently-named schemas connect.

---

> Note: the figures and full column catalogue below describe the original
> **BreedMate** export used to confirm the schema (632 rows). The DB **committed**
> to this repo (`tests/fixtures/DogSampleData.db`) is a smaller **synthetic** stand-in
> (~279 animals) that mirrors the same table set but is populated entirely with
> fictional fairy-tale characters and kennels — no personal data. See
> `tests/fixtures/README.md`.

## Primary table: `Pedigree`  (632 rows in sample)

| Column (exact) | Type | Purpose | Notes |
|---|---|---|---|
| `Name` | TEXT | **PRIMARY KEY** | Unique (632/632). This IS the identity — there is no integer id. |
| `Sire` | TEXT | Father | Stores the **Name string** of the sire, not an id. See CRITICAL note. |
| `Dam` | TEXT | Mother | Stores the **Name string** of the dam, not an id. See CRITICAL note. |
| `Sex` | TEXT | Sex | Dirty values: `M`, `F`, `m`, `''`, NULL — normalize on read. |
| `DOB` | datetime | Date of birth | |
| `Died Date` | datetime | Date of death | |
| `Registration` | TEXT | Registration number | |
| `Additional Reg No.` | TEXT | Secondary registration | |
| `Studbook No.` | TEXT | Studbook number | |
| `Inbreeding Coefficient` | REAL | **COI** | Display "COI". NULL in sample → populated by external script. **Export-dependent name — see "Genetics columns" below.** |
| `Relationship Coefficient` | REAL | **AVK** | Display "AVK". NULL in sample → external script. **Export-dependent name.** |
| `Breed` / `Variety` / `Color` | TEXT | Breed/variety/colour | |
| `Country of Origin` | TEXT | Country | |
| `Breeder` / `Owner` | TEXT | Breeder / owner | |
| `Call Name` / `PreTitle` / `PostTitle` | TEXT | Naming | |
| `Photo` / `HTML Photo` / `Photo #2..#4` | TEXT | Photos | path/reference (TEXT), not blob |
| `OFA` / `CERF` / `Hip Score` / `Eye Colour` / `Blood Type` / `Genotype` | TEXT | Health | |
| `User Field1..9` | TEXT | Custom fields | 9 columns |
| `Points` | REAL | Points | |
| `Comment` / `Notes` / `User Comment` | TEXT | Free text | |
| `Microchip` / `Tattoo` | TEXT | IDs | |
| `Hyperlink` / `Document` | TEXT | Links | |
| `Modified` / `Created` | datetime | Timestamps | |
| `Mark1` / `Mark2` / `_Marks` | INT | Internal flags | |

(Full column list: 62 columns — also Gd, Surveyor, Height, Register, Certifications,
Published Date, Imported, Cause of Death, User Email.)

---

## Genetics columns (COI / AVK) — name varies by BreedMate export (CONFIRMED 2026-06-25)

The two genetics fields are stored under **different column names** depending on
the BreedMate export:

| Field | Sample `DogSampleData.db` (632 rows) | Real `data/japanesespitz-2026.db` (37,601 rows) |
|---|---|---|
| COI | `Inbreeding Coefficient` | `COI` |
| AVK | `Relationship Coefficient` | `AVK` |

SQLite rejects the **entire** query if any selected column is absent, so the app
must NOT hard-code one spelling. The data layer reads `PRAGMA table_info("Pedigree")`
at connect time and selects whichever name exists (`Inbreeding Coefficient` → `COI`),
falling back to `NULL` if neither is present. Implemented in `src/lib/queries.ts`
(`buildSelectCols`) + `electron/main/database.ts`. Other observed differences
(non-blocking): the real DB also has `Tag` / `Ancestor Tags` and lacks
`Document` / `User Email` / `User Comment`; none are referenced by the app.

---

## CRITICAL — Sire/Dam are name strings, not foreign-key IDs

The primary key is `Name` (TEXT), and `Sire`/`Dam` hold the **Name** of the parent
as text. There is **no integer id** and **no declared foreign key**.

Verified: of 474 non-empty `Sire` values, 433 match an existing `Name`; the ~41
that don't are foundation/unknown ancestors not present as their own rows (normal —
the line simply ends there).

**Impact on the traversal algorithm:** the planned `sire_id → animals.id` row-ID
recursion does NOT apply. Traversal must self-join on the Name string
(`Pedigree.Sire = Pedigree.Name`). Implications to handle:
- Match on exact Name text — case/whitespace sensitivity matters (sample is mixed-case).
- A parent Name with no matching row = leaf/foundation ancestor; stop there gracefully.
- Name is unique (PK) so matches are deterministic for animals in the table.
- Depth limit still mandatory: a self-referential name loop would otherwise hang.

`pedigree-algorithm.md` needs updating to reflect name-based traversal.

---

## Other tables in the .db (relevant to feature scope #10)

`Litters`, `Heats/Mates`, `Puppy Records`, `Ownership`, `Contacts`, `Medical`,
`Vaccinations`, `Hips/Elbows`, `Breed Survey`, `Shows`, `Studbook`, `Expenses`,
`Reminders`, `Choices`, `Account`.

Lookup/system tables (leading underscore): `_Sex`, `_Color`, `_Country`, `_Club`,
`_Fields`, `_PreTitle`, `_PostTitle`, `_ShowName`, `_Properties`, `_Tables`,
`_Changes`, `_Replicate`, `_`.

---

## Pedigree-node display fields (from DogForms60.fmx "Family Tree" layout)

The BreedMate Family Tree template composes a node label from these tokens
(inspected 2026-06-14); mapping to the columns above:

| Template token | Column | Notes |
|---|---|---|
| `[Name]` | `Name` | registered name / PK |
| `[Titles]` | `PreTitle` | pre-name titles |
| `[Obedience]` | `PostTitle` | post-name / working titles (verify mapping) |
| `[Reg No.]` | `Registration` | |
| `[Colour]` | `Color` | |
| `[Imported]` | — | imported indicator |
| `F=[p~coi]` | `Inbreeding Coefficient` | subject node only; external value |
| `R=[p~cor]` | `Relationship Coefficient` | subject node only; external value |
| `{[p~lb]}` | — | line-breeding figure, computed externally |

Standard label: `[Titles] [Name] [Obedience] [Reg No.]`; deep generations fall
back to `[Name]` alone. See specification.md §6.3.

---

## Resolved open items

- Animals table name → `Pedigree` (CONFIRMED)
- Sire/Dam storage → TEXT Name string, self-referential by name (CONFIRMED)
- Duplicate COI/AVK in display → two real columns: `Inbreeding Coefficient` and
  `Relationship Coefficient` (CONFIRMED)
- Primary key → `Name` (TEXT), no integer id (CONFIRMED)
- Sex encoding → free-text M/F/m/empty/NULL, needs normalization (CONFIRMED)
- Photo storage → TEXT reference, not blob (CONFIRMED)
