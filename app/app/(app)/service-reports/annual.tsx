import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  AnnualFigures,
  CountedPublisher,
  annualReportApi,
  attendanceApi,
} from '../../../lib/api';

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
  const [year, setYear] = useState(currentStart);
  const [open, setOpen] = useState<string | null>(null);

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
    const sum = (pick: (m: (typeof months)[number]) => number | null) =>
      months.reduce((acc, m) => acc + (pick(m) ?? 0), 0);
    const missing = months.filter(
      (m) => m.midweekAverage === null && m.weekendAverage === null,
    ).length;
    return {
      midweek: months.length ? Math.round(sum((m) => m.midweekAverage) / 12) : null,
      weekend: months.length ? Math.round(sum((m) => m.weekendAverage) / 12) : null,
      missing,
    };
  }, [attendance.data]);

  if (figures.isLoading || attendance.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  if (figures.isError) {
    return (
      <View style={styles.centre}>
        <Text style={styles.muted}>{t('annualReport.noAccess')}</Text>
      </View>
    );
  }

  const f = figures.data as AnnualFigures;

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
      </View>

      <Text style={styles.sectionTitle}>
        {t('annualReport.attendanceSection')}
      </Text>
      <View style={styles.plain}>
        <PlainRow
          label={t('eventTypes.midweek')}
          value={attendanceAverages.midweek}
        />
        <PlainRow
          label={t('eventTypes.weekend')}
          value={attendanceAverages.weekend}
        />
      </View>
      {/* The instruction divides by twelve, so a missing month drags the
          average down. Better to say so than to hide it by dividing by fewer. */}
      {attendanceAverages.missing > 0 ? (
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
        people={f.active}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="inactive"
        label={t('annualReport.becameInactive')}
        hint={t('annualReport.becameInactiveHint')}
        people={f.becameInactive}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="reactivated"
        label={t('annualReport.reactivated')}
        hint={t('annualReport.reactivatedHint')}
        people={f.reactivated}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />

      <Text style={styles.sectionTitle}>
        {t('annualReport.circumstancesSection')}
      </Text>
      <Figure
        id="deaf"
        label={t('publishers.fields.isDeaf')}
        people={f.deaf}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="blind"
        label={t('publishers.fields.isBlind')}
        people={f.blind}
        open={open}
        setOpen={setOpen}
        language={i18n.language}
      />
      <Figure
        id="imprisoned"
        label={t('publishers.fields.isImprisoned')}
        people={f.imprisoned}
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
    </ScrollView>
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
  open,
  setOpen,
  language,
}: {
  id: string;
  label: string;
  hint?: string;
  people: CountedPublisher[];
  open: string | null;
  setOpen: (v: string | null) => void;
  language: string;
}) {
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
        <Text style={styles.figureValue}>{people.length}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
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
});
