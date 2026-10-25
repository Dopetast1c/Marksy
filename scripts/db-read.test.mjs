import { describe, expect, it } from 'vitest';
import { refusal } from './db-read.mjs';

describe('db:read', () => {
  it('lets queries and describe commands through', () => {
    expect(refusal('select count(*) from marks')).toBeNull();
    expect(refusal('with x as (select 1) select * from x; select 2;')).toBeNull();
    expect(refusal('\\d lessons')).toBeNull();
    expect(refusal('\\dt')).toBeNull();
    expect(refusal('explain select 1')).toBeNull();
    // a keyword inside a string or a quoted name is data
    expect(refusal('select \'delete me\' as "update" from marks')).toBeNull();
    // a column that merely contains a keyword is fine
    expect(refusal('select created_at, updated_at, removed_at, offset_days from marks')).toBeNull();
  });

  it('refuses writes, also hidden behind a query, and anything that could switch read-only off', () => {
    for (const sql of [
      'delete from marks',
      'select 1; delete from marks',
      'with d as (delete from marks returning *) select * from d',
      'set default_transaction_read_only = off',
      'select 1; reset all',
      'begin; select 1',
      'commit',
      'explain analyze select 1',
      'select set_config($$default_transaction_read_only$$, $$off$$, false)',
      'select setval($$s$$, 1)',
      'select pg_terminate_backend(1)',
      'copy marks to stdout',
      '\\copy marks to x',
      '\\! rm -rf /',
      '\\d marks; drop table marks',
      '',
    ]) {
      expect(refusal(sql), sql).not.toBeNull();
    }
  });
});
