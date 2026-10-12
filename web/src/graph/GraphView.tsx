import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { emphasis, type Focus, type Neighborhood } from '../explorer/model.ts';
import { edgeGeometry, NODE_H, NODE_W, pairKey, ringLayout, type Point } from './geometry.ts';
export function GraphView({
  model,
  onFocus,
}: {
  model: Neighborhood;
  onFocus: (focus: Focus) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 480 });
  const [positions, setPositions] = useState(() => ringLayout(model.datasets));
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const pointers = useRef(new Map<number, Point>());
  const motion = useRef<
    | { start: Point; camera: typeof camera; nodeId?: string; point?: Point; moved: boolean }
    | undefined
  >(undefined);
  const pinch = useRef<{ distance: number; scale: number } | undefined>(undefined);
  const suppressClick = useRef(false);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPositions(ringLayout(model.datasets));
    setCamera({ x: 0, y: 0, scale: 1 });
  }, [model]);
  const groups = useMemo(() => {
    const result = new Map<string, typeof model.relationships>();
    for (const edge of model.relationships)
      result.set(pairKey(edge), [...(result.get(pairKey(edge)) ?? []), edge]);
    for (const list of result.values()) list.sort((a, b) => (a.edge_id < b.edge_id ? -1 : 1));
    return result;
  }, [model]);
  const distances = new Map(model.datasets.map((node) => [node.node_id, node.distance]));
  function fit() {
    const all = [...positions.values()];
    if (!all.length) return;
    const minX = Math.min(...all.map((p) => p.x)) - NODE_W,
      maxX = Math.max(...all.map((p) => p.x)) + NODE_W;
    const minY = Math.min(...all.map((p) => p.y)) - 100,
      maxY = Math.max(...all.map((p) => p.y)) + 100;
    const scale = Math.min(
      1,
      (size.width - 48) / (maxX - minX),
      (size.height - 48) / (maxY - minY),
    );
    setCamera({
      x: (-(maxX + minX) / 2) * scale,
      y: (-(maxY + minY) / 2) * scale,
      scale: Math.max(0.15, scale),
    });
  }
  function start(event: PointerEvent<SVGElement>, nodeId?: string) {
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: camera.scale };
    } else {
      suppressClick.current = false;
      motion.current = {
        start: { x: event.clientX, y: event.clientY },
        camera,
        nodeId,
        point: nodeId ? positions.get(nodeId) : undefined,
        moved: false,
      };
    }
    (event.target as Element).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const scale =
        (pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) /
        Math.max(1, pinch.current.distance);
      setCamera((old) => ({ ...old, scale: Math.min(2.5, Math.max(0.15, scale)) }));
      suppressClick.current = true;
      return;
    }
    const state = motion.current;
    if (!state) return;
    const dx = event.clientX - state.start.x,
      dy = event.clientY - state.start.y;
    if (Math.hypot(dx, dy) > 5) state.moved = true;
    if (!state.moved) return;
    suppressClick.current = true;
    if (state.nodeId && state.point) {
      const id = state.nodeId,
        point = {
          x: state.point.x + dx / state.camera.scale,
          y: state.point.y + dy / state.camera.scale,
        };
      setPositions((old) => new Map(old).set(id, point));
    } else setCamera({ ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy });
  }
  function end(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    motion.current = undefined;
    pinch.current = undefined;
  }
  function select(focus: Focus) {
    if (!suppressClick.current) onFocus(focus);
  }
  const activate = (event: React.KeyboardEvent, focus: Focus) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onFocus(focus);
    }
  };
  return (
    <div className="graph-frame">
      <div className="graph-tools" aria-label="Graph controls">
        <span>
          {model.datasets.length} datasets · {model.relationships.length} relationships
        </span>
        <div>
          <button
            onClick={() => setCamera((c) => ({ ...c, scale: Math.min(2.5, c.scale * 1.25) }))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setCamera((c) => ({ ...c, scale: Math.max(0.15, c.scale / 1.25) }))}
            aria-label="Zoom out"
          >
            −
          </button>
          <button onClick={fit}>Fit</button>
          <button
            onClick={() => {
              setCamera({ x: 0, y: 0, scale: 1 });
              setPositions(ringLayout(model.datasets));
            }}
          >
            Arrange
          </button>
        </div>
      </div>
      <div className="graph-surface" ref={container}>
        <svg
          ref={svg}
          width="100%"
          height="100%"
          aria-label="Dataset neighborhood graph"
          role="group"
          data-testid="neighborhood-graph"
          onPointerDown={(e) => start(e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <g
            transform={`translate(${size.width / 2 + camera.x},${size.height / 2 + camera.y}) scale(${camera.scale})`}
          >
            {model.relationships.map((edge) => {
              const geometry = edgeGeometry(edge, positions, groups.get(pairKey(edge))!);
              if (!geometry) return null;
              const selected =
                model.focus.kind === 'relationship' && model.focus.edgeId === edge.edge_id;
              const distance = Math.max(
                distances.get(edge.endpoint_a.node_id) ?? 0,
                distances.get(edge.endpoint_b.node_id) ?? 0,
              );
              return (
                <g
                  key={edge.edge_id}
                  className={`graph-edge ${selected ? 'is-focus' : ''}`}
                  opacity={selected ? 1 : emphasis(distance)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Focus relationship ${edge.identity_id} between ${edge.endpoint_a.node_id} and ${edge.endpoint_b.node_id}`}
                  onClick={() => select({ kind: 'relationship', edgeId: edge.edge_id })}
                  onKeyDown={(e) => activate(e, { kind: 'relationship', edgeId: edge.edge_id })}
                  data-edge-id={edge.edge_id}
                >
                  <path className="edge-hit" d={geometry.path} vectorEffect="non-scaling-stroke" />
                  <path className="edge-line" d={geometry.path} vectorEffect="non-scaling-stroke" />
                  <text x={geometry.label.x} y={geometry.label.y} className="edge-label">
                    {edge.identity_id}
                  </text>
                </g>
              );
            })}
            {model.datasets.map((node) => {
              const point = positions.get(node.node_id);
              if (!point) return null;
              const selected = model.seeds.includes(node.node_id);
              const label = node.descriptor.display_name || node.descriptor.qualified_name;
              return (
                <g
                  key={node.node_id}
                  transform={`translate(${point.x},${point.y})`}
                  opacity={emphasis(node.distance)}
                  className={`graph-node ${selected ? 'is-focus' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Focus dataset ${label}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    start(e, node.node_id);
                  }}
                  onClick={() => select({ kind: 'dataset', nodeId: node.node_id })}
                  onKeyDown={(e) => activate(e, { kind: 'dataset', nodeId: node.node_id })}
                  data-node-id={node.node_id}
                  data-distance={node.distance}
                >
                  <title>
                    {label}
                    {node.descriptor.qualified_name}
                    Depth {node.distance}
                  </title>
                  <rect
                    x={-NODE_W / 2}
                    y={-NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx="9"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text x="0" y="-2" textAnchor="middle">
                    {label.length > 22 ? label.slice(0, 21) + '…' : label}
                  </text>
                  <text x="0" y="15" textAnchor="middle" className="node-depth">
                    {selected ? 'Focus' : `Depth ${node.distance}`}
                    {node.unknown_fields?.length ? ' · unknown claims' : ''}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {!model.datasets.length && (
          <div className="graph-empty">No dataset realizations to display.</div>
        )}
      </div>
      <div className="graph-key">
        <span className="key-focus" /> Focus <span className="key-context" /> Neighbors fade with
        BFS distance{' '}
        <span className="graph-hint">
          Drag to pan · drag a node to reposition · use zoom controls or pinch
        </span>
      </div>
    </div>
  );
}
