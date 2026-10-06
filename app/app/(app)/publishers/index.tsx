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
 * WHO SEES A DOOR is not decided here. Every door is handed to DoorList,
 * which draws it for whoever its screen lets in (lib/screen-access) — one
 * rule for the door and for the screen behind it. Until 6 October each door
 * carried a copy of its screen's rule, written to match and free to drift.
 *
 * Two doors are narrower than their screens, on purpose, and say so below:
 * «Составление программы» (the screen forwards by itself; the door asks the
 * same question it does) and «Районный старейшина» (readable by everybody
 * from the visit's page, but a row of the contents only for an admin).
 * «Ответственные» is one row with two screens behind it — see below.
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
  const meetings: Door[] = [];
  // NARROWER THAN THE TABLE SAYS, on purpose: the screen is «self» there — it
  // forwards whoever is not let in — and this is the question it asks
  // (lib/permissions; scripts/check-programme-editor-door.mjs holds the two
  // together).
  if (perms.canOpenProgrammeEditor) {
    meetings.push({
      key: 'programme',
      title: t('congregationHub.programme'),
      // An elder with no programme responsibility may only import; the row says
      // so, rather than promising editing he will not find there.
      subtitle: editsProgramme ? t('congregationHub.sub.programme') : t('congregationHub.sub.programmeImport'),
      href: '/schedule/edit',
    });
  }
  // Meeting duties — for whoever edits them and for every elder, to read and
  // print. A ministerial servant keeping the duties gets this as his first row.
  meetings.push({
    key: 'duties',
    title: t('congregationHub.duties'),
    subtitle: t('congregationHub.sub.duties'),
    href: '/publishers/duties',
  });
  meetings.push({
    key: 'talks',
    title: t('talkCoordinator.title'),
    subtitle: t('congregationHub.sub.talks'),
    href: '/talk-coordinator',
  });

  const elders: Door[] = [
    { key: 'tasks', title: t('tasks.title'), subtitle: t('congregationHub.sub.tasks'), href: '/tasks' },
    {
      key: 'school',
      title: t('pioneerSchool.title'),
      subtitle: t('congregationHub.sub.school'),
      href: '/pioneer-school',
    },
  ];

  // Hall cleaning — read by everyone: when one's own group cleans is every
  // publisher's question. Editing inside is decided by the cleaning detail itself.
  const cleaning: Door = {
    key: 'cleaning',
    title: t('congregationHub.cleaning'),
    subtitle: t('congregationHub.sub.cleaning'),
    href: '/publishers/cleaning',
  };

  // Administration — moved from the Profile (step 3a, 22 September).
  const management: Door[] = [
    {
      key: 'users',
      title: t('profile.userManagement'),
      subtitle: t('congregationHub.sub.users'),
      href: '/publishers/admin-users',
    },
    {
      key: 'journal',
      title: t('journal.title'),
      subtitle: t('journal.rowSubtitle'),
      href: '/publishers/journal',
    },
    // The dump covers every congregation at once, so it belongs to whoever
    // runs the platform.
    {
      key: 'backups',
      title: t('backups.title'),
      subtitle: t('backups.rowSubtitle'),
      href: '/publishers/backups',
    },
    {
      key: 'publicTalks',
      title: t('profile.publicTalks'),
      subtitle: t('profile.publicTalksDescription'),
      href: '/publishers/public-talks',
    },
    {
      key: 'songs',
      title: t('songsImport.title'),
      subtitle: t('profileExtra.songsSub'),
      href: '/publishers/songs-import',
    },
  ];
  // NARROWER THAN ITS SCREEN, on purpose: everybody may read the circuit
  // overseer's page (24 September) and reaches it from the visit; as a row of
  // the contents it stands among the administrator's settings only.
  if (user?.role === 'admin') {
    management.push({
      key: 'circuitOverseer',
      title: t('profile.circuitOverseer'),
      subtitle: t('profile.circuitOverseerDescription'),
      href: '/publishers/circuit-overseer',
    });
  }
  // Meeting times and the halls — one screen since step 3b.
  const meetingPlace: Door[] = [
    {
      key: 'meetingPlace',
      title: t('meetingSettings.title'),
      subtitle: t('congregationHub.sub.meetingPlace'),
      href: '/publishers/meeting-settings',
    },
  ];
  // Who keeps which area — one row under one name. For the administrator it
  // opens the screen where duties are assigned (DoorList draws that door for
  // him alone); for everybody else, the list of who carries what.
  const responsibilities: Door[] =
    user?.role === 'admin'
      ? [
          {
            key: 'responsibilities',
            title: t('responsibilities.title'),
            subtitle: t('profile.responsibilitiesDescription'),
            href: '/publishers/responsibilities',
          },
        ]
      : [
          {
            key: 'responsibilities',
            title: t('responsibilities.title'),
            subtitle: t('congregationHub.sub.responsibilities'),
            href: '/publishers/responsibilities-list',
          },
        ];

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
            ...responsibilities,
          ],
        },
      ];

  return <DoorList sections={sections} lines={lines} />;
}
