# Releasing PedigreeInsights

How to cut a release. Two lessons are baked in here: **don't create a branch you
don't need**, and **never miss the version bump** (the in-app header and the git
tag both come from it).

## The model

- **The version lives in ONE place — `package.json`.** It is injected into the app
  as the compile-time constant `__APP_VERSION__` (shown in the header) and the git
  tag mirrors it (`v1.4.0`). Never hand-edit the version — always use `npm version`
  (or the `release:*` scripts below), which bumps `package.json` +
  `package-lock.json`, makes the release commit, AND creates the matching tag in one
  step, so the three can never drift apart.
- **Work on `main` by default.** This is a single-maintainer repo — commit straight
  to `main`. A short-lived feature branch + PR is *optional*, only worth it for a
  large or risky change you want to review as a diff before it lands. (The branch we
  made for Hypothetical Mating was not necessary and just added merge steps.)

## Which bump? (semver)

- **patch** (1.4.0 → 1.4.1) — bug fix or small internal change; no new capability.
- **minor** (1.4.0 → 1.5.0) — a new backward-compatible feature (e.g. a new report/tab).
- **major** (1.4.0 → 2.0.0) — a breaking change (removed/renamed user-facing
  behaviour, or a changed config / source-DB contract).

Docs-only or internal-only changes: just commit them — **no** version bump.

## The steps (normal release)

1. **Test locally first — commit only after you are happy** (agreed order):
   ```bash
   npm run dev
   ```
   While you work the header shows the version plus a **git build marker** — e.g.
   `v1.4.0 · v1.4.0-2-ga1b2c3d-dirty` (2 commits past the 1.4.0 tag, uncommitted
   changes present) — so a dev/WIP build is never mistaken for the released version.
   A clean release build shows just `vX.Y.Z` with no marker. Restart `npm run dev`
   after any version change; the version is baked in at start.
2. Commit your changes to `main`:
   ```bash
   git add -A
   git commit -m "feat: ..."
   ```
3. Release in one command — bump + commit + tag + push:
   ```bash
   npm run release:minor          # or release:patch / release:major
   ```
   This runs `npm version <level>` (which first runs the `preversion` typecheck +
   unit-test gate), then `git push origin main --follow-tags`. Before a real
   release also `npm run build` (and `npm test` for the native integration suite)
   on the Mac.

Done: `git tag` shows the new `vX.Y.Z`, GitHub `main` + the tag are updated, and the
app header shows the new version (restart `npm run dev` if it's running — the version
is baked in at start).

## By hand (if you don't use the scripts)

```bash
git add -A && git commit -m "..."
npm version minor -m "release: v%s — <summary>"   # bumps files, commits, tags vX.Y.Z
git push origin main --follow-tags
```

## Gotchas (learned the hard way)

- **zsh has no comments interactively.** Don't paste a command with a trailing
  `# ...` comment — zsh passes `#` as an argument (that's what broke
  `git merge feat/... # fast-forward`). Put comments on their own line, or omit them.
- **Tags aren't pushed by default.** Use `--follow-tags` (the `release:*` scripts do).
  Without it the `vX.Y.Z` tag stays local and GitHub never sees it.
- **The dev server caches the version.** `__APP_VERSION__` is set at build start;
  restart `npm run dev` after a bump to see the new number.
- **`npm version` needs a clean tree.** Commit your changes first, then release.
- **`git branch -d` only deletes a merged branch** (a safety check). If you truly
  want to drop an unmerged branch, that's `-D`.
