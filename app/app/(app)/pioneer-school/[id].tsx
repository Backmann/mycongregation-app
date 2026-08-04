import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

import {
  PioneerSchoolDuty,
  extractErrorMessage,
  externalCongregationsApi,
  hallsApi,
  pioneerSchoolApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { LoadFailure } from '../../../components/LoadFailure';
import { RichNote } from '../../../components/RichNote';
import { DateField } from '../../../components/DateField';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { buildPioneerSchoolPdfHtml } from '../../../lib/pioneerSchoolPdf';
import { schoolDates } from './index';

export default function PioneerSchoolScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { canManagePioneerSchool, canViewPioneerSchool } = usePermissions();

  const query = useQuery({
    queryKey: ['pioneer-school', id],
    queryFn: () => pioneerSchoolApi.get(id),
    enabled: canViewPioneerSchool && !!id,
  });
  const helpersQuery = useQuery({
    queryKey: ['pioneer-school', 'helpers'],
    queryFn: () => pioneerSchoolApi.listHelpers(),
    enabled: canViewPioneerSchool,
  });
  const loadQuery = useQuery({
    queryKey: ['pioneer-school', id, 'load'],
    queryFn: () => pioneerSchoolApi.load(id),
    enabled: canViewPioneerSchool && !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pioneer-school'] });
  };

  const [picking, setPicking] = useState<PioneerSchoolDuty | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [dayTimeFor, setDayTimeFor] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [addingHelper, setAddingHelper] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newCong, setNewCong] = useState('');

  const assignMut = useMutation({
    mutationFn: (vars: { dutyId: string; helperId: string | null }) =>
      pioneerSchoolApi.assignDuty(id, vars.dutyId, vars.helperId),
    onSuccess: () => {
      invalidate();
      setPicking(null);
    },
  });
  const addHelperMut = useMutation({
    mutationFn: async () => {
      const helper = await pioneerSchoolApi.createHelper({
        firstName: newFirst.trim(),
        lastName: newLast.trim(),
        congregationName: newCong.trim() || null,
        publisherId: null,
      });
      // Added for a reason: put him straight into the role that was open.
      if (picking) await pioneerSchoolApi.assignDuty(id, picking.id, helper.id);
      return helper;
    },
    onSuccess: () => {
      invalidate();
      setAddingHelper(false);
      setPicking(null);
    },
  });

  const customMut = useMutation({
    mutationFn: (vars: { dayId: string; label: string }) =>
      pioneerSchoolApi.addCustomDuty(id, {
        dayId: vars.dayId,
        customLabel: vars.label,
      }),
    onSuccess: () => {
      invalidate();
      setCustomFor(null);
      setCustomLabel('');
    },
  });
  const removeCustomMut = useMutation({
    mutationFn: (dutyId: string) => pioneerSchoolApi.removeCustomDuty(id, dutyId),
    onSuccess: invalidate,
  });

  const roleLabel = (d: PioneerSchoolDuty): string => {
    if (d.dutyType === 'custom') return d.customLabel ?? '';
    if (d.dutyType === 'microphone') {
      return t('pioneerSchool.roles.microphone', { number: d.slotIndex + 1 });
    }
    return t(`pioneerSchool.roles.${d.dutyType}`);
  };

  const dayTitle = (date: string) =>
    dayjs(date).locale(i18n.language).format('dddd, D MMMM');

  const timeOf = (start: string | null, end: string | null): string | null => {
    const s = start ?? query.data?.school.startTime ?? null;
    const e = end ?? query.data?.school.endTime ?? null;
    if (!s && !e) return null;
    return e ? `${s ?? ''}\u2009\u2013\u2009${e}` : (s ?? '');
  };

  const load = loadQuery.data ?? {};
  const pickList = useMemo(() => {
    const helpers = helpersQuery.data ?? [];
    const needle = pickSearch.trim().toLowerCase();
    return helpers
      .filter(
        (h) =>
          !needle ||
          `${h.firstName} ${h.lastName} ${h.congregationName ?? ''}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [helpersQuery.data, pickSearch]);

  async function printSheet() {
    const data = query.data;
    if (!data) return;
    const preopened = openPrintWindow();
    const html = buildPioneerSchoolPdfHtml({
      title: data.school.title,
      datesLine: schoolDates(
        data.school.startDate,
        data.school.endDate,
        i18n.language,
      ),
      hallName: data.school.hallName,
      hallAddress: data.school.hallAddress,
      notes: data.school.notes,
      days: data.days.map((d) => ({
        date: dayTitle(d.date),
        time: timeOf(d.startTime, d.endTime),
        duties: d.duties.map((r) => ({
          label: roleLabel(r),
          name: r.helperName,
          congregation: r.helperCongregation,
          removed: r.helperRemoved,
        })),
      })),
      labels: {
        dates: t('pioneerSchool.fields.dates'),
        hall: t('pioneerSchool.fields.hall'),
        notes: t('pioneerSchool.fields.notes'),
        unassigned: t('pioneerSchool.unassigned'),
        removed: t('pioneerSchool.helperRemoved'),
        role: t('pioneerSchool.roleColumn'),
        person: t('pioneerSchool.personColumn'),
      },
    });
    await exportHtmlAsPdf(html, {
      fileName: 'pioneer-school',
      preopenedWindow: preopened,
    });
  }

  if (!canViewPioneerSchool) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{t('pioneerSchool.noAccess')}</Text>
      </View>
    );
  }
  if (query.isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
  }
  if (query.error || !query.data) {
    return <LoadFailure error={query.error} onRetry={query.refetch} />;
  }

  const { school, days } = query.data;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* The head of the sheet: what, when, and where to drive. */}
        <View style={styles.headCard}>
          <Text style={styles.headTitle}>{school.title}</Text>
          <Text style={styles.headDates}>
            {schoolDates(school.startDate, school.endDate, i18n.language)}
          </Text>
          {school.hallName || school.hallAddress ? (
            <View style={styles.hallBox}>
              <Ionicons name="location-outline" size={15} color="#0369a1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.hallName}>{school.hallName}</Text>
                {school.hallAddress ? (
                  <Text style={styles.hallAddress}>{school.hallAddress}</Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <View style={styles.headActions}>
            <Pressable style={styles.ghostBtn} onPress={printSheet}>
              <Ionicons name="print-outline" size={17} color="#0ea5e9" />
              <Text style={styles.ghostBtnText}>{t('common.print')}</Text>
            </Pressable>
            {canManagePioneerSchool && (
              <Pressable
                style={styles.ghostBtn}
                onPress={() => setEditOpen(true)}
              >
                <Ionicons name="create-outline" size={17} color="#0ea5e9" />
                <Text style={styles.ghostBtnText}>{t('common.edit')}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {days.map((d) => (
          <View key={d.id} style={styles.dayCard}>
            <View style={styles.dayHead}>
              <Text style={styles.dayDate}>{dayTitle(d.date)}</Text>
              <Pressable
                onPress={() =>
                  canManagePioneerSchool ? setDayTimeFor(d.id) : undefined
                }
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.dayTime,
                    d.startTime || d.endTime ? styles.dayTimeOwn : null,
                  ]}
                >
                  {timeOf(d.startTime, d.endTime) ?? t('pioneerSchool.noTime')}
                </Text>
              </Pressable>
            </View>

            {d.duties.map((r) => (
              <Pressable
                key={r.id}
                style={styles.dutyRow}
                disabled={!canManagePioneerSchool}
                onPress={() => {
                  setPickSearch('');
                  setPicking(r);
                }}
              >
                <Text style={styles.dutyLabel}>{roleLabel(r)}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.dutyName,
                      !r.helperName && styles.dutyEmpty,
                      r.helperRemoved && styles.dutyRemoved,
                    ]}
                  >
                    {r.helperName ?? t('pioneerSchool.unassigned')}
                  </Text>
                  {/* Taking a brother off the list used to turn his rows into
                      «не назначен» — as if nobody had ever been there. He is
                      still on this day; the schedule just has to say that he
                      is no longer on the list. */}
                  {r.helperRemoved ? (
                    <Text style={styles.dutyRemovedNote}>
                      {t('pioneerSchool.helperRemoved')}
                    </Text>
                  ) : null}
                  {r.helperCongregation ? (
                    <Text style={styles.dutyCong}>{r.helperCongregation}</Text>
                  ) : null}
                  {r.warnings.map((w) => (
                    <View key={w} style={styles.warnRow}>
                      <Ionicons name="alert-circle" size={12} color="#b45309" />
                      <Text style={styles.warnText}>
                        {t(`pioneerSchool.warnings.${w}`)}
                      </Text>
                    </View>
                  ))}
                </View>
                {canManagePioneerSchool && r.dutyType === 'custom' ? (
                  <Pressable
                    onPress={() => removeCustomMut.mutate(r.id)}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={18} color="#94a3b8" />
                  </Pressable>
                ) : null}
              </Pressable>
            ))}

            {canManagePioneerSchool && (
              <Pressable
                style={styles.addRole}
                onPress={() => {
                  setCustomLabel('');
                  setCustomFor(d.id);
                }}
              >
                <Ionicons name="add" size={16} color="#0ea5e9" />
                <Text style={styles.addRoleText}>
                  {t('pioneerSchool.addRole')}
                </Text>
              </Pressable>
            )}
          </View>
        ))}

        {school.notes && school.notes.trim() ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesHead}>{t('pioneerSchool.fields.notes')}</Text>
            <RichNote text={school.notes} />
          </View>
        ) : null}
      </ScrollView>

      {/* Who serves */}
      <Modal visible={!!picking} transparent animationType="slide">
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPicking(null)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {picking ? roleLabel(picking) : ''}
            </Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                value={pickSearch}
                onChangeText={setPickSearch}
                placeholder={t('pioneerSchool.helpers.search')}
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <Pressable
                style={styles.pickRow}
                onPress={() =>
                  picking &&
                  assignMut.mutate({ dutyId: picking.id, helperId: null })
                }
              >
                <Text style={styles.pickClear}>
                  {t('pioneerSchool.clearSlot')}
                </Text>
              </Pressable>
              {/* The brother you need is often the one not on the list yet.
                  Leaving the school to add him, then coming back and opening
                  the role again, is four steps for one name. */}
              {canManagePioneerSchool ? (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    setNewFirst('');
                    setNewLast('');
                    setNewCong('');
                    setAddingHelper(true);
                  }}
                >
                  <Ionicons name="person-add-outline" size={17} color="#0ea5e9" />
                  <Text style={styles.pickAdd}>
                    {t('pioneerSchool.helpers.add')}
                  </Text>
                </Pressable>
              ) : null}
              {pickList.map((h) => (
                <Pressable
                  key={h.id}
                  style={styles.pickRow}
                  onPress={() =>
                    picking &&
                    assignMut.mutate({ dutyId: picking.id, helperId: h.id })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>
                      {h.firstName} {h.lastName}
                    </Text>
                    {h.congregationName ? (
                      <Text style={styles.pickCong}>{h.congregationName}</Text>
                    ) : null}
                  </View>
                  {/* How many days he already holds — three reliable brothers
                      quietly take the whole week otherwise. */}
                  {load[h.id] ? (
                    <View style={styles.loadChip}>
                      <Text style={styles.loadText}>
                        {t('pioneerSchool.daysCount', { count: load[h.id] })}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* A day's own hours */}
      <DayTimeSheet
        visible={!!dayTimeFor}
        onClose={() => setDayTimeFor(null)}
        onSave={async (start, end) => {
          if (!dayTimeFor) return;
          await pioneerSchoolApi.updateDay(id, dayTimeFor, {
            startTime: start || null,
            endTime: end || null,
          });
          setDayTimeFor(null);
          invalidate();
        }}
      />

      {/* A role of this school's own */}
      <Modal visible={!!customFor} transparent animationType="slide">
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCustomFor(null)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('pioneerSchool.addRole')}</Text>
            <TextInput
              style={styles.input}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder={t('pioneerSchool.addRoleHint')}
              placeholderTextColor="#94a3b8"
            />
            <Pressable
              style={[styles.primaryBtn, !customLabel.trim() && styles.btnOff]}
              disabled={!customLabel.trim()}
              onPress={() =>
                customFor &&
                customMut.mutate({
                  dayId: customFor,
                  label: customLabel.trim(),
                })
              }
            >
              <Text style={styles.primaryBtnText}>{t('common.add')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={addingHelper} transparent animationType="slide">
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAddingHelper(false)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {t('pioneerSchool.helpers.newTitle')}
            </Text>
            <TextInput
              style={styles.input}
              value={newFirst}
              onChangeText={setNewFirst}
              placeholder={t('pioneerSchool.helpers.firstName')}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={newLast}
              onChangeText={setNewLast}
              placeholder={t('pioneerSchool.helpers.lastName')}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={newCong}
              onChangeText={setNewCong}
              placeholder={t('pioneerSchool.helpers.congregationHint')}
              placeholderTextColor="#94a3b8"
            />
            <Pressable
              style={[
                styles.primaryBtn,
                (!newFirst.trim() || !newLast.trim()) && styles.btnOff,
              ]}
              disabled={
                !newFirst.trim() || !newLast.trim() || addHelperMut.isPending
              }
              onPress={() => addHelperMut.mutate()}
            >
              <Text style={styles.primaryBtnText}>
                {t('pioneerSchool.addAndAssign')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {editOpen ? (
        <SchoolEditSheet
          schoolId={id}
          initial={school}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            invalidate();
          }}
        />
      ) : null}
    </View>
  );
}

/** A day may start later than the school; null means "as the school says". */
function DayTimeSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (start: string, end: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('pioneerSchool.dayTime')}</Text>
          <Text style={styles.hint}>{t('pioneerSchool.dayTimeHint')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={start}
              onChangeText={setStart}
              placeholder="09:00"
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={end}
              onChangeText={setEnd}
              placeholder="16:00"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void onSave(start.trim(), end.trim())}
          >
            <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The school itself: dates, venue, hours, microphones and the notes. */
function SchoolEditSheet({
  schoolId,
  initial,
  onClose,
  onSaved,
}: {
  schoolId: string;
  initial: {
    title: string;
    startDate: string;
    endDate: string;
    hallName: string | null;
    hallAddress: string | null;
    startTime: string | null;
    endTime: string | null;
    microphoneSlots: number;
    notes: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [startDate, setStartDate] = useState(initial.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(initial.endDate.slice(0, 10));
  const [hallName, setHallName] = useState(initial.hallName ?? '');
  const [hallAddress, setHallAddress] = useState(initial.hallAddress ?? '');
  const [startTime, setStartTime] = useState(initial.startTime ?? '');
  const [endTime, setEndTime] = useState(initial.endTime ?? '');
  const [mics, setMics] = useState(String(initial.microphoneSlots));
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [hallsOpen, setHallsOpen] = useState(false);
  const noteSel = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  })[0];

  const halls = useQuery({ queryKey: ['halls'], queryFn: () => hallsApi.list() });
  const externals = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      pioneerSchoolApi.update(schoolId, {
        title: title.trim(),
        startDate,
        endDate,
        hallName: hallName.trim() || null,
        hallAddress: hallAddress.trim() || null,
        startTime: startTime.trim() || null,
        endTime: endTime.trim() || null,
        microphoneSlots: Math.max(0, Math.min(6, parseInt(mics || '0', 10))),
        notes: notes.trim() || null,
      }),
    onSuccess: onSaved,
  });

  /** Wrap the whole note in a marker — the toolbar the app already uses. */
  const wrap = (marker: string) => setNotes((n) => `${n}${marker}${marker}`);
  void noteSel;

  const options = [
    ...(halls.data ?? []).map((h) => ({
      key: `hall-${h.id}`,
      name: h.name,
      address: h.address,
      from: t('pioneerSchool.ourHall'),
    })),
    ...(externals.data ?? []).map((c) => ({
      key: `ext-${c.id}`,
      name: c.city ? `${c.name} · ${c.city}` : c.name,
      address: c.address ?? '',
      from: t('pioneerSchool.fromCongregations'),
    })),
  ];

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: '92%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>{t('pioneerSchool.editTitle')}</Text>

            <Text style={styles.label}>{t('pioneerSchool.fields.title')}</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

            <DateField
              label={t('pioneerSchool.fields.startDate')}
              value={startDate}
              onChange={setStartDate}
            />
            <DateField
              label={t('pioneerSchool.fields.endDate')}
              value={endDate}
              onChange={setEndDate}
            />

            <Text style={styles.label}>{t('pioneerSchool.fields.hall')}</Text>
            <TextInput
              style={styles.input}
              value={hallName}
              onChangeText={setHallName}
              placeholder={t('pioneerSchool.hallNameHint')}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={hallAddress}
              onChangeText={setHallAddress}
              placeholder={t('pioneerSchool.hallAddressHint')}
              placeholderTextColor="#94a3b8"
            />
            {/* A button, not a line of small print: this is the way most
                schools will be filled in, and it was reading as a footnote. */}
            <Pressable
              onPress={() => setHallsOpen((v) => !v)}
              style={styles.pickHallBtn}
            >
              <Ionicons name="list-outline" size={16} color="#0ea5e9" />
              <Text style={styles.pickHallText}>
                {t('pioneerSchool.pickFromList')}
              </Text>
              <Ionicons
                name={hallsOpen ? 'chevron-up' : 'chevron-down'}
                size={15}
                color="#0ea5e9"
              />
            </Pressable>
            {hallsOpen
              ? options.map((o) => (
                  <Pressable
                    key={o.key}
                    style={styles.hallOption}
                    disabled={!o.address}
                    onPress={() => {
                      setHallName(o.name);
                      setHallAddress(o.address);
                      setHallsOpen(false);
                    }}
                  >
                    <View style={styles.hallOptionHead}>
                      <Text style={styles.hallOptionName}>{o.name}</Text>
                      <Text style={styles.hallOptionFrom}>{o.from}</Text>
                    </View>
                    {/* A congregation with no address on file used to vanish
                        from this list, leaving no way to tell «not there» from
                        «nothing filled in». */}
                    <Text
                      style={[
                        styles.hallOptionAddr,
                        !o.address && styles.hallOptionMissing,
                      ]}
                    >
                      {o.address || t('pioneerSchool.noAddress')}
                    </Text>
                  </Pressable>
                ))
              : null}

            <Text style={styles.label}>{t('pioneerSchool.fields.time')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="16:00"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <Text style={styles.label}>
              {t('pioneerSchool.fields.microphones')}
            </Text>
            <TextInput
              style={styles.input}
              value={mics}
              onChangeText={(v) => setMics(v.replace(/[^0-9]/g, '').slice(0, 1))}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>{t('pioneerSchool.fields.notes')}</Text>
            <View style={styles.noteToolbar}>
              <Pressable style={styles.noteTool} onPress={() => wrap('**')}>
                <Text style={styles.noteToolBold}>{t('common.boldShort')}</Text>
              </Pressable>
              <Pressable style={styles.noteTool} onPress={() => wrap('_')}>
                <Text style={styles.noteToolItalic}>
                  {t('common.italicShort')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.noteTool}
                onPress={() => setNotes((n) => `${n}${n ? '\n' : ''}• `)}
              >
                <Text style={styles.noteToolBold}>•</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              placeholder={t('pioneerSchool.notesHint')}
              placeholderTextColor="#94a3b8"
            />
            {notes.trim() ? (
              <View style={styles.preview}>
                <Text style={styles.previewHead}>
                  {t('pioneerSchool.notesPreview')}
                </Text>
                <RichNote text={notes} />
              </View>
            ) : null}

            {saveMut.isError ? (
              <Text style={styles.error}>
                {extractErrorMessage(saveMut.error)}
              </Text>
            ) : null}
            <Pressable
              style={styles.primaryBtn}
              disabled={saveMut.isPending}
              onPress={() => saveMut.mutate()}
            >
              <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  headCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
  },
  headTitle: { fontSize: 18, color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  headDates: { fontSize: 14, color: '#0369a1', marginTop: 2 },
  hallBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  hallName: { fontSize: 14, color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  hallAddress: { fontSize: 12.5, color: '#475569', marginTop: 1 },
  headActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ghostBtnText: {
    color: '#0ea5e9',
    fontSize: 13.5,
    fontFamily: 'Manrope_600SemiBold',
  },

  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayDate: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'capitalize',
  },
  dayTime: { fontSize: 13, color: '#94a3b8' },
  dayTimeOwn: { color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  dutyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  dutyLabel: { width: 118, fontSize: 13, color: '#64748b' },
  dutyName: { fontSize: 14.5, color: '#0f172a' },
  dutyEmpty: { color: '#b45309' },
  dutyRemoved: { color: '#94a3b8', textDecorationLine: 'line-through' },
  dutyRemovedNote: { fontSize: 11.5, color: '#b45309', marginTop: 1 },
  dutyCong: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  warnText: { fontSize: 11.5, color: '#b45309' },
  addRole: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  addRoleText: {
    color: '#0ea5e9',
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },

  notesCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 6,
  },
  notesHead: {
    fontSize: 11.5,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '85%',
  },
  sheetTitle: {
    fontSize: 17,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickName: { fontSize: 15, color: '#0f172a' },
  pickCong: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  pickClear: { fontSize: 14.5, color: '#64748b' },
  loadChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  loadText: { fontSize: 11.5, color: '#64748b' },

  label: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  notesInput: { minHeight: 110 },
  noteToolbar: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  noteTool: {
    width: 38,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteToolBold: { fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  noteToolItalic: { fontSize: 14, fontStyle: 'italic' },
  preview: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewHead: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pickHallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  pickHallText: {
    flex: 1,
    color: '#0ea5e9',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  hallOptionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  hallOptionFrom: { fontSize: 11.5, color: '#94a3b8' },
  hallOptionMissing: { color: '#b45309', fontStyle: 'italic' },
  pickAdd: {
    fontSize: 14.5,
    color: '#0ea5e9',
    fontFamily: 'Manrope_600SemiBold',
  },
  linkText: {
    color: '#0ea5e9',
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
  hallOption: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  hallOptionName: { fontSize: 14, color: '#0f172a' },
  hallOptionAddr: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  hint: { fontSize: 12.5, color: '#94a3b8', marginBottom: 8, lineHeight: 17 },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  btnOff: { opacity: 0.5 },
  error: { color: '#dc2626', fontSize: 13, marginTop: 8 },
});
