---
title: pedigree-algorithm
status: DRAFT — requires Yuliya's review; verified column names, untested on target Mac
source: rewritten from DogSampleData.db inspection (schema-map.md [DOCUMENTED])
updated: 2026-06-14
---

## Key change from v1.0

The original draft assumed integer foreign keys (`sireId → Animal.id`). The real
source schema has **no integer id**: the primary key is `Name` (TEXT), and
`Sire`/`Dam` store the parent's **Name string**. All traversal is therefore a
self-join on the Name column, not an id lookup. See schema-map.md "CRITICAL".

Bridge is `better-sqlite3` (synchronous, read-only) per stack-decision.md — code
below is synchronous, no async/await.

---

## Data model

```typescript
interface Animal {
  name: string;            // PRIMARY KEY (Pedigree.Name) — the identity
  sire: string | null;     // Pedigree.Sire — Name of sire, or null/'' if unknown
  dam: string | null;      // Pedigree.Dam  — Name of dam, or null/'' if unknown
  sex: 'M' | 'F' | null;   // normalized from raw 'M'/'F'/'m'/''/NULL
  dob: string | null;
  registration: string | null;
  breed: string | null;
  coi: number | null;      // Pedigree."Inbreeding Coefficient" — null if not computed
  avk: number | null;      // Pedigree."Relationship Coefficient" — null if not computed
}

// Column names contain spaces — always double-quote them in SQL.
const SELECT_COLS = `
  "Name"        AS name,
  "Sire"        AS sire,
  "Dam"         AS dam,
  "Sex"         AS sexRaw,
  "DOB"         AS dob,
  "Registration" AS registration,
  "Breed"       AS breed,
  "Inbreeding Coefficient"   AS coi,
  "Relationship Coefficient" AS avk
`;

// Sex is dirty in the source (M / F / m / '' / NULL) — normalize on read.
function normalizeSex(raw: string | null): 'M' | 'F' | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return s === 'M' || s === 'F' ? s : null;
}

// Name matching is exact text. Source names are mixed-case with stray
// whitespace, so normalize consistently on BOTH sides of every comparison.
function keyOf(name: string | null): string | null {
  const k = name?.trim();
  return k ? k : null;   // treat '' as "unknown parent"
}
```

---

## Lookup by name

```typescript
function getAnimal(db: Database, name: string): Animal | null {
  const row = db.prepare(
    `SELECT ${SELECT_COLS} FROM "Pedigree" WHERE "Name" = ? COLLATE NOCASE`
  ).get(name) as any;
  if (!row) return null;
  return { ...row, sex: normalizeSex(row.sexRaw) };
}
```

`COLLATE NOCASE` absorbs case differences between a stored `Sire`/`Dam` string and
the target `Name`. Whitespace is handled by `keyOf()` before the query. Because
`Name` is the unique PK, a match (if any) is exactly one row.

---

## Ancestor traversal (recursive, depth-limited, loop-guarded)

```typescript
// Product default is 3 generations, user-adjustable up to 13 (cap raised 2026-06-25; see open-items.md #8b) (spec §6.3/§7.2).
// maxGenerations is the hard cap the UI passes in; never unbounded.
function fetchAncestors(
  db: Database,
  startName: string,
  maxGenerations = 3
): Map<number, Animal[]> {
  const result = new Map<number, Animal[]>();
  const visited = new Set<string>();   // guards against Name cycles

  function traverse(name: string | null, generation: number): void {
    const key = keyOf(name);
    if (!key || generation > maxGenerations) return;

    // Cycle guard: a self-referential Name loop (data-entry error) would
    // otherwise recurse forever even within the depth limit.
    const cycleKey = key.toLowerCase();
    if (visited.has(cycleKey)) return;
    visited.add(cycleKey);

    const animal = getAnimal(db, key);
    if (!animal) return;   // foundation/unknown ancestor: no row of its own — stop

    const bucket = result.get(generation) ?? [];
    bucket.push(animal);
    result.set(generation, bucket);

    traverse(animal.sire, generation + 1);
    traverse(animal.dam, generation + 1);
  }

  traverse(startName, 0);
  return result;
}
```

**Two independent stop conditions, both required:**
1. `maxGenerations` depth limit (UI default 3, user-adjustable up to 13 (cap raised 2026-06-25; see open-items.md #8b) — spec
   §6.3/§7.2). The cap is always finite; the UI must clamp to ≤ 13 (raised from
   10 on 2026-06-25 for the Linebreeding report — open-items.md #8b).
2. `visited` set on Name — catches circular ancestry that the depth limit alone
   would not (e.g. an animal listed as its own grandsire).

~41 of 474 sample sires point at names with no row; that is expected (foundation
stock) and is handled by the `if (!animal) return` leaf case, not an error.

---

## Descendant traversal

```typescript
function fetchDescendants(
  db: Database,
  startName: string,
  maxGenerations = 3
): Map<number, Animal[]> {
  const result = new Map<number, Animal[]>();
  const visited = new Set<string>();

  const childStmt = db.prepare(
    `SELECT ${SELECT_COLS} FROM "Pedigree"
     WHERE "Sire" = ? COLLATE NOCASE OR "Dam" = ? COLLATE NOCASE`
  );

  function traverse(name: string, generation: number): void {
    if (generation > maxGenerations) return;
    const cycleKey = name.toLowerCase();
    if (visited.has(cycleKey)) return;
    visited.add(cycleKey);

    const offspring = (childStmt.all(name, name) as any[])
      .map(r => ({ ...r, sex: normalizeSex(r.sexRaw) })) as Animal[];
    if (!offspring.length) return;

    result.set(generation, (result.get(generation) ?? []).concat(offspring));
    for (const child of offspring) traverse(child.name, generation + 1);
  }

  traverse(startName, 1);
  return result;
}
```

Note: descendant search scans `Sire`/`Dam` text columns. If performance on the
full DB is poor, add indexes on `"Sire"` and `"Dam"` — but the app opens the file
**read-only**, so any index must be created by the external tooling, not in-app.

---

## COI / AVK — read, never compute

```typescript
// COI is computed by an external script (stack-decision.md, open-item #9).
// The app NEVER calculates it. It reads the stored value and shows it if present.
function coiDisplay(animal: Animal): string {
  return animal.coi == null ? 'Not available' : animal.coi.toFixed(2) + '%';
}
```

`Inbreeding Coefficient` and `Relationship Coefficient` are NULL throughout the
sample until the external script populates them. No in-app genetics logic exists,
so the CLAUDE.md canine-genetics validation gate applies to that script, not here.

---

## Validation checklist

```
[ ] Ancestor count for a test animal matches the source application's own pedigree view
[ ] Sire/Dam resolve by Name (spot-check a 3-generation chart against the source application)
[ ] Foundation ancestors (Sire/Dam with no matching row) render as leaf nodes, no error
[ ] No infinite loop on an animal whose Name appears in its own ancestry
[ ] Depth limit enforced at exactly maxGenerations (ancestors) / maxGenerations (descendants)
[ ] Mixed-case / whitespace names still match (COLLATE NOCASE + trim)
[ ] COI shows stored value when present, "Not available" when NULL — never computed in-app
```
