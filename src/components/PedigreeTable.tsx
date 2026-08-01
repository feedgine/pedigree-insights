// PedigreeTable.tsx — compact bracket-grid pedigree, modelled on the BreedMate
// "Family Tree" A4 layout (reference: SNOWSHOES BOBBI AT LUELDAR 8G.png).
// Generations are columns (subject far left, ancestors fanning right); each
// ancestor cell spans the rows of its subtree, producing the classic bracket.
// Monochrome by request: white cells, grey borders, black text — no sex colour.
//
// Implemented with CSS grid + rowspan-style placement rather than react-flow,
// so it stays dense and prints/scrolls like a table.
import React, { useEffect, useMemo, useState } from 'react';
import type { PedigreeTreeNode } from '@/lib/pedigreeAlgorithm';
import { maxDepth, buildGrid, type GridCell } from '@/lib/tableLayout';
import {
  nodeLabel,
  formatDmy,
  todayDmy,
  pctFromFraction,
  pctFromPercent,
  type Animal,
} from '@/lib/schema';
import { computeLineColors } from '@/lib/lineColors';

const ROW_H = 40; // MINIMUM px per leaf row; rows grow to fit content (see grid)
const COL_W = 210; // px per generation column (fixed, like the Finnish KC layout)

// The deepest (last) column shows the NAME ONLY and is sized to the longest name
// (+1 character of slack). We measure that width once and apply the SAME explicit
// px track to BOTH the generation-header grid and the body grid, so the header
// stays aligned with the column (two independent `max-content` tracks would not).
// Font must match `.ptcell__main` (700 12.5px) on the app's base family.
const NAME_FONT = "700 12.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
let _measureCtx: CanvasRenderingContext2D | null | undefined;
function nameMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx !== undefined) return _measureCtx;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) ctx.font = NAME_FONT;
    _measureCtx = ctx;
  } catch {
    _measureCtx = null;
  }
  return _measureCtx;
}
/** Px width for the name-only last column: longest name + 1 char + cell padding. */
function lastColumnWidth(names: string[]): number {
  const PAD = 16; // cell left+right padding (7+7) + 1px right border + slack
  const ctx = nameMeasureCtx();
  if (!ctx) {
    // No canvas (e.g. non-DOM env): rough monospace-ish estimate.
    const longest = names.reduce((m, n) => Math.max(m, n.length), 0);
    return Math.ceil((longest + 1) * 7.6) + PAD;
  }
  let textW = 0;
  for (const n of names) textW = Math.max(textW, ctx.measureText(n).width);
  const oneChar = ctx.measureText('N').width; // "+1 character" of slack
  return Math.ceil(textW + oneChar) + PAD;
}

/** Two layouts of the same bracket grid:
 *  - 'pedigree': Titles + Name, with DOB / Reg detail (no COI/AVK).
 *  - 'tree':     Name only (no titles), with COI · AVK detail on every cell. */
export type PedigreeVariant = 'pedigree' | 'tree';

