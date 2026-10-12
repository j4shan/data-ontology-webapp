import type { Definition, Focus, Neighborhood, Relationship } from './model.ts';
import { toRecords } from '../../../shared/tables.ts';
function JsonDetail({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="metadata">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
function Unknowns({ fields }: { fields?: string[] }) {
  return fields?.length ? <p className="unknown-claims">Unknown: {fields.join(', ')}</p> : null;
}
export function Inspector({
  model,
  onFocus,
}: {
  model: Neighborhood;
  onFocus: (focus: Focus) => void;
}) {
  const { focus, detail } = model;
  return (
    <aside className="inspector" aria-label="Focus inspector">
      <p className="eyebrow">FOCUS DETAILS</p>
      <h3>{model.label}</h3>
      <span className="kind-pill">{focus.kind.replace('_', ' ')}</span>
      {focus.kind === 'relationship' ? (
        <>
          <p className="muted">Each direction has its own claims.</p>
          {(['a', 'b'] as const).map((side) => {
            const endpoint = detail[`endpoint_${side}`];
            const other = detail[`endpoint_${side === 'a' ? 'b' : 'a'}`];
            const claims = detail[side === 'a' ? 'a_to_b' : 'b_to_a'];
            const dataset = model.datasets.find((node) => node.node_id === endpoint.node_id);
            const definition = toRecords<Definition>(detail.entity_definitions).find(
              (d) =>
                d.node_id === endpoint.node_id &&
                d.identity_id === detail.identity_id &&
                JSON.stringify(d.dataset_columns) === JSON.stringify(endpoint.dataset_columns),
            );
            return (
              <section className="endpoint-detail" key={side}>
                <h4>
                  {side.toUpperCase()} → {side === 'a' ? 'B' : 'A'}
                </h4>
                <button
                  className="inline-focus"
                  onClick={() => onFocus({ kind: 'dataset', nodeId: endpoint.node_id })}
                >
                  {dataset?.descriptor.display_name ?? endpoint.node_id}
                </button>
                <code>{endpoint.dataset_columns.join(', ')}</code>
                <dl>
                  <dt>Multiplicity</dt>
                  <dd>{claims.multiplicity}</dd>
                  <dt>Match existence</dt>
                  <dd>{claims.match_existence}</dd>
                </dl>
                {definition && (
                  <>
                    <p className="muted">Universe: {definition.entity_universe}</p>
                    {definition.entity_expression?.map((expression, i) => (
                      <code key={i}>{expression}</code>
                    ))}
                    <JsonDetail label="Entity context" value={definition.entity_metadata} />
                  </>
                )}
              </section>
            );
          })}
          <Unknowns fields={detail.unknown_fields} />
          {detail.annotation && (
            <JsonDetail label="Relationship annotation" value={detail.annotation} />
          )}
        </>
      ) : focus.kind === 'identity' ? (
        <>
          <p>{detail.description}</p>
          <p className="muted">{model.seeds.length} dataset realizations form this view’s focus.</p>
          {toRecords<Definition>(detail.entity_definitions).map((definition, i) => {
            const dataset = model.datasets.find((node) => node.node_id === definition.node_id);
            return (
              <button
                className="realization"
                key={i}
                onClick={() =>
                  onFocus({
                    kind: 'entity_definition',
                    nodeId: definition.node_id!,
                    identityId: definition.identity_id,
                    columns: definition.dataset_columns,
                  })
                }
              >
                <strong>{dataset?.descriptor.display_name ?? definition.node_id}</strong>
                <span>{definition.dataset_columns.join(', ')}</span>
                <small>Universe: {definition.entity_universe}</small>
              </button>
            );
          })}
        </>
      ) : (
        <>
          <p className="qualified-name">{detail.descriptor.qualified_name}</p>
          <p>{detail.descriptor.description}</p>
          <Unknowns fields={detail.unknown_fields} />
          <h4>Record grain</h4>
          {typeof detail.grain === 'string' ? (
            <p className="unknown-claims">{detail.grain}</p>
          ) : (
            <pre>{JSON.stringify(detail.grain, null, 2)}</pre>
          )}
          <h4>Entity definitions</h4>
          {(detail.entity_definitions as Definition[]).map((definition, i) => {
            const selected =
              focus.kind === 'entity_definition' &&
              focus.identityId === definition.identity_id &&
              JSON.stringify(focus.columns) === JSON.stringify(definition.dataset_columns);
            return (
              <section className={`definition ${selected ? 'is-highlight' : ''}`} key={i}>
                <strong>{definition.identity_id}</strong>
                <p>{definition.dataset_columns.join(', ')}</p>
                <small>Universe: {definition.entity_universe}</small>
                <Unknowns fields={definition.unknown_fields} />
                {definition.entity_expression.map((expression, i) => (
                  <code key={i}>{expression}</code>
                ))}
                <JsonDetail label="Entity context" value={definition.entity_metadata} />
              </section>
            );
          })}
          <details className="columns-detail" open={focus.kind === 'column'}>
            <summary>Columns ({detail.columns.length})</summary>
            {detail.columns.map((column: any) => (
              <section
                className={`column ${focus.kind === 'column' && focus.column === column.name ? 'is-highlight' : ''}`}
                key={column.name}
              >
                <strong>{column.name}</strong>
                <p>{column.description}</p>
                {column.value_description && <p>{column.value_description}</p>}
              </section>
            ))}
          </details>
          <JsonDetail label="Dataset accessor" value={detail.accessor} />
        </>
      )}
    </aside>
  );
}
