// PedigreeTable.tsx — compact bracket-grid pedigree, modelled on the BreedMate
// "Family Tree" A4 layout (reference: SNOWSHOES BOBBI AT LUELDAR 8G.png).
// Generations are columns (subject far left, ancestors fanning right); each
// ancestor cell spans the rows of its subtree, producing the classic bracket.
// Monochrome by request: white cells, grey borders, black text — no sex colour.
//
// Implemented with CSS grid + rowspan-style placement rather than react-flow,
// so it stays dense and prints/scrolls like a table.
import React, { useMemo } from 'react';
import type { PedigreeTreeNode } from '@/lib/pedigreeAlgorithm';
import { maxDepth, buildGrid, type GridCell } from '@/lib/tableLayout';
import { nodeLabel, type Animal } from '@/lib/schema';
import { computeLineColors } from '@/lib/lineColors';

const ROW_H = 40; // MINIMUM px per leaf row; rows grow to fit content (see grid)
const COL_W = 210; // px per generation column (fixed, like the Finnish KC layout)

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

/** The subject shown as a header block ABOVE the ancestor grid (certificate
 *  style), so the grid itself starts at the Parents column. */
function SubjectHeader({
  animal,
  variant,
}: {
  animal: Animal | null;
  variant: PedigreeVariant;
}): React.ReactElement | null {
  if (!animal) return null;
  const facts: [string, string | null][] = [
    ['Date of Birth', animal.dob ? animal.dob.slice(0, 10) : null],
    ['Sex', animal.sex],
    ['Breed', animal.breed],
    ['Reg No.', animal.registration],
    ['Color', animal.color],
    // COI is a stored fraction → ×100; AVK is already a percentage → shown raw.
    ['COI', animal.coi == null ? null : `${(animal.coi * 100).toFixed(2)}%`],
    ['AVK', animal.avk == null ? null : `${animal.avk.toFixed(2)}%`],
  ];
  return (
    <div className="ptsubject">
      <div className="ptsubject__head">
        <span className="ptsubject__label">
          {variant === 'tree' ? 'Pedigree tree of:' : 'Pedigree of:'}
        </span>
        <span className="ptsubject__name">{nodeLabel(animal)}</span>
      </div>
      <div className="ptsubject__facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="ptsubject__fact">
              <span className="ptsubject__k">{k}:</span> {v}
            </div>
          ))}
      </div>
    </div>
  );
}

function Cell({
  cell,
  variant,
  colors,
  parentHealth = false,
}: {
  cell: GridCell;
  variant: PedigreeVariant;
  colors: Map<string, string>;
  parentHealth?: boolean;
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
}: {
  tree: PedigreeTreeNode;
  variant?: PedigreeVariant;
  parentHealth?: boolean;
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
  const colTemplate = `repeat(${depth}, ${COL_W}px)`;
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
      <SubjectHeader animal={tree.animal} variant={variant} />
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
            <Cell key={c.key} cell={c} variant={variant} colors={colors} parentHealth={parentHealth} />
          ))}
        </div>
      </div>
    </div>
  );
}
