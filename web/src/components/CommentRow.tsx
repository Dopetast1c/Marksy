import { shortDate } from '@marksy/core';
import type { FeedItem } from '../api/queries';
import { dateStyle, useT } from '../i18n';
import { CommentChip } from './MarkChip';
import { Row, Stripe } from './Section';

// The teacher's comment without a mark (D56): one row for Marks (screen.marks) and for the subject's marks (design.md
// 5.3, 5.4). The comment icon in place of a chip, the text in quotes and in full. In Marks the title is the subject; on
// the subject screen it is "Teacher's comment" (marks.comment) and the date leads the text. Never counted, never a band colour.

export function CommentRow({
  item,
  inSubject = false,
  onClick,
}: {
  item: Extract<FeedItem, { type: 'comment' }>;
  inSubject?: boolean;
  onClick?: () => void;
}) {
  const t = useT();
  const quote = item.text ? t('event.quote', { text: item.text }) : null;
  return (
    <Row
      // a neutral stripe in both places, as the prototype's remarkRow: a comment is neither good nor bad
      stripe={<Stripe severity="neutral" />}
      lead={<CommentChip />}
      title={inSubject ? t('marks.comment') : (item.subject?.name ?? t('marks.comment'))}
      sub={
        inSubject ? [shortDate(item.date, dateStyle(), { weekday: true }), quote].filter(Boolean).join(' · ') : quote
      }
      wrap
      onClick={onClick}
    />
  );
}
