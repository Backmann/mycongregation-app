import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { FONT } from '../../../lib/typography';

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#eef2f6';

type Door = { key: string; title: string; subtitle: string; href: string };
type Section = { key: string; label: string | null; doors: Door[] };

/**
 * The congregation's contents — every door into the congregation's work.
 *
 * Each door is shown by the SAME rule that guarded it before it moved here
 * (lib/permissions, and the role checks the Profile and the Home tiles used),
 * so this screen changes where a door stands, never who may pass it. Most of
 * the screens behind these doors do not check rights themselves: the rule on
 * the door is the only thing between a person and a screen not meant for him,
 * with the server refusing the data behind it. Copy a condition here exactly.
 *
 * A row is named by the title of the screen it opens, so a tap never lands on
 * a heading that says something else.
 *
 * Those who may browse the roster see sections; everyone else sees a handful
 * of rows with no headings, a door of their own first.
 */
export default function CongregationScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const perms = usePermissions();

  // The roster rule — the same as the roster screen's and the server's.
  const privileged =
    user?.role === 'admin' || user?.role === 'elder' || user?.canViewPrivateData === true;
  // The elders' tasks — the same rule as the Tasks tile on Home.
  const elderOrAdmin = user?.role === 'admin' || user?.role === 'elder';

  // One screen: those who keep everyone's absences see all, the rest see their
  // own. The row and the screen's title say which.
  const absences: Door = perms.canManageAbsences
    ? { key: 'absences', title: t('absences.title.list'), subtitle: t('congregationHub.sub.absencesAll'), href: '/absences' }
    : { key: 'absences', title: t('absences.title.mine'), subtitle: t('congregationHub.sub.absencesMine'), href: '/absences' };
  const groups: Door = {
    key: 'groups',
    title: t('serviceGroups.title.list'),
    subtitle: t('congregationHub.sub.groups'),
    href: '/service-groups',
  };

  const editsProgramme = perms.canEditMidweekSchedule || perms.canEditWeekendSchedule;
  const importsProgramme = perms.canImportMidweekSchedule || perms.canImportWeekendSchedule;
  const meetings: Door[] = [];
  if (editsProgramme || importsProgramme) {
    meetings.push({
      key: 'programme',
      title: t('congregationHub.programme'),
      // An elder with no programme responsibility may only import; the row says
      // so, rather than promising editing he will not find there.
      subtitle: editsProgramme ? t('congregationHub.sub.programme') : t('congregationHub.sub.programmeImport'),
      href: '/schedule',
    });
  }
  // Meeting duties — whoever edits them (lib/permissions canEditDuties: admin,
  // duties coordinator, body coordinator), and every elder to read and print,
  // as the programme screen let them. A ministerial servant keeping the duties
  // gets this as his first row.
  if (perms.canEditDuties || perms.isElder || perms.isAdmin) {
    meetings.push({
      key: 'duties',
      title: t('congregationHub.duties'),
      subtitle: t('congregationHub.sub.duties'),
      href: '/publishers/duties',
    });
  }
  if (perms.canCoordinatePublicTalks) {
    meetings.push({
      key: 'talks',
      title: t('talkCoordinator.title'),
      subtitle: t('congregationHub.sub.talks'),
      href: '/talk-coordinator',
    });
  }

  const elders: Door[] = [];
  if (elderOrAdmin) {
    elders.push({ key: 'tasks', title: t('tasks.title'), subtitle: t('congregationHub.sub.tasks'), href: '/tasks' });
  }
  if (perms.canViewPioneerSchool) {
    elders.push({
      key: 'school',
      title: t('pioneerSchool.title'),
      subtitle: t('congregationHub.sub.school'),
      href: '/pioneer-school',
    });
  }

  // Hall cleaning — read by everyone: when one's own group cleans is every
  // publisher's question. Editing inside is decided by the cleaning detail itself.
  const cleaning: Door = {
    key: 'cleaning',
    title: t('congregationHub.cleaning'),
    subtitle: t('congregationHub.sub.cleaning'),
    href: '/publishers/cleaning',
  };

  const sections: Section[] = privileged
    ? [
        {
          key: 'people',
          label: t('congregationHub.sections.people'),
          doors: [
            {
              key: 'publishers',
              title: t('publishers.title.roster'),
              subtitle: t('congregationHub.sub.publishers'),
              href: '/publishers/list',
            },
            groups,
            absences,
          ],
        },
        { key: 'meetings', label: t('congregationHub.sections.meetings'), doors: meetings },
        { key: 'elders', label: t('congregationHub.sections.elders'), doors: elders },
        { key: 'hall', label: t('congregationHub.sections.hall'), doors: [cleaning] },
      ]
    : [
        {
          key: 'mine',
          label: null,
          doors: [
            ...meetings,
            // The same screen as the roster: for him the server sends only his
            // own group, which is what the Home tile has always opened.
            {
              key: 'myGroup',
              title: t('home.actions.myGroup'),
              subtitle: t('congregationHub.sub.myGroup'),
              href: '/publishers/list',
            },
            groups,
            absences,
            cleaning,
          ],
        },
      ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        {sections
          .filter((s) => s.doors.length > 0)
          .map((s) => (
            <View key={s.key} style={s.label ? null : styles.unlabelled}>
              {s.label ? <Text style={styles.label}>{s.label}</Text> : null}
              {s.doors.map((d) => (
                <Row key={d.key} door={d} />
              ))}
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

function Row({ door }: { door: Door }) {
  return (
    <Pressable
      onPress={() => router.push(door.href as never)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={door.title}
      accessibilityHint={door.subtitle}
    >
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {door.title}
        </Text>
        {/* One line: a subtitle that wraps breaks the list's even rhythm. */}
        <Text style={styles.subtitle} numberOfLines={1}>
          {door.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  unlabelled: { paddingTop: 8 },
  label: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  pressed: { backgroundColor: '#f8fafc' },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontFamily: FONT.bold, color: INK },
  subtitle: { fontSize: 14, fontFamily: FONT.medium, color: SOFT, marginTop: 3 },
});
