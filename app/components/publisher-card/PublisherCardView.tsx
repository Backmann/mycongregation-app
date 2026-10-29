import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  absencesApi,
  meetingSettingsApi,
  specialEventsApi,
  type ActivityItem,
  publisherActivityApi,
  publishersApi,
  responsibilitiesApi,
  serviceGroupsApi,
  serviceReportsApi,
  auxYearApi,
  auxApplicationsApi,
  type Publisher,
} from '../../lib/api';
import { addWeeks, formatDateISO, startOfWeekMonday } from '../../lib/dates';
import { effectiveVersionFor } from '../../lib/meeting-schedule';
import { weekRules } from '../../lib/week-rules';
import { formatDay, formatDayRange } from '../../lib/date-range';
import { formatMonthLabel } from '../../lib/i18n';
import { activityItemLabel } from '../../lib/activity';
import { whatsappNumber } from '../../lib/talk-messages';
import { contactsCheckLine } from '../../lib/contacts-check';
import { CAPABILITY_CATEGORIES, countActiveCapabilities } from '../../lib/capabilities';
import { FONT } from '../../lib/typography';
import { StatusReasonsModal } from '../StatusReasonsModal';
import { usePermissions } from '../../lib/permissions';
import { capitalize, monthName, monthsLabel, runsOf } from '../../lib/aux-application';

/**
 * THE PUBLISHER'S CARD, READ (28 October 2026, Lionel: «premium, convenient,
 * and think it through again»).
 *
 * What the old card got wrong, and what this one does instead:
 *  - the notes were written in the form and shown nowhere — a block of their own;
 *  - the group was named in the list beside the card and not in the card;
 *  - the birth date and the pioneer's «since» were printed as 1970-09-16;
 *  - «Мужской» stood in the header as a title, and again under «Личные данные»;
 *  - the status hid among the personal data — it sits in the header now, and
 *    a tap on it says why;
 *  - «Данные верны» vouched for contacts that did not exist;
 *  - «Изменить» and S-21 stood at the very bottom, under «Удалить навсегда»;
 *  - a phone number could not be rung, an address could not be found.
 *
 * Two blocks are for admins and elders only (his decision): «Служение» — the
 * status, why, and six months of reports — and «На встречах» — what he is
 * given at the meetings, ahead first. Both load after the card, so the card
 * itself opens as fast as before.
 */

export interface PublisherCardActions {
  canEdit: boolean;
  canS21: boolean;
  onEdit: () => void;
  onS21: () => void;
  onConfirmContacts: () => void;
  confirmingContacts: boolean;
}

const KIND_COLOR: Record<string, string> = {
  midweek: '#0e7490',
  weekend: '#6d28d9',
  memorial: '#b45309',
};

