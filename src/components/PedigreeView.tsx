// PedigreeView — the bracket-chart stage (the "Pedigree" tab). Fetches its own
// ancestor tree via useResource and reports readiness up so the toolbar Save
// button can enable. (The old "PedigreeTree" bracket variant was retired in
// v1.2.0 in favour of the Indented Tree text pedigree; see IndentedTreeView.)
import React, { useEffect } from 'react';
import { useResource } from '@/hooks/useResource';
import PedigreeTable from './PedigreeTable';

interface Props {
  subjectName: string;
  generations: number;
  onReady: (ready: boolean) => void;
}

export default function PedigreeView({
  subjectName,
  generations,
  onReady,
}: Props): React.ReactElement {
  const { data: tree, loading, error } = useResource(
    () => window.api.getPedigree(subjectName, generations),
    [subjectName, generations],
  );

  const ready = !loading && !error && !!tree;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  if (loading) return <div className="empty-stage">Building pedigree…</div>;
  if (error) return <div className="empty-stage">Could not load the pedigree: {error}</div>;
  if (!tree) return <div className="empty-stage" />;
  return <PedigreeTable tree={tree} variant="pedigree" />;
}
