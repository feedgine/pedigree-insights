// DnaTestReport.tsx — the DNA Tests report: a genotype pie chart over the whole
// database, and beneath it every dog that has a result for the selected test.
//
// The layout mirrors the breed club's published report (PRA-rcd4-20260630):
// a header line with the test name and the report date, then the columns
// Pedigree No. · Dog's registered name · <test> genotype · Sire (father's name) ·
// Dam (mother's name) · Date of birth. The pedigree number is the owner's own
// record number from `Registration` (#6), shown verbatim.
//
// The chart is INLINE SVG rather than a canvas or a chart library: it prints into
// the PDF at full vector resolution, needs no runtime dependency, and survives the
// packaged app's Content-Security-Policy untouched.
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-08-27
import React from 'react';
import type { DnaTestReport as Report, DnaTestSlice, GenotypeClass } from '@/lib/dnaReport';

/** Slice colours. Deliberately the same three-way reading as the club's chart —
 *  blue = clear, amber = carrier, red = affected — so a reader who knows the
 *  published report recognises this one at a glance. Grey holds anything the
 *  classifier could not place. */
const SLICE_COLOR: Record<GenotypeClass, string> = {
  clear: '#3f6fd8',
  carrier: '#e8a33d',
  affected: '#c0392b',
  other: '#9aa2ad',
};

const R = 92; // pie radius, px
const CX = 108;
const CY = 108;

/** Point on the pie's edge at `fraction` around the circle, clockwise from 12. */
function edge(fraction: number): [number, number] {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}

/** SVG path for one slice. A single slice covering the whole circle cannot be
 *  drawn as an arc (start and end points coincide), so it becomes a full circle. */
function slicePath(from: number, to: number): string {
  const [x1, y1] = edge(from);
  const [x2, y2] = edge(to);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(
    2,
  )} ${y2.toFixed(2)} Z`;
}

function GenotypePie({ slices, total }: { slices: DnaTestSlice[]; total: number }) {
  if (total === 0) return null;
  let acc = 0;
  const wedges = slices.map((s) => {
    const from = acc;
    acc += s.count / total;
    return { s, from, to: acc };
  });
  const single = wedges.length === 1;

  return (
    <figure className="dna-chart">
      <svg
        className="dna-chart__svg"
        viewBox="0 0 216 216"
        width="216"
        height="216"
        role="img"
        aria-label={`Genotype distribution across ${total} dogs`}
      >
        {single ? (
          <circle cx={CX} cy={CY} r={R} fill={SLICE_COLOR[wedges[0].s.id]} />
        ) : (
          wedges.map(({ s, from, to }) => (
            <path
              key={s.id}
              d={slicePath(from, to)}
              fill={SLICE_COLOR[s.id]}
              stroke="#fff"
              strokeWidth="1.5"
            >
              <title>{`${s.label}: ${s.count} (${s.percent.toFixed(1)}%)`}</title>
            </path>
          ))
        )}
      </svg>
      <figcaption className="dna-chart__legend">
        <ul className="dna-legend">
          {slices.map((s) => (
            <li key={s.id} className="dna-legend__row">
              <span
                className="dna-legend__dot"
                style={{ background: SLICE_COLOR[s.id] }}
                aria-hidden="true"
              />
              <span className="dna-legend__label">{s.label}</span>
              <span className="dna-legend__num">
                {s.count} <span className="dna-legend__pct">({s.percent.toFixed(1)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export default function DnaTestReport({
  report,
  error,
  loading,
  generatedOn,
  dbName,
}: {
  report: Report | null;
  error: string | null;
  loading: boolean;
  /** Report date, DD-MMM-YYYY — shown in the header and repeated on the print caption. */
  generatedOn: string;
  /** Open database file name, for the printed page's provenance line. */
  dbName: string | null;
}): React.ReactElement {
  if (error) {
    return <div className="empty-stage">Could not build the report: {error}</div>;
  }
  if (loading || !report) {
    return <div className="empty-stage">Building the report…</div>;
  }

  const genotypeHeader = `${report.testLabel} genotype`;

  return (
    <div className="dna">
      {/* Screen header. In print this is replaced by .dna__caption so the page
          carries the test name, the date and the source file on every sheet. */}
      <div className="dna__head">
        <h2 className="dna__title">{report.testTitle}</h2>
        <span className="dna__meta">
          {report.total} {report.total === 1 ? 'result' : 'results'} · {generatedOn}
        </span>
      </div>
      <div className="dna__caption" aria-hidden="true">
        <span>{report.testTitle}</span>
        <span>
          {dbName ? `${dbName} · ` : ''}
          {report.total} {report.total === 1 ? 'result' : 'results'} · {generatedOn}
        </span>
      </div>

      {!report.columnPresent && (
        <p className="dna__note dna__note--warn" role="status">
          The open database has no <strong>{report.testTitle}</strong> column, so there is
          nothing to report. A database exported before this test was added simply does not
          carry it — the other tests in the list may still have data.
        </p>
      )}

      {report.columnPresent && report.total === 0 && (
        <p className="dna__note" role="status">
          The <strong>{report.testTitle}</strong> column exists in this database, but no dog
          has a result recorded for it yet.
        </p>
      )}

      {report.total > 0 && (
        <>
          <GenotypePie slices={report.slices} total={report.total} />

          <table className="dna-table">
            <thead>
              <tr>
                <th className="dna-cell dna-cell--no" title="Pedigree number (Registration)">
                  Pedigree No.
                </th>
                <th className="dna-cell dna-cell--name">Dog&rsquo;s registered name</th>
                <th className="dna-cell dna-cell--geno">{genotypeHeader}</th>
                <th className="dna-cell dna-cell--parent">Sire (father&rsquo;s name)</th>
                <th className="dna-cell dna-cell--parent">Dam (mother&rsquo;s name)</th>
                <th className="dna-cell dna-cell--dob">Date of birth</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.name}>
                  <td className="dna-cell dna-cell--no">{r.pedigreeNo}</td>
                  <td className="dna-cell dna-cell--name">{r.name}</td>
                  <td className={`dna-cell dna-cell--geno dna-geno--${r.genotypeClass}`}>
                    <span
                      className="dna-geno__dot"
                      style={{ background: SLICE_COLOR[r.genotypeClass] }}
                      aria-hidden="true"
                    />
                    {r.genotype}
                  </td>
                  <td className="dna-cell dna-cell--parent">{r.sire}</td>
                  <td className="dna-cell dna-cell--parent">{r.dam}</td>
                  <td className="dna-cell dna-cell--dob">{r.dob}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="dna__note">
            Genotypes are shown exactly as the database records them; the colour and the
            chart slice come from reading each value as Clear, Carrier or Affected. A value
            the app cannot place is listed under &ldquo;Other / unclear&rdquo; and still
            appears in the table. Only dogs with a recorded result are listed.
          </p>
        </>
      )}
    </div>
  );
}
