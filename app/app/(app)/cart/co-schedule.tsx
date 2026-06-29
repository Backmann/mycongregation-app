import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
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
import {
  cartLocationsApi,
  coVisitItemsApi,
  hallsApi,
  meetingSettingsApi,
  specialEventsApi,
  type CartLocation,
  type CoVisitItem,
  type Hall,
  type SpecialEvent,
} from '../../../lib/api';
import { buildCoScheduleHtml } from '../../../lib/coSchedulePdf';
import { CIRCUIT_OVERSEER_VISIT_TYPE } from '../../../components/SpecialEventForm';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { TimeWheel } from '../../../components/TimeWheel';
import { usePermissions } from '../../../lib/permissions';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';

const WEEKDAY_ANCHOR = [
  '2024-01-01',
  '2024-01-02',
  '2024-01-03',
  '2024-01-04',
  '2024-01-05',
  '2024-01-06',
  '2024-01-07',
];

type PlaceKind = 'kingdom_hall' | 'cart_location' | 'custom';
type ItemKind =
  | 'field_service'
  | 'lunch'
  | 'pastoral'
  | 'pioneers'
  | 'elders'
  | 'document_review';

interface FormState {
  id: string | null;
  kind: ItemKind;
  itemDate: string;
  startTime: string;
  placeKind: PlaceKind;
  cartLocationId: string | null;
  placeText: string;
  assigneePublisherId: string | null;
  assigneeText: string;
  hostOther: boolean;
  note: string;
  withWife: boolean;
  forWife: boolean;
}

function pickVisit(events: SpecialEvent[]): SpecialEvent | null {
  const visits = events
    .filter((e) => e.type === CIRCUIT_OVERSEER_VISIT_TYPE)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (visits.length === 0) return null;
  const today = formatDateISO(new Date());
  const active = visits.find(
    (e) => e.date <= today && (e.endDate ?? e.date) >= today,
  );
  if (active) return active;
  const upcoming = visits.find((e) => e.date >= today);
  if (upcoming) return upcoming;
  return visits[visits.length - 1];
}

