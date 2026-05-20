import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Duty, DutyType, Publisher } from '../lib/api';

type Meeting = 'midweek' | 'weekend';

const MEETINGS: Meeting[] = ['midweek', 'weekend'];

const DUTY_TYPE_ORDER: DutyType[] = [
  'security',
  'attendant',
  'microphone',
  'audio',
  'video',
  'zoom',
  'stage',
  'ventilation',
  'custom',
];

function orderIndex(t: DutyType): number {
  const i = DUTY_TYPE_ORDER.indexOf(t);
  return i === -1 ? DUTY_TYPE_ORDER.length : i;
}

function sortDuties(a: Duty, b: Duty): number {
  return orderIndex(a.dutyType) - orderIndex(b.dutyType) || a.slotIndex - b.slotIndex;
}

export function dutyLabel(
  duty: Duty,
  t: (k: string) => string,
): string {
  if (duty.dutyType === 'custom') {
    return duty.customLabel || t('duties.types.custom');
  }
  if (duty.dutyType === 'microphone') {
    return `${t('duties.types.microphone')} ${duty.slotIndex + 1}`;
  }
  return t(`duties.types.${duty.dutyType}`);
}

type Props = {
  duties: Duty[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  onGenerate: (eventType: Meeting) => void;
  /** Optional: tapping a slot (added in A2c for assignment). */
  onPressSlot?: (duty: Duty) => void;
  pending?: boolean;
};

export function DutiesSection({
  duties,
  publishersById,
  canEdit,
  onGenerate,
  onPressSlot,
  pending,
}: Props) {
  const { t } = useTranslation();

  if (duties.length === 0 && !canEdit) return null;

  const byMeeting = new Map<Meeting, Duty[]>();
  for (const d of duties) {
    const m = d.eventType as Meeting;
    if (m !== 'midweek' && m !== 'weekend') continue;
    const arr = byMeeting.get(m) ?? [];
    arr.push(d);
    byMeeting.set(m, arr);
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={16} color="#475569" />
        <Text style={styles.headerText}>{t('duties.title')}</Text>
      </View>

      {MEETINGS.map((meeting) => {
        const list = (byMeeting.get(meeting) ?? []).slice().sort(sortDuties);
        const meetingLabel = t(`meetingSettings.${meeting}`);

        if (list.length === 0) {
          if (!canEdit) return null;
          return (
            <View key={meeting} style={styles.meetingBlock}>
              <Text style={styles.meetingLabel}>{meetingLabel}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.fillBtn,
                  pressed && styles.fillBtnPressed,
                  pending && styles.disabled,
                ]}
                onPress={() => onGenerate(meeting)}
                disabled={pending}
              >
                <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
                <Text style={styles.fillBtnText}>{t('duties.generate')}</Text>
              </Pressable>
            </View>
          );
        }

        return (
          <View key={meeting} style={styles.meetingBlock}>
            <Text style={styles.meetingLabel}>{meetingLabel}</Text>
            <View style={styles.rows}>
              {list.map((d) => {
                const publisher = d.publisherId
                  ? publishersById.get(d.publisherId) ?? null
                  : null;
                const tappable = canEdit && !!onPressSlot;
                const content = (
                  <>
                    <Text style={styles.dutyLabel}>{dutyLabel(d, t)}</Text>
                    <Text
                      style={[
                        styles.publisher,
                        !publisher && styles.unassigned,
                      ]}
                      numberOfLines={1}
                    >
                      {publisher
                        ? publisher.displayName
                        : t('duties.unassigned')}
                    </Text>
                  </>
                );
                return tappable ? (
                  <Pressable
                    key={d.id}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => onPressSlot?.(d)}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={d.id} style={styles.row}>
                    {content}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  meetingBlock: { marginTop: 8 },
  meetingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  dutyLabel: { fontSize: 14, color: '#0f172a', flexShrink: 1 },
  publisher: { fontSize: 14, color: '#334155', fontWeight: '600', maxWidth: '55%' },
  unassigned: { color: '#cbd5e1', fontWeight: '400' },
  fillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  fillBtnPressed: { backgroundColor: '#e0f2fe' },
  fillBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  disabled: { opacity: 0.5 },
});
