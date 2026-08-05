// IndentedTree.tsx — the pedigree rendered as a classic indented text
// tree (the "Indented Tree" tab). The exact text shown here is produced by
// buildPedigreeText (the single source of truth in src/lib/indentedTree.ts) and
// is byte-identical to what the "TXT" export writes, so the on-screen report and
// the exported file can never drift. Rendered in a monospace <pre> so the ASCII
// connector lines stay aligned.
import React from 'react';

export default function IndentedTree({ text }: { text: string }): React.ReactElement {
  return (
    <div className="ptree">
      <pre className="ptree__pre">{text}</pre>
    </div>
  );
}
