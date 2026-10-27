import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  dutyPlacesApi,
  meetingSettingsApi,
  specialEventsApi,
  extractErrorMessage,
  type DutyPlace,
  type DutyPlacesChange,
  type DutyType,
  type PlaceKind,
} from '../../../lib/api';
import { notify } from '../../../lib/error-bus';
import { failsScreen } from '../../../lib/screen-failure';
import { FONT } from '../../../lib/typography';
import { PLACE_CAPABILITIES, STANDARD_PLACES, placeKey } from '../../../lib/duty-places';
import { DUTY_ICONS } from '../../../components/DutiesSection';
import { Dialog } from '../../../components/Dialog';
import { LoadFailure } from '../../../components/LoadFailure';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { weekRules } from '../../../lib/week-rules';

/**
 * «Места собрания» — the places of the midweek and the weekend meeting, kept
 * once (Lionel, 27 October 2026; mockup «Места собрания — макет»).
 *
 * Until now a place the congregation added, a name, the order and a note
 * lived on one meeting and were typed again the next week, and the number of
 * microphones could not be changed in the app at all. Here they are set once;
 * a new meeting takes them, and the meetings ahead follow a change — nobody
 * already standing at a place is taken off it (the server's rule; the save
 * dialog says where that happens).
 */

type Draft = DutyPlace & { uid: string };

let uidCounter = 0;
const withUid = (p: DutyPlace): Draft => ({ ...p, uid: `p${++uidCounter}` });

const MAX_COUNT = 10;

