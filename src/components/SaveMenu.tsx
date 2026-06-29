// SaveMenu.tsx — a single "Save…" button that opens a small dropdown of output
// formats. Formats are data-driven, so adding one (e.g. SVG later) is just
// another entry in the array the caller passes — no new buttons in the toolbar.
import React, { useEffect, useRef, useState } from 'react';

export interface SaveFormat {
  /** Stable id (also the React key). */
  id: string;
  /** Menu label, e.g. "PDF". */
  label: string;
  /** Optional one-line hint shown under the label. */
  hint?: string;
  /** Invoked when the user picks this format. */
  run: () => void | Promise<void>;
}

export default function SaveMenu({
  formats,
  disabled = false,
  busy = false,
}: {
  formats: SaveFormat[];
  disabled?: boolean;
  busy?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (f: SaveFormat) => {
    setOpen(false);
    void f.run();
  };

  return (
    <div className="savemenu" ref={ref}>
      <button
        className="btn btn--ghost"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy || formats.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Save the current view"
      >
        {busy ? 'Saving…' : 'Save…'}
      </button>
      {open && (
        <ul className="savemenu__list" role="menu">
          {formats.map((f) => (
            <li key={f.id} role="none">
              <button
                role="menuitem"
                className="savemenu__item"
                onClick={() => pick(f)}
              >
                <span className="savemenu__label">{f.label}</span>
                {f.hint && <span className="savemenu__hint">{f.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
