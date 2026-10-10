import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { VisitPeopleChips, FieldNoteLine, useFieldListViewer } from './FieldListBits';
import { MyDot } from './MyDot';
import { SourceLink } from './SourceLink';
import { MyGlowRow } from './MyGlowRow';
import { ChipRow, PersonChip } from './PersonChip';
import {
  CoVisitFieldServiceMeeting,
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  Publisher,
  UpdateFieldServiceMeetingInput,
  hallsApi,
  isFieldServiceDraft,
  serviceGroupsApi,
} from '../lib/api';
import { resolveHallAddress } from '../lib/hallAddress';
import { formatDateISO, parseISODate, addDays } from '../lib/dates';
import { FieldServiceForm } from './FieldServiceMeetingSheet';

// The window itself lives in FieldServiceMeetingSheet (October 2026); this
// name is what the two screens import.
export { FieldServiceForm };

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
function isoDayOf(dateISO: string): number {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function sortMeetings(a: FieldServiceMeeting, b: FieldServiceMeeting): number {
  return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
}

type Props = {
  meetings: FieldServiceMeeting[];
  /**
   * Outings planned inside a circuit-overseer visit, already narrowed to this
   * week by the caller. During a visit the week's field service lives in the
   * visit schedule instead of here, which is why this section used to stand
   * empty exactly when there was the most going on.
   */
  visitMeetings?: CoVisitFieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  weekStartISO: string;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
  onRemove: (id: string) => void;
  pending?: boolean;
  hideHeader?: boolean;
};

export function FieldServiceSection({
  meetings,
  visitMeetings = [],
  publishersById,
  canEdit,
  weekStartISO,
  onCreate,
  onUpdate,
  onRemove,
  pending,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  // Halls: resolve shorthand meeting addresses to the exact hall address.
  const sectionHallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const sectionHalls = sectionHallsQuery.data ?? [];
  const sectionGroupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 5 * 60 * 1000,
  });
  const sectionGroupName = (id: string) =>
    (sectionGroupsQuery.data?.data ?? []).find((g) => g.id === id)?.name ?? '';
  const viewer = useFieldListViewer(meetings);
  const [formFor, setFormFor] = useState<FieldServiceMeeting | 'new' | null>(
    null,
  );

  if (meetings.length === 0 && visitMeetings.length === 0 && !canEdit)
    return null;

  const list = meetings.slice().sort(sortMeetings);
  // A meeting already held cannot be deleted (the server keeps it as a
  // record), and a week already over takes no new ones.
  const todayISO = formatDateISO(new Date());
  const isHeld = (m: FieldServiceMeeting) =>
    formatDateISO(addDays(parseISODate(m.weekStartDate), m.dayOfWeek - 1)) <
    todayISO;
  const weekOver =
    !!weekStartISO &&
    formatDateISO(addDays(parseISODate(weekStartISO), 6)) < todayISO;

  return (
    <View style={styles.section}>
      {!hideHeader ? (
        <View style={styles.header}>
          <Ionicons name="megaphone-outline" size={16} color="#475569" />
          <Text style={styles.headerText}>{t('fieldService.title')}</Text>
        </View>
      ) : null}

      {list.length === 0 && visitMeetings.length === 0 ? (
        <Text style={styles.empty}>{t('fieldService.empty')}</Text>
      ) : (
        <View style={styles.rows}>
          {list.map((m) => {
            const conductor = m.conductorPublisherId
              ? publishersById.get(m.conductorPublisherId) ?? null
              : null;
            const isMine = viewer.isMine(m);
            const RowWrap = isMine ? MyGlowRow : View;
            return (
              <RowWrap
                key={m.id}
                kind="field_service"
                style={[styles.row, isMine && styles.rowMineGlow]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.when}>
                    {t(`fieldService.days.${m.dayOfWeek}`)} · {m.startTime}
                  </Text>
                  {m.isGeneral ? (
                    <View style={styles.generalBadge}>
                      <Ionicons name="people" size={12} color="#7c3aed" />
                      <Text style={styles.generalBadgeText}>
                        {t('fieldService.generalBadge')}
                      </Text>
                    </View>
                  ) : null}
                  {/* A month still being prepared: the planner sees it here
                      too, so he does not add the same Saturday twice. */}
                  {isFieldServiceDraft(m) ? (
                    <View style={styles.draftBadge}>
                      <Text style={styles.draftBadgeText}>
                        {t('fieldService.draft.badge')}
                      </Text>
                    </View>
                  ) : null}
                  {/* The group should know he is coming — Lionel asked for
                      this to be visible to publishers, not kept among the
                      elders. It sits on the meeting itself, where the group
                      already looks to see where and when. */}
                  {/* Whose meeting it is — this list alone never said. */}
                  {m.serviceGroupId ? (
                    <Text style={styles.groupName}>
                      {sectionGroupName(m.serviceGroupId)}
                    </Text>
                  ) : null}
                  {m.serviceOverseerVisit ? (
                    <View style={styles.visitBadge}>
                      <Ionicons name="walk" size={12} color="#0e7490" />
                      <Text style={styles.visitBadgeText}>
                        {t('fieldService.overseerVisitBadge')}
                      </Text>
                    </View>
                  ) : null}
                  <ChipRow>
                    {/* The dot stands beside the viewer's own name: on a visit
                        he may be the overseer or the assistant, not the
                        conductor this chip names. */}
                    {viewer.isMine(m) && m.conductorPublisherId === viewer.me ? (
                      <MyDot kind="field_service" />
                    ) : null}
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
                    <VisitPeopleChips meeting={m} publishersById={publishersById} me={viewer.me} />
                  </ChipRow>
                  <Text style={styles.address} numberOfLines={2}>
                    {resolveHallAddress(m.address, sectionHalls)}
                  </Text>
                  <FieldNoteLine note={viewer.noteOf(m.id)} groupName={sectionGroupName} />
                  {!!m.topic && (
                    <Text style={styles.topic} numberOfLines={3}>
                      {m.topic}
                    </Text>
                  )}
                  <SourceLink url={m.sourceUrl} />
                </View>
                {canEdit && (
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => setFormFor(m)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      disabled={pending}
                    >
                      <Ionicons name="create-outline" size={20} color="#0369a1" />
                    </Pressable>
                    {isHeld(m) ? null : (
                      <Pressable
                        onPress={() => onRemove(m.id)}
                        hitSlop={8}
                        style={styles.iconBtn}
                        disabled={pending}
                      >
                        <Ionicons name="trash-outline" size={20} color="#dc2626" />
                      </Pressable>
                    )}
                  </View>
                )}
              </RowWrap>
            );
          })}
        </View>
      )}

      {visitMeetings.length > 0 ? (
        <View style={styles.visitBlock}>
          <View style={styles.visitHead}>
            <Ionicons name="briefcase-outline" size={14} color="#0e7490" />
            <Text style={styles.visitHeadText}>
              {t('fieldService.fromCoVisit')}
            </Text>
          </View>
          {[...visitMeetings]
            .sort(
              (a, b) =>
                a.itemDate.localeCompare(b.itemDate) ||
                (a.startTime ?? '').localeCompare(b.startTime ?? ''),
            )
            .map((m) => (
              <View key={m.id} style={styles.visitRow}>
                <Text style={styles.when}>
                  {t(`fieldService.days.${isoDayOf(m.itemDate)}`)}
                  {m.startTime ? ` \u00b7 ${m.startTime}` : ''}
                </Text>
                {m.place ? (
                  <Text style={styles.address} numberOfLines={2}>
                    {resolveHallAddress(m.place, sectionHalls)}
                  </Text>
                ) : null}
              </View>
            ))}
          {/* No conductor line here on purpose: the visit's public view does
              not carry one, and an empty «Ведущий» would read as "nobody is
              leading it", which is not what the schedule says. */}
          <Text style={styles.visitHint}>
            {t('fieldService.fromCoVisitHint')}
          </Text>
        </View>
      ) : null}

      {canEdit && !weekOver && (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => setFormFor('new')}
        >
          <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('fieldService.addEntry')}</Text>
        </Pressable>
      )}

      <FieldServiceForm
        target={formFor}
        weekStartISO={weekStartISO}
        // A week whose meetings are still a draft takes its new one as a
        // draft too: one announcement for the whole month.
        asDraft={meetings.some(isFieldServiceDraft)}
        onRemove={(id) => {
          setFormFor(null);
          onRemove(id);
        }}
        onClose={() => setFormFor(null)}
        onCreate={(input) => {
          onCreate(input);
          setFormFor(null);
        }}
        onUpdate={(id, input) => {
          onUpdate(id, input);
          setFormFor(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  draftBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  draftBadgeText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  assistantHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fillIn: {
    fontSize: 12.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  chipOff: { opacity: 0.45 },
  visitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#cffafe',
  },
  groupName: {
    fontSize: 12.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  visitBadgeText: {
    fontSize: 11.5,
    color: '#0e7490',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#0e7490' },
  chipText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextOn: { color: '#ffffff' },
  hallChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  hallChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hallChipActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  hallChipText: { fontSize: 13, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  hallChipTextActive: { color: '#0369a1' },
  section: { marginTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    fontSize: 13,
    color: '#94a3b8',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  visitBlock: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f0fdff',
    borderWidth: 1,
    borderColor: '#cff2f7',
    gap: 8,
  },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  visitHeadText: {
    fontSize: 12,
    color: '#0e7490',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  visitRow: { gap: 2 },
  visitHint: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  when: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  generalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: '#f3e8ff',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  generalBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#7c3aed' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  toggleHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowMineGlow: { borderRadius: 12, marginVertical: 2 },
  address: { fontSize: 13, color: '#475569' },
  topic: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  link: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 4 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bae6fd',
    backgroundColor: '#f8fafc',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  formScroll: { maxHeight: 420 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  statHint: {
    fontSize: 12,
    color: '#0369a1',
    marginTop: 6,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
  },
  warnHint: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 4,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  dayChipOn: { borderColor: '#0ea5e9', backgroundColor: '#e0f2fe' },
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  dayChipTextOn: { color: '#0369a1' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  multiline: { minHeight: 40, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  duplicateLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  duplicateLinkText: { color: '#0369a1', fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  suggestBtnText: { color: '#0369a1', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  saveHint: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    textAlign: 'right',
    marginBottom: 6,
  },
  eventWarnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  eventWarnText: {
    flex: 1,
    color: '#92400e',
    fontSize: 13,
    lineHeight: 18,
  },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  disabled: { opacity: 0.5 },
});
