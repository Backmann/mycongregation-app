import { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Assignment, Publisher } from '../lib/api';

interface Props {
  /** Open when non-null; the meeting zone being planned. */
  zone: {
    eventType: 'midweek' | 'weekend';
    title: string;
    meta: string | null;
    items: Assignment[];
    weekStartDate: string;
  } | null;
  publishersById: Map<string, Publisher>;
  canPublish: boolean;
  publishing: boolean;
  onEdit: (a: Assignment) => void;
  onPublish: (eventType: 'midweek' | 'weekend', weekStartDate: string) => void;
  onClose: () => void;
}

const SONG_KEYS = ['mid_song', 'weekend_song', 'weekend_opening_song'];

function isAssigned(a: Assignment): boolean {
  return !!a.publisherId || !!a.speakerName;
}


/**
 * Planning mode — a focused overlay for filling ONE meeting (the zone the
 * brother is responsible for). Shows what still needs assigning, then drafts,
 * with progress; tapping a row opens the same bottom sheet. When the zone is
 * fully assigned, a soft "publish this meeting" bar appears.
 */
export function PlanningMode({
  zone,
  publishersById,
  canPublish,
  publishing,
  onEdit,
  onPublish,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const open = !!zone;

  const { todo, drafts, assignedCount, totalCount } = useMemo(() => {
    const real = (zone?.items ?? []).filter(
      (a) => !SONG_KEYS.includes(a.partKey),
    );
    const todo = real.filter((a) => !isAssigned(a));
    const drafts = real.filter(
      (a) => isAssigned(a) && String(a.status) === 'draft',
    );
    const assignedCount = real.filter(isAssigned).length;
    return { todo, drafts, assignedCount, totalCount: real.length };
  }, [zone]);

  const allDone = todo.length === 0;
  const pct = totalCount === 0 ? 0 : Math.round((assignedCount / totalCount) * 100);

  const partTitleOf = (a: Assignment) =>
    a.partTitle && a.partTitle.trim().length > 0
      ? a.partTitle
      : t('schedule.unassigned');

  const assigneeOf = (a: Assignment): string | null => {
    if (a.publisherId) {
      return publishersById.get(a.publisherId)?.displayName ?? null;
    }
    if (a.speakerName) return a.speakerName;
    return null;
  };

  const Row = ({ a, draft }: { a: Assignment; draft: boolean }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onEdit(a)}
    >
      <View
        style={[styles.dot, draft ? styles.dotDraft : styles.dotTodo]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {partTitleOf(a)}
        </Text>
        {draft ? (
          <Text style={styles.rowAssignee} numberOfLines={1}>
            {assigneeOf(a)}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
      presentationStyle={Platform.OS === 'web' ? undefined : 'fullScreen'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#0ea5e9" />
            <Text style={styles.headerBtnText}>{t('common.close')}</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('schedule.planning.title')}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <Text style={styles.zoneTitle}>{zone?.title}</Text>
          {zone?.meta ? <Text style={styles.zoneMeta}>{zone.meta}</Text> : null}

          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {t('schedule.planning.progress', {
                done: assignedCount,
                total: totalCount,
              })}
            </Text>
          </View>

          {allDone ? (
            <View style={styles.doneBox}>
              <Ionicons
                name="checkmark-circle"
                size={40}
                color="#22c55e"
              />
              <Text style={styles.doneText}>
                {t('schedule.planning.allAssigned')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.groupHeader}>
                {t('schedule.planning.todoHeader', { count: todo.length })}
              </Text>
              <View style={styles.card}>
                {todo.map((a) => (
                  <Row key={a.id} a={a} draft={false} />
                ))}
              </View>
            </>
          )}

          {drafts.length > 0 ? (
            <>
              <Text style={[styles.groupHeader, { marginTop: 20 }]}>
                {t('schedule.planning.draftHeader', { count: drafts.length })}
              </Text>
              <View style={styles.card}>
                {drafts.map((a) => (
                  <Row key={a.id} a={a} draft />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        {canPublish && (todo.length === 0 || drafts.length > 0) ? (
          <View style={styles.publishBar}>
            <Pressable
              style={({ pressed }) => [
                styles.publishBtn,
                pressed && styles.publishBtnPressed,
                publishing && styles.publishBtnDisabled,
              ]}
              disabled={publishing}
              onPress={() =>
                zone && onPublish(zone.eventType, zone.weekStartDate)
              }
            >
              <Text style={styles.publishBtnText}>
                {publishing
                  ? t('schedule.planning.publishing')
                  : t('schedule.planning.publishThis')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  headerBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#0f172a' },
  zoneTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  zoneMeta: { fontSize: 14, color: '#64748b', marginTop: 2, textTransform: 'capitalize' },
  progressWrap: { marginTop: 16, marginBottom: 8 },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#0ea5e9' },
  progressText: { fontSize: 13, color: '#475569', marginTop: 6, fontWeight: '600' },
  groupHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowPressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  dotTodo: { backgroundColor: '#f43f5e' },
  dotDraft: { backgroundColor: '#f59e0b' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  rowAssignee: { fontSize: 13, color: '#0369a1', marginTop: 2 },
  doneBox: { alignItems: 'center', marginTop: 28, gap: 10 },
  doneText: { fontSize: 15, color: '#15803d', fontWeight: '600', textAlign: 'center' },
  publishBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { maxWidth: 680, marginHorizontal: 'auto' as never } : null),
  },
  publishBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnPressed: { opacity: 0.85 },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
