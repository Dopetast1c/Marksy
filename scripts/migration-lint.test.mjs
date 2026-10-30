import { describe, expect, it } from 'vitest';
import { migrationProblems } from './migration-lint.mjs';

const br = '\n--> statement-breakpoint\n';

describe('migration lint', () => {
  it('lets expansions through', () => {
    const text = [
      'CREATE TABLE "jobs" ("id" text PRIMARY KEY NOT NULL, "family_id" uuid NOT NULL)',
      'ALTER TABLE "jobs" ADD CONSTRAINT "jobs_family_fk" FOREIGN KEY ("family_id") REFERENCES "families"("id")',
      'ALTER TABLE "marks" ADD COLUMN "note" text',
      'ALTER TABLE "marks" ADD COLUMN "weight" integer DEFAULT 1 NOT NULL',
      'CREATE INDEX "marks_note_idx" ON "marks" USING btree ("note")',
      'ALTER TABLE "marks" ADD CONSTRAINT "marks_weight_check" CHECK ("weight" > 0) NOT VALID',
    ].join(br);
    expect(migrationProblems(text)).toEqual([]);
  });

  it('refuses what breaks the previous release', () => {
    const cases = {
      'DROP TABLE "old"': 'drops a table',
      'ALTER TABLE "marks" DROP COLUMN "note"': 'drops a column',
      'ALTER TABLE "marks" RENAME COLUMN "note" TO "comment"': 'renames a column',
      'ALTER TABLE "marks" RENAME TO "grades"': 'renames a table',
      'ALTER TABLE "marks" ALTER COLUMN "value" SET DATA TYPE numeric': "changes a column's type",
      'ALTER TABLE "marks" ALTER COLUMN "value" TYPE numeric': "changes a column's type",
      'ALTER TABLE "marks" ALTER COLUMN "note" SET NOT NULL': 'makes a column NOT NULL',
      'CREATE INDEX CONCURRENTLY "x" ON "marks" ("note")':
        'builds an index CONCURRENTLY (migrations run in one transaction)',
      'ALTER TABLE "marks" ADD COLUMN "kind" text NOT NULL':
        'adds a NOT NULL column without a default to an existing table',
      'ALTER TABLE "marks" ADD CONSTRAINT "c" CHECK ("value" > 0)':
        'adds a validated constraint to an existing table (use NOT VALID, validate in a later release)',
    };
    for (const [sql, reason] of Object.entries(cases)) expect(migrationProblems(sql), sql).toEqual([reason]);
  });

  it('a contraction is allowed once the release that stopped using the thing is out', () => {
    const text = '-- marksy:contract expanded in v1.2.0\nALTER TABLE "marks" DROP COLUMN "note"';
    expect(migrationProblems(text, { released: (v) => v === '1.2.0' })).toEqual([]);
    expect(migrationProblems(text, { released: () => false })).toEqual([
      'marked as a contraction of 1.2.0, but v1.2.0 is not released yet',
    ]);
  });

  it('comments do not count', () => {
    expect(migrationProblems('-- we never DROP TABLE here\nCREATE TABLE "x" ("id" integer)')).toEqual([]);
  });
});
