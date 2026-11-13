import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../components/KeyboardScroll';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryAssignmentRow,
  type TerritoryNoCallRow,
} from '../../../../lib/api';
import { failsScreen } from '../../../../lib/screen-failure';
import { LoadFailure } from '../../../../components/LoadFailure';
import { NoAccess } from '../../../../components/NoAccess';
import { TerritoryMap } from '../../../../components/territories/TerritoryMap';
import { AssignSheet } from '../../../../components/territories/AssignSheet';
import { PrintMapSheet } from '../../../../components/territories/PrintMapSheet';
import { NoCallSheet } from '../../../../components/territories/NoCallSheet';
import { BusinessList, pointsOf, useBusinesses } from '../../../../components/territories/BusinessList';
import { TerritoryCardSheet } from '../../../../components/territories/TerritoryCardSheet';
import { streetsOfTerritory } from '../../../../lib/map-snapshot';
import { useAuth } from '../../../../lib/auth';
import { OpenMapButton, ShareLink } from '../../../../components/territories/MapLinks';
import { DivisionButton } from '../../../../components/territories/DivisionButton';
import {
  AssignmentSheet,
  type AssignmentAction,
} from '../../../../components/territories/AssignmentSheet';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../components/reports/ReportBits';
import { formatDateISO } from '../../../../lib/dates';
import {
  addDaysISO,
  formatDayShort,
  formatMonthYear,
  routeLink,
  TONE_COLOR,
  toneOf,
} from '../../../../lib/territory-view';

/**
 * One territory, for the whole section (11 November 2026): where it is, who
 * has it and until when, what to do with it, its «не беспокоить» addresses
 * and its record for the kept service years. Keepers act; the committee
 * reads.
 */
