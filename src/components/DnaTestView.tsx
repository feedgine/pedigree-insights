// DnaTestView — the DNA Tests stage. Self-contained in the same way as the other
// report views: it fetches its own data via useResource for the selected test,
// reports readiness up so the toolbar's Save button can enable, and lifts the CSV
// text up so the toolbar's CSV export writes exactly what is on screen.
//
// The report covers the WHOLE database, so this view needs no subject dog.
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-08-27
import React, { useEffect, useMemo } from 'react';
import { useResource } from '@/hooks/useResource';
import { dnaReportCsv } from '@/lib/dnaReport';
import { todayDmy } from '@/lib/schema';
import DnaTestReport from './DnaTestReport';

interface Props {
  /** Selected test id (one of DNA_TESTS in dnaReport.ts). */
  testId: string;
  /** Open database file name, shown on the printed page. */
  dbName: string | null;
  onReady: (ready: boolean) => void;
  /** Receives the CSV text for the current report ('' while there is nothing). */
  onCsv: (csv: string) => void;
}

export default function DnaTestView({
  testId,
  dbName,
  onReady,
  onCsv,
}: Props): React.ReactElement {
  // One stamp per mount/selection, so the header, the print caption and the CSV
  // all carry the same date even if the report is left open past midnight.
  const generatedOn = useMemo(() => todayDmy(), [testId]);

  const { data: report, loading, error } = useResource(
    () => window.api.getDnaTestReport(testId),
    [testId],
  );

  const ready = !loading && !error && !!report && report.total > 0;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  useEffect(() => {
    onCsv(report && report.total > 0 ? dnaReportCsv(report, generatedOn) : '');
  }, [report, generatedOn, onCsv]);

  return (
    <DnaTestReport
      report={report ?? null}
      error={error}
      loading={loading}
      generatedOn={generatedOn}
      dbName={dbName}
    />
  );
}