// Stored COI is a FRACTION in [0,1] (0.19 = 19%) → ×100 for the percentage.
function fmtCoi(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}
// Stored AVK is ALREADY a percentage in [0,100] (≤100% by definition) → shown raw.
function fmtAvk(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

/** Column header label for a generation: Parents, Grandparents, G Grandparents… */
function genLabel(gen: number): string {
  if (gen === 1) return 'Parents';
  if (gen === 2) return 'Grandparents';
  return `${'G '.repeat(gen - 2).trim()} Grandparents`;
}

/** The subject's photo. The DB `Photo` value is a non-portable absolute path from
 *  the editing machine, so main reads only its filename, relative to the open db
 *  (`<db-folder>/Photos/<file>`), and returns a data: URL. No photo → empty space;
 *  a path that can't be read → a neutral placeholder box. */
function SubjectPhoto({ photo }: { photo: string | null | undefined }): React.ReactElement {
  const value = photo?.trim() ?? '';
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    if (!value || !window.api?.getPhoto) return;
    window.api.getPhoto(value).then(
      (url) => {
        if (!alive) return;
        if (url) setSrc(url);
        else setFailed(true);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [value]);

  if (!value) return <div className="ptcard__photo ptcard__photo--empty" />;
  if (src) {
    return (
      <div className="ptcard__photo">
        <img className="ptcard__img" src={src} alt="" />
      </div>
    );
  }
  return (
    <div className="ptcard__photo ptcard__photo--ph">
      {failed && <span className="ptcard__phnote">no photo</span>}
    </div>
  );
}

/** The expanded subject card ABOVE the ancestor grid: a `JSF / {version} Edition`
 *  banner, then two columns (left: name, Reg·Sex, photo; right: pet name, DOB·DOD,
 *  pre-titles, genetics/health, breeder·country), then a footer rule with the
 *  generation date (the DB can change, so the printout is stamped). The pedigree
 *  grid below is unchanged. Rows render only when their value is present. */
function SubjectHeader({
  animal,
  bodyOverride,
}: {
  animal: Animal | null;
  /** When provided, replaces the animal two-column body (e.g. the Hypothetical
   *  Mating tab supplies a litter-specific body). The JSF banner and the
   *  "Generated" footer are kept, so every card reads consistently. */
  bodyOverride?: React.ReactNode;
}): React.ReactElement | null {
  if (!animal) return null;
  const sexLabel = animal.sex === 'M' ? 'Male' : animal.sex === 'F' ? 'Female' : null;
  const born = formatDmy(animal.dob);
  const died = formatDmy(animal.diedDate);
  const pre = animal.preTitle?.trim();
  const breeder = animal.breeder?.trim();
  const country = animal.country?.trim();
  // COI is a stored fraction (×100); AVK is already a percentage (raw) — keep the
  // documented scales distinct.
  const genetics = [
    animal.coi != null ? `COI ${pctFromFraction(animal.coi, 1)}` : null,
    animal.avk != null ? `AVK ${pctFromPercent(animal.avk, 1)}` : null,
    animal.praRcd4C2orf71?.trim() ? `PRA ${animal.praRcd4C2orf71.trim()}` : null,
    animal.samsKcnj10?.trim() ? `SAMS ${animal.samsKcnj10.trim()}` : null,
    animal.ofa?.trim() ? `OFA ${animal.ofa.trim()}` : null,
    animal.cerf?.trim() ? `CERF ${animal.cerf.trim()}` : null,
    animal.hipScore?.trim() ? `Hips ${animal.hipScore.trim()}` : null,
    animal.eyeColour?.trim() ? `Eye ${animal.eyeColour.trim()}` : null,
    animal.bloodType?.trim() ? `Blood ${animal.bloodType.trim()}` : null,
    animal.genotype?.trim() ? `Genotype ${animal.genotype.trim()}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="ptcard">
      <div className="ptcard__top">
        <span className="ptcard__brand">JSF</span>
        <span className="ptcard__edition">{__APP_VERSION__} Edition</span>
      </div>
      {bodyOverride ?? (
      <div className="ptcard__body">
        <div className="ptcard__left">
          <div className="ptcard__name">{animal.name}</div>
          <SubjectPhoto photo={animal.photo} />
        </div>
        <div className="ptcard__right">
          {animal.callName?.trim() && (
            <div className="ptcard__row">
              <span className="ptcard__k">Pet name:</span> {animal.callName.trim()}
            </div>
          )}
          {born && (
            <div className="ptcard__row">
              <span className="ptcard__k">Born:</span> {born}
            </div>
          )}
          {animal.registration && (
            <div className="ptcard__row">
              <span className="ptcard__k">Reg No:</span> {animal.registration}
            </div>
          )}
          {sexLabel && (
            <div className="ptcard__row">
              <span className="ptcard__k">Sex:</span> {sexLabel}
            </div>
          )}
          {died && (
            <div className="ptcard__row">
              <span className="ptcard__k">Died:</span> {died}
            </div>
          )}
          {pre && (
            <div className="ptcard__row">
              <span className="ptcard__k">Titles:</span> {pre}
            </div>
          )}
          {genetics.length > 0 && <div className="ptcard__genetics">{genetics.join(' · ')}</div>}
          {breeder && (
            <div className="ptcard__row">
              <span className="ptcard__k">Breeder:</span> {breeder}
            </div>
          )}
          {country && (
            <div className="ptcard__row">
              <span className="ptcard__k">Country of Origin:</span> {country}
            </div>
          )}
        </div>
      </div>
      )}
      <div className="ptcard__foot">
        <span className="ptcard__gen">Generated {todayDmy()}</span>
      </div>
    </div>
  );
}

function Cell({
  cell,
  variant,
  colors,
  parentHealth = false,
  isLast = false,
}: {
  cell: GridCell;
  variant: PedigreeVariant;
  colors: Map<string, string>;
  parentHealth?: boolean;
  /** True for the deepest generation column: render name only, on one line;
   *  the column is sized to the longest name (see PedigreeTable grid template). */
  isLast?: boolean;
}): React.ReactElement {
  const { node } = cell;

  const style: React.CSSProperties = {
    // Ancestor cells only (the subject column is rendered as a header), so a
    // generation-N cell sits in grid column N.
    gridColumn: cell.col,
    gridRow: `${cell.rowStart + 1} / span ${cell.rowSpan}`,
  };

  // Filler slot (no ancestor at all) — blank bordered box keeps the grid solid.
  if (!node) {
    return <div className="ptcell ptcell--filler" style={style} />;
  }

  // Known dog whose parent is unknown: an explicit "unknown parent" marker.
  if (!node.animal) {
    return (
      <div className="ptcell ptcell--empty" style={style}>
        <span className="ptcell__unknown">—</span>
      </div>
    );
  }

  const a = node.animal;
  const showTitles = variant === 'pedigree';
  const fullLabel = showTitles ? nodeLabel(a) : a.name; // hover tooltip

  // Repeated ancestors get a line-family tint; dogs appearing once stay white.
  const tint = colors.get(a.name.trim().toLowerCase());
  if (tint) style.background = tint;

  // DNA health markers (Hypothetical Mating only): shown on the parent cells.
  const healthLine = [
    a.praRcd4C2orf71?.trim() ? `PRA ${a.praRcd4C2orf71.trim()}` : '',
    a.samsKcnj10?.trim() ? `SAMS ${a.samsKcnj10.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const showHealth = parentHealth && node.generation === 1 && healthLine !== '';

  // Deepest generation column: name only (no titles / reg / dob), one line; the
  // cycle marker ↺ is kept as a data-integrity flag. The column width is sized to
  // the longest name via `max-content` in the grid template (+1ch of slack in CSS),
  // so the single-line name never truncates.
  if (isLast) {
    return (
      <div className={`ptcell ptcell--last${tint ? ' ptcell--lined' : ''}`} style={style}>
        <div className="ptcell__main ptcell__main--nowrap" title={fullLabel}>
          {a.name}
          {node.repeated && <span className="ptcell__repeat" title="Ancestry loop (data)"> ↺</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`ptcell${tint ? ' ptcell--lined' : ''}`} style={style}>
      {/* Titles render small & muted on their own line(s); the Name always
          starts on a fresh line and stays prominent. The cell grows vertically
          (see grid rows) so nothing is clipped. */}
      {showTitles && a.preTitle?.trim() && (
        <div className="ptcell__titles">{a.preTitle.trim()}</div>
      )}
      <div className="ptcell__main" title={fullLabel}>
        {a.name}
        {showTitles && a.postTitle?.trim() && (
          <span className="ptcell__titles ptcell__titles--post"> {a.postTitle.trim()}</span>
        )}
        {node.repeated && <span className="ptcell__repeat" title="Ancestry loop (data)"> ↺</span>}
      </div>
      {/* Secondary info, smaller font; wraps to multiple lines when a dog has
          several registration numbers. */}
      {variant === 'pedigree' ? (
        <>
          {a.registration && <div className="ptcell__meta">Reg {a.registration}</div>}
          {a.dob && <div className="ptcell__meta">{a.dob.slice(0, 10)}</div>}
          {showHealth && <div className="ptcell__meta ptcell__health">{healthLine}</div>}
        </>
      ) : (
        <div className="ptcell__meta">
          COI {fmtCoi(a.coi)} · AVK {fmtAvk(a.avk)}
        </div>
      )}
    </div>
  );
}

export default function PedigreeTable({
  tree,
  variant = 'pedigree',
  parentHealth = false,
  cardBody,
}: {
  tree: PedigreeTreeNode;
  variant?: PedigreeVariant;
  parentHealth?: boolean;
  /** Optional replacement body for the subject card (see SubjectHeader). */
  cardBody?: React.ReactNode;
}): React.ReactElement {
  const { cells, depth } = useMemo(() => {
    const d = maxDepth(tree);
    return { cells: buildGrid(tree, d), depth: d };
  }, [tree]);

  // Line-family tints for repeated ancestors (close shades per line of descent).
  const colors = useMemo(() => computeLineColors(tree), [tree]);

  const rows = 2 ** depth;
  // Grid covers the ancestor columns only (generations 1..depth); the subject is
  // a separate header above.
  // Every column is a fixed COL_W, EXCEPT the deepest (last) one, which is sized to
  // the longest NAME (+1 char). The width is an explicit px so the header grid and
  // the body grid share the exact same last track and stay aligned.
  const lastColW = useMemo(() => {
    const names = cells
      .filter((c) => c.col === depth && c.node?.animal)
      .map((c) => c.node!.animal!.name);
    return names.length ? lastColumnWidth(names) : COL_W;
  }, [cells, depth]);
  const colTemplate =
    depth <= 1
      ? `${lastColW}px`
      : `repeat(${depth - 1}, ${COL_W}px) ${lastColW}px`;
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: colTemplate,
    // Rows grow to fit their content (min ROW_H): a deep cell with a long title
    // string makes its leaf row taller, and every cell spanning that row grows
    // with it — so names are never clipped (Finnish-KC-style layout).
    gridTemplateRows: `repeat(${rows}, minmax(${ROW_H}px, auto))`,
  };

  const ancestorCells = cells.filter((c) => c.col > 0);

  return (
    <div className="pttable">
      <SubjectHeader animal={tree.animal} bodyOverride={cardBody} />
      <div className="ptgrid">
        <div className="ptgenhead" style={{ gridTemplateColumns: colTemplate }}>
          {Array.from({ length: depth }, (_, i) => (
            <div key={i} className="ptgenhead__cell">
              {genLabel(i + 1)}
            </div>
          ))}
        </div>
        <div className="pttable__grid" style={gridStyle}>
          {ancestorCells.map((c) => (
            <Cell key={c.key} cell={c} variant={variant} colors={colors} parentHealth={parentHealth} isLast={c.col === depth} />
          ))}
        </div>
      </div>
    </div>
  );
}
