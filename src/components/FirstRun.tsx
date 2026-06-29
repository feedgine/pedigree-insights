// FirstRun.tsx — Screen 1 (PRD §6.5). Shown when no .db is connected. Prompts
// the user to pick their pedigree database file; the path is then remembered by
// main. (Any pedigree SQLite file works; BreedMate exports are the typical one.)
import React from 'react';

interface Props {
  onPick: () => void;
  error: string | null;
  busy: boolean;
}

export default function FirstRun({ onPick, error, busy }: Props): React.ReactElement {
  return (
    <div className="firstrun">
      <div className="firstrun__card">
        <div className="firstrun__logo" aria-hidden>🐾</div>
        <h1>PedigreeInsights</h1>
        <p className="firstrun__sub">No pedigree database connected yet.</p>
        <button className="btn btn--primary" onClick={onPick} disabled={busy}>
          {busy ? 'Opening…' : 'Choose pedigree database (.db)…'}
        </button>
        <p className="firstrun__note">
          Your file is opened <strong>read-only</strong>. The path is remembered
          for next time.
        </p>
        {error && <p className="firstrun__error">Could not open that file: {error}</p>}
      </div>
    </div>
  );
}
