import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTermFinals, useYearFinals } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { ChangeArrow } from '../../components/ChangeArrow';
import { EmptyState } from '../../components/EmptyState';
import { FinalCellView } from '../../components/FinalCell';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ListCard } from '../../components/Section';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useCapabilities, useScale, useSchoolTz, useStudent } from '../../hooks/useStudent';
import { dateStyle, intlLocale, useT } from '../../i18n';
import { finalsStateText, schoolYearLabel } from '../../lib/finals';
import { roman } from '../../lib/period';
import { todayIn } from '../../lib/time';

// Итоги (docs/design.md 5.3b): the marks a teacher sets at the end of a term or a year, on their own screen. Четверти:
// subject × I–IV and Год for the current year; Годы: subject × school year with the arrow against last year. A posted
// final is a filled chip; a calculation (the running term's average, the year by the scale's year rule over the term
// finals posted so far) is an italic decimal with no fill, so nobody reads it as the teacher's mark; a dash where there
// is nothing yet. The legend sits above the table: without it the mix cannot be read. A row opens the subject.

const shortDay = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'numeric' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

function Note({ children }: { children: React.ReactNode }) {
  return <p className="m-0 rounded-md bg-surface2 px-3 py-2.5 text-[13px] text-ink2">{children}</p>;
}

function TermsView({ studentId, termKind }: { studentId: string; termKind: string }) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const student = useStudent(studentId);
  const tz = useSchoolTz(studentId);
  const q = useTermFinals(studentId);
  const locale = intlLocale();
  if (!q.data) return <EmptyState title={q.isError ? t('app.error') : t('app.loading')} />;
  const { terms, rows, state, lastYear } = q.data;
  const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${terms.length + 1}, 32px)` };
  const year = q.data.year ? schoolYearLabel(q.data.year.label) : '';
  return (
    <>
      <Note>{t(`finals.legend.terms.${termKind}`)}</Note>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h2">{[year, student?.classLabel].filter(Boolean).join(' · ')}</h2>
        {state && <span className="text-small text-ink3">{finalsStateText(t, state, dateStyle(), todayIn(tz))}</span>}
      </div>
      <ListCard>
        <div
          className="grid items-center gap-1 pt-2.5 pb-0.5 text-center text-[11px] font-bold tracking-[.04em] text-ink3 uppercase"
          style={cols}
        >
          <span />
          {terms.map((x) => (
            <span key={x.id}>{roman(x.index)}</span>
          ))}
          <span>{t('finals.year')}</span>
        </div>
        <div className="grid items-center gap-1 pb-1.5 text-center text-[9.5px] font-semibold text-ink3" style={cols}>
          <span />
          {terms.map((x) => (
            <span key={x.id} className="flex flex-col leading-tight">
              <span>{shortDay(x.from, locale)}</span>
              <span>{shortDay(x.to, locale)}</span>
            </span>
          ))}
          <span />
        </div>
        {rows.map((r) => (
          <button
            key={r.subject.id}
            type="button"
            onClick={() => navigate(`/s/${studentId}/subjects/${r.subject.id}`)}
            className="grid min-h-12 w-full items-center gap-1 border-t border-line py-2.5 text-left"
            style={cols}
          >
            <span className="flex min-w-0 flex-col gap-px">
              <b className="hyphens-auto break-words">{r.subject.name}</b>
              {lastYear && (
                <span className="truncate text-small text-ink3">
                  {r.lastYear
                    ? t('finals.lastYear', { year: schoolYearLabel(lastYear.label), mark: r.lastYear.raw })
                    : t('finals.newSubject')}
                </span>
              )}
            </span>
            {r.terms.map((c) => (
              <FinalCellView key={c.termId} cell={c} scale={scale} />
            ))}
            <FinalCellView cell={r.year} scale={scale} />
          </button>
        ))}
      </ListCard>
    </>
  );
}

function YearsView({ studentId, termKind }: { studentId: string; termKind: string }) {
  const t = useT();
  const navigate = useNavigate();
  const scale = useScale(studentId);
  const q = useYearFinals(studentId);
  if (!q.data) return <EmptyState title={q.isError ? t('app.error') : t('app.loading')} />;
  const { years, rows } = q.data;
  const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${years.length}, 60px) 28px` };
  return (
    <>
      <Note>{t(`finals.legend.years.${termKind}`)}</Note>
      <ListCard>
        <div
          className="grid items-center gap-1 pt-2.5 pb-1.5 text-center text-[11px] font-bold tracking-[.04em] text-ink3"
          style={cols}
        >
          <span />
          {years.map((y) => (
            <span key={y.id}>{schoolYearLabel(y.label)}</span>
          ))}
          <span />
        </div>
        {rows.map((r) => {
          const cur = r.cells.at(-1)?.value ?? null;
          const prev = r.cells.at(-2)?.value ?? null;
          const content = (
            <>
              <span className="flex min-w-0 flex-col gap-px">
                <b className="hyphens-auto break-words">{r.subjectName}</b>
                {!r.subjectId ? (
                  <span className="truncate text-small text-ink3">{t('finals.notThisYear')}</span>
                ) : r.isNew ? (
                  <span className="truncate text-small text-ink3">{t('finals.newSubject')}</span>
                ) : null}
              </span>
              {r.cells.map((c) => (
                <FinalCellView key={c.yearId} cell={c} scale={scale} />
              ))}
              <span className="text-center text-[15px]">
                <ChangeArrow delta={cur != null && prev != null ? cur - prev : null} trend={r.trend} />
              </span>
            </>
          );
          const cls = 'grid min-h-12 w-full items-center gap-1 border-t border-line py-2.5 text-left first:border-t-0';
          return r.subjectId ? (
            <button
              key={r.subjectName}
              type="button"
              className={cls}
              style={cols}
              onClick={() => navigate(`/s/${studentId}/subjects/${r.subjectId}`)}
            >
              {content}
            </button>
          ) : (
            <div key={r.subjectName} className={cls} style={cols}>
              {content}
            </div>
          );
        })}
      </ListCard>
    </>
  );
}

export function FinalsScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  const caps = useCapabilities(studentId);
  const termKind = caps?.terms && caps.terms !== 'none' ? caps.terms : null;
  // ?mode=quarters|years (design.md 4): a link or the back button lands on the same view
  const [params, setParams] = useSearchParams();
  const shown = termKind && params.get('mode') !== 'years' ? 'terms' : 'years';
  const setMode = (m: 'terms' | 'years') =>
    setParams({ mode: m === 'terms' ? 'quarters' : 'years' }, { replace: true });
  const scale = useScale(studentId);
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('finals.screen')} studentId={studentId} back>
        {termKind && scale && (
          <SegmentedControl
            label={t('finals.screen')}
            value={shown}
            onChange={setMode}
            options={[
              { value: 'terms', label: t(`term.${termKind}.plural`) },
              { value: 'years', label: t('finals.years') },
            ]}
          />
        )}
      </ScreenHeader>
      <Body>
        {!scale ? (
          // a year without marks has no finals (D49)
          <EmptyState title={t('finals.none.title')} text={t('marks.empty.noMarksYear')} />
        ) : shown === 'terms' ? (
          <TermsView studentId={studentId} termKind={termKind ?? 'other'} />
        ) : (
          <YearsView studentId={studentId} termKind={termKind ?? 'other'} />
        )}
      </Body>
    </Frame>
  );
}
