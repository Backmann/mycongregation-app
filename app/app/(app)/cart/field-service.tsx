import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  Publisher,
  UpdateFieldServiceMeetingInput,
  fieldServiceApi,
  fieldServiceMonthThemeApi,
  fieldServiceStatsApi,
  publishersApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { FieldServiceForm } from '../../../components/FieldServiceSection';
import { FieldServiceGenerateModal } from '../../../components/FieldServiceGenerateModal';
import { MyBulb } from '../../../components/MyBulb';
import { ChipRow, PersonChip } from '../../../components/PersonChip';
import { parseISODate, addDays, formatDateISO } from '../../../lib/dates';

/** Actual calendar date (ISO) of a meeting, from its week + weekday. */
function meetingDateISO(m: FieldServiceMeeting): string {
  return formatDateISO(addDays(parseISODate(m.weekStartDate), m.dayOfWeek - 1));
}

/** First Saturday (ISO) of a "YYYY-MM" month — a sensible default for a new entry. */
function firstSaturdayOf(monthKey: string): string {
  let d = dayjs(`${monthKey}-01`);
  while (d.day() !== 6) d = d.add(1, 'day');
  return d.format('YYYY-MM-DD');
}

type MonthBlock = {
  key: string;
  title: string;
  meetings: FieldServiceMeeting[];
};

