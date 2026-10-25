import { describe, expect, it } from 'vitest';
import { bareOf, refusal, ROLE_SETUP } from './db-read.mjs';

describe('db:read', () => {
  it('lets queries and describe commands through', () => {
    expect(refusal('select count(*) from marks')).toBeNull();
    expect(refusal('select count(*) from marks;')).toBeNull();
    expect(refusal('with x as (select 1) select * from x')).toBeNull();
    expect(refusal('\\d lessons')).toBeNull();
    expect(refusal('\\dt')).toBeNull();
    expect(refusal('explain select 1')).toBeNull();
    // a keyword inside a string, a quoted name or a comment is data
    expect(refusal('select \'delete me\' as "update" from marks -- drop it')).toBeNull();
    expect(refusal("select e'it\\'s; delete' from marks")).toBeNull();
    expect(refusal('select $$; drop table marks; $$ as x')).toBeNull();
    // a column that merely contains a keyword is fine
    expect(refusal('select created_at, updated_at, removed_at, offset_days from marks')).toBeNull();
  });

  it('refuses writes, also hidden behind a query, a comment or a quote, and more than one statement', () => {
    for (const sql of [
      'delete from marks',
      'select 1; delete from marks',
      'select 1; select 2',
      'with d as (delete from marks returning *) select * from d',
      'set default_transaction_read_only = off',
      'begin; select 1',
      'commit',
      'explain analyze select 1',
      'select set_config($$default_transaction_read_only$$, $$off$$, false)',
      'select setval($$s$$, 1)',
      'select pg_terminate_backend(1)',
      'copy marks to stdout',
      // a quote inside a comment or a dollar string must not swallow what follows (the review's cases)
      "select 1 /* ' */; delete from marks; select /* ' */ 1",
      "select $$'$$; commit; begin read write; delete from marks; commit; select $$'$$",
      "select 1 /* ' */; copy (select 1) to program 'id'; select /* ' */ 1",
      "select 1 -- '\n; start transaction read write; truncate marks; commit; select '",
      "select 'not closed",
      'select /* not closed',
      '\\copy marks to x',
      '\\! rm -rf /',
      '\\d marks; drop table marks',
      '\\d marks \\! id',
      '',
    ]) {
      expect(refusal(sql), sql).not.toBeNull();
    }
  });

  it('reads strings, names and comments the way the database does', () => {
    expect(bareOf('select \'a\'\'b\', "c""d" /* x /* y */ z */ -- w\n from t')).toBe('select \'\', ""    \n from t');
    expect(bareOf("select e'\\''")).toBe("select ''");
    expect(bareOf('select $a$ $b$ $a$')).toBe("select ''");
  });

  it('the read role can only read: no superuser, SELECT only, read-only by default', () => {
    expect(ROLE_SETUP).toMatch(/NOSUPERUSER/);
    expect(ROLE_SETUP).toMatch(/default_transaction_read_only = on/);
    expect(ROLE_SETUP).toMatch(/GRANT SELECT ON ALL TABLES/);
    expect(ROLE_SETUP).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)/);
  });
});
