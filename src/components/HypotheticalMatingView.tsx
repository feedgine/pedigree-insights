// HypotheticalMatingView — the Hypothetical Mating stage (PRD §6.8). Like the
// other report views it is self-contained: it owns the two parent selections,
// fetches the projected-litter analysis via useResource, and reports readiness
// up so the toolbar Save button can enable. Unlike the single-subject tabs it
// mounts TWO lookups; by pedigree convention the SIRE is on the left and the DAM
// on the right. The shared toolbar search is not used here. Read-only — the
// preview never writes to the database.
import React, { useEffect, useState } from 'react';
import { useResource } from '@/hooks/useResource';
import SearchPanel from './SearchPanel';
import HypotheticalMatingReport from './HypotheticalMatingReport';

interface Props {
  generations: number;
  onReady: (ready: boolean) => void;
}

function ParentPicker({
  role,
  name,
  onPick,
  autoFocus,
}: {
  role: 'Dam' | 'Sire';
  name: string | null;
  onPick: (name: string | null) => void;
  autoFocus?: boolean;
}): React.ReactElement {
  return (
    <div className="hm-picker">
      <span className={`hm-picker__role hm-picker__role--${role.toLowerCase()}`}>{role}</span>
      {name ? (
        <span className="hm-picker__chosen">
          <strong>{name}</strong>
          <button className="btn btn--ghost hm-picker__change" onClick={() => onPick(null)}>
            change
          </button>
        </span>
      ) : (
        <SearchPanel
          onSelect={onPick}
          placeholder={`Look up the ${role.toLowerCase()}…`}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}

export default function HypotheticalMatingView({
  generations,
  onReady,
}: Props): React.ReactElement {
  const [damName, setDamName] = useState<string | null>(null);
  const [sireName, setSireName] = useState<string | null>(null);

  const enabled = !!damName && !!sireName;
  const { data: report, loading, error } = useResource(
    () => window.api.getHypotheticalMating(sireName as string, damName as string, generations),
    [sireName, damName, generations],
    enabled,
  );

  const ready = enabled && !loading && !error && !!report;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  return (
    <div className="hm">
      <div className="hm__pickers">
        {/* Sire on the left, dam on the right (pedigree convention). */}
        <ParentPicker role="Sire" name={sireName} onPick={setSireName} autoFocus />
        <span className="hm__times" aria-hidden="true">×</span>
        <ParentPicker role="Dam" name={damName} onPick={setDamName} />
      </div>

      {!enabled && (
        <div className="empty-stage">Pick a sire and a dam to preview their potential litter.</div>
      )}
      {enabled && loading && <div className="empty-stage">Projecting the litter…</div>}
      {enabled && error && (
        <div className="empty-stage">Could not build the preview: {error}</div>
      )}
      {enabled && !loading && !error && report && <HypotheticalMatingReport report={report} />}
    </div>
  );
}
