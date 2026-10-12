import { isRecord } from './protocol.ts';
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export function toRecords<T = Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) {
    if (!value.every(isRecord)) throw new Error('Collection contains a non-record item');
    return value as T[];
  }
  if (!isRecord(value) || !Array.isArray(value.header) || !Array.isArray(value.rows)) {
    throw new Error('Expected a graph table or records collection');
  }
  const header = value.header;
  if (!header.every((key) => typeof key === 'string') || new Set(header).size !== header.length) {
    throw new Error('Invalid table header');
  }
  return value.rows.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== header.length) throw new Error('Table row length does not match header');
    const record: Record<string, unknown> = {};
    header.forEach((key: string, i: number) => {
      const parts = key.split('.');
      if (parts.some(part => !part || forbidden.has(part))) throw new Error('Unsafe table header');
      let target = record;
      parts.forEach((part, j) => {
        if (j === parts.length - 1) {
          if (Object.hasOwn(target, part)) throw new Error('Overlapping table header');
          target[part] = row[i];
        } else {
          if (!Object.hasOwn(target, part)) target[part] = {};
          if (!isRecord(target[part])) throw new Error('Overlapping table header');
          target = target[part] as Record<string, unknown>;
        }
      });
    });
    return record as T;
  });
}
