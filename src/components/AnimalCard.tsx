// AnimalCard.tsx — one node in the chart. Renders the DogForms60.fmx "Family
// Tree" label `[Titles] [Name] [Obedience] [Reg No.]` (PRD §6.3), sex colour-
// coded (blue ♂ / pink ♀, neutral subject), with empty/repeated states. Deep
// generations degrade to name-only when the box is small.
import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { AnimalNodeData } from '@/lib/layout';
import { nodeLabel } from '@/lib/schema';

function sexClass(sex: 'M' | 'F' | null, isSubject: boolean): string {
  if (isSubject) return 'card--subject';
  if (sex === 'M') return 'card--male';
  if (sex === 'F') return 'card--female';
  return 'card--unknown';
}

export default function AnimalCard({ data }: NodeProps<AnimalNodeData>): React.ReactElement {
  const { node } = data;
  const isSubject = node.generation === 0;
  // Dense (name-only) once boxes get small — gen 5+ per the size table.
  const dense = node.generation >= 5;

  if (!node.animal) {
    return (
      <div className="card card--empty" title="Unknown ancestor">
        <Handle type="target" position={Position.Left} />
        <span className="card__empty-label">— unknown —</span>
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  const a = node.animal;
  return (
    <div className={`card ${sexClass(a.sex, isSubject)}`}>
      <Handle type="target" position={Position.Left} />
      <div className="card__name">{nodeLabel(a, dense)}</div>
      {!dense && a.registration && (
        <div className="card__reg">Reg {a.registration}</div>
      )}
      {!dense && a.color && <div className="card__color">{a.color}</div>}
      {isSubject && (
        <div className="card__metrics">
          F = {a.coi == null ? '—' : a.coi.toFixed(1)} · R ={' '}
          {a.avk == null ? '—' : a.avk.toFixed(1)}
        </div>
      )}
      {node.repeated && <div className="card__repeat" title="Repeated ancestor">↺</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
