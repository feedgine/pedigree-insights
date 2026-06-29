---
title: open-items
note: Check this file before starting any implementation task.
updated: 2026-06-14
---

## Blocking — cannot implement until resolved

| # | Item | Blocks | Resolve by |
|---|---|---|---|
_(none — all blocking items resolved 2026-06-14 via DogSampleData.db inspection)_

## Non-blocking — decide before that feature is built

_(none open — see Resolved below)_

## Resolved

| # | Item | Resolution | Date |
|---|---|---|---|
| 6 | Target Mac architecture | Apple Silicon (arm64) only for MVP; Universal deferred | 2026-06-14 |
| 8 | Default generation depth | 3 by default, adjustable up to 10 (spec §7.2) | 2026-06-14 |
| 8b | Max generation cap raised 10→13 | To support the Linebreeding report at PedigreeOnline's default depth. MAX_GENERATIONS_CAP = 13; default depth unchanged (3). Per-call cycle guard + finite cap keep deep traversals bounded. | 2026-06-25 |
| 1 | Animals table name | `Pedigree` (632 rows in sample) | 2026-06-14 |
| 2 | Sire/Dam linkage | TEXT **Name strings**, self-join on Name — NOT integer FK | 2026-06-14 |
| 10 | Other tables | Litters, Heats/Mates, Medical, Hips/Elbows, Studbook, Contacts, Shows, etc. (see schema-map) | 2026-06-14 |
| 3 | .db file path on Yuliya's Mac | File picker on first launch; last path saved to config (also resolves #7) | 2026-06-14 |
| 4 | Desktop framework | Electron + better-sqlite3 | 2026-06-14 |
| 5 | Write access scope | Read-only | 2026-06-14 |
| 7 | DB file path strategy | File picker (folded into #3) | 2026-06-14 |
| 9 | COI display | Value computed by external script; app shows it if available, else "not available" | 2026-06-14 |
| 11 | COI/AVK column naming varies by export | Detect at connect time; sample uses "Inbreeding Coefficient"/"Relationship Coefficient", real exports use "COI"/"AVK". buildSelectCols adapts; missing → NULL. (schema-map.md) | 2026-06-25 |
| 12 | Fork → PedigreeInsights | Forked from PedigreePoint into ./pedigree-insights for GitHub packaging. Four tabs: Pedigree, PedigreeTree, Linebreeding, Foundation. | 2026-06-25 |
| 13 | Linebreeding depth | Own cap LINEBREEDING_MAX_GENERATIONS = 20 (selector 4–20). Per-path cross enumeration is feasible/meaningful to ~20 gens; measured on the 37k-dog DB it explodes beyond (≈13 B crosses @50 gens, ≈1e33 "all"). | 2026-06-25 |
| 14 | Foundation / deep contribution | Memoized layered DP (contribution.ts) computes blood contribution + presence across "all generations" in ms (CONTRIBUTION_MAX_GENERATIONS = 64 safety cap; lines run out far sooner, cap only guards cycles). Verified on real DB: parents = 50%, grandparents = 25%. | 2026-06-25 |
| 15 | Contribution % vs COI gate | Owner-approved 2026-06-25: contribution % (Wright's ½^gen) IS computed in-app for Foundation/Linebreeding, labelled a computed estimate. The COI gate (external, validated) is unchanged and still applies to a dog's own inbreeding coefficient. | 2026-06-25 |
