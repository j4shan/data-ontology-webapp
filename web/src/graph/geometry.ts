import type { Dataset, Relationship } from '../explorer/model.ts';
export interface Point {
  x: number;
  y: number;
}
export const NODE_W = 174;
export const NODE_H = 56;
export function ringLayout(nodes: Dataset[]): Map<string, Point> {
  const groups = new Map<number, Dataset[]>();
  for (const node of nodes) groups.set(node.distance, [...(groups.get(node.distance) ?? []), node]);
  const positions = new Map<string, Point>();
  let previousRadius = -160;
  for (const [depth, group] of [...groups].sort(([a], [b]) => a - b)) {
    group.sort((a, b) => (a.node_id < b.node_id ? -1 : a.node_id > b.node_id ? 1 : 0));
    const radius =
      depth === 0 && group.length === 1
        ? 0
        : Math.max(previousRadius + 240, (group.length * 210) / (2 * Math.PI));
    group.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
      positions.set(
        node.node_id,
        radius === 0
          ? { x: 0, y: 0 }
          : { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      );
    });
    previousRadius = radius;
  }
  return positions;
}
function border(from: Point, to: Point): Point {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const t = Math.min(
    NODE_W / 2 / Math.max(0.001, Math.abs(dx)),
    NODE_H / 2 / Math.max(0.001, Math.abs(dy)),
  );
  return { x: from.x + dx * t, y: from.y + dy * t };
}
export function edgeGeometry(
  edge: Relationship,
  positions: Map<string, Point>,
  siblings: Relationship[],
) {
  const a = positions.get(edge.endpoint_a.node_id),
    b = positions.get(edge.endpoint_b.node_id);
  if (!a || !b) return;
  const index = siblings.findIndex((item) => item.edge_id === edge.edge_id);
  if (edge.endpoint_a.node_id === edge.endpoint_b.node_id) {
    const height = 75 + index * 32;
    return {
      path: `M ${a.x + 45} ${a.y - NODE_H / 2} C ${a.x + 140} ${a.y - height} ${a.x - 140} ${a.y - height} ${a.x - 45} ${a.y - NODE_H / 2}`,
      label: { x: a.x, y: a.y - height * 0.8 },
    };
  }
  const from = border(a, b),
    to = border(b, a);
  const offset = (index - (siblings.length - 1) / 2) * 58;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const control = {
    x: (from.x + to.x) / 2 - ((b.y - a.y) / length) * offset,
    y: (from.y + to.y) / 2 + ((b.x - a.x) / length) * offset,
  };
  const t = siblings.length > 1 ? 0.2 + (0.6 * (index + 0.5)) / siblings.length : 0.5;
  return {
    path: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
    label: {
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t * t * to.y - 7,
    },
  };
}
export function pairKey(edge: Relationship) {
  return JSON.stringify([edge.endpoint_a.node_id, edge.endpoint_b.node_id].sort());
}
