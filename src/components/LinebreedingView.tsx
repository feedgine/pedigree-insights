// LinebreedingView — the Linebreeding stage. Owns its own min-crosses filter
// (the selector lives in the report body) and fetches the report via useResource.
import React, { useEffect, useState } from 'react';
import { useResource } from '@/hooks/useResource';
import { DEFAULT_MIN_CROSSES } from '@/lib/linebreeding';
import LinebreedingReport from './LinebreedingReport';

interface Props {
  subjectName: string;
  generations: number;
  onReady: (ready: boolean) => void;
}

export default function LinebreedingView({
  subjectName,
  generations,
  onReady,
}: Props): React.ReactElement {
  const [minCrosses, setMinCrosses] = useState(DEFAULT_MIN_CROSSES);

  const { data: report, loading, error } = useResource(
    () => window.api.getLinebreeding(subjectName, generations, minCrosses),
    [subjectName, generations, minCrosses],
  );

  const ready = !loading && !error && !!report;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  if (loading) return <div className="empty-stage">Analyzing linebreeding…</div>;
  if (error) return <div className="empty-stage">Could not analyze linebreeding: {error}</div>;
  if (!report) return <div className="empty-stage" />;
  return (
    <LinebreedingReport
      report={report}
      minCrosses={minCrosses}
      onMinCrossesChange={setMinCrosses}
    />
  );
}
