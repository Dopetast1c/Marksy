import type { z } from 'zod';
import { ProviderSchemaError } from '../providers/errors';
import type { DriftReporter } from '../providers/types';

// Drift detection shared by every provider (CLAUDE.md "Hard rules": every response is validated with a passthrough
// schema; unknown fields, missing fields, new enum values and new error shapes are recorded, and parsing never fails
// on unknown fields). A provider declares its raw schemas with z.looseObject and lets this walk compare a response
// with them: differences are reported, a broken list item is skipped, only an unusable whole response throws.

type Schema = z.ZodType;
type Def = { type: string; innerType?: Schema; element?: Schema; valueType?: Schema; options?: Schema[] };

const def = (s: Schema) => (s as unknown as { _zod: { def: Def } })._zod.def;
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const typeName = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export interface DriftCheck {
  /** Compare a value with a schema and report every difference. Never throws. */
  shape(schema: Schema, value: unknown, path?: string): void;
  /** A whole response: shape-checked, then parsed; throws ProviderSchemaError only when it cannot be used at all. */
  parse<T>(schema: z.ZodType<T>, value: unknown, path?: string): T;
  /** A list: every item shape-checked, the items that parse are returned, the others are reported and skipped. */
  items<T>(schema: z.ZodType<T>, value: unknown, path: string): T[];
  /** Is this enum value one the provider knows? Unknown values are reported as new_enum_value. null and undefined are fine. */
  known(value: string | null | undefined, values: readonly string[], path: string): boolean;
  /** An error body in a shape the provider does not recognise. */
  errorShape(path: string): void;
}

export function driftChecker(drift: DriftReporter, endpoint: string): DriftCheck {
  const report = (kind: Parameters<DriftReporter['report']>[0]['kind'], path: string, sample?: string) =>
    drift.report({ kind, endpoint, path: path || '$', ...(sample !== undefined && { sample }) });

  function walk(schema: Schema, value: unknown, path: string): void {
    const d = def(schema);
    switch (d.type) {
      case 'optional':
        if (value !== undefined) walk(d.innerType!, value, path);
        return;
      case 'nullable':
        if (value !== null) walk(d.innerType!, value, path);
        return;
      case 'default':
      case 'catch':
        if (value !== undefined) walk(d.innerType!, value, path);
        return;
      case 'object': {
        if (!isPlainObject(value)) return report('type_mismatch', path, typeName(value));
        const shape = (schema as unknown as { shape: Record<string, Schema> }).shape;
        for (const [key, field] of Object.entries(shape)) {
          const child = path ? `${path}.${key}` : key;
          if (value[key] === undefined) {
            if (!field.safeParse(undefined).success) report('missing_field', child);
          } else walk(field, value[key], child);
        }
        for (const key of Object.keys(value)) {
          if (!(key in shape)) report('unknown_field', path ? `${path}.${key}` : key);
        }
        return;
      }
      case 'array':
        if (!Array.isArray(value)) return report('type_mismatch', path, typeName(value));
        for (const item of value) walk(d.element!, item, `${path}[]`);
        return;
      case 'record':
        if (!isPlainObject(value)) return report('type_mismatch', path, typeName(value));
        for (const item of Object.values(value)) walk(d.valueType!, item, path ? `${path}.*` : '*');
        return;
      default:
        if (!schema.safeParse(value).success) report('type_mismatch', path, typeName(value));
    }
  }

  return {
    shape: (schema, value, path = '') => walk(schema, value, path),
    parse(schema, value, path = '') {
      walk(schema, value, path);
      const r = schema.safeParse(value);
      if (!r.success) throw new ProviderSchemaError(`${endpoint}: response cannot be used`);
      return r.data;
    },
    items(schema, value, path) {
      if (!Array.isArray(value)) {
        report('type_mismatch', path, typeName(value));
        return [];
      }
      const out: z.infer<typeof schema>[] = [];
      for (const item of value) {
        walk(schema, item, `${path}[]`);
        const r = schema.safeParse(item);
        if (r.success) out.push(r.data);
      }
      return out;
    },
    known(value, values, path) {
      if (value === null || value === undefined || values.includes(value)) return true;
      report('new_enum_value', path, value);
      return false;
    },
    errorShape: (path) => report('new_error_shape', path),
  };
}
