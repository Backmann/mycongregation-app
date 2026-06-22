import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { meApi, meetingSettingsApi, MyAssignmentItem } from '../../../lib/api';
import {
  RefinedTask,
  refineMyTasks,
  taskMeta,
  taskSubsectionLabel,
  taskTitle,
} from '../../../lib/my-tasks';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';

const TASK_ICONS: Record<
  MyAssignmentItem['kind'],
  keyof typeof Ionicons.glyphMap
> = {
  meeting: 'calendar-outline',
  duty: 'construct-outline',
  cleaning: 'sparkles-outline',
  cart: 'cart-outline',
  field_service: 'walk-outline',
  outgoing_talk: 'mic-outline',
};

function weekHeaderLabel(weekStartISO: string, locale: string): string {
  const start = new Date(`${weekStartISO}T00:00:00`);
  const end = addDays(start, 6);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}\u2013${end.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
    })}`;
  }
  return `${start.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  })} \u2013 ${end.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  })}`;
}

/** One "meeting card": tasks sharing a date + event/kind, in program order. */
interface TaskGroup {
  key: string;
  rows: RefinedTask[];
}

/** A whole week: its Monday ISO plus the meeting/cleaning cards within it. */
interface WeekBlock {
  weekISO: string;
  groups: TaskGroup[];
}

/**
 * Build week blocks, and within each week group consecutive tasks into cards
 * by date + eventType/kind (meeting parts and their duties land in the same
 * card; cleaning gets its own). `refined` is already sorted by date then
 * partOrder, so a simple run-length grouping preserves order.
 */
function buildWeeks(refined: RefinedTask[]): WeekBlock[] {
  const weeks: WeekBlock[] = [];
  for (const r of refined) {
    const weekISO = formatDateISO(
      startOfWeekMonday(new Date(`${r.dateISO}T00:00:00`)),
    );
    const groupKey = `${r.dateISO}|${r.item.eventType ?? r.item.kind}`;

    let week = weeks[weeks.length - 1];
    if (!week || week.weekISO !== weekISO) {
      week = { weekISO, groups: [] };
      weeks.push(week);
    }
    const lastGroup = week.groups[week.groups.length - 1];
    if (lastGroup && lastGroup.key === groupKey) {
      lastGroup.rows.push(r);
    } else {
      week.groups.push({ key: groupKey, rows: [r] });
    }
  }
  return weeks;
}

export default function MyAssignmentsScreen() {
  const { t, i18n } = useTranslation();
  const todayISO = formatDateISO(new Date());

  const overviewQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const versions = overviewQuery.data?.versions ?? [];

  const tasksQuery = useQuery({
    queryKey: ['me', 'assignments'],
    queryFn: () => meApi.assignments(),
    retry: false,
    staleTime: 60 * 1000,
  });

  const isLoading = tasksQuery.isLoading || overviewQuery.isLoading;
  const refreshing = tasksQuery.isRefetching || overviewQuery.isRefetching;
  const onRefresh = () => {
    tasksQuery.refetch();
    overviewQuery.refetch();
  };

  const refined = refineMyTasks(
    tasksQuery.data?.items ?? [],
    versions,
    todayISO,
  );
  const weeks = buildWeeks(refined);

  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home' as any);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0ea5e9" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('home.myTasksScreen.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : refined.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="checkmark-done-circle-outline"
              size={40}
              color="#94a3b8"
            />
            <Text style={styles.emptyText}>
              {t('home.myTasksScreen.empty')}
            </Text>
          </View>
        ) : (
          weeks.map((w) => (
            <View key={w.weekISO} style={styles.weekBlock}>
              <Text style={styles.weekHeader}>
                {weekHeaderLabel(w.weekISO, i18n.language)}
              </Text>
              {w.groups.map((g) => {
                const head = g.rows[0];
                return (
                  <View key={g.key} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Ionicons
                        name={TASK_ICONS[head.item.kind]}
                        size={16}
                        color="#0ea5e9"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.cardHeadText} numberOfLines={1}>
                        {taskMeta(head, t, i18n.language)}
                      </Text>
                    </View>
                    {g.rows.map((r, idx) => (
                      <View
                        key={`${r.item.kind}-${idx}-${r.dateISO}`}
                        style={[styles.partRow, idx > 0 && styles.rowBorder]}
                      >
                        {taskSubsectionLabel(r.item, t) ? (
                          <Text style={styles.subsection} numberOfLines={1}>
                            {taskSubsectionLabel(r.item, t)}
                          </Text>
                        ) : null}
                        <Text style={styles.title} numberOfLines={2}>
                          {taskTitle(r.item, t)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  weekBlock: { marginBottom: 18 },
  weekHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingBottom: 4,
    marginBottom: 10,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  cardHeadText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  partRow: {
    paddingVertical: 11,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  subsection: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  emptyBox: { alignItems: 'center', marginTop: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