export default function FieldServiceMeetingsScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const canEdit = perms.canEditFieldServiceMeetings;
  const qc = useQueryClient();
  const { myPublisherId } = useMyPublisher();

  const scrollRef = useRef<ScrollView>(null);
  const monthOffsets = useRef<Record<string, number>>({});
  const didInitialScroll = useRef(false);

  const meetingsQuery = useQuery({
    queryKey: ['field-service', 'all'],
    queryFn: () => fieldServiceApi.list(),
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );
  const themesQuery = useQuery({
    queryKey: ['field-service-month-themes'],
    queryFn: () => fieldServiceMonthThemeApi.list(),
  });
  const themeByMonth = new Map<string, string>(
    (themesQuery.data ?? []).map((tm) => [
      `${tm.year}-${String(tm.month).padStart(2, '0')}`,
      tm.theme,
    ]),
  );

  // --- Month-theme editor ---
  const [themeEdit, setThemeEdit] = useState<{
    monthKey: string;
    value: string;
  } | null>(null);
  const themeM = useMutation({
    mutationFn: (vars: { year: number; month: number; theme: string }) =>
      fieldServiceMonthThemeApi.upsert(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-service-month-themes'] });
      setThemeEdit(null);
    },
  });
  const saveTheme = () => {
    if (!themeEdit) return;
    themeM.mutate({
      year: Number(themeEdit.monthKey.slice(0, 4)),
      month: Number(themeEdit.monthKey.slice(5, 7)),
      theme: themeEdit.value,
    });
  };

  // --- Form state ---
  const [target, setTarget] = useState<FieldServiceMeeting | 'new' | null>(null);
  const [addDefaultDate, setAddDefaultDate] = useState<string | undefined>();
  const [genOpen, setGenOpen] = useState(false);
  const [tab, setTab] = useState<'months' | 'conductors'>('months');

  const conductorStatsQuery = useQuery({
    queryKey: ['field-service-conductor-stats'],
    queryFn: () => fieldServiceStatsApi.conductorStats(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['field-service'] });
    qc.invalidateQueries({ queryKey: ['field-service-conductor-stats'] });
    qc.invalidateQueries({ queryKey: ['field-service-topic-history'] });
  };

  const createM = useMutation({
    mutationFn: (input: CreateFieldServiceMeetingInput) =>
      fieldServiceApi.create(input),
    onSuccess: () => {
      invalidate();
      setTarget(null);
    },
  });
  const updateM = useMutation({
    mutationFn: (vars: { id: string; input: UpdateFieldServiceMeetingInput }) =>
      fieldServiceApi.update(vars.id, vars.input),
    onSuccess: () => {
      invalidate();
      setTarget(null);
    },
  });
  const removeM = useMutation({
    mutationFn: (id: string) => fieldServiceApi.remove(id),
    onSuccess: () => invalidate(),
  });

  const confirmRemove = (id: string) => {
    const msg = t('fieldService.deleteConfirm');
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) removeM.mutate(id);
    } else {
      Alert.alert('', msg, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('fieldService.delete'),
          style: 'destructive',
          onPress: () => removeM.mutate(id),
        },
      ]);
    }
  };

  if (meetingsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  // --- Build continuous month blocks (data span ∪ current month) ---
  const meetings = meetingsQuery.data ?? [];
  const byMonth = new Map<string, FieldServiceMeeting[]>();
  for (const m of meetings) {
    const k = meetingDateISO(m).slice(0, 7);
    const arr = byMonth.get(k);
    if (arr) arr.push(m);
    else byMonth.set(k, [m]);
  }
  const currentMonthKey = dayjs().format('YYYY-MM');
  let minK = currentMonthKey;
  let maxK = currentMonthKey;
  for (const k of byMonth.keys()) {
    if (k < minK) minK = k;
    if (k > maxK) maxK = k;
  }
  const months: MonthBlock[] = [];
  {
    let d = dayjs(`${minK}-01`);
    const end = dayjs(`${maxK}-01`);
    while (d.isBefore(end) || d.isSame(end)) {
      const k = d.format('YYYY-MM');
      const ms = (byMonth.get(k) ?? [])
        .slice()
        .sort(
          (a, b) =>
            meetingDateISO(a).localeCompare(meetingDateISO(b)) ||
            a.startTime.localeCompare(b.startTime),
        );
      const title = d
        .toDate()
        .toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
      months.push({ key: k, title: title.charAt(0).toUpperCase() + title.slice(1), meetings: ms });
      d = d.add(1, 'month');
    }
  }

  const scrollToCurrent = () => {
    if (didInitialScroll.current) return;
    const off = monthOffsets.current[currentMonthKey];
    if (off != null) {
      didInitialScroll.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: false });
    }
  };
  const scrollToMonth = (key: string) => {
    const off = monthOffsets.current[key];
    if (off != null)
      scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: true });
  };

  const openAdd = (monthKey: string) => {
    setAddDefaultDate(firstSaturdayOf(monthKey));
    setTarget('new');
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['months', 'conductors'] as const).map((tb) => (
          <Pressable
            key={tb}
            style={[styles.tabItem, tab === tb && styles.tabItemOn]}
            onPress={() => setTab(tb)}
          >
            <Text style={[styles.tabText, tab === tb && styles.tabTextOn]}>
              {t(`fieldService.tabs.${tb}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'months' && (
        <>
          {/* Month jump bar */}
          <View style={styles.monthBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthBarInner}
          style={styles.monthBarScroll}
        >
          {months.map((m) => (
            <Pressable
              key={m.key}
              style={[
                styles.monthChip,
                m.key === currentMonthKey && styles.monthChipCurrent,
              ]}
              onPress={() => scrollToMonth(m.key)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  m.key === currentMonthKey && styles.monthChipTextCurrent,
                ]}
              >
                {dayjs(`${m.key}-01`)
                  .toDate()
                  .toLocaleDateString(i18n.language, { month: 'short' })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {canEdit && (
          <Pressable style={styles.genBtn} onPress={() => setGenOpen(true)}>
            <Ionicons name="sparkles-outline" size={15} color="#0369a1" />
            <Text style={styles.genBtnText}>
              {t('fieldService.generate.button')}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 48 }}
        onContentSizeChange={scrollToCurrent}
      >
        {months.map((m) => (
          <View
            key={m.key}
            onLayout={(e) => {
              monthOffsets.current[m.key] = e.nativeEvent.layout.y;
              if (m.key === currentMonthKey) scrollToCurrent();
            }}
            style={styles.monthSection}
          >
            <Text
              style={[
                styles.monthTitle,
                m.key === currentMonthKey && styles.monthTitleCurrent,
              ]}
            >
              {m.title}
            </Text>
            {(() => {
              const theme = themeByMonth.get(m.key);
              if (theme) {
                return (
                  <Pressable
                    style={styles.themeRow}
                    onPress={() =>
                      canEdit && setThemeEdit({ monthKey: m.key, value: theme })
                    }
                    disabled={!canEdit}
                  >
                    <Ionicons name="bookmark" size={13} color="#0369a1" />
                    <Text style={styles.themeText}>{theme}</Text>
                  </Pressable>
                );
              }
              if (canEdit) {
                return (
                  <Pressable
                    style={styles.themeAdd}
                    onPress={() => setThemeEdit({ monthKey: m.key, value: '' })}
                  >
                    <Ionicons
                      name="bookmark-outline"
                      size={13}
                      color="#94a3b8"
                    />
                    <Text style={styles.themeAddText}>
                      {t('fieldService.monthTheme.add')}
                    </Text>
                  </Pressable>
                );
              }
              return null;
            })()}

            {m.meetings.length === 0 ? (
              <Text style={styles.emptyMonth}>{t('fieldService.emptyMonth')}</Text>
            ) : (
              m.meetings.map((mt) => {
                const conductor = mt.conductorPublisherId
                  ? publishersById.get(mt.conductorPublisherId) ?? null
                  : null;
                const isMine =
                  !!myPublisherId && mt.conductorPublisherId === myPublisherId;
                const dISO = meetingDateISO(mt);
                return (
                  <View key={mt.id} style={[styles.card, isMine && styles.cardMine]}>
                    <Pressable
                      style={styles.cardMain}
                      onPress={() => canEdit && setTarget(mt)}
                      disabled={!canEdit}
                    >
                      <Text style={styles.when}>
                        {t(`fieldService.days.${mt.dayOfWeek}`)}{' '}
                        {dayjs(dISO).format('DD.MM')} · {mt.startTime}
                      </Text>
                      {mt.isGeneral ? (
                        <View style={styles.generalBadge}>
                          <Ionicons name="people" size={12} color="#7c3aed" />
                          <Text style={styles.generalBadgeText}>
                            {t('fieldService.generalBadge')}
                          </Text>
                        </View>
                      ) : null}
                      <ChipRow>
                        {isMine ? <MyBulb size={15} /> : null}
                        {conductor ? (
                          <PersonChip
                            label={conductor.displayName}
                            variant="main"
                          />
                        ) : (
                          <PersonChip
                            label={t('fieldService.unassigned')}
                            variant="empty"
                          />
                        )}
                      </ChipRow>
                      <Text style={styles.address} numberOfLines={2}>
                        {mt.address}
                      </Text>
                      {!!mt.topic && (
                        <Text style={styles.topic} numberOfLines={3}>
                          {mt.topic}
                        </Text>
                      )}
                      {!!mt.sourceUrl && (
                        <Pressable
                          onPress={() => Linking.openURL(mt.sourceUrl as string)}
                          hitSlop={6}
                        >
                          <Text style={styles.link} numberOfLines={1}>
                            <Ionicons
                              name="link-outline"
                              size={13}
                              color="#0369a1"
                            />{' '}
                            {t('fieldService.openLink')}
                          </Text>
                        </Pressable>
                      )}
                    </Pressable>
                    {canEdit && (
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => confirmRemove(mt.id)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#dc2626"
                        />
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}

            {canEdit && (
              <Pressable style={styles.addBtn} onPress={() => openAdd(m.key)}>
                <Ionicons name="add" size={18} color="#0369a1" />
                <Text style={styles.addBtnText}>{t('fieldService.addEntry')}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
        </>
      )}

      {tab === 'conductors' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {(conductorStatsQuery.data ?? []).length === 0 ? (
            <Text style={styles.emptyMonth}>
              {t('fieldService.conductorsEmpty')}
            </Text>
          ) : (
            (conductorStatsQuery.data ?? [])
              .slice()
              .sort((a, b) => {
                if (!a.lastDate && b.lastDate) return -1;
                if (a.lastDate && !b.lastDate) return 1;
                if (a.lastDate && b.lastDate)
                  return a.lastDate.localeCompare(b.lastDate);
                return 0;
              })
              .map((c) => {
                const pub = publishersById.get(c.conductorPublisherId);
                return (
                  <View key={c.conductorPublisherId} style={styles.condRow}>
                    <Text style={styles.condName}>
                      {pub?.displayName ?? '—'}
                    </Text>
                    <Text style={styles.condStat}>
                      {[
                        t('fieldService.stat.total', { count: c.total }),
                        c.lastDate
                          ? t('fieldService.stat.last', {
                              date: c.lastDate.split('-').reverse().join('.'),
                            })
                          : t('fieldService.stat.never'),
                        c.nextDate
                          ? t('fieldService.stat.next', {
                              date: c.nextDate.split('-').reverse().join('.'),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  </View>
                );
              })
          )}
        </ScrollView>
      )}

      <FieldServiceForm
        target={target}
        weekStartISO={target && target !== 'new' ? target.weekStartDate : ''}
        pickDate={target === 'new'}
        defaultDate={addDefaultDate}
        weekConductorIds={(week, excludeId) =>
          meetings
            .filter(
              (m) =>
                m.weekStartDate === week &&
                m.id !== excludeId &&
                !!m.conductorPublisherId,
            )
            .map((m) => m.conductorPublisherId as string)
        }
        onClose={() => setTarget(null)}
        onCreate={(input) => createM.mutate(input)}
        onUpdate={(id, input) => updateM.mutate({ id, input })}
      />

      <Modal
        visible={themeEdit !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeEdit(null)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setThemeEdit(null)}
          />
          <View style={styles.themeCard}>
            <Text style={styles.themeCardTitle}>
              {t('fieldService.monthTheme.title')}
            </Text>
            <TextInput
              style={styles.themeInput}
              value={themeEdit?.value ?? ''}
              onChangeText={(v) =>
                setThemeEdit((prev) => (prev ? { ...prev, value: v } : prev))
              }
              placeholder={t('fieldService.monthTheme.placeholder')}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={2000}
              autoFocus
            />
            <View style={styles.themeActions}>
              <Pressable
                style={styles.themeCancel}
                onPress={() => setThemeEdit(null)}
              >
                <Text style={styles.themeCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.themeSave}
                onPress={saveTheme}
                disabled={themeM.isPending}
              >
                <Text style={styles.themeSaveText}>
                  {t('fieldService.form.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FieldServiceGenerateModal
        visible={genOpen}
        onClose={() => setGenOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemOn: { borderBottomColor: '#0ea5e9' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  tabTextOn: { color: '#0369a1' },
  condRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 8,
  },
  condName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  condStat: { fontSize: 13, color: '#475569', marginTop: 4 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  monthBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthBarScroll: { flex: 1 },
  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
  },
  genBtnText: { fontSize: 13, fontWeight: '700', color: '#0369a1' },
  monthBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  monthChipCurrent: { backgroundColor: '#0ea5e9' },
  monthChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  monthChipTextCurrent: { color: '#fff' },
  monthSection: { paddingHorizontal: 16, paddingTop: 16 },
  monthTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  monthTitleCurrent: { color: '#0369a1' },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: -4,
    marginBottom: 10,
  },
  themeText: { flex: 1, fontSize: 13, color: '#0369a1', fontWeight: '600' },
  themeAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -4,
    marginBottom: 10,
  },
  themeAddText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  themeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  themeCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  themeInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  themeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  themeCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  themeCancelText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  themeSave: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  themeSaveText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  emptyMonth: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  cardMine: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' },
  cardMain: { flex: 1, gap: 4 },
  when: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  generalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: '#f3e8ff',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  generalBadgeText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  address: { fontSize: 13, color: '#475569' },
  topic: { fontSize: 13, color: '#0f172a' },
  link: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  removeBtn: { paddingLeft: 10, paddingTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderStyle: 'dashed',
    backgroundColor: '#f0f9ff',
    paddingVertical: 12,
    marginBottom: 6,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
});
