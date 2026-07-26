// HypotheticalMatingReport.tsx — presentation for the Hypothetical Mating tab
// (PRD §6.8). Order: a compact header (parents, litter COI/AVK, warn-only checks)
// → the projected pedigree bracket chart → the common-ancestor list → the
// line-breeding pattern classification → a footnote. Common ancestors are
// colour-coded in the chart (via computeLineColors, as in PedigreeTable); the same
// swatches key the list so the reader can match a name to its highlight.
//
// Read-only planning view — nothing is written to the database. Genetics are
// computed in-app and labelled computed estimates (PRD §7.3).
//
// [DRAFT — requires Yuliya's review]
import React, { useMemo } from 'react';
import type { HypotheticalMatingReport as Report } from '@/lib/hypotheticalMating';
import { computeLineColors } from '@/lib/lineColors';
import { coiDisplay } from '@/lib/schema';
import PedigreeTable from './PedigreeTable';

const lc = (s: string): string => s.trim().toLowerCase();

export default function HypotheticalMatingReport({
  report,
}: {
  report: Report;
}): React.ReactElement {
  // Same colours the bracket chart paints on repeated (= common) ancestors.
  const colors = useMemo(() => computeLineColors(report.tree), [report.tree]);

  return (
    <div className="hm-report">
      <div className="hm-report__head">
        <div className="hm-report__parents">
          {/* Sire × dam, matching the picker order. */}
          <strong>{report.sireName}</strong>
          <span className="hm-report__x"> × </span>
          <strong>{report.damName}</strong>
          {!report.found && (
            <span className="lb__warn"> — one or both parents not found in the database</span>
          )}
        </div>

        <ul className="lb__stats">
          <li>
            Projected litter COI: <strong>{coiDisplay(report.litterCoi)}</strong>
            {report.litterAvk != null && <> · AVK {coiDisplay(report.litterAvk)}</>}{' '}
            <span className="hm-est">(computed estimate)</span>
          </li>
          <li>
            {report.commonAncestors.length} common ancestor
            {report.commonAncestors.length === 1 ? '' : 's'} on both sides ·{' '}
            {report.uniqueAncestors} unique ancestors in {report.generations} generations
          </li>
        </ul>

        {report.warnings.length > 0 && (
          <div className="hm-warn" role="alert">
            <strong>⚠ Heads-up (does not block the preview):</strong>
            <ul className="hm-warn__list">
              {report.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {report.geneticsWarnings && report.geneticsWarnings.length > 0 && (
          <div className="lb__cycle-warn" role="alert">
            <strong>
              ⚠ {report.geneticsWarnings.length} pedigree cycle
              {report.geneticsWarnings.length === 1 ? '' : 's'} detected
            </strong>{' '}
            — a dog appears in its own ancestry (a data error); those edges were broken so the COI
            could still be computed. Please correct the data.
          </div>
        )}
      </div>

      <div className="hm-report__chart">
        <PedigreeTable tree={report.tree} variant="pedigree" />
      </div>

      <div className="hm-report__analysis">
        {report.commonAncestors.length > 0 && (
          <div className="hm-commons">
            <span className="hm-commons__label">
              Common ancestors (highlighted in the chart, ranked by Blood %):
            </span>
            <ul className="hm-commons__list">
              {report.commonAncestors.map((a) => (
                <li key={a.name}>
                  <span
                    className="hm-swatch"
                    style={{ background: colors.get(lc(a.name)) ?? 'transparent' }}
                    aria-hidden="true"
                  />
                  {a.animal.name} — <span className="hm-notation">{a.notation}</span>
                  {a.bloodPercent != null && <> · {a.bloodPercent.toFixed(2)}% blood</>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="hm-class">
          <span className="hm-class__label">Line-breeding pattern:</span>
          {report.classification.matches.length === 0 && report.classification.isOutcross && (
            <span className="hm-tag hm-tag--outcross">Outcross / line-cross</span>
          )}
          {report.classification.matches.map((m) => (
            <div key={m.key} className="hm-match">
              <span className={`hm-tag hm-tag--${m.confidence}`}>
                {m.confidence === 'possible' ? 'possible' : 'match'}
              </span>
              <span className="hm-match__method">{m.method}</span>
              <span className="hm-match__note">{m.note}</span>
            </div>
          ))}
          {report.classification.isOutcross && report.classification.outcrossNote && (
            <div className="hm-match">
              <span className="hm-match__note">{report.classification.outcrossNote}</span>
            </div>
          )}
        </div>

        <p className="lb__note">
          Planning projection only — nothing is written to the database. Litter COI/AVK are computed
          in-app (Meuwissen-Luo / Ancestor-Loss), labelled computed estimates. Pattern notes use the
          owner's 8-method reference; selection- or kennel-level methods (Oppenheimer, clan/quad,
          three-line rotation) can't be judged from a pedigree alone and are not asserted here.
        </p>
      </div>
    </div>
  );
}
