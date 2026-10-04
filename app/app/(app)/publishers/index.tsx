import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { congregationSummaryApi } from '../../../lib/api';
import { congregationLines, type DoorLine } from '../../../lib/congregation-lines';
import { DoorList, type Door, type DoorSection } from '../../../components/DoorList';

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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const perms = usePermissions();
  // What stands under each door — one request (27 September); until it
  // arrives, or if it fails, every row keeps its plain description.
  const summaryQ = useQuery({
    queryKey: ['congregation-summary'],
    queryFn: () => congregationSummaryApi.get(),
    staleTime: 60 * 1000,
  });
  // Back from a screen where something was just changed, the lines say so:
  // asked again whenever the tab comes to the front.
  const { refetch } = summaryQ;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const lines: Record<string, DoorLine> = summaryQ.data
    ? congregationLines(
        summaryQ.data,
        { manageAbsences: perms.canManageAbsences, editCleaning: perms.canEditCleaning },
        t as never,
        i18n.language,
      )
    : {};

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
      href: '/schedule/edit',
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

  // Administration — moved from the Profile (step 3a, 22 September), each row
  // behind the same condition it had there: the Profile's section showed for
  // admins and elders (its `isAdmin` meant both), and inside it users,
  // responsibilities, the circuit overseer and the journal only for a full
  // admin, backups for whoever holds that right, the talks catalogue and the
  // song import for admins and elders alike. Nobody gains or loses a door.
  const fullAdmin = user?.role === 'admin';
  const management: Door[] = [];
  if (fullAdmin) {
    management.push({
      key: 'users',
      title: t('profile.userManagement'),
      subtitle: t('congregationHub.sub.users'),
      href: '/publishers/admin-users',
    });
    management.push({
      key: 'journal',
      title: t('journal.title'),
      subtitle: t('journal.rowSubtitle'),
      href: '/publishers/journal',
    });
  }
  // The dump covers every congregation at once, so it belongs to whoever runs
  // the platform — hidden rather than a door onto a refusal.
  if (user?.canManageBackups) {
    management.push({
      key: 'backups',
      title: t('backups.title'),
      subtitle: t('backups.rowSubtitle'),
      href: '/publishers/backups',
    });
  }
  if (elderOrAdmin) {
    management.push({
      key: 'publicTalks',
      title: t('profile.publicTalks'),
      subtitle: t('profile.publicTalksDescription'),
      href: '/publishers/public-talks',
    });
    management.push({
      key: 'songs',
      title: t('songsImport.title'),
      subtitle: t('profileExtra.songsSub'),
      href: '/publishers/songs-import',
    });
  }
  if (fullAdmin) {
    management.push({
      key: 'circuitOverseer',
      title: t('profile.circuitOverseer'),
      subtitle: t('profile.circuitOverseerDescription'),
      href: '/publishers/circuit-overseer',
    });
  }
  // Meeting times and the halls — one screen since step 3b, a full admin's
  // door as both Profile rows were.
  const meetingPlace: Door[] = fullAdmin
    ? [
        {
          key: 'meetingPlace',
          title: t('meetingSettings.title'),
          subtitle: t('congregationHub.sub.meetingPlace'),
          href: '/publishers/meeting-settings',
        },
      ]
    : [];
  // Who keeps which area — a full admin's door, as it was in the Profile.
  const responsibilities: Door[] = fullAdmin
    ? [
        {
          key: 'responsibilities',
          title: t('responsibilities.title'),
          subtitle: t('profile.responsibilitiesDescription'),
          href: '/publishers/responsibilities',
        },
      ]
    : [];

  const sections: DoorSection[] = privileged
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
            ...responsibilities,
          ],
        },
        { key: 'meetings', label: t('congregationHub.sections.meetings'), doors: meetings },
        { key: 'elders', label: t('congregationHub.sections.elders'), doors: elders },
        { key: 'hall', label: t('congregationHub.sections.hall'), doors: [cleaning, ...meetingPlace] },
        // Empty for someone who sees the roster but holds none of these rights
        // (the private-data flag alone) — and an empty section is not drawn.
        { key: 'management', label: t('congregationHub.sections.management'), doors: management },
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

  return <DoorList sections={sections} lines={lines} />;
}
