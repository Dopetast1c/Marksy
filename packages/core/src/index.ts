// @marksy/core: canonical types, the DiaryProvider interface, grading scales and marks math.
// Nothing here knows a specific diary system (CLAUDE.md, "Provider boundary").

export * from './model/schemas';
export * from './model/names';
export * from './providers/manifest';
export * from './providers/types';
export * from './providers/errors';
export * from './providers/registry';
export * from './http/types';
export * from './grading/types';
export * from './grading/round';
export * from './grading/scale';
export * from './grading/goal';
export * from './grading/format';
export * from './grading/resolve';
export * from './grading/family-rules';
export * from './grading/scales';
export * from './marks/dates';
export * from './marks/short-dates';
export * from './marks/periods';
export * from './marks/stats';
export * from './guidance/guidance';
export * from './http/allow-list';
export * from './http/throttled-client';
export * from './http/logger';
export * from './http/run-context';
export * from './http/fixture-transport';
export * from './drift/check';
