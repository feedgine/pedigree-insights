// LinebreedingReport.tsx — tabular linebreeding report modelled on the
// PedigreeOnline "Linebreeding" view (reference: the Daesdaemar Sunset Blvd
// PDF). Lists every ancestor that appears more than once across the sire and
// dam sides, with the generation/line of each cross.
//
// Columns: Name · Crosses · # · Lines · Blood % · Influence · AGR · COI. The
// Name is shown WITHOUT championship titles (this is a numbers-focused report;
// titles add noise and width). Blood %/Influence are structural; COI/AGR/AVK are
// computed in-app (genetics engine) as a pre-report step — all computed
// estimates, labelled in the footnote.
//
// [DRAFT — requires Yuliya's review]
import React from 'react';
import type {
  AncestorCrosses,
  LinebreedingReport as Report,
} from '@/lib/linebreeding';
import { coiDisplay } from '@/lib/schema';

const MIN_CROSS_CHOICES = [2, 3, 4, 5];

/** Compact percent for table cells: an em dash when the (external) value is
 *  absent, so empty genetics slots read as "not yet provided", not "0%". */
function pct(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function Row({ a }: { a: AncestorCrosses }): React.ReactElement {
  const sexClass =
    a.animal.sex === 'M' ? 'lb-sex--M' : a.animal.sex === 'F' ? 'lb-sex--F' : 'lb-sex--U';
  return (
    <tr>
      <td className="lb-cell lb-cell--name">
        <span className={`lb-dot ${sexClass}`} aria-hidden="true" />
        {a.animal.name}
        {a.inFinalGeneration && (
          <span className="lb-star" title="Appears in the final generation of the report">
            {' '}*
          </span>
        )}
      </td>
      <td className="lb-cell lb-cell--stats">{a.notation}</td>
      <td className="lb-cell lb-cell--num">{a.crosses}</td>
      <td className="lb-cell lb-cell--num">
        {a.crosses} <span className="lb-split">({a.sireLines})({a.damLines})</span>
      </td>
      <td className="lb-cell lb-cell--num lb-cell--gen">{pct(a.bloodPercent)}</td>
      <td className="lb-cell lb-cell--num">{a.influence}</td>
      <td className="lb-cell lb-cell--num lb-cell--gen">{pct(a.agr)}</td>
      <td className="lb-cell lb-cell--num lb-cell--gen">{pct(a.coi)}</td>
    </tr>
  );
}

export default function LinebreedingReport({
  report,
  minCrosses,
  onMinCrossesChange,
}: {
  report: Report;
  minCrosses: number;
  onMinCrossesChange: (n: number) => void;
}): React.ReactElement {
  // Max distinct ancestor SLOTS across `generations` ancestor generations:
  // 2^1 + 2^2 + … + 2^g = 2^(g+1) − 2. (The previous 2^g − 1 counted a tree of
  // depth g INCLUDING the subject — about half the real denominator — which
  // doubled the displayed "% unique". PedigreeOnline uses 2^(g+1) − 1.)
  const total = 2 ** (report.generations + 1) - 2;
  const uniquePct =
    total > 0 ? ((report.uniqueAncestors / total) * 100).toFixed(2) : '0.00';

  return (
    <div className="lb">
      <div className="lb__head">
        <strong>Linebreeding statistics for {report.subject}</strong>
        {!report.found && <span className="lb__warn"> — dog not found</span>}
        <ul className="lb__stats">
          <li>
            {report.generations}-generation Coefficient of Inbreeding (COI):{' '}
            <strong>{coiDisplay(report.subjectCoi)}</strong>
            {report.subjectAvk != null && ` · AVK ${report.subjectAvk.toFixed(2)}%`}
          </li>
          <li>
            Unique ancestors in {report.generations} generations (
            {report.uniqueAncestors} / {total}) = {uniquePct}%
          </li>
          <li>Total crosses walked (incl. repeats): {report.totalCrosses}</li>
        </ul>

        {report.geneticsWarnings && report.geneticsWarnings.length > 0 && (
          <div className="lb__cycle-warn" role="alert">
            <strong>
              ⚠ {report.geneticsWarnings.length} pedigree cycle
              {report.geneticsWarnings.length === 1 ? '' : 's'} detected
            </strong>{' '}
            — a dog appears in its own ancestry (a data error). These edges were
            broken so COI/AGR could still be computed; please correct the data:
            <ul className="lb__cycle-list">
              {report.geneticsWarnings.map((w, i) => (
                <li key={i}>
                  <strong>{w.child}</strong> — {w.relation} = {w.parent} (already an
                  ancestor)
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="lb__note">
          Crosses, Lines, Blood % and Influence are structural. Blood % is Wright's
          ½^generation contribution and Influence is its equivalent-cross
          restatement; rows are ranked by Blood % to surface top influencers. COI
          (Meuwissen-Luo), AGR (Colleau) and AVK (ancestor-loss) are computed
          in-app from the full pedigree as a pre-report step — all computed
          estimates, distinct quantities. An em dash (—) means not yet computed.
        </p>
      </div>

      <div className="lb__controls">
        <label className="depth">
          Min crosses:
          <select
            value={minCrosses}
            onChange={(e) => onMinCrossesChange(Number(e.target.value))}
          >
            {MIN_CROSS_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="lb__count">
          {report.ancestors.length} repeated ancestor
          {report.ancestors.length === 1 ? '' : 's'}
        </span>
      </div>

      {report.ancestors.length === 0 ? (
        <div className="empty-stage">
          No ancestor appears at least {minCrosses} times within{' '}
          {report.generations} generations.
        </div>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th className="lb-cell lb-cell--name">Name</th>
              <th className="lb-cell lb-cell--stats" title="Generation + side of each appearance (S = sire side, D = dam side; case = sex)">
                Crosses
              </th>
              <th className="lb-cell lb-cell--num">#</th>
              <th className="lb-cell lb-cell--num" title="Total (sire-side)(dam-side)">
                Lines
              </th>
              <th className="lb-cell lb-cell--num lb-cell--gen" title="Genetic blood contribution to the subject = Σ ½^generation over its crosses — a computed estimate (rows are ranked by this)">
                Blood %
              </th>
              <th className="lb-cell lb-cell--num" title="Influence — the equivalent cross pair (n×n / n×(n+1)) representing the Blood % contribution; '< 7x7' below the 7×7 floor">
                Influence
              </th>
              <th className="lb-cell lb-cell--num lb-cell--gen" title="Additive Genetic Relationship subject↔ancestor (Colleau's indirect method) — computed in-app from the full pedigree">
                AGR
              </th>
              <th className="lb-cell lb-cell--num lb-cell--gen" title="Ancestor's own Coefficient of Inbreeding (Meuwissen-Luo) — computed in-app from the full pedigree">
                COI
              </th>
            </tr>
          </thead>
          <tbody>
            {report.ancestors.map((a) => (
              <Row key={a.name} a={a} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
