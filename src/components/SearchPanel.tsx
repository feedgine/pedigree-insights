// SearchPanel.tsx — Screen 3 (PRD §6.2). "Look up a dog by name" — the minimum
// supporting capability for v1.0. Debounced name/registration search over the
// IPC API; selecting a result loads its pedigree chart.
//
// Reusable: the Hypothetical Mating tab (PRD §6.8) mounts two of these to pick a
// dam and a sire, so `placeholder` and `autoFocus` are overridable (defaults keep
// the original single-search behaviour unchanged).
import React, { useEffect, useRef, useState } from 'react';
import type { Animal } from '@/lib/schema';

interface Props {
  onSelect: (name: string) => void;
  /** Input placeholder; defaults to the original single-lookup wording. */
  placeholder?: string;
  /** Whether the input grabs focus on mount (default true). Set false for the
   *  second of two side-by-side pickers so they don't fight over focus. */
  autoFocus?: boolean;
}

export default function SearchPanel({
  onSelect,
  placeholder = 'Look up dog by name…',
  autoFocus = true,
}: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await window.api.searchAnimals(q);
      setResults(r);
      setLoading(false);
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="search">
      <input
        className="search__input"
        type="search"
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <ul className="search__results">
          {loading && <li className="search__hint">Searching…</li>}
          {!loading && results.length === 0 && (
            <li className="search__hint">No matches</li>
          )}
          {results.map((a) => (
            <li key={a.name}>
              <button
                className="search__row"
                onClick={() => {
                  onSelect(a.name);
                  setQuery('');
                  setResults([]);
                }}
              >
                <span className="search__name">{a.name}</span>
                <span className={`badge badge--${a.sex ?? 'U'}`}>{a.sex ?? '?'}</span>
                <span className="search__meta">
                  {a.registration ? `Reg ${a.registration}` : ''}
                  {a.breed ? ` · ${a.breed}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
