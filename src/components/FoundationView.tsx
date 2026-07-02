// FoundationView — the Foundation stage. Self-contained: owns the imported
// foundation list and the import/clear flow, and fetches the contribution report
// via useResource (only once a subject is chosen and a list exists).
import React, { useCallback, useEffect, useState } from 'react';
import { useResource } from '@/lib/useResource';
import FoundationReport from './FoundationReport';

interface Props {
  subjectName: string | null;
  onReady: (ready: boolean) => void;
}

export default function FoundationView({ subjectName, onReady }: Props): React.ReactElement {
  const [foundationNames, setFoundationNames] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    window.api.getConfig().then(
      (c) => setFoundationNames(c.foundationNames ?? []),
      () => {},
    );
  }, []);

  const enabled = !!subjectName && foundationNames.length > 0;
  const { data: report, loading, error } = useResource(
    () => window.api.getFoundation(subjectName as string),
    [subjectName, foundationNames],
    enabled,
  );

  const ready = enabled && !loading && !error && !!report;
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);

  const onImport = useCallback(async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await window.api.importFoundation();
      if (!res.canceled) {
        setFoundationNames(res.names);
        const unmatchedNote =
          res.unmatched.length > 0
            ? ` ${res.unmatched.length} not found: ${res.unmatched.slice(0, 5).join(', ')}${
                res.unmatched.length > 5 ? '…' : ''
              }`
            : '';
        setImportMsg(
          `Loaded ${res.names.length} names — ${res.matched} matched the database.${unmatchedNote}`,
        );
      }
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }, []);

  const onClear = useCallback(async () => {
    try {
      await window.api.clearFoundation();
      setFoundationNames([]);
      setImportMsg(null);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <FoundationReport
      report={report ?? null}
      error={error}
      foundationNames={foundationNames}
      importing={importing}
      importMsg={importMsg}
      hasSubject={!!subjectName}
      onImport={onImport}
      onClear={onClear}
    />
  );
}
