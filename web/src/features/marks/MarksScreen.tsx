import { useNavigate, useParams } from 'react-router';
import type { FeedItem } from '../../api/queries';
import { useMarksFeed } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { FinalsEntry } from '../../components/FinalsEntry';
import { CommentIcon } from '../../components/icons';
import { AbsenceChip, MarkChip } from '../../components/MarkChip';
import { MarkFilter, useMarkFilterFor } from '../../components/MarkFilter';
import { PeriodBar, PeriodNav } from '../../components/PeriodControls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard, MoreButton, Row, Stripe } from '../../components/Section';
import { useCapabilities, useScale, useSchoolTz } from '../../hooks/useStudent';
import { dateStyle, useT } from '../../i18n';
import { dayCaption } from '../../lib/days';
import { roman } from '../../lib/period';
import { subjectStyle } from '../../lib/subject-color';
import { todayIn } from '../../lib/time';
import { usePeriod } from '../../state/store';

// Оценки (docs/design.md 5.3, ux-principles D27, D28, D30, D56): the list, nothing else; the average and the bands are on
// Главная. The period control and the mark filter in the header, the navigator, the finals entry row, then the days,
// newest first. In a day: the finals card on the day a term's finals were posted, the marks (the work type only when
// the diary set one, no placeholder), the absences as quiet rows (never marks), the teacher's comments without a mark,
// the marks the teacher changed or removed. No "new" dot (D28) and no StatBlock (D30).

type Group = { date: string; items: FeedItem[] };

function byDay(items: readonly FeedItem[]): Group[] {
  const out: Group[] = [];
  for (const i of items) {
    const last = out.at(-1);
    if (last?.date === i.date) last.items.push(i);
    else out.push({ date: i.date, items: [i] });
  }
  return out;
}

