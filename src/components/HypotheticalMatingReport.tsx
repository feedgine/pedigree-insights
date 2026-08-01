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
      {(!report.found ||
        report.warnings.length > 0 ||
        (report.geneticsWarnings?.length ?? 0) > 0) && (
      <div className="hm-report__head">
        {/* Litter identity + projected COI/AVK now live in the card above the chart;
            the counts moved into the Common-ancestors heading. Head keeps warnings. */}
        {!report.found && (
          <div className="lb__warn">One or both parents were not found in the database.</div>
        )}

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
      )}

      {report.chartGenerations < report.generations && (
        <div className="hm-chart-note">
          Chart shows the first {report.chartGenerations} generations for legibility; litter
          COI/AVK and the common-ancestor analysis use all {report.generations} generations.
        </div>
      )}
      <div className="hm-report__chart">
        <PedigreeTable
          tree={report.tree}
          variant="pedigree"
          parentHealth
          cardBody={
            <div className="ptcard__body">
              <div className="ptcard__right">
                <div className="ptcard__row">
                  <span className="ptcard__k">Name:</span> Planned litter — {report.sireName} ×{' '}
                  {report.damName}
                </div>
                <div className="ptcard__row">
                  <span className="ptcard__k">Genetic COI:</span> {coiDisplay(report.litterCoi)}
                  {report.litterAvk != null && <> · AVK {coiDisplay(report.litterAvk)}</>}{' '}
                  <span className="hm-est">(computed estimate)</span>
                </div>
              </div>
            </div>
          }
        />
      </div>

      <div className="hm-report__analysis">
        <div className="hm-commons">
          <span className="hm-commons__label">
            Common ancestors — {report.commonAncestors.length} on both sides ·{' '}
            {report.uniqueAncestors} unique in {report.generations} generations (ranked by
            Blood %; highlighted in the chart where within its depth):
          </span>
          {report.commonAncestors.length > 0 && (
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
          )}
        </div>

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
