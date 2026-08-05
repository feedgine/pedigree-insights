// indentedTree.ts — renders a PedigreeTreeNode as a classic indented ASCII
// "indented tree" (the Family Tree text export), plus a short summary header.
// This is the SINGLE SOURCE OF TRUTH for both the on-screen report and the
// .txt export, so what the user sees on screen is exactly what is written to
// file.
//
// Layout (reverse-engineered from a real BreedMate 8-generation export and
// verified against it): the subject sits at the left margin, its sire block is
// drawn above and its dam block below, indenting 4 columns per generation. A
// vertical '|' connector runs on the side of each node that faces the parent's
// spine — the dam side for an upper (sire) child, the sire side for a lower
// (dam) child; the root gets neither.
//
// Per Yuliya's spec (2026-07-20): each node is prefixed with its generation as
// G0 (subject), G1, G2 … in place of the championship titles; the summary
// block shows COI and AVK instead of Colour & Markings / Breeder.
//
// Pure logic (no DOM, no SQLite): safe to unit-test and to run in the renderer.
// [DRAFT — requires Yuliya's review] until confirmed working on the target Mac.

import type { PedigreeTreeNode } from './pedigreeAlgorithm';
import { pctFromFraction, pctFromPercent } from './schema';

/** Segments occupying one generation column (4 chars) in a line prefix. */
const BLANK = '    ';
const PIPE = '|   ';

/**
 * Format a stored DOB as M/D/YYYY to match the source export. Accepts an
 * ISO datetime ('YYYY-MM-DD…') or an already-US date; strips any time part.
 * Returns '' for a null/blank/unparseable value rather than inventing a date.
 */
export function formatDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const s = dob.trim();
  if (!s) return '';
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return `${Number(m)}/${Number(d)}/${y}`;
  }
  // Any other format: keep the date token, drop a trailing time if present.
  return s.split(/[ T]/)[0];
}

/**
 * One node's text: `G{gen} {name} {registration} ({dob})`. Titles are
 * intentionally omitted — the generation label replaces them (spec). An
 * unknown/missing ancestor renders as an empty string, i.e. a bare '+--',
 * exactly like the source export. A repeated (line-bred) ancestor is shown
 * once expanded elsewhere and marked '[repeat]' here so the reader knows its
 * ancestry is not re-drawn under this occurrence.
 */
export function nodeText(node: PedigreeTreeNode): string {
  const gen = `G${node.generation}`;
  const a = node.animal;
  if (!a) return ''; // unknown/foundation ancestor → blank slot
  const parts = [gen, a.name.trim()];
  const reg = a.registration?.trim();
  if (reg) parts.push(reg);
  let line = parts.join(' ');
  const dob = formatDob(a.dob);
  if (dob) line += ` (${dob})`;
  if (node.repeated) line += ' [repeat]';
  return line;
}

/**
 * Build the ASCII indented tree as an array of lines. Sire-first, in-order
 * (sire above, self, dam below). The connector logic is the classic sideways
 * binary-tree rule described in the file header.
 */
export function buildIndentedTree(root: PedigreeTreeNode): string[] {
  const lines: string[] = [];

  function render(
    node: PedigreeTreeNode,
    prefix: string,
    role: 'root' | 'sire' | 'dam'
  ): void {
    const sireSeg = role === 'dam' ? PIPE : BLANK;
    const damSeg = role === 'sire' ? PIPE : BLANK;

    if (node.sire) render(node.sire, prefix + sireSeg, 'sire');
    lines.push(`${prefix}+--${nodeText(node)}`);
    if (node.dam) render(node.dam, prefix + damSeg, 'dam');
  }

  render(root, '', 'root');
  return lines;
}


/**
 * The complete text report: summary header + blank line + indented tree.
 * `generations` is the depth the tree was built to, shown in the header.
 */
export function buildPedigreeText(
  root: PedigreeTreeNode,
  generations: number
): string {
  const a = root.animal;
  const name = a?.name.trim() || '(unknown)';

  const header = [
    '',
    `Pedigree of:  ${name}`,
    `Sex:  ${a?.sex ?? '—'}`,
    `Date of Birth:  ${formatDob(a?.dob ?? null)}`,
    `COI:  ${pctFromFraction(a?.coi ?? null)}`, // stored fraction → ×100
    `AVK:  ${pctFromPercent(a?.avk ?? null)}`, // stored percentage → raw (≤100%)
    `Generations:  ${generations}`,
    '',
  ];

  return header.concat(buildIndentedTree(root)).join('\n') + '\n';
}
