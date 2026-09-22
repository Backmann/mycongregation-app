import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  Hall,
  MeetingSettingsVersion,
  extractErrorMessage,
  hallsApi,
  meetingSettingsApi,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';
import { Dialog } from '../../../components/Dialog';
import { DateField } from '../../../components/DateField';
import { TimeField } from '../../../components/TimeField';
import { formatDateISO } from '../../../lib/dates';

/**
 * Meeting times and places — one screen (step 3b, 22 September).
 *
 * It was two Profile screens: «Время и место встреч» — the congregation's
 * name, its timezone and the schedule, each with its own save button on one
 * page, the form opening pre-filled so it showed what WOULD be saved rather
 * than what is in force, dates typed as 2026-05-20 — and «Залы Царства», the
 * address book the field-service meetings draw from.
 *
 * Now it reads top to bottom: what is in force, its history, the halls, and
 * the congregation's name and timezone. Every change opens its own window
 * with its own save, so one button never saves another's edit. The requests
 * and the rules are the ones the two screens used; only the layout is new.
 *
 * Admin only, as both screens were — the halls screen checked it itself, the
 * settings screen relied on its row; this one checks, as the halls did.
 */

const QK = ['meeting-settings'] as const;
const HALLS = ['halls'] as const;
const DOW = [1, 2, 3, 4, 5, 6, 7];
/** A Monday — day names come from dayjs in the reader's language. */
const WEEK_ANCHOR = '2024-01-01';

interface Draft {
  effectiveFrom: string;
  midweekDow: number;
  midweekTime: string;
  weekendDow: number;
  weekendTime: string;
  address: string;
  microphoneSlots: number;
}

function todayISO(): string {
  // The DEVICE's day, not UTC. This is the default effectiveFrom of a new
  // settings version: between midnight and 02:00 in a German summer the UTC
  // date is still yesterday, and a version that starts yesterday changes
  // retroactively which day last night's meeting was on.
  return formatDateISO(new Date());
}

/** The timezone this device is in — the best first guess for a congregation. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Whether a string is a timezone the platform actually knows. */
function isUsableTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** What the clock and the calendar read in that timezone right now. */
function nowIn(timezone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return '';
  }
}

