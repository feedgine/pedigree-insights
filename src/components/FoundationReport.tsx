// FoundationReport.tsx — for a chosen dog, shows how each dog on an imported
// "foundation" list appears in its ancestry and how much it contributes
// genetically (across all generations, via the memoized contribution DP).
//
// Contribution % is Wright's blood contribution — a deterministic, computed
// estimate, deliberately distinct from the externally-validated COI (CLAUDE.md).
//
// [DRAFT — requires Yuliya's review]
import React from 'react';
import type { FoundationReport as Report } from '@/lib/contribution';

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

export default function FoundationReport({
  report,
  foundationNames,
  importing,
  importMsg,
  hasSubject,
  onImport,
  onClear,
}: {
  report: Report | null;
  foundationNames: string[];
  importing: boolean;
  importMsg: string | null;
  hasSubject: boolean;
  onImport: () => void;
  onClear: () => void;
}): React.ReactElement {
  const hasList = foundationNames.length > 0;

  return (
    <div className="lb fnd">
      <div className="lb__head">
        <strong>Foundation report</strong>
        <div className="fnd__controls">
          <button className="btn btn--primary" onClick={onImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import list…'}
          </button>
          {hasList && (
            <>
              <span className="lb__count">{foundationNames.length} foundation dogs loaded</span>
              <button className="btn btn--ghost" onClick={onClear} disabled={importing}>
                Clear
              </button>
            </>
          )}
        </div>
        {importMsg && <p className="fnd__msg">{importMsg}</p>}
        <p className="lb__note">
          Contribution % is Wright's genetic blood contribution (½ per generation,
          summed over every path), computed across all generations. It is a
          computed estimate — distinct from the externally-validated COI.
        </p>
      </div>

      {!hasList ? (
        <div className="empty-stage">
          Import a foundation-dog list (one name per line, or a CSV) to begin.
        </div>
      ) : !hasSubject ? (
        <div className="empty-stage">Look up a dog to see its foundation contributions.</div>
      ) : !report ? (
        <div className="empty-stage">Analyzing…</div>
      ) : !report.found ? (
        <div className="empty-stage">Dog not found in the database.</div>
      ) : (
        <>
          <ul className="lb__stats">
            <li>
              <strong>{report.presentCount}</strong> of {report.totalSupplied} foundation
              dogs present in {report.subject}'s pedigree (
              {report.totalSupplied > 0
                ? ((report.presentCount / report.totalSupplied) * 100).toFixed(0)
                : '0'}
              %), traced over {report.generations} generations.
            </li>
            <li>
              Combined contribution of present foundation dogs:{' '}
              <strong>{pct(report.combinedContribution)}</strong>{' '}
              <span className="lb-split">
                (founders descended from one another overlap, so this may exceed their
                distinct share)
              </span>
            </li>
          </ul>

          <table className="lb-table">
            <thead>
              <tr>
                <th className="lb-cell lb-cell--name">Foundation dog</th>
                <th className="lb-cell lb-cell--num">In DB</th>
                <th className="lb-cell lb-cell--num">Present</th>
                <th className="lb-cell lb-cell--num" title="Closest generation of appearance (1 = parent)">
                  Closest
                </th>
                <th className="lb-cell lb-cell--num" title="Occurrence paths within 20 generations">
                  Crosses
                </th>
                <th className="lb-cell lb-cell--num lb-cell--gen" title="Wright's blood contribution — computed estimate">
                  Contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.query} className={r.present ? '' : 'fnd__absent'}>
                  <td className="lb-cell lb-cell--name">
                    {r.name}
                    {r.name.toLowerCase() !== r.query.trim().toLowerCase() && (
                      <span className="lb-split"> (“{r.query}”)</span>
                    )}
                  </td>
                  <td className="lb-cell lb-cell--num">{r.inDatabase ? '✓' : '—'}</td>
                  <td className="lb-cell lb-cell--num">{r.present ? '✓' : '—'}</td>
                  <td className="lb-cell lb-cell--num">{r.closest ?? '—'}</td>
                  <td className="lb-cell lb-cell--num">{r.present ? r.crosses : '—'}</td>
                  <td className="lb-cell lb-cell--num lb-cell--gen">
                    {r.present ? pct(r.contribution) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
