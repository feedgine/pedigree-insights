# Test fixtures

## `DogSampleData.db`

A **synthetic** pedigree database used by the integration tests
(`tests/integration/database.test.ts`). It mirrors the shape of a real source
export but contains **no real or personal data** — every person is a fairy-tale
character, every kennel is fictional, all emails are `@example.com`, all phone
numbers are `555-01xx`, and addresses are storybook ("12 Beanstalk Lane").

- **`Pedigree`** — ~279 animals, shaped to the *source database contract*
  (`Name`, `Sire`, `Dam` + optional `Sex`, `DOB`, `Registration`,
  `PreTitle`/`PostTitle`, `Color`, `Breed`, `Owner`, `Breeder`, `Country of Origin`;
  the long-name genetics columns `Inbreeding Coefficient` / `Relationship
  Coefficient` are left NULL). The cast is fairy-tale personages + exotic animals
  (e.g. `Avalon Cinderella`, `Camelot Merlin`, `Mistmoor SnowWhite`); realm prefixes
  repeat so name search has multiple hits.
- **Ancillary tables** — `Contacts`, `Ownership`, `Medical`, `Account`, `Litters`,
  `Puppy Records`, `Vaccinations`, `Hips/Elbows`, `Studbook`, `Shows`,
  `Heats/Mates`, `Reminders`, `Expenses`, `Breed Survey`, `Choices` — recreated with
  the real source column shapes and filled with a few invented rows each, so the
  fixture demonstrates a realistic, full pedigree database without exposing anyone.
- The graph is deliberately structured: the top three generations are fully known
  and distinct; deeper generations include line-breeding (repeated ancestors) and
  unknown/foundation ancestors (so some lines end early). This exercises the
  ancestor-count, de-duplication, linebreeding, and empty-leaf code paths.
- Regression counts in the integration test (ancestor totals, per-generation
  counts, linebreeding unique-ancestor counts) are locked to this fixture.

## Manual check after setup

Open the app, point it at this `DogSampleData.db`, and try these:

- **Subject to look up:** `Avalon Cinderella` (female). Sire `Hollowfen Quetzal`,
  dam `Avalon Cockatrice`. Search also works case-insensitively and on the prefix
  `Avalon` (multiple hits).
- **Pedigree / PedigreeTree tabs:** the bracket chart should fill (depth 4–8);
  some deep boxes are empty (unknown foundation ancestors) — that's expected.
- **Linebreeding tab:** strongly line-bred — top repeated ancestors include
  `Mistmoor SnowWhite`, `Avalon Roc`, `Tortuga Okapi`, plus the legends
  `Camelot Merlin` and `Faewood Titania`.
- **Foundation tab:** import `foundation-sample.txt` (in this folder) — all five
  foundation animals should be reported present, with a contribution % each.

## `foundation-sample.txt`

A ready-made foundation list (one name per line) for the Foundation report, using
animals that sit behind `Avalon Cinderella`:
`Camelot Merlin`, `Faewood Titania`, `Mistmoor SnowWhite`, `Avalon Roc`,
`Tortuga Okapi`.

---

The filename is kept as `DogSampleData.db` for continuity with the docs; it is a
synthetic stand-in, **not** the original vendor sample database (which carried
real contact records and is never committed). The full source schema is
documented in `docs/schema-map.md`.