export default function MeetingPlaceScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const lang = i18n.language;

  const query = useQuery({ queryKey: QK, queryFn: () => meetingSettingsApi.getOverview(), enabled: isAdmin });
  const hallsQuery = useQuery({ queryKey: HALLS, queryFn: () => hallsApi.list(), enabled: isAdmin });

  const day = useMemo(
    () => (dow: number) => dayjs(WEEK_ANCHOR).add(dow - 1, 'day').locale(lang).format('dddd'),
    [lang],
  );
  const longDate = (iso: string) => dayjs(iso).locale(lang).format('D MMMM YYYY');

  const onError = (e: unknown) => notify(t('meetingSettings.errorTitle'), extractErrorMessage(e));
  const refresh = () => qc.invalidateQueries({ queryKey: QK });
  const refreshHalls = () => qc.invalidateQueries({ queryKey: HALLS });

  const nameMutation = useMutation({
    mutationFn: (n: string) => meetingSettingsApi.updateCongregation({ name: n }),
    onSuccess: refresh,
    onError,
  });
  const timezoneMutation = useMutation({
    mutationFn: (tz: string) => meetingSettingsApi.updateCongregation({ timezone: tz }),
    onSuccess: refresh,
    onError,
  });
  const versionMutation = useMutation({
    mutationFn: (d: Draft) =>
      meetingSettingsApi.upsertVersion({
        effectiveFrom: d.effectiveFrom.trim(),
        midweekDow: d.midweekDow,
        midweekTime: d.midweekTime.trim(),
        weekendDow: d.weekendDow,
        weekendTime: d.weekendTime.trim(),
        address: d.address.trim(),
        // Microphone slots are set in the Duties feature; carried through so
        // saving a new schedule version keeps them.
        microphoneSlots: d.microphoneSlots,
      }),
    onSuccess: refresh,
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => meetingSettingsApi.removeVersion(id),
    onSuccess: refresh,
    onError,
  });
  const hallCreate = useMutation({
    mutationFn: (input: { name: string; address: string; isDefault?: boolean }) => hallsApi.create(input),
    onSuccess: refreshHalls,
    onError,
  });
  const hallUpdate = useMutation({
    mutationFn: (v: { id: string; input: { name?: string; address?: string; isDefault?: boolean } }) =>
      hallsApi.update(v.id, v.input),
    onSuccess: refreshHalls,
    onError,
  });
  const hallRemove = useMutation({
    mutationFn: (id: string) => hallsApi.remove(id),
    onSuccess: refreshHalls,
    onError,
  });

  // --- the windows -------------------------------------------------------
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [tzDraft, setTzDraft] = useState<string | null>(null);
  const [hallDraft, setHallDraft] = useState<{ hall: Hall | null; name: string; address: string; isDefault: boolean } | null>(null);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('halls.adminOnly')}</Text>
      </View>
    );
  }
  if (query.isLoading || hallsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  const data = query.data;
  const effective = data?.effective ?? null;
  const versions = data?.versions ?? [];
  const halls = hallsQuery.data ?? [];
  const congregationName = data?.congregation.name ?? '';
  const congregationTz = data?.congregation.timezone ?? '';

  const openSchedule = () =>
    setDraft({
      effectiveFrom: todayISO(),
      midweekDow: effective?.midweekDow ?? 3,
      midweekTime: effective?.midweekTime ?? '19:00',
      weekendDow: effective?.weekendDow ?? 7,
      weekendTime: effective?.weekendTime ?? '13:00',
      address: effective?.address ?? halls.find((h) => h.isDefault)?.address ?? '',
      microphoneSlots: effective?.microphoneSlots ?? 2,
    });
  const draftValid =
    !!draft &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom) &&
    /^\d{1,2}:\d{2}$/.test(draft.midweekTime.trim()) &&
    /^\d{1,2}:\d{2}$/.test(draft.weekendTime.trim());

  const confirmDeleteVersion = async (v: MeetingSettingsVersion) => {
    if (
      await confirm({
        title: t('meetingSettings.deleteConfirm.title'),
        body: t('meetingSettings.deleteConfirm.body', { date: longDate(v.effectiveFrom) }),
        confirmLabel: t('meetingSettings.deleteConfirm.action'),
        danger: true,
      })
    ) {
      deleteMutation.mutate(v.id);
    }
  };

  const confirmDeleteHall = async (hall: Hall) => {
    if (
      await confirm({
        title: t('halls.deleteTitle'),
        body: t('halls.deleteBody'),
        confirmLabel: t('halls.deleteConfirm'),
        danger: true,
      })
    ) {
      hallRemove.mutate(hall.id);
      setHallDraft(null);
    }
  };

  const tzTrim = (tzDraft ?? '').trim();
  const tzValid = isUsableTimezone(tzTrim);
  const tzPreview = tzValid ? nowIn(tzTrim, lang) : null;
  const hallPending = hallCreate.isPending || hallUpdate.isPending || hallRemove.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* ── What is in force ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>{t('meetingSettings.now')}</Text>
      <View style={styles.card}>
        {effective ? (
          <>
            <InfoRow icon="calendar-outline" title={t('meetingSettings.midweek')}
              subtitle={`${day(effective.midweekDow)} · ${effective.midweekTime}`} />
            <InfoRow icon="calendar-outline" title={t('meetingSettings.weekend')}
              subtitle={`${day(effective.weekendDow)} · ${effective.weekendTime}`} />
            <InfoRow icon="location-outline" title={t('meetingSettings.address')}
              subtitle={effective.address || '—'} />
          </>
        ) : (
          <Text style={styles.empty}>{t('meetingSettings.noVersions')}</Text>
        )}
        <ActionRow icon="create-outline" label={t('meetingSettings.change')} onPress={openSchedule} />
      </View>
      {effective ? (
        <Text style={styles.note}>{t('meetingSettings.since', { date: longDate(effective.effectiveFrom) })}</Text>
      ) : null}

      {/* ── History ──────────────────────────────────────────────────── */}
      {versions.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>{t('meetingSettings.history')}</Text>
          <View style={styles.card}>
            {versions.map((v, i) => {
              const now = v.id === effective?.id;
              return (
                <View key={v.id} style={[styles.row, i > 0 && styles.rowLine]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.histHead}>
                      <Text style={[styles.rowTitle, !now && styles.dim]}>
                        {t('meetingSettings.historySince', { date: longDate(v.effectiveFrom) })}
                      </Text>
                      {now ? (
                        <View style={styles.nowBadge}>
                          <Text style={styles.nowBadgeText}>{t('meetingSettings.effectiveNow')}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowSubtitle}>
                      {t(`meetingSettings.dow.${v.midweekDow}`)} {v.midweekTime} · {t(`meetingSettings.dow.${v.weekendDow}`)}{' '}
                      {v.weekendTime}
                      {v.address ? ` · ${v.address}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void confirmDeleteVersion(v)}
                    hitSlop={8}
                    style={styles.iconBtn}
                    disabled={deleteMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t('meetingSettings.deleteConfirm.title')}
                  >
                    <Ionicons name="trash-outline" size={19} color="#dc2626" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {/* ── Halls ────────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>{t('halls.title')}</Text>
      <View style={styles.card}>
        {halls.length === 0 ? <Text style={styles.empty}>{t('halls.empty')}</Text> : null}
        {halls.map((hall) => (
          <Pressable
            key={hall.id}
            style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.rowPressed]}
            onPress={() => setHallDraft({ hall, name: hall.name, address: hall.address, isDefault: hall.isDefault })}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="business-outline" size={18} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{hall.name}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={2}>{hall.address}</Text>
            </View>
            {hall.isDefault ? <Text style={styles.rightText}>{t('halls.default')}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </Pressable>
        ))}
        <ActionRow
          icon="add"
          label={t('halls.add')}
          onPress={() => setHallDraft({ hall: null, name: '', address: '', isDefault: halls.length === 0 })}
        />
      </View>
      <Text style={styles.note}>{t('halls.hint')}</Text>

      {/* ── The congregation ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>{t('meetingSettings.congregation')}</Text>
      <View style={styles.card}>
        <NavRow icon="people-outline" title={t('meetingSettings.congregationName')} subtitle={congregationName || '—'}
          onPress={() => setNameDraft(congregationName)} />
        <NavRow
          icon="globe-outline"
          title={t('meetingSettings.timezone')}
          subtitle={
            congregationTz
              ? `${congregationTz} · ${t('meetingSettings.timezoneNow', { when: nowIn(congregationTz, lang) })}`
              : '—'
          }
          onPress={() => setTzDraft(congregationTz || deviceTimezone())}
          line
        />
      </View>

      {/* ── Window: the schedule ─────────────────────────────────────── */}
      <Dialog
        visible={draft !== null}
        title={t('meetingSettings.change')}
        icon="time-outline"
        iconTint="#0284c7"
        iconBg="#e0f2fe"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        confirmDisabled={!draftValid}
        pending={versionMutation.isPending}
        onConfirm={() => {
          if (!draft || !draftValid) return;
          versionMutation.mutate(draft, { onSuccess: () => setDraft(null) });
        }}
        onCancel={() => setDraft(null)}
        scroll
      >
        {draft ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{t('meetingSettings.midweek')}</Text>
            <DayPicker value={draft.midweekDow} onChange={(d) => setDraft({ ...draft, midweekDow: d })} t={t} />
            <TimeField value={draft.midweekTime} onChange={(v) => setDraft({ ...draft, midweekTime: v })} placeholder="19:00" />

            <Text style={[styles.fieldLabel, styles.gap]}>{t('meetingSettings.weekend')}</Text>
            <DayPicker value={draft.weekendDow} onChange={(d) => setDraft({ ...draft, weekendDow: d })} t={t} />
            <TimeField value={draft.weekendTime} onChange={(v) => setDraft({ ...draft, weekendTime: v })} placeholder="13:00" />

            <Text style={[styles.fieldLabel, styles.gap]}>{t('meetingSettings.address')}</Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={draft.address}
              onChangeText={(v) => setDraft({ ...draft, address: v })}
              placeholder={t('meetingSettings.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
            />
            {/* One tap fills the address from the halls list — the free text
                stays, so an address that is in no list still fits. */}
            {halls.length > 0 ? (
              <View style={styles.chips}>
                <Text style={styles.chipsLabel}>{t('meetingSettings.fromHalls')}</Text>
                {halls.map((h) => {
                  const on = draft.address.trim() === h.address.trim();
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => setDraft({ ...draft, address: h.address })}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{h.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, styles.gap]}>{t('meetingSettings.effectiveFromLabel')}</Text>
            <DateField value={draft.effectiveFrom} onChange={(v) => setDraft({ ...draft, effectiveFrom: v })} />
            <Text style={styles.hint}>{t('meetingSettings.effectiveFromHint')}</Text>
          </View>
        ) : null}
      </Dialog>

      {/* ── Window: the name ─────────────────────────────────────────── */}
      <Dialog
        visible={nameDraft !== null}
        title={t('meetingSettings.congregationName')}
        icon="people-outline"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        confirmDisabled={!(nameDraft ?? '').trim() || (nameDraft ?? '').trim() === congregationName}
        pending={nameMutation.isPending}
        onConfirm={() => nameMutation.mutate((nameDraft ?? '').trim(), { onSuccess: () => setNameDraft(null) })}
        onCancel={() => setNameDraft(null)}
      >
        <TextInput
          style={styles.input}
          value={nameDraft ?? ''}
          onChangeText={setNameDraft}
          placeholder={t('meetingSettings.congregationName')}
          placeholderTextColor="#94a3b8"
        />
      </Dialog>

      {/* ── Window: the timezone ─────────────────────────────────────── */}
      <Dialog
        visible={tzDraft !== null}
        title={t('meetingSettings.timezone')}
        icon="globe-outline"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        confirmDisabled={!tzValid || tzTrim === congregationTz}
        pending={timezoneMutation.isPending}
        onConfirm={() => timezoneMutation.mutate(tzTrim, { onSuccess: () => setTzDraft(null) })}
        onCancel={() => setTzDraft(null)}
      >
        <View style={{ gap: 8 }}>
          <TextInput
            style={styles.input}
            value={tzDraft ?? ''}
            onChangeText={setTzDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Europe/Berlin"
            placeholderTextColor="#94a3b8"
          />
          {/* Live proof the value is right: a mistyped name would otherwise
              show only weeks later, as a day boundary in the wrong place. */}
          <Text style={styles.hint}>
            {tzPreview ? t('meetingSettings.timezoneNow', { when: tzPreview }) : t('meetingSettings.timezoneInvalid')}
          </Text>
          <Pressable onPress={() => setTzDraft(deviceTimezone())} hitSlop={6}>
            <Text style={styles.link}>{t('meetingSettings.useDeviceTimezone')}</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* ── Window: a hall ───────────────────────────────────────────── */}
      <Dialog
        visible={hallDraft !== null}
        title={hallDraft?.hall ? t('halls.editTitle') : t('halls.add')}
        icon="business-outline"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('halls.save')}
        confirmDisabled={!hallDraft || !hallDraft.name.trim() || !hallDraft.address.trim()}
        pending={hallPending}
        extraLabel={hallDraft?.hall ? t('halls.deleteConfirm') : undefined}
        onExtra={hallDraft?.hall ? () => void confirmDeleteHall(hallDraft.hall as Hall) : undefined}
        onConfirm={() => {
          if (!hallDraft) return;
          const input = { name: hallDraft.name.trim(), address: hallDraft.address.trim(), isDefault: hallDraft.isDefault };
          const done = { onSuccess: () => setHallDraft(null) };
          if (hallDraft.hall) hallUpdate.mutate({ id: hallDraft.hall.id, input }, done);
          else hallCreate.mutate(input, done);
        }}
        onCancel={() => setHallDraft(null)}
        scroll
      >
        {hallDraft ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{t('halls.name')}</Text>
            <TextInput
              style={styles.input}
              value={hallDraft.name}
              onChangeText={(v) => setHallDraft({ ...hallDraft, name: v })}
              placeholder={t('halls.namePlaceholder')}
              placeholderTextColor="#94a3b8"
            />
            <Text style={[styles.fieldLabel, styles.gap]}>{t('halls.address')}</Text>
            <TextInput
              style={styles.input}
              value={hallDraft.address}
              onChangeText={(v) => setHallDraft({ ...hallDraft, address: v })}
              placeholder={t('halls.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('halls.makeDefault')}</Text>
              <Switch value={hallDraft.isDefault} onValueChange={(v) => setHallDraft({ ...hallDraft, isDefault: v })} />
            </View>
          </View>
        ) : null}
      </Dialog>
    </ScrollView>
  );
}

function InfoRow({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={[styles.row, styles.rowLine]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color="#0ea5e9" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  onPress,
  line,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  line?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, line && styles.rowLine, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color="#0ea5e9" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

function ActionRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color="#0369a1" style={{ marginRight: 10 }} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function DayPicker({ value, onChange, t }: { value: number; onChange: (dow: number) => void; t: (k: string) => string }) {
  return (
    <View style={styles.dayRow}>
      {DOW.map((d) => {
        const on = d === value;
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            style={[styles.dayChip, on && styles.dayChipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{t(`meetingSettings.dow.${d}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const INK = '#0f172a';
const SOFT = '#64748b';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: SOFT, fontSize: 15, textAlign: 'center' },
  // The Profile's section and row language, so the screens read alike.
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: SOFT,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  card: { backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  rowPressed: { backgroundColor: '#f8fafc' },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, color: INK, fontWeight: '500', fontFamily: 'Manrope_500Medium' },
  rowSubtitle: { fontSize: 12.5, color: SOFT, marginTop: 2 },
  dim: { color: SOFT },
  rightText: { fontSize: 12.5, color: SOFT, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', marginRight: 6 },
  actionText: { fontSize: 14.5, color: '#0369a1', fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  empty: { padding: 18, color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  note: { fontSize: 12.5, color: SOFT, paddingHorizontal: 20, marginTop: 8, lineHeight: 17 },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nowBadge: { backgroundColor: '#dcfce7', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },
  nowBadgeText: { fontSize: 11, color: '#15803d', fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  iconBtn: { padding: 6, marginLeft: 6 },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: SOFT,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  gap: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: INK,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: SOFT, lineHeight: 17, marginTop: 2 },
  link: { fontSize: 13.5, color: '#0369a1', fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dayChipOn: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  dayChipText: { fontSize: 13, color: SOFT, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  dayChipTextOn: { color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 },
  chipsLabel: { fontSize: 12.5, color: SOFT },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
  chipText: { fontSize: 12.5, color: SOFT, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  chipTextOn: { color: '#0369a1' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  switchLabel: { fontSize: 14, color: INK },
});
