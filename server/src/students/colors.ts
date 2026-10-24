// The subject palette (docs/design.md 6.6): the twelve keys of docs/tokens.json → color.subject that the family picks
// from; a subject without a pick is «авто». A test keeps this list equal to the tokens.

export const SUBJECT_COLORS = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'violet',
  'purple',
  'pink',
  'grey',
] as const;

export type SubjectColor = (typeof SUBJECT_COLORS)[number];