export default function DutyPlacesScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PlaceKind>('midweek');
  const [drafts, setDrafts] = useState<Partial<Record<PlaceKind, Draft[]>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<DutyPlacesChange | null>(null);

  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['duty-places', kind],
    queryFn: () => dutyPlacesApi.get(kind),
  });

  // The draft starts from what is kept (or the code's list) and stays the
  // draft until saved — switching to the other kind and back keeps it.
  useEffect(() => {
    if (q.data && !drafts[kind]) {
      setDrafts((d) => ({ ...d, [kind]: q.data.places.map(withUid) }));
    }
  }, [q.data, kind, drafts]);

  const draft = drafts[kind] ?? [];
  const setDraft = (next: Draft[]) => setDrafts((d) => ({ ...d, [kind]: next }));
  const saved = q.data?.places ?? [];

  const nameOf = (p: Pick<DutyPlace, 'dutyType' | 'customLabel'>) =>
    p.dutyType === 'custom' ? p.customLabel?.trim() || t('dutyPlaces.unnamed') : t(`duties.types.${p.dutyType}`);

  const dirty = useMemo(() => JSON.stringify(strip(draft)) !== JSON.stringify(strip(saved)), [draft, saved]);
  const problem = useMemo(() => {
    const seen = new Set<string>();
    for (const p of draft) {
      if (p.dutyType === 'custom' && !p.customLabel?.trim()) return t('dutyPlaces.needsName');
      const key = placeKey(p).toLocaleLowerCase();
      if (seen.has(key)) return t('dutyPlaces.twice', { name: nameOf(p) });
      seen.add(key);
    }
    return draft.length === 0 ? t('dutyPlaces.needsOne') : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // «Взять с последней встречи»: offered only when the latest meeting holds
  // places the KEPT template does not — the congregation added them by hand.
  // Compared with what is saved, not with the draft: taking a place out of
  // the draft is not a reason to offer it back.
  const latest = q.data?.latestSheet ?? null;
  const latestExtra = useMemo(() => {
    if (!latest) return [];
    const have = new Set(saved.map(placeKey));
    return latest.places.filter((p) => !have.has(placeKey(p)));
  }, [latest, saved]);
  // The meeting's own day, not its week's Monday.
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const latestDate = latest
    ? (weekRules({
        weekStartISO: latest.weekStartDate,
        version: effectiveVersionFor(settingsQ.data?.versions, latest.weekStartDate),
        events: eventsQ.data ?? [],
      }).dateOf(kind) ?? latest.weekStartDate)
    : null;
  const takeLatest = () => {
    if (!latest) return;
    const byKey = new Map(draft.map((p) => [placeKey(p), p]));
    setDraft(
      latest.places.map((p) => {
        const mine = byKey.get(placeKey(p));
        return mine ? { ...mine, count: p.count, notes: p.notes ?? mine.notes } : withUid(p);
      }),
    );
  };

  const missingStandard = STANDARD_PLACES.filter((type) => !draft.some((p) => p.dutyType === type));

  const update = (uid: string, patch: Partial<DutyPlace>) =>
    setDraft(draft.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };
  const remove = (uid: string) => {
    setDraft(draft.filter((p) => p.uid !== uid));
    setOpen(null);
  };
  const addOwn = () => {
    const p = withUid({ dutyType: 'custom', customLabel: '', count: 1, notes: null, capability: null });
    setDraft([...draft, p]);
    setOpen(p.uid);
  };
  const addStandard = (type: DutyType) =>
    setDraft([...draft, withUid({ dutyType: type, customLabel: null, count: 1, notes: null, capability: null })]);

  const previewM = useMutation({
    mutationFn: () => dutyPlacesApi.preview(kind, strip(draft)),
    onSuccess: setPreview,
    onError: (e) => notify(t('dutyPlaces.errorTitle'), extractErrorMessage(e)),
  });
  const saveM = useMutation({
    mutationFn: () => dutyPlacesApi.save(kind, strip(draft)),
    onSuccess: (res) => {
      setPreview(null);
      setDrafts((d) => ({ ...d, [kind]: res.places.map(withUid) }));
      qc.invalidateQueries({ queryKey: ['duty-places'] });
      qc.invalidateQueries({ queryKey: ['duties'] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
      notify(undefined, t('dutyPlaces.saved', { count: res.meetings }), 'success');
    },
    onError: (e) => notify(t('dutyPlaces.errorTitle'), extractErrorMessage(e)),
  });

  // What the dialog lists: added and removed places, from the two lists.
  const savedKeys = new Set(saved.map(placeKey));
  const draftKeys = new Set(draft.map(placeKey));
  const added = draft.filter((p) => !savedKeys.has(placeKey(p)) && !(p.id && saved.some((s) => s.id === p.id)));
  const removed = saved.filter((p) => !draftKeys.has(placeKey(p)) && !(p.id && draft.some((d) => d.id === p.id)));

  const dateLabel = (iso: string | null) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' })
      : '';

  if (q.isLoading && !drafts[kind]) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }
  if (q.error && !drafts[kind]) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.seg}>
          {(['midweek', 'weekend'] as const).map((k) => (
            <Pressable
              key={k}
              testID={`places-kind-${k}`}
              onPress={() => {
                setKind(k);
                setOpen(null);
              }}
              style={[styles.segItem, kind === k && styles.segOn]}
            >
              <Text style={[styles.segText, kind === k && styles.segTextOn]}>{t(`dutyPlaces.kind.${k}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{t('dutyPlaces.hint')}</Text>

        {latest && latestExtra.length > 0 ? (
          <Pressable testID="places-take-latest" onPress={takeLatest} style={styles.take}>
            <Text style={styles.takeTitle}>{t('dutyPlaces.takeLatest', { date: dateLabel(latestDate) })}</Text>
            <Text style={styles.takeSub}>
              {t('dutyPlaces.takeLatestHas', { list: latestExtra.map(nameOf).join(', ') })}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          {draft.map((p, i) => {
            const icon = DUTY_ICONS[p.dutyType] ?? DUTY_ICONS.custom;
            const isOpen = open === p.uid;
            const own = p.dutyType === 'custom';
            return (
              <View key={p.uid} style={[styles.place, i > 0 && styles.border, isOpen && styles.placeOpen]}>
                <View style={styles.placeRow}>
                  <Pressable
                    style={styles.placeMain}
                    onPress={() => setOpen(isOpen ? null : p.uid)}
                    testID={`place-${i}`}
                    accessibilityRole="button"
                  >
                    <View style={[styles.icon, { backgroundColor: `${icon.color}14` }]}>
                      <Ionicons name={icon.icon} size={17} color={icon.color} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.placeName}>{nameOf(p)}</Text>
                      {own ? (
                        <Text style={styles.placeMark}>
                          {p.capability
                            ? t('dutyPlaces.offerMark', { name: t(`capabilities.items.${p.capability}`) })
                            : t('dutyPlaces.offerBrothers')}
                        </Text>
                      ) : p.dutyType === 'timekeeper' ? (
                        <Text style={styles.placeSub}>{t('dutyPlaces.optional')}</Text>
                      ) : null}
                      {p.notes ? <Text style={styles.placeSub}>{p.notes}</Text> : null}
                    </View>
                  </Pressable>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => update(p.uid, { count: Math.max(1, p.count - 1) })}
                      disabled={p.count <= 1}
                      style={styles.stepBtn}
                      accessibilityLabel={t('dutyPlaces.fewer')}
                    >
                      <Ionicons name="remove" size={16} color={p.count <= 1 ? '#cbd5e1' : '#0369a1'} />
                    </Pressable>
                    <Text style={styles.count}>{p.count}</Text>
                    <Pressable
                      onPress={() => update(p.uid, { count: Math.min(MAX_COUNT, p.count + 1) })}
                      disabled={p.count >= MAX_COUNT}
                      style={styles.stepBtn}
                      accessibilityLabel={t('dutyPlaces.more')}
                    >
                      <Ionicons name="add" size={16} color="#0369a1" />
                    </Pressable>
                  </View>
                  <View style={styles.arrows}>
                    <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={4}>
                      <Ionicons name="chevron-up" size={16} color={i === 0 ? '#e2e8f0' : '#64748b'} />
                    </Pressable>
                    <Pressable onPress={() => move(i, 1)} disabled={i === draft.length - 1} hitSlop={4}>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={i === draft.length - 1 ? '#e2e8f0' : '#64748b'}
                      />
                    </Pressable>
                  </View>
                </View>

                {isOpen ? (
                  <View style={styles.edit}>
                    {own ? (
                      <>
                        <Text style={styles.fieldLabel}>{t('dutyPlaces.name')}</Text>
                        <TextInput
                          style={styles.input}
                          value={p.customLabel ?? ''}
                          onChangeText={(v) => update(p.uid, { customLabel: v })}
                          placeholder={t('dutyPlaces.namePlaceholder')}
                          placeholderTextColor="#94a3b8"
                          maxLength={60}
                          autoFocus={!p.customLabel}
                          testID="place-name"
                        />
                        <Text style={styles.fieldLabel}>{t('dutyPlaces.offer')}</Text>
                        <View style={styles.chips}>
                          <Pressable
                            onPress={() => update(p.uid, { capability: null })}
                            style={[styles.chip, !p.capability && styles.chipOn]}
                          >
                            <Text style={[styles.chipText, !p.capability && styles.chipTextOn]}>
                              {t('dutyPlaces.anyBrother')}
                            </Text>
                          </Pressable>
                          {PLACE_CAPABILITIES.map((c) => (
                            <Pressable
                              key={c}
                              onPress={() => update(p.uid, { capability: c })}
                              style={[styles.chip, p.capability === c && styles.chipOn]}
                            >
                              <Text style={[styles.chipText, p.capability === c && styles.chipTextOn]}>
                                {t(`capabilities.items.${c}`)}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.fieldLabel}>{t('dutyPlaces.notes')}</Text>
                    <TextInput
                      style={styles.input}
                      value={p.notes ?? ''}
                      onChangeText={(v) => update(p.uid, { notes: v || null })}
                      placeholder={t('dutyPlaces.notesPlaceholder')}
                      placeholderTextColor="#94a3b8"
                      maxLength={500}
                    />
                    <Pressable onPress={() => remove(p.uid)} style={styles.removeBtn} testID="place-remove">
                      <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                      <Text style={styles.removeText}>{t('dutyPlaces.remove')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.adds}>
          <Pressable onPress={addOwn} style={styles.addBtn} testID="place-add-own">
            <Ionicons name="add" size={16} color="#0369a1" />
            <Text style={styles.addText}>{t('dutyPlaces.addOwn')}</Text>
          </Pressable>
          {missingStandard.map((type) => (
            <Pressable key={type} onPress={() => addStandard(type)} style={styles.addBtn}>
              <Ionicons name="add" size={16} color="#0369a1" />
              <Text style={styles.addText}>{t(`duties.types.${type}`)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {problem && dirty ? <Text style={styles.problem}>{problem}</Text> : null}
        <Pressable
          onPress={() => previewM.mutate()}
          disabled={!dirty || !!problem || previewM.isPending}
          style={[styles.save, (!dirty || !!problem) && styles.saveOff]}
          testID="places-save"
        >
          <Text style={styles.saveText}>{previewM.isPending ? t('common.saving') : t('common.save')}</Text>
        </Pressable>
      </View>

      <Dialog
        visible={preview !== null}
        title={t(`dutyPlaces.confirmTitle.${kind}`)}
        icon="options-outline"
        iconTint="#0369a1"
        iconBg="#e0f2fe"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        pending={saveM.isPending}
        onConfirm={() => saveM.mutate()}
        onCancel={() => setPreview(null)}
        scroll
      >
        {preview ? (
          <View style={styles.dialog} testID="places-preview">
            <Text style={styles.dialogText}>
              {preview.meetings > 0
                ? t('dutyPlaces.affects', { count: preview.meetings })
                : t('dutyPlaces.affectsNone')}
            </Text>
            {added.length > 0 ? (
              <Text style={styles.dialogSub}>+ {added.map(nameOf).join(', ')}</Text>
            ) : null}
            {removed.length > 0 ? (
              <Text style={styles.dialogSub}>− {removed.map(nameOf).join(', ')}</Text>
            ) : null}
            {preview.kept.length > 0 ? (
              <View style={styles.kept}>
                <Text style={styles.keptTitle}>{t('dutyPlaces.keptTitle')}</Text>
                {preview.kept.map((k, i) => (
                  <Text key={i} style={styles.keptLine}>
                    {dateLabel(k.date)} — {nameOf(k)}: {k.publisherName ?? '—'}
                  </Text>
                ))}
                <Text style={styles.keptHint}>{t('dutyPlaces.keptHint')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Dialog>
    </View>
  );
}

/** What the server is sent, and what «changed?» compares. */
function strip(list: DutyPlace[]): DutyPlace[] {
  return list.map((p) => ({
    id: p.id ?? null,
    dutyType: p.dutyType,
    customLabel: p.dutyType === 'custom' ? (p.customLabel ?? '').trim() : null,
    count: p.count,
    notes: p.notes?.trim() ? p.notes.trim() : null,
    capability: p.dutyType === 'custom' ? (p.capability ?? null) : null,
  }));
}

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#e2e8f0';
const SKY = '#0369a1';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 40, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segOn: { backgroundColor: '#e0f2fe' },
  segText: { fontFamily: FONT.bold, fontSize: 14, color: SOFT },
  segTextOn: { color: SKY },
  hint: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, color: SOFT, marginHorizontal: 2 },
  take: { backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#93c5fd', borderRadius: 12, padding: 12 },
  takeTitle: { fontFamily: FONT.bold, fontSize: 13.5, color: SKY },
  takeSub: { fontFamily: FONT.regular, fontSize: 12.5, color: SOFT, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  place: { paddingHorizontal: 12, paddingVertical: 10 },
  placeOpen: { backgroundColor: '#f0f9ff' },
  border: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontFamily: FONT.bold, fontSize: 14.5, color: INK },
  placeMark: { fontFamily: FONT.medium, fontSize: 12, color: SKY, marginTop: 1 },
  placeSub: { fontFamily: FONT.regular, fontSize: 12, color: SOFT, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: LINE, borderRadius: 10, backgroundColor: '#fff' },
  stepBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: FONT.bold, fontSize: 14, color: INK, minWidth: 18, textAlign: 'center' },
  arrows: { alignItems: 'center' },
  edit: { marginTop: 10, marginLeft: 40, gap: 6 },
  fieldLabel: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: '#94a3b8', marginTop: 4 },
  input: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: INK,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
  chipText: { fontFamily: FONT.semibold, fontSize: 12.5, color: SOFT },
  chipTextOn: { color: SKY },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8 },
  removeText: { fontFamily: FONT.bold, fontSize: 13, color: '#b91c1c' },
  adds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  addText: { fontFamily: FONT.bold, fontSize: 13.5, color: SKY },
  footer: { padding: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: '#f8fafc', gap: 8 },
  problem: { fontFamily: FONT.semibold, fontSize: 13, color: '#b45309' },
  save: { backgroundColor: '#0e7490', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveOff: { opacity: 0.45 },
  saveText: { fontFamily: FONT.extrabold, fontSize: 15, color: '#fff' },
  dialog: { gap: 8 },
  dialogText: { fontFamily: FONT.medium, fontSize: 14.5, lineHeight: 21, color: INK },
  dialogSub: { fontFamily: FONT.semibold, fontSize: 13.5, color: SOFT },
  kept: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 10, gap: 3 },
  keptTitle: { fontFamily: FONT.bold, fontSize: 13.5, color: '#b45309' },
  keptLine: { fontFamily: FONT.medium, fontSize: 13, color: '#78350f' },
  keptHint: { fontFamily: FONT.regular, fontSize: 12.5, color: '#78350f', marginTop: 2 },
});