export function PublisherCardView({
  publisher,
  pastoral,
  isAdmin,
  actions,
  access,
  footer,
}: {
  publisher: Publisher;
  /** Admin or elder: status, circumstances, «Служение», «На встречах». */
  pastoral: boolean;
  isAdmin: boolean;
  actions: PublisherCardActions;
  /** The app-access block (admins), rendered by the screen. */
  access: ReactNode;
  /** «Изменил …» and the removal actions, rendered by the screen. */
  footer: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [width, setWidth] = useState(0);
  // Two columns where there is room for two readable ones: the card on its
  // own on a computer, or beside the list on a wide one.
  const twoCols = width >= 760;
  const [explain, setExplain] = useState(false);
  const removed = !!publisher.deletedAt;

  const groupsQ = useQuery({ queryKey: ['service-groups', 'names'], queryFn: () => serviceGroupsApi.list({}) });
  const respQ = useQuery({ queryKey: ['responsibilities'], queryFn: () => responsibilitiesApi.list() });
  const absQ = useQuery({
    queryKey: ['absences', 'week-warn'],
    queryFn: () => absencesApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const group = (groupsQ.data?.data ?? []).find((g) => g.id === publisher.serviceGroupId) ?? null;
  const groupRole =
    group?.overseerPublisherId === publisher.id
      ? 'overseer'
      : group?.assistantPublisherId === publisher.id
        ? 'assistant'
        : null;
  const duties = publisher.userId ? (respQ.data ?? []).filter((r) => r.userId === publisher.userId) : [];

  const todayISO = formatDateISO(new Date());
  // Away today, or the next time he will be — what one wants to know before
  // giving him anything.
  const absence = useMemo(() => {
    const own = (absQ.data ?? [])
      .filter((a) => a.publisherId === publisher.id && (a.endDate ?? a.startDate) >= todayISO)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return own[0] ?? null;
  }, [absQ.data, publisher.id, todayISO]);

  const isBaptised = ['publisher', 'ministerial_servant', 'elder'].includes(publisher.appointment);
  const pioneer = publisher.pioneerType !== 'none' ? publisher.pioneerType : null;
  const roleChip =
    publisher.appointment === 'publisher' || publisher.appointment === 'unbaptized_publisher'
      ? t(`publisherCard.${publisher.gender}`) +
        (publisher.appointment === 'unbaptized_publisher' ? ` · ${t('publishers.appointment.unbaptized')}` : '')
      : t(`publishers.appointment.${publisher.appointment}`);

  const phone = publisher.mobilePhone?.trim() || null;
  const email = publisher.email?.trim() || null;
  const address = publisher.address?.trim() || null;
  const wa = whatsappNumber(phone);
  const open = (url: string) => {
    if (Platform.OS === 'web') window.open(url, url.startsWith('http') ? '_blank' : '_self', 'noopener');
    else void Linking.openURL(url);
  };

  const hero = (
    <View style={styles.hero}>
      <View style={[styles.heroTop, !twoCols && styles.heroTopNarrow]}>
        <View style={[styles.avatar, { backgroundColor: publisher.gender === 'brother' ? '#0e7490' : '#be185d' }]}>
          <Text style={styles.avatarText}>{(publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '')}</Text>
        </View>
        <View style={[styles.heroBody, !twoCols && styles.heroBodyNarrow]}>
          <Text style={[styles.name, !twoCols && styles.center]}>{publisher.displayName}</Text>
          <View style={[styles.chips, !twoCols && styles.chipsNarrow]}>
            <Chip text={roleChip} tone="role" />
            {pioneer ? (
              <Chip
                text={
                  publisher.pioneerSince
                    ? t('publisherCard.pioneerSince', {
                        kind: t(`publishers.pioneer.detail.${pioneer}`),
                        year: publisher.pioneerSince.slice(0, 4),
                      })
                    : t(`publishers.pioneer.detail.${pioneer}`)
                }
                tone="pioneer"
              />
            ) : null}
            {publisher.isAuxiliaryPioneerNow ? <Chip text={t('auxPioneer.servesAsAux')} tone="pioneer" /> : null}
            {group ? (
              <Chip
                text={
                  groupRole
                    ? t(`publisherCard.groupRole.${groupRole}`, { name: group.name })
                    : t('publisherCard.group', { name: group.name })
                }
                tone="group"
              />
            ) : null}
            {pastoral && publisher.status ? (
              <Chip
                text={t(`publishers.status.${publisher.status}`)}
                tone={publisher.status === 'active' ? 'ok' : 'warn'}
                icon="information-circle-outline"
                onPress={() => setExplain(true)}
                testID="card-status"
              />
            ) : null}
            {absence ? (
              <Chip
                text={t(absence.startDate <= todayISO ? 'publisherCard.awayNow' : 'publisherCard.awayFrom', {
                  span: formatDayRange(absence.startDate, absence.endDate ?? absence.startDate, lang, { month: 'short' }),
                })}
                tone="away"
                icon="airplane-outline"
              />
            ) : null}
          </View>
        </View>
        {!removed && (actions.canEdit || actions.canS21) ? (
          <View style={[styles.heroActions, !twoCols && styles.heroActionsNarrow]}>
            {actions.canS21 ? (
              <Pressable onPress={actions.onS21} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} testID="card-s21">
                <Ionicons name="document-text-outline" size={16} color="#0369a1" />
                <Text style={styles.btnText}>S-21</Text>
              </Pressable>
            ) : null}
            {actions.canEdit ? (
              <Pressable
                onPress={actions.onEdit}
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressedDark]}
                testID="card-edit"
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={[styles.btnText, styles.btnPrimaryText]}>{t('publishers.actions.edit')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      {/* Ring, write, find — greyed where there is nothing to do it with. */}
      <View style={[styles.quick, !twoCols && styles.chipsNarrow]}>
        <Quick icon="call-outline" label={t('publisherCard.call')} onPress={phone ? () => open(`tel:${phone}`) : null} />
        <Quick icon="logo-whatsapp" label={t('publisherCard.whatsapp')} onPress={wa ? () => open(`https://wa.me/${wa}`) : null} />
        <Quick icon="mail-outline" label={t('publisherCard.write')} onPress={email ? () => open(`mailto:${email}`) : null} />
        <Quick
          icon="location-outline"
          label={t('publisherCard.map')}
          onPress={address ? () => open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`) : null}
        />
      </View>
    </View>
  );

  const noContacts = !phone && !email && !address;
  const contacts = (
    <Block title={t('publishers.sections.contact')}>
      {noContacts ? (
        <View style={styles.emptyLine}>
          <Text style={styles.emptyText}>{t('publisherCard.noContacts')}</Text>
          {actions.canEdit && !removed ? (
            <Pressable onPress={actions.onEdit} hitSlop={6}>
              <Text style={styles.link}>{t('publisherCard.add')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {phone ? <Row label={t('publishers.fields.phone')} value={phone} onPress={() => open(`tel:${phone}`)} /> : null}
          {email ? <Row label={t('publisherCard.email')} value={email} onPress={() => open(`mailto:${email}`)} /> : null}
          {address ? <Row label={t('publishers.fields.address')} value={address} /> : null}
          <View style={styles.checkRow}>
            <Ionicons
              name={publisher.contactsConfirmedAt ? 'shield-checkmark-outline' : 'alert-circle-outline'}
              size={14}
              color={publisher.contactsConfirmedAt ? '#16a34a' : '#b45309'}
            />
            <Text style={[styles.checkText, { color: publisher.contactsConfirmedAt ? '#166534' : '#92400e' }]}>
              {contactsCheckLine(t, lang, publisher.contactsConfirmedAt ?? null, publisher.contactsConfirmedByName ?? null)}
            </Text>
            {/* Only real contacts can be vouched for: with none, the button
                confirmed an empty card. */}
            {actions.canEdit && !removed ? (
              <Pressable onPress={actions.onConfirmContacts} disabled={actions.confirmingContacts} hitSlop={6}>
                <Text style={styles.link}>{actions.confirmingContacts ? t('common.loading') : t('myContacts.confirm')}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </Block>
  );

  const notes = publisher.notes?.trim() ? (
    <Block
      title={t('publishers.sections.notes')}
      action={actions.canEdit && !removed ? { label: t('publishers.actions.edit'), onPress: actions.onEdit } : undefined}
    >
      <Text style={styles.note} testID="card-notes">
        {publisher.notes!.trim()}
      </Text>
    </Block>
  ) : null;

  const capsCount = countActiveCapabilities(publisher.capabilities ?? {});
  const congregation = (
    <Block title={t('publisherCard.inCongregation')}>
      {/* The group stands in the header, with his role in it. */}
      {duties.map((d) => (
        <Row key={d.type} label={t('publisherCard.duty')} value={t(`responsibilities.types.${d.type}`)} />
      ))}
      <Text style={styles.subLabel}>
        {t('publishers.sections.capabilities')}
        {capsCount > 0 ? ` · ${capsCount}` : ''}
      </Text>
      {capsCount === 0 ? (
        <Text style={styles.emptyText}>{t('publishers.noCapabilities')}</Text>
      ) : (
        <View style={styles.caps}>
          {CAPABILITY_CATEGORIES.flatMap((c) => c.capabilities)
            .filter((c) => publisher.capabilities?.[c.key])
            .map((c) => (
              <View key={c.key} style={styles.cap}>
                <Text style={styles.capText}>{t(`capabilities.items.${c.key}`)}</Text>
              </View>
            ))}
        </View>
      )}
    </Block>
  );

  const personalRows = [
    publisher.birthDate ? (
      <Row key="b" label={t('publishers.fields.birthDate')} value={formatDay(publisher.birthDate, lang, { year: 'always' })} />
    ) : null,
    isBaptised ? (
      <Row
        key="bp"
        label={t('publishers.fields.baptism')}
        value={publisher.baptismDate ? formatDay(publisher.baptismDate, lang, { year: 'always' }) : null}
      />
    ) : publisher.appointment === 'unbaptized_publisher' ? (
      <Row
        key="ms"
        label={t('publishers.fields.ministryStart')}
        value={publisher.ministryStartDate ? formatDay(publisher.ministryStartDate, lang, { year: 'always' }) : null}
      />
    ) : null,
    pioneer && publisher.pioneerSince ? (
      <Row
        key="p"
        label={t(`publishers.pioneer.detail.${pioneer}`)}
        value={t('publisherCard.since', { date: formatDay(publisher.pioneerSince, lang, { year: 'always' }) })}
      />
    ) : null,
    // Shown only when there is something, and only to elders: an empty line
    // would say these facts exist and were looked at.
    pastoral && (publisher.isDeaf || publisher.isBlind || publisher.isImprisoned) ? (
      <Row
        key="c"
        label={t('publishers.sections.circumstances')}
        value={[
          publisher.isDeaf ? t('publishers.fields.isDeaf') : null,
          publisher.isBlind ? t('publishers.fields.isBlind') : null,
          publisher.isImprisoned ? t('publishers.fields.isImprisoned') : null,
        ]
          .filter(Boolean)
          .join(', ')}
      />
    ) : null,
  ].filter(Boolean);
  const personal = personalRows.length ? <Block title={t('publishers.sections.personal')}>{personalRows}</Block> : null;

  const service = pastoral && !removed ? <ServiceBlock publisher={publisher} onExplain={() => setExplain(true)} /> : null;
  const meetings = pastoral && !removed ? <MeetingsBlock publisherId={publisher.id} /> : null;
  const aux = pastoral ? <AuxBlock publisherId={publisher.id} /> : null;
  const accessBlock = isAdmin ? <Block title={t('publishers.sections.appAccess')}>{access}</Block> : null;

  const left = [contacts, notes, personal, accessBlock];
  const right = [service, aux, congregation, meetings];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {hero}
      {twoCols ? (
        <View style={styles.cols}>
          <View style={styles.col}>{left}</View>
          <View style={styles.col}>{right}</View>
        </View>
      ) : (
        // On a phone the order an elder reads in: how he serves, how to reach
        // him, what to remember, where he stands, what he has been given.
        <View>{[service, aux, contacts, notes, congregation, meetings, personal, accessBlock]}</View>
      )}
      {footer}
      <StatusReasonsModal
        target={explain ? { publisherId: publisher.id, displayName: publisher.displayName } : null}
        onClose={() => setExplain(false)}
      />
    </View>
  );
}

/** «Служение · 6 месяцев»: the reports month by month, and why the status. */
function ServiceBlock({ publisher, onExplain }: { publisher: Publisher; onExplain: () => void }) {
  const { t } = useTranslation();
  const historyQ = useQuery({
    queryKey: ['publisher-history', publisher.id, 7],
    queryFn: () => serviceReportsApi.getHistoryForPublisher(publisher.id, 7),
  });
  const reasonsQ = useQuery({
    queryKey: ['status-explained', publisher.id],
    queryFn: () => publishersApi.explainStatus(publisher.id),
  });
  const months = (historyQ.data?.timeline ?? [])
    .slice()
    .sort((a, b) => a.reportMonth.localeCompare(b.reportMonth))
    .filter((m) => !historyQ.data?.startsFrom || m.reportMonth.slice(0, 7) >= historyQ.data.startsFrom.slice(0, 7))
    .slice(-6);
  const r = reasonsQ.data;
  return (
    <Block
      title={t('publisherCard.service')}
      action={{
        label: t('publisherCard.reports'),
        onPress: () =>
          router.push({
            pathname: '/service-reports/publisher-history',
            params: { publisherId: publisher.id, displayName: publisher.displayName },
          } as never),
      }}
    >
      {historyQ.isLoading ? (
        <ActivityIndicator style={styles.wait} />
      ) : months.length === 0 ? (
        <Text style={styles.emptyText}>{t('publisherCard.noReports')}</Text>
      ) : (
        <View style={styles.months}>
          {months.map((m) => {
            const rep = m.report;
            const served = !!rep && (rep.servedThisMonth === true || (rep.hoursReported ?? 0) > 0);
            const state = !rep ? 'none' : served ? 'served' : 'silent';
            return (
              <View key={m.reportMonth} style={[styles.month, MONTH_BG[state]]} testID={`month-${m.reportMonth.slice(0, 7)}`}>
                <Text style={[styles.monthText, { color: MONTH_FG[state] }]}>
                  {formatMonthLabel(m.reportMonth.slice(0, 7)).slice(0, 3)}
                </Text>
                <Ionicons
                  name={state === 'served' ? 'checkmark' : state === 'silent' ? 'remove' : 'ellipsis-horizontal'}
                  size={13}
                  color={state === 'served' ? '#15803d' : state === 'silent' ? '#b45309' : '#94a3b8'}
                />
              </View>
            );
          })}
        </View>
      )}
      {r && r.windowFrom ? (
        <Pressable onPress={onExplain} hitSlop={4}>
          <Text style={styles.reason}>
            {t('publisherCard.weighed', { served: r.served, expected: r.expected })}
            <Text style={styles.link}>{`  ${t('publisherCard.why')}`}</Text>
          </Text>
        </Pressable>
      ) : null}
    </Block>
  );
}

/** «На встречах»: what he is given, ahead first, then the last few. */
function MeetingsBlock({ publisherId }: { publisherId: string }) {
  const { t, i18n } = useTranslation();
  const [more, setMore] = useState(false);
  const monday = startOfWeekMonday(new Date());
  // GET /publisher-activity looks back from the week it is given: from five
  // weeks ahead, sixteen weeks — eleven behind and what is planned.
  const until = formatDateISO(addWeeks(monday, 5));
  const q = useQuery({
    queryKey: ['publisher-activity', until, 16],
    queryFn: () => publisherActivityApi.getActivity({ weekStart: until, weeks: 16 }),
    staleTime: 60 * 1000,
  });
  // The activity knows the week; the day is the week rules' answer — a
  // meeting moved by the circuit overseer's visit on its moved day, the
  // Memorial on its own date (Lionel, 28 October 2026: the day, not the week).
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const dayOf = (i: ActivityItem): string | null => {
    if (!settingsQ.data || !eventsQ.data) return null;
    const rules = weekRules({
      weekStartISO: i.weekStartDate,
      version: effectiveVersionFor(settingsQ.data.versions, i.weekStartDate),
      events: eventsQ.data,
    });
    if (i.eventType === 'memorial') return rules.memorial?.date ?? null;
    if (i.eventType === 'midweek' || i.eventType === 'weekend') return rules.dateOf(i.eventType);
    return null;
  };
  const todayISO = formatDateISO(new Date());
  const items = (q.data?.find((a) => a.publisherId === publisherId)?.items ?? [])
    .map((i) => ({ i, day: dayOf(i) }))
    .sort((a, b) => (b.day ?? b.i.weekStartDate).localeCompare(a.day ?? a.i.weekStartDate));
  // Ahead by the day itself: Sunday's part is still ahead on Wednesday,
  // Monday's is not.
  const isAheadOf = (x: { i: ActivityItem; day: string | null }) =>
    x.day ? x.day >= todayISO : x.i.weekStartDate >= formatDateISO(monday);
  const ahead = items.filter(isAheadOf).reverse();
  const past = items.filter((x) => !isAheadOf(x));
  // Folded: the next three and the last three; «Ещё» opens the rest.
  const shown = [
    ...ahead.slice(0, more ? 12 : 3).map((x) => ({ ...x, ahead: true })),
    ...past.slice(0, more ? 12 : 3).map((x) => ({ ...x, ahead: false })),
  ];
  return (
    <Block
      title={t('publisherCard.meetings')}
      action={past.length > 3 || ahead.length > 3 ? { label: more ? t('publisherCard.less') : t('publisherCard.more'), onPress: () => setMore((v) => !v) } : undefined}
    >
      {q.isLoading ? (
        <ActivityIndicator style={styles.wait} />
      ) : shown.length === 0 ? (
        <Text style={styles.emptyText}>{t('publisherCard.noMeetings')}</Text>
      ) : (
        shown.map(({ i, day, ahead: isAhead }, n) => (
          <View key={`${i.weekStartDate}${i.eventType}${i.kind}${i.partKey ?? i.dutyType}${i.slotIndex ?? ''}${n}`} style={styles.act}>
            <Text style={styles.actWeek}>
              {day
                ? formatDay(day, i18n.language, { weekday: 'short', month: 'short' })
                : t('publisherCard.week', { date: formatDay(i.weekStartDate, i18n.language, { month: 'short' }) })}
            </Text>
            <View style={[styles.actDot, { backgroundColor: KIND_COLOR[i.eventType] ?? '#94a3b8' }]} />
            <Text style={styles.actText} numberOfLines={2}>
              {activityItemLabel(i)}
              {i.kind === 'part' && i.role === 'assistant' ? ` · ${t('publisherCard.assistant')}` : ''}
            </Text>
            {isAhead ? <Text style={styles.ahead}>{t('publisherCard.ahead')}</Text> : null}
          </View>
        ))
      )}
    </Block>
  );
}

/**
 * «Подсобное служение» (29 October 2026, mockup screen 10): kept for good —
 * an application still before the committee, then every service year he
 * served, with the goals and the hours that came in. Nothing when he never
 * served and has nothing pending.
 */
function AuxBlock({ publisherId }: { publisherId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useQuery({
    queryKey: ['aux-pioneers', 'card', publisherId],
    queryFn: () => auxYearApi.card(publisherId),
  });
  // The applications themselves, each with its S-205b — for those who keep
  // the list (the committee and the admins); other elders see the years.
  const { canManageAuxiliaryPioneers } = usePermissions();
  const appsQ = useQuery({
    queryKey: ['aux-applications', 'publisher', publisherId],
    queryFn: () => auxApplicationsApi.forPublisher(publisherId),
    enabled: canManageAuxiliaryPioneers,
  });
  const apps = appsQ.data ?? [];
  const d = q.data;
  if (!d || (d.totalMonths === 0 && !d.pending)) return null;
  const shortYear = (y: number) => `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
  const yearMonths = (months: string[]) =>
    capitalize(
      runsOf(months)
        .map((r) =>
          r.start === r.end
            ? monthName(r.start, lang, false)
            : `${monthName(r.start, lang, false)}–${monthName(r.end, lang, false)}`,
        )
        .join(', '),
    );
  return (
    <Block key="aux" title={t('auxCard.title')}>
      {d.totalMonths > 0 && d.since !== null ? (
        <View style={styles.auxSummary}>
          <Text style={styles.auxSummaryText}>
            {t('auxCard.summary', { months: d.totalMonths, year: d.since })}
          </Text>
        </View>
      ) : null}
      {d.pending ? (
        <View style={[styles.auxTile, styles.auxTilePending]}>
          <View style={[styles.auxBadge, { backgroundColor: '#fef3c7' }]}>
            <Text style={[styles.auxBadgeTop, { color: '#92400e' }]}>
              {monthName(d.pending.months[0], lang, false).slice(0, 3).toUpperCase()}
            </Text>
            <Text style={[styles.auxBadgeSub, { color: '#b45309' }]}>{d.pending.months[0].slice(0, 4)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.auxTitle}>
              {t('auxCard.pending', { months: monthsLabel(d.pending.months, lang) })}
            </Text>
            <Text style={styles.auxSub}>{t('auxCard.pendingSub')}</Text>
          </View>
        </View>
      ) : null}
      {d.years.map((y) => {
        const reported = y.cells.filter((c) => c.hours !== null);
        const goals = `${y.cells.map((c) => c.goal).join(' · ')} ${t('auxCard.hoursUnit')}`;
        const line = [
          goals,
          reported.length > 0 ? t('auxCard.reported', { list: reported.map((c) => c.hours).join(' · ') }) : null,
          y.paper ? t('auxCard.paper') : null,
        ]
          .filter(Boolean)
          .join(' — ');
        return (
          <View key={y.year} style={styles.auxTile}>
            <View style={styles.auxBadge}>
              <Text style={styles.auxBadgeTop}>{shortYear(y.year)}</Text>
              <Text style={styles.auxBadgeSub}>{t('auxCard.year')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.auxTitle}>{yearMonths(y.cells.map((c) => c.month))}</Text>
              <Text style={styles.auxSub}>{line}</Text>
            </View>
          </View>
        );
      })}
      {apps.length > 0 ? (
        <>
          <Text style={styles.subLabel}>{t('auxPrint.cardApps', { count: apps.length })}</Text>
          {apps.map((a) => (
            <Pressable
              key={a.id}
              style={styles.auxAppRow}
              onPress={() => router.push(`/cart/aux-application/${a.id}` as never)}
              accessibilityRole="link"
            >
              <Ionicons name="document-text-outline" size={16} color="#0369a1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.auxTitle} numberOfLines={1}>
                  {a.untilCancelled
                    ? t('auxApp.my.fromUntilCancelled', { month: monthName(a.months[0], lang) })
                    : capitalize(monthsLabel(a.months, lang))}
                </Text>
                <Text style={styles.auxSub}>
                  {t('auxPrint.cardAppLine', {
                    date: a.approvedAt
                      ? new Date(a.approvedAt).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
                      : '—',
                  })}
                  {a.source === 'paper' ? ` · ${t('auxCard.paper')}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </Pressable>
          ))}
        </>
      ) : null}
    </Block>
  );
}

function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={6}>
            <Text style={styles.link}>{action.label} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value: string | null; onPress?: () => void }) {
  const body = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowEmpty, onPress && styles.rowLink]} selectable>
        {value ?? '—'}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const CHIP = {
  role: { bg: '#e0f2fe', fg: '#0369a1' },
  pioneer: { bg: '#dcfce7', fg: '#166534' },
  group: { bg: '#ede9fe', fg: '#5b21b6' },
  ok: { bg: '#f0fdf4', fg: '#15803d' },
  warn: { bg: '#fef3c7', fg: '#92400e' },
  away: { bg: '#fff1f2', fg: '#be123c' },
} as const;

function Chip({
  text,
  tone,
  icon,
  onPress,
  testID,
}: {
  text: string;
  tone: keyof typeof CHIP;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  testID?: string;
}) {
  const c = CHIP[tone];
  const inner = (
    <>
      <Text style={[styles.chipText, { color: c.fg }]}>{text}</Text>
      {icon ? <Ionicons name={icon} size={13} color={c.fg} /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: c.bg }]} testID={testID} accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>{inner}</View>
  );
}

function Quick({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: (() => void) | null;
}) {
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.q, !onPress && styles.qOff, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={onPress ? '#0369a1' : '#cbd5e1'} />
      <Text style={[styles.qText, !onPress && styles.qTextOff]}>{label}</Text>
    </Pressable>
  );
}

const MONTH_BG = {
  served: { backgroundColor: '#dcfce7' },
  silent: { backgroundColor: '#fef3c7' },
  none: { backgroundColor: '#f1f5f9' },
} as const;
const MONTH_FG = { served: '#166534', silent: '#92400e', none: '#94a3b8' } as const;

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#e2e8f0';

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  hero: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 18, marginBottom: 14, gap: 14 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 24, color: '#fff' },
  heroBody: { flex: 1, minWidth: 200, gap: 8 },
  name: { fontFamily: FONT.extrabold, fontSize: 24, color: INK, letterSpacing: -0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontFamily: FONT.bold, fontSize: 12.5 },
  heroActions: { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  heroActionsNarrow: { width: '100%', justifyContent: 'center' },
  heroTopNarrow: { flexDirection: 'column', alignItems: 'center' },
  heroBodyNarrow: { minWidth: 0, width: '100%', alignItems: 'center' },
  center: { textAlign: 'center' },
  chipsNarrow: { justifyContent: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  btnText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#0369a1' },
  btnPrimary: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  btnPrimaryText: { color: '#fff' },
  pressed: { opacity: 0.7 },
  pressedDark: { opacity: 0.85 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  q: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  qOff: { backgroundColor: '#f8fafc', borderColor: '#f1f5f9' },
  qText: { fontFamily: FONT.bold, fontSize: 13, color: '#0369a1' },
  qTextOff: { color: '#cbd5e1' },
  cols: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  auxSummary: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, marginBottom: 8 },
  auxSummaryText: { fontFamily: FONT.bold, fontSize: 12, color: '#166534' },
  auxTile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 10, marginBottom: 8 },
  auxAppRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  auxTilePending: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  auxBadge: { width: 56, borderRadius: 10, backgroundColor: '#dcfce7', alignItems: 'center', paddingVertical: 6 },
  auxBadgeTop: { fontFamily: FONT.extrabold, fontSize: 15, color: '#166534' },
  auxBadgeSub: { fontFamily: FONT.semibold, fontSize: 10.5, color: '#15803d' },
  auxTitle: { fontFamily: FONT.bold, fontSize: 14.5, color: '#0f172a' },
  auxSub: { fontFamily: FONT.medium, fontSize: 12.5, color: SOFT, marginTop: 2 },
  block: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  blockTitle: { fontFamily: FONT.extrabold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: SOFT },
  link: { fontFamily: FONT.bold, fontSize: 13, color: '#0369a1' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowLabel: { fontFamily: FONT.semibold, fontSize: 13.5, color: SOFT },
  rowValue: { fontFamily: FONT.bold, fontSize: 14.5, color: INK, flexShrink: 1, textAlign: 'right' },
  rowEmpty: { color: '#cbd5e1', fontFamily: FONT.regular },
  rowLink: { color: '#0369a1' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  checkText: { flex: 1, fontFamily: FONT.semibold, fontSize: 12.5 },
  emptyLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  emptyText: { fontFamily: FONT.medium, fontSize: 13.5, color: '#94a3b8' },
  note: {
    fontFamily: FONT.medium,
    fontSize: 14.5,
    lineHeight: 22,
    color: '#334155',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subLabel: { fontFamily: FONT.semibold, fontSize: 13.5, color: SOFT, paddingTop: 9, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  caps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cap: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#ccfbf1' },
  capText: { fontFamily: FONT.bold, fontSize: 12, color: '#0f766e' },
  wait: { alignSelf: 'flex-start', marginVertical: 8 },
  months: { flexDirection: 'row', gap: 5 },
  month: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 8 },
  monthText: { fontFamily: FONT.bold, fontSize: 11 },
  reason: { fontFamily: FONT.medium, fontSize: 12.5, color: '#475569', marginTop: 10 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  actWeek: { width: 104, fontFamily: FONT.bold, fontSize: 12.5, color: SOFT },
  actDot: { width: 8, height: 8, borderRadius: 4 },
  actText: { flex: 1, fontFamily: FONT.semibold, fontSize: 13.5, color: INK },
  ahead: {
    fontFamily: FONT.extrabold,
    fontSize: 10.5,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
});