function visitDays(visit: SpecialEvent): string[] {
  const out: string[] = [];
  const end = new Date(`${visit.endDate ?? visit.date}T00:00:00`);
  for (
    let d = new Date(`${visit.date}T00:00:00`);
    d <= end;
    d.setDate(d.getDate() + 1)
  ) {
    out.push(formatDateISO(d));
  }
  return out;
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export default function CoScheduleScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const { canViewCoSchedule, canEditCoSchedule } = usePermissions();
  const loc = i18n.language;

  const [form, setForm] = useState<FormState | null>(null);
  const [mode, setMode] = useState<'co' | 'wife'>('co');

  const { data: events, isLoading } = useQuery({
    queryKey: ['special-events', 'co-schedule'],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: canViewCoSchedule,
  });

  const visit = events ? pickVisit(events) : null;

  const { data: items } = useQuery({
    queryKey: ['co-visit-items', visit?.id],
    queryFn: () => coVisitItemsApi.list(visit!.id),
    enabled: canViewCoSchedule && !!visit,
  });

  const { data: locations } = useQuery({
    queryKey: ['cart-locations'],
    queryFn: () => cartLocationsApi.list(),
    enabled: canEditCoSchedule,
  });
  const { data: settingsOverview } = useQuery({
    queryKey: ['meeting-settings-overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    enabled: canViewCoSchedule,
  });
  const { data: halls } = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    enabled: canViewCoSchedule,
  });
  // Kingdom Hall addresses to choose from: the configured halls (profile) plus
  // the meeting-settings address, so it works whether or not named halls exist.
  const settingsHallAddress = settingsOverview?.effective?.address ?? null;
  const hallOptions: { id: string; address: string }[] = (halls ?? []).map(
    (h: Hall) => ({ id: h.id, address: h.address }),
  );
  if (
    settingsHallAddress &&
    !hallOptions.some((o) => o.address === settingsHallAddress)
  ) {
    hallOptions.push({ id: 'settings', address: settingsHallAddress });
  }
  const defaultHallAddress =
    (halls ?? []).find((h: Hall) => h.isDefault)?.address ??
    hallOptions[0]?.address ??
    null;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['co-visit-items', visit?.id] });
  const createM = useMutation({
    mutationFn: (input: Parameters<typeof coVisitItemsApi.create>[0]) =>
      coVisitItemsApi.create(input),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const updateM = useMutation({
    mutationFn: (p: {
      id: string;
      input: Parameters<typeof coVisitItemsApi.update>[1];
    }) => coVisitItemsApi.update(p.id, p.input),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const removeM = useMutation({
    mutationFn: (id: string) => coVisitItemsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });

  const days = useMemo(() => (visit ? visitDays(visit) : []), [visit]);
  // The wife's schedule mirrors the overseer's joint field-service day, so
  // that day shows on both sides from a single source of truth (no dupes).
  const isSynced = (it: CoVisitItem) => mode === 'wife' && !it.forWife;
  const itemsOf = (kind: ItemKind) =>
    (items ?? []).filter((i) => {
      if (i.kind !== kind) return false;
      if (i.forWife === (mode === 'wife')) return true;
      return (
        mode === 'wife' &&
        kind === 'field_service' &&
        !i.forWife &&
        i.withWife
      );
    });

  if (!canViewCoSchedule) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('coVisit.noAccess')}</Text>
      </View>
    );
  }
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }
  if (!visit) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={40} color="#94a3b8" />
        <Text style={styles.muted}>{t('coVisit.noVisit')}</Text>
      </View>
    );
  }

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  const weekdayName = (dow: number | null) => {
    const d = dow && dow >= 1 && dow <= 7 ? dow : 2;
    return new Date(`${WEEKDAY_ANCHOR[d - 1]}T00:00:00`).toLocaleDateString(
      loc,
      { weekday: 'long' },
    );
  };
  const placeLabel = (it: CoVisitItem) => {
    if (it.placeKind === 'kingdom_hall')
      return it.placeText
        ? `${t('coVisit.kingdomHall')} · ${it.placeText}`
        : t('coVisit.kingdomHall');
    if (it.placeKind === 'cart_location')
      return it.cartLocationName ?? t('coVisit.cartLocation');
    if (it.placeKind === 'custom') return it.placeText ?? '';
    return '';
  };

  const coName = [visit.coFirstName, visit.coLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const period =
    visit.endDate && visit.endDate !== visit.date
      ? `${fmt(visit.date)} — ${fmt(visit.endDate)}`
      : fmt(visit.date);
  const weekMonday = formatDateISO(
    startOfWeekMonday(new Date(`${visit.date}T00:00:00`)),
  );

  const openCreate = (kind: ItemKind) =>
    setForm({
      id: null,
      kind,
      itemDate: days[0] ?? visit.date,
      startTime: '',
      placeKind: 'kingdom_hall',
      cartLocationId: null,
      placeText: '',
      assigneePublisherId: null,
      assigneeText: '',
      hostOther: false,
      note: '',
      forWife: mode === 'wife',
      withWife: false,
    });
  const openEdit = (it: CoVisitItem) =>
    setForm({
      id: it.id,
      kind: (it.kind as ItemKind) ?? 'field_service',
      itemDate: it.itemDate,
      startTime: it.startTime ?? '',
      placeKind: (it.placeKind as PlaceKind) ?? 'kingdom_hall',
      cartLocationId: it.cartLocationId,
      placeText: it.placeText ?? '',
      assigneePublisherId: it.assigneePublisherId,
      assigneeText: it.assigneeText ?? '',
      hostOther:
        it.kind === 'lunch' && !it.assigneePublisherId && !!it.assigneeText,
      note: it.note ?? '',
      forWife: it.forWife,
      withWife: it.withWife,
    });

  const submit = () => {
    if (!form) return;
    const startTime = form.startTime.trim() || null;
    let payload: Parameters<typeof coVisitItemsApi.update>[1] = {
      itemDate: form.itemDate,
      startTime,
    };
    if (form.kind === 'field_service') {
      payload = {
        ...payload,
        placeKind: form.placeKind,
        cartLocationId:
          form.placeKind === 'cart_location' ? form.cartLocationId : null,
        placeText:
          form.placeKind === 'custom'
            ? form.placeText.trim() || null
            : form.placeKind === 'kingdom_hall'
              ? form.placeText.trim() || defaultHallAddress || null
              : null,
        assigneePublisherId: form.assigneePublisherId,
        withWife: form.withWife,
      };
    } else if (form.kind === 'lunch') {
      payload = {
        ...payload,
        assigneePublisherId: form.hostOther ? null : form.assigneePublisherId,
        assigneeText: form.hostOther ? form.assigneeText.trim() || null : null,
        note: form.note.trim() || null,
      };
    } else if (form.kind === 'pastoral') {
      payload = {
        ...payload,
        assigneePublisherId: form.assigneePublisherId,
        note: form.note.trim() || null,
      };
    } else {
      payload = { ...payload, note: form.note.trim() || null };
    }
    if (form.id) updateM.mutate({ id: form.id, input: payload });
    else
      createM.mutate({
        specialEventId: visit.id,
        kind: form.kind,
        forWife: form.forWife,
        ...payload,
      });
  };
  const onDelete = () => {
    if (!form?.id) return;
    const id = form.id;
    if (Platform.OS === 'web') {
      if (window.confirm(t('coVisit.confirmDelete'))) removeM.mutate(id);
      return;
    }
    Alert.alert(t('coVisit.confirmDelete'), '', [
      { text: t('coVisit.cancel'), style: 'cancel' },
      {
        text: t('coVisit.delete'),
        style: 'destructive',
        onPress: () => removeM.mutate(id),
      },
    ]);
  };

  const handlePrint = () => {
    if (Platform.OS !== 'web') {
      Alert.alert(t('coVisit.printWebOnly'));
      return;
    }
    const html = buildCoScheduleHtml({
      visit,
      items: items ?? [],
      locale: loc,
      congregationName: settingsOverview?.congregation.name ?? null,
      hallAddress: settingsOverview?.effective?.address ?? null,
      labels: {
        visitTitle: t('coVisit.visitTitle'),
        coScheduleTitle: t('coVisit.coScheduleTitle'),
        wifeScheduleTitle: t('coVisit.wifeScheduleTitle'),
        fieldService: t('coVisit.fieldServiceTitle'),
        lunches: t('coVisit.lunchesTitle'),
        pastoral: t('coVisit.pastoralTitle'),
        pioneers: t('coVisit.pioneersTitle'),
        elders: t('coVisit.eldersTitle'),
        docReview: t('coVisit.docReviewTitle'),
        day: t('coVisit.day'),
        time: t('coVisit.time'),
        place: t('coVisit.place'),
        accompanier: t('coVisit.accompanying'),
        host: t('coVisit.host'),
        address: t('coVisit.address'),
        phone: t('coVisit.phone'),
        note: t('coVisit.note'),
        target: t('coVisit.pastoralTarget'),
        theme: t('coVisit.pioneersTheme'),
        kingdomHall: t('coVisit.kingdomHall'),
        cartLocation: t('coVisit.cartLocation'),
        wife: t('coVisit.wife'),
        period: t('coVisit.period'),
        accommodation: t('circuitOverseer.accommodationAddress'),
        congregation: t('coVisit.congregation'),
      },
    });
    const win = window.open('', '_blank');
    if (!win) {
      Alert.alert(t('coVisit.printBlocked'));
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const renderSection = (
    kind: ItemKind,
    title: string,
    addLabel: string,
    emptyLabel: string,
    renderItem: (it: CoVisitItem) => ReactNode,
  ) => {
    if (mode === 'wife' && kind !== 'field_service' && kind !== 'lunch') {
      return null;
    }
    const list = itemsOf(kind);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {canEditCoSchedule ? (
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
              onPress={() => openCreate(kind)}
            >
              <Ionicons name="add" size={18} color="#0ea5e9" />
              <Text style={styles.addText}>{addLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        {list.length === 0 ? (
          <Text style={styles.muted}>{emptyLabel}</Text>
        ) : (
          days
            .filter((day) => list.some((i) => i.itemDate === day))
            .map((day) => (
              <View key={day} style={styles.dayBlock}>
                <Text style={styles.dayHeader}>{fmt(day)}</Text>
                {list
                  .filter((i) => i.itemDate === day)
                  .map((it) => (
                    <Pressable
                      key={it.id}
                      disabled={!canEditCoSchedule || isSynced(it)}
                      style={({ pressed }) => [
                        styles.itemRow,
                        pressed &&
                          canEditCoSchedule &&
                          !isSynced(it) &&
                          styles.pressed,
                      ]}
                      onPress={() =>
                        canEditCoSchedule && !isSynced(it) && openEdit(it)
                      }
                    >
                      <Text style={styles.itemTime}>{it.startTime ?? '—'}</Text>
                      <View style={styles.itemBody}>{renderItem(it)}</View>
                      {canEditCoSchedule && !isSynced(it) ? (
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#cbd5e1"
                        />
                      ) : null}
                    </Pressable>
                  ))}
              </View>
            ))
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{coName || t('coVisit.overseer')}</Text>
        {visit.coWifeName ? (
          <Kv label={t('coVisit.wife')} value={visit.coWifeName} />
        ) : null}
        <Kv label={t('coVisit.period')} value={period} />
        <Kv
          label={t('coVisit.midweekDay')}
          value={weekdayName(visit.coMidweekDow)}
        />
        {visit.coAccommodationAddress ? (
          <Kv
            label={t('circuitOverseer.accommodationAddress')}
            value={visit.coAccommodationAddress}
          />
        ) : null}
      </View>

      <Pressable
        style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
        onPress={() => router.push(`/schedule?week=${weekMonday}` as never)}
      >
        <Ionicons name="calendar-outline" size={20} color="#0ea5e9" />
        <Text style={styles.linkText}>{t('coVisit.openMeetingProgram')}</Text>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.pdfBtn, pressed && styles.pressed]}
        onPress={handlePrint}
      >
        <Ionicons name="download-outline" size={18} color="#ffffff" />
        <Text style={styles.pdfBtnText}>{t('coVisit.printButton')}</Text>
      </Pressable>

      {visit.coWifeName ? (
        <View style={styles.toggleRow}>
          {(
            [
              ['co', t('coVisit.tabCo')],
              ['wife', visit.coWifeName || t('coVisit.tabWife')],
            ] as ['co' | 'wife', string][]
          ).map(([m, label]) => (
            <Pressable
              key={m}
              style={[styles.modeChip, mode === m && styles.modeChipActive]}
              onPress={() => setMode(m)}
            >
              <Text
                style={[
                  styles.modeChipText,
                  mode === m && styles.modeChipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {renderSection(
        'field_service',
        t('coVisit.fieldServiceTitle'),
        t('coVisit.addMeeting'),
        t('coVisit.noMeetings'),
        (it) => (
          <>
            <Text style={styles.itemPlace}>{placeLabel(it)}</Text>
            {(it.assigneeName || it.assigneeText) && !isSynced(it) ? (
              <Text style={styles.itemAssignee}>
                {it.assigneeName ?? it.assigneeText}
              </Text>
            ) : null}
            {it.withWife ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  marginTop: 4,
                  backgroundColor: '#f3e8ff',
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Ionicons name="people" size={12} color="#7c3aed" />
                <Text
                  style={{
                    marginLeft: 4,
                    fontSize: 11,
                    color: '#7c3aed',
                    fontWeight: '600',
                  }}
                >
                  {isSynced(it)
                    ? t('coVisit.coBadge')
                    : t('coVisit.spouseBadge')}
                </Text>
              </View>
            ) : null}
          </>
        ),
      )}

      {renderSection(
        'lunch',
        t('coVisit.lunchesTitle'),
        t('coVisit.addLunch'),
        t('coVisit.noLunches'),
        (it) => (
          <>
            <Text style={styles.itemPlace}>
              {it.assigneeName ?? it.assigneeText ?? '—'}
            </Text>
            {it.assigneeAddress ? (
              <Text style={styles.itemAssignee}>{it.assigneeAddress}</Text>
            ) : null}
            {it.assigneePhone ? (
              <Text style={styles.itemAssignee}>{it.assigneePhone}</Text>
            ) : null}
            {it.note ? (
              <Text style={styles.itemAssignee}>{it.note}</Text>
            ) : null}
          </>
        ),
      )}

      {renderSection(
        'pastoral',
        t('coVisit.pastoralTitle'),
        t('coVisit.addPastoral'),
        t('coVisit.noPastoral'),
        (it) => (
          <>
            <Text style={styles.itemPlace}>{it.assigneeName ?? '—'}</Text>
            {it.note ? (
              <Text style={styles.itemAssignee}>{it.note}</Text>
            ) : null}
          </>
        ),
      )}

      {renderSection(
        'pioneers',
        t('coVisit.pioneersTitle'),
        t('coVisit.add'),
        t('coVisit.empty'),
        (it) =>
          it.note ? (
            <Text style={styles.itemPlace}>{it.note}</Text>
          ) : (
            <Text style={styles.itemAssignee}>—</Text>
          ),
      )}

      {renderSection(
        'elders',
        t('coVisit.eldersTitle'),
        t('coVisit.add'),
        t('coVisit.empty'),
        (it) =>
          it.note ? (
            <Text style={styles.itemPlace}>{it.note}</Text>
          ) : (
            <Text style={styles.itemAssignee}>—</Text>
          ),
      )}

      {renderSection(
        'document_review',
        t('coVisit.docReviewTitle'),
        t('coVisit.add'),
        t('coVisit.empty'),
        (it) =>
          it.note ? (
            <Text style={styles.itemPlace}>{it.note}</Text>
          ) : (
            <Text style={styles.itemAssignee}>—</Text>
          ),
      )}

      <Modal
        visible={!!form}
        animationType="slide"
        transparent
        onRequestClose={() => setForm(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setForm(null)}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {form ? (
                <>
                  <Text style={styles.modalTitle}>
                    {form.kind === 'lunch'
                      ? t('coVisit.lunch')
                      : form.kind === 'pastoral'
                        ? t('coVisit.pastoral')
                        : form.kind === 'pioneers'
                          ? t('coVisit.pioneers')
                          : form.kind === 'elders'
                            ? t('coVisit.elders')
                            : form.kind === 'document_review'
                              ? t('coVisit.docReview')
                              : form.id
                                ? t('coVisit.editMeeting')
                                : t('coVisit.addMeeting')}
                  </Text>

                  <Text style={styles.fieldLabel}>{t('coVisit.day')}</Text>
                  <View style={styles.chipRow}>
                    {days.map((day) => (
                      <Pressable
                        key={day}
                        style={[
                          styles.chip,
                          form.itemDate === day && styles.chipActive,
                        ]}
                        onPress={() => setForm({ ...form, itemDate: day })}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            form.itemDate === day && styles.chipTextActive,
                          ]}
                        >
                          {new Date(`${day}T00:00:00`).toLocaleDateString(loc, {
                            weekday: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>{t('coVisit.time')}</Text>
                  <TimeWheel
                    value={form.startTime}
                    onChange={(v) => setForm({ ...form, startTime: v })}
                  />

                  {form.kind === 'field_service' ? (
                    <>
                      <Text style={styles.fieldLabel}>{t('coVisit.place')}</Text>
                      <View style={styles.chipRow}>
                        {(
                          [
                            ['kingdom_hall', t('coVisit.kingdomHall')],
                            ['custom', t('coVisit.placeOther')],
                          ] as [PlaceKind, string][]
                        ).map(([k, label]) => (
                          <Pressable
                            key={k}
                            style={[
                              styles.chip,
                              form.placeKind === k && styles.chipActive,
                            ]}
                            onPress={() => setForm({ ...form, placeKind: k })}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                form.placeKind === k && styles.chipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {form.placeKind === 'kingdom_hall' &&
                      hallOptions.length > 0 ? (
                        <View style={styles.chipRow}>
                          {hallOptions.map((opt) => {
                            const active =
                              form.placeText === opt.address ||
                              (!form.placeText &&
                                opt.address === defaultHallAddress);
                            return (
                              <Pressable
                                key={opt.id}
                                style={[
                                  styles.chip,
                                  active && styles.chipActive,
                                ]}
                                onPress={() =>
                                  setForm({ ...form, placeText: opt.address })
                                }
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    active && styles.chipTextActive,
                                  ]}
                                >
                                  {opt.address}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                      {form.placeKind === 'cart_location' ? (
                        <View style={styles.chipRow}>
                          {(locations ?? []).map((l: CartLocation) => (
                            <Pressable
                              key={l.id}
                              style={[
                                styles.chip,
                                form.cartLocationId === l.id &&
                                  styles.chipActive,
                              ]}
                              onPress={() =>
                                setForm({ ...form, cartLocationId: l.id })
                              }
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  form.cartLocationId === l.id &&
                                    styles.chipTextActive,
                                ]}
                              >
                                {l.name}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {form.placeKind === 'custom' ? (
                        <TextInput
                          style={styles.input}
                          value={form.placeText}
                          onChangeText={(v) =>
                            setForm({ ...form, placeText: v })
                          }
                          placeholder={t('coVisit.placeOtherHint')}
                          placeholderTextColor="#94a3b8"
                        />
                      ) : null}
                      <PublisherSelector
                        label={t('coVisit.accompanying')}
                        value={form.assigneePublisherId}
                        genderFilter={form.forWife ? 'sister' : 'brother'}
                        onChange={(id) =>
                          setForm({ ...form, assigneePublisherId: id })
                        }
                      />
                      {!form.forWife ? (
                        <Pressable
                          onPress={() =>
                            setForm({ ...form, withWife: !form.withWife })
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 14,
                            marginBottom: 2,
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: form.withWife }}
                        >
                          <Ionicons
                            name={
                              form.withWife ? 'checkbox' : 'square-outline'
                            }
                            size={22}
                            color={form.withWife ? '#0ea5e9' : '#94a3b8'}
                          />
                          <Text
                            style={{
                              marginLeft: 10,
                              fontSize: 15,
                              color: '#334155',
                              fontWeight: form.withWife ? '600' : '400',
                            }}
                          >
                            {t('coVisit.serveWithSpouse')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}

                  {form.kind === 'lunch' ? (
                    <>
                      <View style={styles.toggleRow}>
                        {(
                          [
                            [false, t('coVisit.host')],
                            [true, t('coVisit.hostOther')],
                          ] as [boolean, string][]
                        ).map(([v, label]) => (
                          <Pressable
                            key={String(v)}
                            style={[
                              styles.chip,
                              form.hostOther === v && styles.chipActive,
                            ]}
                            onPress={() => setForm({ ...form, hostOther: v })}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                form.hostOther === v && styles.chipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {form.hostOther ? (
                        <TextInput
                          style={styles.input}
                          value={form.assigneeText}
                          onChangeText={(v) =>
                            setForm({ ...form, assigneeText: v })
                          }
                          placeholder={t('coVisit.hostName')}
                          placeholderTextColor="#94a3b8"
                        />
                      ) : (
                        <PublisherSelector
                          label={t('coVisit.host')}
                          value={form.assigneePublisherId}
                          onChange={(id) =>
                            setForm({ ...form, assigneePublisherId: id })
                          }
                        />
                      )}
                      <Text style={styles.fieldLabel}>{t('coVisit.note')}</Text>
                      <TextInput
                        style={styles.input}
                        value={form.note}
                        onChangeText={(v) => setForm({ ...form, note: v })}
                        placeholder={t('coVisit.note')}
                        placeholderTextColor="#94a3b8"
                      />
                    </>
                  ) : null}

                  {form.kind === 'pastoral' ? (
                    <>
                      <Text style={styles.fieldLabel}>
                        {t('coVisit.pastoralElder')}
                      </Text>
                      <PublisherSelector
                        label={t('coVisit.pastoralElder')}
                        value={form.assigneePublisherId}
                        appointmentFilter="elder"
                        onChange={(id) =>
                          setForm({ ...form, assigneePublisherId: id })
                        }
                      />
                      <Text style={styles.fieldLabel}>
                        {t('coVisit.pastoralTarget')}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={form.note}
                        onChangeText={(v) => setForm({ ...form, note: v })}
                        placeholder={t('coVisit.pastoralTarget')}
                        placeholderTextColor="#94a3b8"
                      />
                    </>
                  ) : null}

                  {form.kind === 'pioneers' ||
                  form.kind === 'elders' ||
                  form.kind === 'document_review' ? (
                    <>
                      <Text style={styles.fieldLabel}>
                        {form.kind === 'pioneers'
                          ? t('coVisit.pioneersTheme')
                          : t('coVisit.note')}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={form.note}
                        onChangeText={(v) => setForm({ ...form, note: v })}
                        placeholder={
                          form.kind === 'pioneers'
                            ? t('coVisit.pioneersTheme')
                            : t('coVisit.note')
                        }
                        placeholderTextColor="#94a3b8"
                      />
                    </>
                  ) : null}

                  <View style={styles.modalActions}>
                    {form.id ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.deleteBtn,
                          pressed && styles.pressed,
                        ]}
                        onPress={onDelete}
                      >
                        <Text style={styles.deleteText}>
                          {t('coVisit.delete')}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    <Pressable
                      style={({ pressed }) => [
                        styles.cancelBtn,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => setForm(null)}
                    >
                      <Text style={styles.cancelText}>
                        {t('coVisit.cancel')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.saveBtn,
                        pressed && styles.pressed,
                      ]}
                      onPress={submit}
                      disabled={createM.isPending || updateM.isPending}
                    >
                      <Text style={styles.saveText}>{t('coVisit.save')}</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  muted: { fontSize: 15, color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvLabel: { fontSize: 14, color: '#64748b' },
  kvValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  pressed: { opacity: 0.6 },
  linkText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0f172a' },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
  },
  pdfBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  section: { gap: 8, marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { fontSize: 14, fontWeight: '600', color: '#0ea5e9' },
  dayBlock: { gap: 6 },
  dayHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'capitalize',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
  },
  itemTime: { fontSize: 14, fontWeight: '700', color: '#0ea5e9', width: 48 },
  itemBody: { flex: 1 },
  itemPlace: { fontSize: 15, color: '#0f172a', fontWeight: '600' },
  itemAssignee: { fontSize: 13, color: '#64748b', marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#f1f5f9',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalContent: { padding: 16, gap: 8 },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modeChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  modeChipText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  modeChipTextActive: { color: '#ffffff' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 13, color: '#334155' },
  chipTextActive: { color: '#ffffff', fontWeight: '600' },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  deleteBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  deleteText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
  cancelBtn: { marginLeft: 'auto', paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: '#475569', fontWeight: '600', fontSize: 15 },
  saveBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  saveText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
