import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { territoriesApi, type TerritoryRow } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { LoadFailure } from '../../../components/LoadFailure';
import { NoAccess } from '../../../components/NoAccess';
import { TerritoryImport } from '../../../components/territories/TerritoryImport';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../components/reports/ReportBits';
import { formatDateISO } from '../../../lib/dates';
import { formatDayShort } from '../../../lib/territory-view';

/**
 * «Участки» (11 November 2026), first stage.
 *
 * Who is let in is the server's answer (territories/access): the territory
 * servant, his assistant and administrators always; the service committee
 * once the brought-over records are confirmed. Until then the keepers see
 * the import; afterwards everybody let in sees the list. Giving out, the map
 * and printing come in the next stage.
 */
export default function TerritoriesScreen() {
  const { t, i18n } = useTranslation();
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const a = accessQ.data;
  const listQ = useQuery({
    queryKey: ['territories', 'list'],
    queryFn: () => territoriesApi.list(),
    enabled: !!a?.seesAll && !!a?.verified,
    throwOnError: failsScreen,
  });
  const today = formatDateISO(new Date());

  const counts = useMemo(() => {
    const rows = listQ.data ?? [];
    const held = rows.filter((r) => r.holder);
    const overdue = held.filter((r) => r.holder?.dueOn && r.holder.dueOn < today);
    const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
    const idle = rows.filter((r) => !r.holder && (!r.lastCompletedOn || r.lastCompletedOn < yearAgo));
    return { total: rows.length, held: held.length, overdue: overdue.length, idle: idle.length };
  }, [listQ.data, today]);

  if (accessQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !a.seesAll) return <NoAccess />;

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <View style={s.head}>
        <Text style={s.kicker}>{t('territories.kicker')}</Text>
        <Text style={s.sub}>
          {a.verified
            ? t('territories.verifiedSince', {
                date: a.verifiedAt ? formatDayShort(a.verifiedAt.slice(0, 10), i18n.language) : '',
              })
            : t('territories.notVerified')}
        </Text>
      </View>

      {!a.verified ? (
        a.keeps ? (
          <TerritoryImport onDone={() => accessQ.refetch()} />
        ) : (
          <NoAccess />
        )
      ) : listQ.isLoading ? (
        <ActivityIndicator color={BRAND} />
      ) : listQ.error ? (
        <LoadFailure error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : (
        <>
          <View style={s.tiles}>
            <Tile value={counts.total} label={t('territories.tiles.total')} />
            <Tile value={counts.held} label={t('territories.tiles.held')} tone="#15803d" />
            <Tile value={counts.overdue} label={t('territories.tiles.overdue')} tone="#c2410c" />
            <Tile value={counts.idle} label={t('territories.tiles.idle')} tone={BRAND} />
          </View>
          <View style={cardStyles.card}>
            {(listQ.data ?? []).map((r) => (
              <Row key={r.id} row={r} today={today} lang={i18n.language} />
            ))}
          </View>
          <Text style={s.next}>{t('territories.nextStage')}</Text>
        </>
      )}
    </KeyboardScroll>
  );
}

function Tile({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={s.tile}>
      <Text style={[s.tileValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

function Row({ row, today, lang }: { row: TerritoryRow; today: string; lang: string }) {
  const { t } = useTranslation();
  const h = row.holder;
  const overdue = !!h?.dueOn && h.dueOn < today;
  return (
    <View style={s.row}>
      <View style={[s.bar, { backgroundColor: h ? (overdue ? '#c2410c' : '#15803d') : '#cbd5e1' }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.number}>
          {row.number}
          {row.locality ? <Text style={s.locality}> · {row.locality}</Text> : null}
        </Text>
        <Text style={s.meta}>
          {h
            ? t('territories.row.held', {
                name: h.forGroupName ? `${h.forGroupName} · ${h.name}` : h.name,
                date: formatDayShort(h.assignedOn, lang),
              })
            : row.lastCompletedOn
              ? t('territories.row.free', { date: formatDayShort(row.lastCompletedOn, lang) })
              : t('territories.row.freeNever')}
        </Text>
      </View>
      {h?.dueOn ? (
        <Text style={[s.due, overdue && { color: '#c2410c' }]}>
          {t('territories.row.due', { date: formatDayShort(h.dueOn, lang) })}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 960, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { marginBottom: 12 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 1, color: '#15803d', textTransform: 'uppercase' },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, marginTop: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tile: { flexGrow: 1, flexBasis: 140, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 12 },
  tileValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: INK },
  tileLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  bar: { width: 5, alignSelf: 'stretch', borderRadius: 3 },
  number: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  locality: { fontFamily: 'Manrope_500Medium', color: MUTED },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  due: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  next: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 4, textAlign: 'center' },
});
