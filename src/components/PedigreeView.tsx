// PedigreeView — the bracket-chart stage (shared by the Pedigree and PedigreeTree
// tabs, which differ only by `variant`). Fetches its own ancestor tree via
// useResource and reports readiness up so the toolbar Save button can enable.
import React, { useEffect } from 'react';
import { useResource } from '@/lib/useResource';
import PedigreeTable, { type PedigreeVariant } from './PedigreeTable';

interface Props {
  subjectName: string;
  generations: number;
  variant: PedigreeVariant;
  onReady: (ready: boolean) => void;
}

export default function PedigreeView({
  subjectName,
  generations,
  variant,
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

  const noun = variant === 'tree' ? 'pedigree tree' : 'pedigree';
  if (loading) return <div className="empty-stage">Building {noun}…</div>;
  if (error) return <div className="empty-stage">Could not load the {noun}: {error}</div>;
  if (!tree) return <div className="empty-stage" />;
  return <PedigreeTable tree={tree} variant={variant} />;
}