export function MarksScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { studentId = '' } = useParams();
  const scale = useScale(studentId);
  const caps = useCapabilities(studentId);
  const tz = useSchoolTz(studentId);
  const { kind, offset } = usePeriod();
  const filter = useMarkFilterFor(studentId);
  const feed = useMarksFeed(studentId, { period: kind, offset }, filter.query);
  const ds = dateStyle();
  const today = todayIn(tz);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const toSubject = (id: string | undefined) => id && navigate(`/s/${studentId}/subjects/${id}`);

  const row = (i: FeedItem) => {
    switch (i.type) {
      case 'mark': {
        const sub = [i.workType ? t(`workType.${i.workType}`) : null, i.topic].filter(Boolean).join(' · ');
        return (
          <Row
            key={i.id}
            stripe={<Stripe subject={subjectStyle(i.subject.name, i.subject.color)} />}
            lead={<MarkChip mark={i.mark} />}
            title={i.subject.name}
            sub={sub || null}
            trail={
              i.comment ? (
                <span className="flex-none text-ink3" title={i.comment}>
                  <CommentIcon />
                  <span className="sr-only">{i.comment}</span>
                </span>
              ) : undefined
            }
            onClick={() => toSubject(i.subject.id)}
          />
        );
      }
      case 'absence':
        return (
          <Row
            key={i.id}
            stripe={
              i.subject ? (
                <Stripe subject={subjectStyle(i.subject.name, i.subject.color)} />
              ) : (
                <Stripe severity="neutral" />
              )
            }
            lead={<AbsenceChip code={i.code ?? t('marks.absentCode')} />}
            title={i.subject?.name ?? t('marks.absence')}
            sub={i.subject ? t('marks.absence') : null}
            quiet
            onClick={() => toSubject(i.subject?.id)}
          />
        );
      case 'comment':
        return (
          <Row
            key={i.id}
            stripe={<Stripe severity="neutral" />}
            lead={
              <span className="grid size-[30px] flex-none place-items-center rounded-[9px] bg-surface2 text-ink2">
                <CommentIcon size={16} />
              </span>
            }
            title={i.subject?.name ?? t('marks.comment')}
            sub={i.text ? t('event.quote', { text: i.text }) : null}
            wrap
            onClick={() => toSubject(i.subject?.id)}
          />
        );
      case 'markChanged':
      case 'markRemoved':
        return (
          <Row
            key={i.id}
            stripe={<Stripe subject={subjectStyle(i.subject.name, i.subject.color)} />}
            lead={<MarkChip mark={i.mark} />}
            title={i.subject.name}
            sub={
              i.type === 'markRemoved'
                ? t('marks.removed')
                : i.before
                  ? t('marks.changed', { before: i.before })
                  : t('marks.changedPlain')
            }
            onClick={() => toSubject(i.subject.id)}
          />
        );
      default:
        return null;
    }
  };

  const finalsCard = (i: Extract<FeedItem, { type: 'finals' }>) => (
    <div key={i.id} className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3 shadow-card">
      <div className="flex items-baseline justify-between gap-2.5">
        <b className="text-[15px]">{t(`finals.card.${i.term.kind}`, { roman: roman(i.term.index) })}</b>
        <button
          type="button"
          className="text-[13px] font-bold whitespace-nowrap text-accent"
          onClick={() => navigate(`/s/${studentId}/finals`)}
        >
          {t('finals.all')}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {i.marks.map((m) => (
          <button
            key={m.mark.id}
            type="button"
            onClick={() => toSubject(m.subject.id)}
            className="flex items-center gap-1.5 rounded-pill bg-surface2 py-1 pr-2 pl-1 text-[12.5px] font-semibold"
          >
            <MarkChip mark={m.mark} small />
            {m.subject.name}
          </button>
        ))}
      </div>
      <span className="text-small text-ink3">
        {[
          t('finals.subjects', { count: i.marks.length }),
          i.differ ? t('finals.differ', { count: i.differ }) : t('finals.allMatch'),
          t('finals.notInAverage'),
        ].join(' · ')}
      </span>
    </div>
  );

  let body: React.ReactNode;
  if (!feed.data) body = <EmptyState title={feed.isError ? t('app.error') : t('app.loading')} />;
  else if (!items.length) {
    const pastYear = kind === 'year' && offset > 0 && !!caps?.finalMarks;
    body = filter.comments ? (
      <EmptyState title={t('marks.empty.title')} text={t('marks.empty.comments')} />
    ) : filter.tags.length ? (
      <EmptyState title={t('marks.empty.title')} text={t('marks.empty.tags')} />
    ) : pastYear ? (
      <>
        <EmptyState title={t('marks.empty.title')} text={t('marks.empty.pastYear')} />
        <MoreButton onClick={() => navigate(`/s/${studentId}/finals`)}>{t('finals.title')}</MoreButton>
      </>
    ) : (
      <EmptyState
        title={t('marks.empty.title')}
        text={scale ? t('marks.empty.period') : t('marks.empty.noMarksYear')}
      />
    );
  } else
    body = (
      <>
        {byDay(items).map((g) => {
          const cards = g.items.filter((i) => i.type === 'finals');
          const rows = g.items.filter((i) => i.type !== 'finals');
          const caption = dayCaption(t, g.date, today, ds);
          return (
            <section key={g.date} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 pt-1.5">
                <b className="text-[13px]">{caption.label}</b>
                <span className="text-[12px] text-ink3">{caption.date}</span>
              </div>
              {cards.map((c) => c.type === 'finals' && finalsCard(c))}
              {rows.length > 0 && <ListCard>{rows.map(row)}</ListCard>}
            </section>
          );
        })}
        {feed.hasNextPage && <MoreButton onClick={() => void feed.fetchNextPage()}>{t('marks.more')}</MoreButton>}
      </>
    );

  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('screen.marks')} studentId={studentId}>
        <PeriodBar studentId={studentId} />
        <MarkFilter studentId={studentId} />
      </ScreenHeader>
      <Body>
        <PeriodNav studentId={studentId} />
        <FinalsEntry studentId={studentId} />
        <div className={`flex flex-col gap-3 transition-opacity ${feed.isPlaceholderData ? 'opacity-50' : ''}`}>
          {body}
        </div>
      </Body>
    </Frame>
  );
}
