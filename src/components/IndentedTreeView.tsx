// IndentedTreeView — the Indented Tree stage (classic indented-text pedigree).
// Follows the same self-contained pattern as the other report views: it fetches
// its own de-dup ancestor tree via useResource (getPedigreeTree, 5/10/20 gens),
// renders it through buildPedigreeText, and reports readiness up.
//
// One extra wire beyond the other views: the TXT export needs the exact text
// string (not the DOM), and the Save… menu lives up in App. So the view lifts
// its rendered text up via `onText`; App holds it and hands it to saveText when
// the user picks "TXT". The on-screen <pre> and the exported file are therefore
// the same buildPedigreeText output and can never drift.
import React, { useEffect, useMemo } from 'react';
import { useResource } from '@/hooks/useResource';
import { buildPedigreeText } from '@/lib/indentedTree';
import IndentedTree from './IndentedTree';

interface Props {
  subjectName: string;
  generations: number;
  onReady: (ready: boolean) => void;
  onText: (text: string) => void;
}

export default function IndentedTreeView({
  subjectName,
  generations,
  onReady,
  onText,
}: Props): React.ReactElement {
  const { data: treeNode, loading, error } = useResource(
    () => window.api.getPedigreeTree(subjectName, generations),
    [subjectName, generations],
  );

  const text = useMemo(
    () => (treeNode ? buildPedigreeText(treeNode, generations) : ''),
    [treeNode, generations],
  );

  const ready = !loading && !error && !!treeNode && !!text;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  // Publish the current text upward for the toolbar's TXT export; clear it when
  // the view unmounts (tab switch) so a stale pedigree can't be exported.
  useEffect(() => {
    onText(text);
    return () => onText('');
  }, [text, onText]);

  if (loading) return <div className="empty-stage">Building pedigree tree…</div>;
  if (error) return <div className="empty-stage">Could not build the pedigree tree: {error}</div>;
  if (!treeNode) return <div className="empty-stage" />;
  return <IndentedTree text={text} />;
}