export default function TerritoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const a = accessQ.data;
  const open = !!a?.seesAll && !!a?.verified;
  const q = useQuery({
    queryKey: ['territories', 'detail', id],
    queryFn: () => territoriesApi.detail(id!),
    enabled: open && !!id,
    throwOnError: failsScreen,
  });
  const today = formatDateISO(new Date());
  const [giving, setGiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: () => territoriesApi.restore(id!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['territories'] }),
  });
  const [printing, setPrinting] = useState(false);
  const [noCall, setNoCall] = useState<{ row: TerritoryNoCallRow | null } | null>(null);
  // The territory's streets from the map, offered when an address is typed:
  // read once the sheet opens, on the web, when the map file is there.
  const { user } = useAuth();
  const streetsQ = useQuery({
    queryKey: ['territories', 'streets', id],
    queryFn: () =>
      streetsOfTerritory({ congregationId: user!.congregationId, geometry: q.data!.geometry }),
    enabled: !!noCall && Platform.OS === 'web' && !!a?.mapReady && !!q.data && !!user,
    staleTime: Infinity,
    retry: false,
  });
  // The neighbours and the holder for a printed map come from the list.
  const listQ = useQuery({
    queryKey: ['territories', 'list'],
    queryFn: () => territoriesApi.list(),
    enabled: open && Platform.OS === 'web',
  });
  const [acting, setActing] = useState<{
    action: AssignmentAction;
    row: TerritoryAssignmentRow;
  } | null>(null);

  const d = q.data;
  const current = d?.assignments.find((x) => !x.completedOn && !x.returnedOn) ?? null;
  // A business territory's list (13 November 2026): its dots on the map too.
  const business = d?.category === 'business';
  const businessesQ = useBusinesses(id, open && business);
  const lastDone = useMemo(() => {
    if (!d) return null;
    // The server's count first: a joined territory counts only from the join.
    if (d.lastWorkedOn !== undefined) return d.lastWorkedOn;
    return [d.lastCompletedOn, ...d.assignments.map((x) => x.completedOn)]
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
  }, [d]);

  if (accessQ.isLoading || (open && q.isLoading)) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !open) return <NoAccess />;
  if (q.error || !d) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;

  const tone = toneOf(
    {
      holder: current ? { dueOn: current.dueOn } : null,
      lastCompletedOn: lastDone,
    },
    today,
  );
  const route = routeLink(d.geometry);

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: d.number }} />
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: d.id, number: d.number, geometry: d.geometry, tone }]}
          focus={d.id}
          height={280}
          points={business ? pointsOf(businessesQ.data) : undefined}
        />
      ) : current ? (
        <OpenMapButton assignmentId={current.id} />
      ) : null}

      <View style={s.titleRow}>
        {/* The number is the screen's title above; here only where it is. */}
        <Text style={[s.sub, { flex: 1 }]}>{d.locality ?? ''}</Text>
        {route ? (
          <Pressable
            onPress={() => void Linking.openURL(route)}
            style={s.route}
            accessibilityRole="link"
          >
            <Ionicons name="navigate-outline" size={16} color={BRAND} />
            <Text style={s.routeText}>{t('territories.route')}</Text>
          </Pressable>
        ) : null}
        {a.keeps && Platform.OS === 'web' && !d.archivedAt ? (
          <Pressable onPress={() => setPrinting(true)} style={s.route} accessibilityRole="button">
            <Ionicons name="print-outline" size={16} color={BRAND} />
            <Text style={s.routeText}>{t('territories.sheet.printOne')}</Text>
          </Pressable>
        ) : null}
        {a.keeps && Platform.OS === 'web' && !d.archivedAt ? (
          <Pressable
            onPress={() => router.push(`/cart/territory/outline/${d.id}` as never)}
            style={s.route}
            accessibilityRole="button"
          >
            <Ionicons name="shapes-outline" size={16} color={BRAND} />
            <Text style={s.routeText}>{t('territories.outline.open')}</Text>
          </Pressable>
        ) : null}
        {a.keeps && Platform.OS === 'web' && !d.archivedAt ? (
          <Pressable
            onPress={() => router.push(`/cart/territory/new?near=${d.id}` as never)}
            style={s.route}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={16} color={BRAND} />
            <Text style={s.routeText}>{t('territories.create.near')}</Text>
          </Pressable>
        ) : null}
        {a.keeps && !d.archivedAt ? (
          <Pressable onPress={() => setEditing(true)} style={s.route} accessibilityRole="button">
            <Ionicons name="create-outline" size={16} color={BRAND} />
            <Text style={s.routeText}>{t('territories.card.edit')}</Text>
          </Pressable>
        ) : null}
      </View>

      {d.archivedAt ? (
        <View style={[cardStyles.card, s.archived]}>
          <Text style={s.archivedText}>
            {t('territories.card.archivedSince', { date: formatDayShort(d.archivedAt.slice(0, 10), lang) })}
          </Text>
          {a.keeps ? (
            <>
              <Pressable
                onPress={() => restore.mutate()}
                disabled={restore.isPending}
                style={s.restore}
                accessibilityRole="button"
              >
                {restore.isPending ? (
                  <ActivityIndicator color={BRAND} />
                ) : (
                  <Text style={s.routeText}>{t('territories.card.restore')}</Text>
                )}
              </Pressable>
              {restore.error ? <Text style={s.restoreError}>{extractErrorMessage(restore.error)}</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}

      {d.note ? (
        <View style={s.noteBox}>
          <Ionicons name="document-text-outline" size={15} color={MUTED} style={{ marginTop: 1 }} />
          <Text style={s.noteText}>{d.note}</Text>
        </View>
      ) : null}

      <View style={[cardStyles.card, s.card, { borderLeftColor: TONE_COLOR[tone] }]}>
        {current ? (
          <>
            <Text style={s.kicker}>{t(`territories.tone.${tone}`)}</Text>
            <Text style={s.holder}>
              {current.forGroupName ? `${current.forGroupName} · ` : ''}
              {current.holderName}
            </Text>
            <Text style={s.meta}>
              {t('territories.detail.since', { date: formatDayShort(current.assignedOn, lang) })}
              {current.dueOn
                ? ` · ${t('territories.detail.due', { date: formatDayShort(current.dueOn, lang) })}`
                : ''}
              {current.extended ? ` · ${t('territories.detail.extended')}` : ''}
            </Text>
            {a.keeps ? (
              <View style={s.actions}>
                <Action
                  label={t('territories.action.complete.title')}
                  onPress={() => setActing({ action: 'complete', row: current })}
                  primary
                />
                <Action
                  label={t('territories.action.extend.short')}
                  onPress={() => setActing({ action: 'extend', row: current })}
                />
                <Action
                  label={t('territories.action.return.title')}
                  onPress={() => setActing({ action: 'return', row: current })}
                />
              </View>
            ) : null}
            {a.keeps ? <ShareLink assignmentId={current.id} /> : null}
            {!business ? <DivisionButton territoryId={d.id} /> : null}
          </>
        ) : (
          <>
            <Text style={s.kicker}>{t(`territories.tone.${tone}`)}</Text>
            <Text style={s.holder}>
              {lastDone
                ? t('territories.row.free', { date: formatDayShort(lastDone, lang) })
                : t('territories.row.freeNever')}
            </Text>
            {a.keeps && !d.archivedAt ? (
              <View style={s.actions}>
                <Action label={t('territories.overview.give')} onPress={() => setGiving(true)} primary />
              </View>
            ) : null}
          </>
        )}
      </View>

      {business ? (
        <>
          <Text style={s.section}>
            {t('territories.business.title')}
            {businessesQ.data ? ` — ${businessesQ.data.items.length}` : ''}
          </Text>
          <BusinessList territoryId={d.id} keeps={a.keeps && !d.archivedAt} canMark={a.keeps} />
        </>
      ) : null}

      <Text style={s.section}>{t('territories.detail.noCalls', { count: d.noCalls.length })}</Text>
      <View style={[cardStyles.card, s.list]}>
        {d.noCalls.length === 0 ? (
          <Text style={s.empty}>{t('territories.detail.noCallsNone')}</Text>
        ) : (
          d.noCalls.map((n) => {
            const up = !!n.reviewOn && n.reviewOn <= addDaysISO(today, 30);
            return (
              <Pressable
                key={n.id}
                disabled={!a.keeps}
                onPress={() => setNoCall({ row: n })}
                style={({ pressed }) => [s.ncLine, pressed && { opacity: 0.6 }]}
                accessibilityRole={a.keeps ? 'button' : undefined}
              >
                <Ionicons name="hand-left-outline" size={15} color="#c2410c" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lineText}>
                    {n.address}
                    {n.surname ? ` · ${t('territories.noCall.onDoor', { surname: n.surname })}` : ''}
                  </Text>
                  <Text style={[s.lineMeta, up && s.reviewDue]}>
                    {t('territories.noCall.noted', { date: formatDayShort(n.notedOn, lang) })}
                    {n.reviewOn
                      ? ` · ${t(up ? 'territories.noCall.reviewNow' : 'territories.noCall.reviewOn', {
                          date: formatMonthYear(n.reviewOn, lang),
                        })}`
                      : ''}
                  </Text>
                </View>
                {a.keeps ? <Ionicons name="create-outline" size={16} color={MUTED} /> : null}
              </Pressable>
            );
          })
        )}
        {a.keeps && !d.archivedAt ? (
          <Pressable onPress={() => setNoCall({ row: null })} style={s.addNc} accessibilityRole="button">
            <Ionicons name="add" size={18} color={BRAND} />
            <Text style={s.addNcText}>{t('territories.noCall.add')}</Text>
          </Pressable>
        ) : null}
        <Text style={s.small}>{t('territories.detail.noCallsRule')}</Text>
      </View>

      <Text style={s.section}>{t('territories.detail.history')}</Text>
      <View style={[cardStyles.card, s.list]}>
        {d.assignments.length === 0 ? (
          <Text style={s.empty}>{t('territories.detail.historyNone')}</Text>
        ) : (
          d.assignments.map((x) => (
            <Pressable
              key={x.id}
              disabled={!a.keeps}
              onPress={() => setActing({ action: 'edit', row: x })}
              style={({ pressed }) => [s.hist, pressed && { opacity: 0.6 }]}
              accessibilityRole={a.keeps ? 'button' : undefined}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.histName}>
                  {x.forGroupName ? `${x.forGroupName} · ` : ''}
                  {x.holderName}
                </Text>
                <Text style={s.meta}>
                  {formatDayShort(x.assignedOn, lang)} →{' '}
                  {x.completedOn
                    ? `${formatDayShort(x.completedOn, lang)} · ${t(`territories.method.${x.method ?? 'door_to_door'}`)}`
                    : x.returnedOn
                      ? t('territories.detail.returned', { date: formatDayShort(x.returnedOn, lang) })
                      : t('territories.detail.stillHeld')}
                </Text>
              </View>
              {a.keeps ? <Ionicons name="create-outline" size={16} color={MUTED} /> : null}
            </Pressable>
          ))
        )}
        <Text style={s.small}>{t('territories.detail.historyKept')}</Text>
      </View>

      {editing ? (
        <TerritoryCardSheet territory={d} held={!!current} visible onClose={() => setEditing(false)} />
      ) : null}
      {giving ? (
        <AssignSheet
          territoryId={d.id}
          visible
          onClose={() => setGiving(false)}
          onPrint={() => setPrinting(true)}
        />
      ) : null}
      {noCall ? (
        <NoCallSheet
          territoryId={d.id}
          number={d.number}
          row={noCall.row}
          streets={streetsQ.data ?? []}
          visible
          onClose={() => setNoCall(null)}
        />
      ) : null}
      {printing ? (
        <PrintMapSheet
          targets={(listQ.data ?? []).filter((r) => r.id === d.id)}
          all={listQ.data ?? []}
          visible
          onClose={() => setPrinting(false)}
        />
      ) : null}
      <AssignmentSheet
        action={acting?.action ?? null}
        assignment={acting?.row ?? null}
        keeps={a.keeps}
        onClose={() => setActing(null)}
      />
    </KeyboardScroll>
  );
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.btn, primary && s.btnPrimary, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <Text style={[s.btnText, primary && s.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  archived: { borderLeftWidth: 4, borderLeftColor: '#94a3b8', gap: 8 },
  archivedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK, lineHeight: 19 },
  restore: { alignSelf: 'flex-start', borderWidth: 1, borderColor: BRAND, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  restoreError: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  noteBox: { flexDirection: 'row', gap: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 10 },
  noteText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 13, color: INK, lineHeight: 18 },
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  routeText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  card: { borderLeftWidth: 5, marginBottom: 0 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  holder: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: INK, marginTop: 4 },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  btn: { borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff' },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  btnTextPrimary: { color: '#fff' },
  section: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase', marginTop: 6 },
  list: { paddingVertical: 8, marginBottom: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  ncLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  reviewDue: { color: '#b45309', fontFamily: 'Manrope_700Bold' },
  addNc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4 },
  addNcText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: BRAND },
  lineText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK },
  lineMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  histName: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, paddingVertical: 8 },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: '#94a3b8', marginTop: 8 },
});
