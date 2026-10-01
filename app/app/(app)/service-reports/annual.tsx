import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  AnnualDriftLine,
  AnnualFigures,
  AnnualListKey,
  AnnualNumberKey,
  AnnualNumbers,
  AnnualSentView,
  CountedPublisher,
  LateFact,
  annualReportApi,
  attendanceApi,
  extractErrorMessage,
  meetingSettingsApi,
} from '../../../lib/api';
import { buildAnnualReportPdfHtml } from '../../../lib/annualReportPdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { Sheet } from '../../../components/Sheet';
import { DateField } from '../../../components/DateField';

/**
 * A draft of the annual congregation report (S-10).
 *
 * Not a form to fill in. Almost every figure the form asks for already follows
 * from the reports and the attendance record, so the app works them out and
 * the secretary checks them — which is both quicker and safer than counting by
 * hand in September.
 *
 * EVERY FIGURE OPENS. Tapping a number shows the people behind it. That is the
 * real safeguard: the secretary knows the congregation by face and will notice
 * one name too many or one missing long before any test would. A number nobody
 * can look into is a number taken on trust, and they are the one who signs it.
 */
export default function AnnualReportScreen() {
  const { t, i18n } = useTranslation();

  const now = dayjs();
  const currentStart = now.month() >= 8 ? now.year() : now.year() - 1;
  /**
   * Which year opens (28 September, Lionel agreed): the one that ENDED, until
   * 20 October. The yearly report is gathered and sent in September, and
   * opened then the running year showed a year of zeros. From 21 October —
   * when September's reports are due — the new year opens. The arrows still
   * reach either.
   */
  const inAutumnGrace =
    now.month() === 8 || (now.month() === 9 && now.date() <= 20);
  // The September task opens the year it is about.
  const params = useLocalSearchParams<{ startYear?: string }>();
  const asked = Number(params.startYear);
  const [year, setYear] = useState(
    Number.isInteger(asked) && asked > 2000
      ? asked
      : inAutumnGrace
        ? currentStart - 1
        : currentStart,
  );
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<AnnualNumbers> | null>(null);
  const [why, setWhy] = useState<AnnualDriftLine | null>(null);

  /**
   * A year is over on 1 September — only then is there anything to send, and
   * only then does what was sent stand beside what the reports say.
   */
  const yearOver = !now.isBefore(dayjs(`${year + 1}-09-01`));
  const sentView = useQuery({
    queryKey: ['annual-report', 'sent', year],
    queryFn: () => annualReportApi.sent(year),
    enabled: yearOver,
  });
  const kept = yearOver ? (sentView.data?.sent ?? null) : null;
  const driftOf = (key: AnnualNumberKey) =>
    sentView.data?.drift.find((d) => d.key === key) ?? null;

  const figures = useQuery({
    queryKey: ['annual-report', year],
    queryFn: () => annualReportApi.figures(year),
  });

  const attendance = useQuery({
    queryKey: ['attendance', 'year', year],
    queryFn: () => attendanceApi.serviceYear(year),
  });

  // The form says plainly: add the twelve monthly averages and divide by
  // twelve. So that is what is done — dividing by however many months happen
  // to have data would quietly disagree with the instruction. A month with
  // nothing recorded is instead reported as a gap to go and fill.
  const attendanceAverages = useMemo(() => {
    const months = attendance.data?.months ?? [];
    // A month still ahead is not a gap, and dividing by twelve in the middle
    // of a year turned a true average of ninety-six into fifty-six — a figure
    // that looked like a fact. The form's "divide by twelve" is written for a
    // finished year, where every month has a figure and the two agree anyway.
    // So the divisor is the months that actually hold one.
    const started = months.filter((m) => m.month <= dayjs().format('YYYY-MM-01'));
    const avg = (pick: (m: (typeof months)[number]) => number | null) => {
      const have = started.map(pick).filter((v): v is number => v !== null);
      return have.length
        ? Math.round(have.reduce((a, b) => a + b, 0) / have.length)
        : null;
    };
    const missing = started.filter(
      (m) => m.midweekAverage === null && m.weekendAverage === null,
    ).length;
    return {
      midweek: avg((m) => m.midweekAverage),
      weekend: avg((m) => m.weekendAverage),
      missing,
      counted: started.length - missing,
    };
  }, [attendance.data]);

  const overview = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
  });

  const print = () => {
    if (!figures.data) return;
    const preopened = openPrintWindow();
    // What was sent, where it was kept: the people counted then, and the
    // averages as filed — a printout of a closed year must match the form.
    const printed: AnnualFigures = kept
      ? { ...figures.data, ...kept.members }
      : figures.data;
    const html = buildAnnualReportPdfHtml({
      figures: printed,
      attendance: {
        midweek: kept ? kept.figures.midweekAverage : attendanceAverages.midweek,
        weekend: kept ? kept.figures.weekendAverage : attendanceAverages.weekend,
      },
      congregationName: overview.data?.congregation?.name ?? '',
      monthName: (m) => dayjs(m).locale(i18n.language).format('MMMM YYYY'),
      printedOn: dayjs().locale(i18n.language).format('D MMMM YYYY'),
      labels: {
        title: t('annualReport.pageTitle'),
        serviceYear: t('attendance.serviceYear', { from: year, to: year + 1 }),
        attendanceSection: t('annualReport.attendanceSection'),
        midweek: t('eventTypes.midweek'),
        weekend: t('eventTypes.weekend'),
        publishersSection: t('annualReport.publishersSection'),
        active: t('annualReport.active'),
        becameInactive: t('annualReport.becameInactive'),
        reactivated: t('annualReport.reactivated'),
        circumstancesSection: t('annualReport.circumstancesSection'),
        deaf: t('publishers.fields.isDeaf'),
        blind: t('publishers.fields.isBlind'),
        imprisoned: t('publishers.fields.isImprisoned'),
        byHandSection: t('annualReport.byHandSection'),
        byHandItems: [
          t('annualReport.byHandTerritories'),
          t('annualReport.byHandUnworked'),
          t('annualReport.byHandBranchHelp'),
        ],
        reportsPerMonth: t('annualReport.reportsPerMonth'),
        asideSection: t('annualReport.asideSection'),
        inactiveNow: t('annualReport.inactiveNow'),
        inactiveNowHint: t('annualReport.inactiveNowHint'),
        lapseUnknown: t('annualReport.lapseUnknown'),
        lapseUnknownHint: t('annualReport.lapseUnknownHint'),
        printed: t('attendance.printedOn'),
        draftNote: t('annualReport.draftNote'),
      },
    });
    void exportHtmlAsPdf(html, { fileName: 'S-10', preopenedWindow: preopened });
  };

  if (figures.isLoading || attendance.isLoading || sentView.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  if (figures.isError) {
    // Blaming permissions for anything that went wrong sent us looking in the
    // wrong place for an hour: the real cause was a failing query, and the
    // screen insisted the report was not available. Only a refusal is called a
    // refusal now; everything else says what actually happened.
    const status = (figures.error as { response?: { status?: number } })
      ?.response?.status;
    const denied = status === 401 || status === 403;
    return (
      <View style={styles.centre}>
        <Text style={styles.muted}>
          {denied
            ? t('annualReport.noAccess')
            : extractErrorMessage(figures.error)}
        </Text>
      </View>
    );
  }

  const f = figures.data as AnnualFigures;
  /** The people behind a form line: as sent where kept, as counted otherwise. */
  const peopleOf = (key: AnnualListKey): CountedPublisher[] =>
    kept ? kept.members[key] : f[key];
  /** The number on a form line: as typed when it was sent, or the count. */
  const valueOf = (key: AnnualListKey): number =>
    kept ? (kept.figures[key] ?? 0) : f[key].length;
  const lineProps = (key: AnnualListKey) => ({
    people: peopleOf(key),
    value: valueOf(key),
    drift: driftOf(key),
    onWhy: setWhy,
  });
  const startSaving = (over: Partial<AnnualNumbers> = {}) =>
    setEditing({
      ...(kept?.figures ?? sentView.data?.now ?? {}),
      ...over,
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear(year - 1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color="#0e7490" />
        </Pressable>
        <Text style={styles.yearLabel}>
          {t('attendance.serviceYear', { from: year, to: year + 1 })}
        </Text>
        <Pressable
          onPress={() => setYear(year + 1)}
          hitSlop={10}
          disabled={year >= currentStart}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={year >= currentStart ? '#cbd5e1' : '#0e7490'}
          />
        </Pressable>
        <Pressable onPress={print} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="print-outline" size={20} color="#0e7490" />
        </Pressable>
      </View>

      {yearOver && sentView.data ? (
        <SentBanner
          view={sentView.data}
          language={i18n.language}
          onSave={() => startSaving()}
        />
      ) : null}

      <Text style={styles.sectionTitle}>
        {t('annualReport.attendanceSection')}
      </Text>
      <View style={styles.plain}>
        <PlainRow
          label={t('eventTypes.midweek')}
          value={
            kept ? kept.figures.midweekAverage : attendanceAverages.midweek
          }
        />
        <PlainRow
          label={t('eventTypes.weekend')}
          value={
            kept ? kept.figures.weekendAverage : attendanceAverages.weekend
          }
        />
      </View>
      {kept && (driftOf('midweekAverage') || driftOf('weekendAverage')) ? (
        <Text style={styles.driftPlain}>
          {t('sent.attendanceNow', {
            midweek: sentView.data?.now.midweekAverage ?? '—',
            weekend: sentView.data?.now.weekendAverage ?? '—',
          })}
        </Text>
      ) : null}
      {/* Said plainly: how many months the figure rests on, and how many are
          still to fill. A number without its footing invites being copied. */}
      {/* Where the figures are the ones sent, the footing of today's record
          is beside the point — the drift line above says what moved. */}
      {kept ? null : (
        <Text style={styles.basis}>
          {t('annualReport.averageBasis', {
            count: attendanceAverages.counted,
          })}
        </Text>
      )}
      {!kept && attendanceAverages.missing > 0 ? (
        <View style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.warnText}>
            {t('annualReport.missingMonths', {
              count: attendanceAverages.missing,
            })}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {t('annualReport.publishersSection')}
      </Text>

      {/* The shape of the year, stated plainly. The app cannot tell "did not
          share" from "not collected yet", so it does not pretend to: a month
          standing far below its neighbours says the data is not in, and the
          secretary is the one who can tell which it is. */}
      <View style={styles.monthsCard}>
        <Text style={styles.monthsTitle}>{t('annualReport.reportsPerMonth')}</Text>
        <View style={styles.monthsRow}>
          {f.monthlyReporters.map((m) => (
            <View key={m.month} style={styles.monthCell}>
              <Text style={styles.monthCount}>{m.count}</Text>
              <Text style={styles.monthName}>
                {dayjs(m.month).locale(i18n.language).format('MMM')}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.monthsNote}>{t('annualReport.reportsPerMonthNote')}</Text>
      </View>
      <Figure
        id="active"
        label={t('annualReport.active')}
        hint={t('annualReport.activeHint')}
        {...lineProps('active')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="inactive"
        label={t('annualReport.becameInactive')}
        hint={t('annualReport.becameInactiveHint')}
        {...lineProps('becameInactive')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="reactivated"
        label={t('annualReport.reactivated')}
        hint={t('annualReport.reactivatedHint')}
        {...lineProps('reactivated')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      {/* Deliberately below the three form figures and marked as not going on
          it. The form asks whose sixth silent month fell inside the year and
          says not to count anyone who lapsed earlier and is still lapsed; the
          elders ask who is inactive now. Two questions, and answering one with
          the other is how a form gets filled in wrongly. */}
      <Figure
        id="inactiveNow"
        label={t('annualReport.inactiveNow')}
        hint={t('annualReport.inactiveNowHint')}
        people={f.inactiveNow}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      {/* Not a figure at all — a question. The form's line runs through the
          month their break began, and for these people that month is on paper,
          from before the app kept reports. Answering it here either way would
          put a wrong number on a signed form. */}
      {f.lapseUnknown.length > 0 && (
        <Figure
          id="lapseUnknown"
          label={t('annualReport.lapseUnknown')}
          hint={t('annualReport.lapseUnknownHint')}
          people={f.lapseUnknown}
          open={open}
          setOpen={setOpen}
          language={i18n.language}
        />
      )}

      <Text style={styles.sectionTitle}>
        {t('annualReport.circumstancesSection')}
      </Text>
      <Figure
        id="deaf"
        label={t('publishers.fields.isDeaf')}
        {...lineProps('deaf')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="blind"
        label={t('publishers.fields.isBlind')}
        {...lineProps('blind')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="imprisoned"
        label={t('publishers.fields.isImprisoned')}
        {...lineProps('imprisoned')}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />

      {/* Said out loud rather than left as empty boxes: the app has no
          territory record and cannot answer for the congregation about help
          from the branch, and pretending otherwise would be worse than
          admitting it. */}
      <Text style={styles.sectionTitle}>{t('annualReport.byHandSection')}</Text>
      <View style={styles.byHand}>
        <Text style={styles.byHandText}>{t('annualReport.byHandNote')}</Text>
      </View>

      {why && sentView.data ? (
        <DriftSheet
          line={why}
          language={i18n.language}
          onClose={() => setWhy(null)}
          onCorrect={() => {
            const line = why;
            setWhy(null);
            startSaving({ [line.key]: line.now });
          }}
        />
      ) : null}
      {editing && sentView.data ? (
        <SaveSheet
          year={year}
          view={sentView.data}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * Where the year stands with the branch: sent and kept, frozen by the app, or
 * not yet saved — each with the one thing to do about it.
 */
function SentBanner({
  view,
  language,
  onSave,
}: {
  view: AnnualSentView;
  language: string;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const day = (d: string) => dayjs(d).locale(language).format('D MMMM YYYY');
  const kept = view.sent;

  if (kept?.confirmed) {
    return (
      <View style={[styles.banner, styles.bannerSent]}>
        <View style={styles.bannerHead}>
          <Ionicons name="lock-closed-outline" size={18} color="#0e7490" />
          <Text style={styles.bannerTitle}>{t('sent.annualTitle')}</Text>
        </View>
        <Text style={styles.bannerText}>
          {kept.savedByName && kept.sentOn
            ? t('sent.byWhom', { date: day(kept.sentOn), name: kept.savedByName })
            : kept.sentOn
              ? t('sent.onDay', { date: day(kept.sentOn) })
              : ''}{' '}
          {t('sent.annualBody')}
        </Text>
        <Pressable onPress={onSave} hitSlop={6} style={styles.bannerLink}>
          <Ionicons name="create-outline" size={15} color="#0e7490" />
          <Text style={styles.bannerLinkText}>{t('sent.correct')}</Text>
        </Pressable>
      </View>
    );
  }
  if (kept) {
    return (
      <View style={[styles.banner, styles.bannerFrozen]}>
        <View style={styles.bannerHead}>
          <Ionicons name="lock-closed-outline" size={18} color="#475569" />
          <Text style={styles.bannerTitle}>{t('sent.frozenTitle')}</Text>
        </View>
        <Text style={styles.bannerText}>
          {t('sent.frozenBody', { date: day(kept.savedAt.slice(0, 10)) })}
        </Text>
        <Pressable onPress={onSave} hitSlop={6} style={styles.bannerLink}>
          <Ionicons name="create-outline" size={15} color="#0e7490" />
          <Text style={styles.bannerLinkText}>{t('sent.confirm')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.bannerUnsaved]}>
      <View style={styles.bannerHead}>
        <Ionicons name="lock-open-outline" size={18} color="#92400e" />
        <Text style={[styles.bannerTitle, { color: '#92400e' }]}>
          {t('sent.unsavedTitle')}
        </Text>
      </View>
      <Text style={[styles.bannerText, { color: '#78350f' }]}>
        {t('sent.unsavedBody')}
      </Text>
      <Pressable style={styles.saveBtn} onPress={onSave}>
        <Text style={styles.saveBtnText}>{t('sent.save')}</Text>
      </Pressable>
      {/* Only while it is still ahead: an older year, from before the app
          kept anything, has no freeze coming, and a date in the past would
          read as a threat already carried out. */}
      {!dayjs().isAfter(dayjs(view.freezeOn), 'day') ? (
        <Text style={styles.bannerNote}>
          {t('sent.freezeNote', { date: day(view.freezeOn) })}
        </Text>
      ) : null}
    </View>
  );
}

/** «Report for August filed 3 September» — one later fact, said plainly. */
function factText(
  f: LateFact,
  t: (k: string, o?: Record<string, unknown>) => string,
  language: string,
): string {
  return t(`sent.facts.${f.kind}`, {
    month: f.reportMonth
      ? dayjs(f.reportMonth).locale(language).format('MMMM YYYY')
      : '',
    date: dayjs(f.at).locale(language).format('D MMMM'),
    day: f.day ? dayjs(f.day).locale(language).format('D MMMM YYYY') : '',
  });
}

/**
 * Why a sent figure and today's count part — person by person, with what was
 * entered after the form went out. Then the two honest choices: correct what
 * was sent, or keep it.
 */
function DriftSheet({
  line,
  language,
  onClose,
  onCorrect,
}: {
  line: AnnualDriftLine;
  language: string;
  onClose: () => void;
  onCorrect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible
      variant="bottom"
      title={t('sent.driftTitle')}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Pressable style={styles.primaryBtn} onPress={onCorrect}>
            <Text style={styles.primaryBtnText}>
              {t('sent.correctTo', { from: line.sent ?? '—', to: line.now ?? '—' })}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>
              {t('sent.keep', { count: line.sent ?? '—' })}
            </Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={styles.compare}>
          <View style={styles.compareCell}>
            <Text style={styles.compareLabel}>{t('sent.sentLabel')}</Text>
            <Text style={styles.compareValue}>{line.sent ?? '—'}</Text>
          </View>
          <View style={styles.compareCell}>
            <Text style={styles.compareLabel}>{t('sent.nowLabel')}</Text>
            <Text style={[styles.compareValue, { color: '#b45309' }]}>
              {line.now ?? '—'}
            </Text>
          </View>
        </View>

        {line.people.length > 0 ? (
          <Text style={styles.sheetSection}>{t('sent.whoTitle')}</Text>
        ) : null}
        {line.people.map((p) => (
          <View key={p.id} style={styles.driftPerson}>
            <Text style={styles.personName}>{p.name}</Text>
            <Text style={styles.driftChange}>{t(`sent.${p.change}`)}</Text>
            {p.reasons.length > 0 ? (
              p.reasons.map((r, i) => (
                <Text key={i} style={styles.driftReason}>
                  · {factText(r, t, language)}
                </Text>
              ))
            ) : (
              <Text style={styles.driftReason}>{t('sent.noReason')}</Text>
            )}
          </View>
        ))}

        <Text style={styles.sheetNote}>{t('sent.notAffect')}</Text>
        <Text style={styles.sheetNote}>{t('sent.correctHint')}</Text>
      </ScrollView>
    </Sheet>
  );
}

const FORM_LINES: { key: AnnualNumberKey; label: string }[] = [
  { key: 'midweekAverage', label: 'eventTypes.midweek' },
  { key: 'weekendAverage', label: 'eventTypes.weekend' },
  { key: 'active', label: 'annualReport.active' },
  { key: 'becameInactive', label: 'annualReport.becameInactive' },
  { key: 'reactivated', label: 'annualReport.reactivated' },
  { key: 'deaf', label: 'publishers.fields.isDeaf' },
  { key: 'blind', label: 'publishers.fields.isBlind' },
  { key: 'imprisoned', label: 'publishers.fields.isImprisoned' },
];

/**
 * «This is what I sent.» The app offers its own numbers; the secretary keeps
 * or changes them to match the form he filed. The record has to agree with
 * the form, not with the app.
 */
function SaveSheet({
  year,
  view,
  initial,
  onClose,
}: {
  year: number;
  view: AnnualSentView;
  initial: Partial<AnnualNumbers>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sentOn, setSentOn] = useState(
    view.sent?.sentOn ?? dayjs().format('YYYY-MM-DD'),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FORM_LINES.map(({ key }) => [key, initial[key] == null ? '' : String(initial[key])]),
    ),
  );
  const save = useMutation({
    mutationFn: () =>
      annualReportApi.saveSent({
        startYear: year,
        sentOn,
        figures: Object.fromEntries(
          FORM_LINES.map(({ key }) => [
            key,
            values[key].trim() === '' ? null : Number(values[key]),
          ]),
        ) as AnnualNumbers,
      }),
    onSuccess: (data) => {
      qc.setQueryData(['annual-report', 'sent', year], data);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });
  const valid = FORM_LINES.every(({ key }) => /^\d*$/.test(values[key].trim()));

  return (
    <Sheet
      visible
      variant="bottom"
      fills
      title={t('sent.sheetTitle')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      footer={
        <Pressable
          style={[styles.primaryBtn, (!valid || save.isPending) && { opacity: 0.5 }]}
          disabled={!valid || save.isPending}
          onPress={() => save.mutate()}
        >
          <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sheetIntro}>
          {t('sent.sheetIntro', { year: `${year}/${String(year + 1).slice(2)}` })}
        </Text>
        <Text style={styles.fieldLabel}>{t('sent.sentOnLabel')}</Text>
        <DateField value={sentOn} onChange={setSentOn} />
        {FORM_LINES.map(({ key, label }) => {
          const now = view.now[key];
          const typed = values[key].trim();
          const differs = typed !== '' && now !== null && Number(typed) !== now;
          return (
            <View key={key} style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>{t(label)}</Text>
                {differs ? (
                  <Text style={styles.formHint}>
                    {t('sent.byReports', { count: now })}
                  </Text>
                ) : null}
              </View>
              <TextInput
                value={values[key]}
                onChangeText={(v) => setValues((s) => ({ ...s, [key]: v }))}
                keyboardType="number-pad"
                style={styles.formInput}
                accessibilityLabel={t(label)}
              />
            </View>
          );
        })}
        <Text style={styles.sheetNote}>{t('sent.appointmentsNote')}</Text>
        {save.isError ? (
          <Text style={styles.error}>{extractErrorMessage(save.error)}</Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function PlainRow({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.plainRow}>
      <Text style={styles.plainLabel}>{label}</Text>
      <Text style={styles.plainValue}>{value ?? '—'}</Text>
    </View>
  );
}

function Figure({
  id,
  label,
  hint,
  people,
  value,
  drift,
  onWhy,
  open,
  setOpen,
  language,
}: {
  id: string;
  label: string;
  hint?: string;
  people: CountedPublisher[];
  /** The number shown — as sent, where it was; the count otherwise. */
  value?: number;
  /** What the reports say now, where it differs from what was sent. */
  drift?: AnnualDriftLine | null;
  onWhy?: (line: AnnualDriftLine) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
  language: string;
}) {
  const { t } = useTranslation();
  const isOpen = open === id;
  return (
    <View style={styles.figure}>
      <Pressable
        style={styles.figureHead}
        onPress={() => setOpen(isOpen ? null : id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.figureLabel}>{label}</Text>
          {hint ? <Text style={styles.figureHint}>{hint}</Text> : null}
        </View>
        <Text style={styles.figureValue}>{value ?? people.length}</Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#94a3b8"
        />
      </Pressable>

      {isOpen ? (
        people.length === 0 ? (
          <Text style={styles.figureEmpty}>—</Text>
        ) : (
          people.map((p) => (
            <View key={p.id} style={styles.person}>
              <Text style={styles.personName}>{p.name}</Text>
              {p.month ? (
                <Text style={styles.personMonth}>
                  {dayjs(`${p.month}-01`).locale(language).format('MMMM YYYY')}
                </Text>
              ) : null}
            </View>
          ))
        )
      ) : null}

      {drift && onWhy ? (
        <Pressable style={styles.driftLine} onPress={() => onWhy(drift)}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.driftText}>
            {t('sent.nowDiffers', { count: drift.now ?? '—' })}
          </Text>
          <Text style={styles.driftWhy}>{t('sent.why')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 12, paddingBottom: 40 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#64748b', fontSize: 14, textAlign: 'center' },

  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  yearLabel: { fontSize: 16, color: '#0f172a', fontFamily: 'Manrope_700Bold' },

  sectionTitle: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Manrope_700Bold',
    marginTop: 18,
    marginBottom: 6,
    marginLeft: 4,
  },

  plain: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
  },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  plainLabel: { flex: 1, fontSize: 14.5, color: '#0f172a' },
  plainValue: {
    fontSize: 20,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
  },

  basis: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 6,
    marginLeft: 4,
  },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  warnText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },

  monthsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  monthsTitle: {
    fontSize: 13,
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },
  monthsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  monthCell: {
    minWidth: 44,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  monthCount: {
    fontSize: 15,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
  },
  monthName: {
    fontSize: 10.5,
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  monthsNote: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 8,
    lineHeight: 16,
  },
  figure: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    paddingHorizontal: 14,
  },
  figureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  figureLabel: { fontSize: 14.5, color: '#0f172a' },
  figureHint: { fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 16 },
  figureValue: {
    fontSize: 22,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
  },
  figureEmpty: { fontSize: 14, color: '#94a3b8', paddingBottom: 12 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  personName: { flex: 1, fontSize: 14, color: '#334155' },
  personMonth: {
    fontSize: 12.5,
    color: '#94a3b8',
    textTransform: 'capitalize',
  },

  byHand: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  byHandText: { fontSize: 13.5, color: '#475569', lineHeight: 19 },

  banner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  bannerSent: { backgroundColor: '#ecfeff', borderColor: '#a5f3fc' },
  bannerFrozen: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' },
  bannerUnsaved: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: {
    fontSize: 15.5,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    flex: 1,
  },
  bannerText: { fontSize: 13.5, color: '#334155', lineHeight: 19, marginTop: 6 },
  bannerNote: { fontSize: 12.5, color: '#92400e', lineHeight: 17, marginTop: 10 },
  bannerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  bannerLinkText: {
    fontSize: 13.5,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#b45309',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },

  driftLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    borderStyle: 'dashed',
    paddingVertical: 10,
  },
  driftText: { flex: 1, fontSize: 13, color: '#92400e' },
  driftWhy: { fontSize: 13, color: '#0e7490', fontFamily: 'Manrope_700Bold' },
  driftPlain: {
    fontSize: 12.5,
    color: '#92400e',
    marginTop: 6,
    marginLeft: 4,
    lineHeight: 17,
  },

  compare: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  compareCell: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  compareLabel: { fontSize: 12.5, color: '#64748b' },
  compareValue: {
    fontSize: 26,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
  },
  sheetSection: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Manrope_700Bold',
    marginTop: 14,
    marginBottom: 4,
  },
  driftPerson: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  driftChange: { fontSize: 12.5, color: '#b45309', marginTop: 2 },
  driftReason: { fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 18 },
  sheetNote: { fontSize: 12.5, color: '#64748b', lineHeight: 18, marginTop: 12 },
  sheetIntro: { fontSize: 13.5, color: '#475569', lineHeight: 19, marginBottom: 10 },
  primaryBtn: {
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  fieldLabel: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  formLabel: { fontSize: 14.5, color: '#0f172a' },
  formHint: { fontSize: 12, color: '#b45309', marginTop: 2 },
  formInput: {
    width: 76,
    textAlign: 'right',
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  error: { color: '#b91c1c', fontSize: 13, marginTop: 10 },
});
