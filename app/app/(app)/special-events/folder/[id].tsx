import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { KeyboardScroll } from '../../../../components/KeyboardScroll';
import { LoadFailure } from '../../../../components/LoadFailure';
import { confirm } from '../../../../components/ConfirmHost';
import { FolderLine, type LineActions } from '../../../../components/co-folder/FolderLine';
import { Page2 } from '../../../../components/co-folder/Page2';
import { extractErrorMessage, meetingSettingsApi } from '../../../../lib/api';
import {
  coFolderApi,
  filterItems,
  mayHandOver,
  type CoFolder,
  type FolderAnswer,
  type FolderFilter,
  type FolderItem,
  type FolderMarkState,
  type FolderRole,
} from '../../../../lib/co-folder';
import { answersFile, makeFile, tocFile, type FileContext, type FolderFile } from '../../../../lib/co-folder-files';
import { withTitle } from '../../../../lib/coFolderPdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../../lib/pdf';
import { reportError } from '../../../../lib/error-bus';
import { failsScreen } from '../../../../lib/screen-failure';
import { formatDayRange } from '../../../../lib/date-range';
import { capitalizeFirst } from '../../../../lib/relative-time';
import { useMayOpen } from '../../../../lib/useMayOpen';
import { BRAND, INK, LINE, MUTED } from '../../../../components/reports/ReportBits';

/** Two columns when the screen's own column is this wide; rows with the
 * status beside them from ROW_WIDE. */
const TWO_COLUMNS = 900;
const ROW_WIDE = 620;
const AMBER = '#b45309';
const ROLES: FolderRole[] = ['coordinator', 'secretary', 'service_overseer'];

/**
 * «Папка для районного старейшины» — form S-61 for one visit (17 November
 * 2026; mockup «Папка для районного (S-61)»). The coordinator, the secretary
 * and the service overseer see and mark everything; another elder sees
 * section 1. Each file is saved by the browser's print window («Сохранить
 * как PDF») under a name numbered as on the form; the app asks afterwards
 * whether it was saved, and marks it only then.
 */
export default function CoFolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { width } = useWindowDimensions();
  // The screen's own column, not the window: beside the side menu a laptop
  // window leaves less room than its width says.
  const [column, setColumn] = useState(width);
  const wide = column >= TWO_COLUMNS;
  const rowWide = column >= ROW_WIDE;
  const qc = useQueryClient();
  const mayOpen = useMayOpen();
  const q = useQuery({
    queryKey: ['co-folder', id],
    queryFn: () => coFolderApi.get(id!),
    enabled: !!id,
    throwOnError: failsScreen,
  });
  const congQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const [filter, setFilter] = useState<FolderFilter | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['co-folder', id] });

  const markM = useMutation({
    mutationFn: (v: { key: string; state: FolderMarkState | null; stamp?: string | null }) =>
      coFolderApi.mark(id!, v.key, v.state, v.stamp),
    onSuccess: refresh,
    onError: (e) => reportError(extractErrorMessage(e)),
  });
  const answerM = useMutation({
    mutationFn: (v: { q: number; a: FolderAnswer | null }) => coFolderApi.answer(id!, v.q, v.a),
    onSuccess: refresh,
    onError: (e) => reportError(extractErrorMessage(e)),
  });
  const s62M = useMutation({
    mutationFn: (v: { what: 'sent' | 'checked'; on: boolean }) => coFolderApi.s62(id!, v.what, v.on),
    onSuccess: refresh,
    onError: (e) => reportError(extractErrorMessage(e)),
  });
  const handM = useMutation({
    mutationFn: (on: boolean) => coFolderApi.handOver(id!, on),
    onSuccess: refresh,
    onError: (e) => reportError(extractErrorMessage(e)),
  });
  const deletedM = useMutation({
    mutationFn: () => coFolderApi.filesDeleted(id!),
    onSuccess: refresh,
    onError: (e) => reportError(extractErrorMessage(e)),
  });

  const f = q.data;
  const ctx = (folder: CoFolder): FileContext => ({
    folder,
    t,
    lang,
    congregation: congQ.data?.congregation?.name ?? '',
    hall: congQ.data?.effective?.address ?? '',
  });

  /** Save one file, then ask whether it was saved — and mark it only then. */
  const saveFile = async (key: string, make: () => Promise<FolderFile>, mark: boolean, fallbackStamp?: string | null) => {
    // Opened inside the tap, or the browser takes it for a popup.
    const preopened = openPrintWindow();
    setBusyKey(key);
    try {
      const file = await make();
      const res = await exportHtmlAsPdf(withTitle(file.html, file.name), {
        fileName: file.name,
        preopenedWindow: preopened,
        landscape: file.landscape,
      });
      if (!res.ok || !mark) return;
      const yes = await confirm({
        title: t('coFolder.saved.title'),
        body: t('coFolder.saved.body'),
        confirmLabel: t('coFolder.saved.yes'),
        cancelLabel: t('coFolder.saved.no'),
      });
      if (yes) await markM.mutateAsync({ key, state: 'saved', stamp: file.stamp ?? fallbackStamp ?? null });
    } catch (e) {
      preopened?.close();
      reportError(extractErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const actions: LineActions = {
    busyKey,
    onSave: (key) => {
      if (!f) return;
      const item = f.items.find((i) => i.key === (key.startsWith('2.1:') ? '2.1' : key))!;
      const stamp = key.startsWith('2.1:') ? item.groups?.find((g) => g.key === key)?.stamp : item.stamp;
      void saveFile(key, () => makeFile(ctx(f), key, item), true, stamp);
    },
    onMark: (key, state) => markM.mutate({ key, state }),
  };

  const visible = useMemo(() => (f ? filterItems(f, filter ?? (wide || !f.access.roles.length ? 'all' : 'mine')) : []), [f, filter, wide]);

  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error || !f) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;

  const current: FolderFilter = filter ?? (wide || !f.access.roles.length ? 'all' : 'mine');
  const canMark = f.access.full;
  /** «Вт, 5 января» to start a line; «вт, 5 января» inside a sentence. */
  const day = (iso: string) => capitalizeFirst(dayjs(iso).locale(lang).format('dd, D MMMM'));
  const dayIn = (iso: string) => dayjs(iso).locale(lang).format('dd, D MMMM');
  const when = formatDayRange(f.visit.date, f.visit.endDate, lang, { year: 'always' });
  const left =
    f.daysLeft > 0 ? t('coFolder.daysLeft', { count: f.daysLeft }) : f.daysLeft === 0 ? t('coFolder.dueToday') : t('coFolder.duePassed');

  const sub = (i: FolderItem): string => {
    const parts = [t(`coFolder.item.${i.key.replace('.', '_')}.hint`)];
    const n = i.facts;
    if (i.key === '1.3' && n.count != null) parts.push(t('coFolder.fact.pastoral', { count: Number(n.count) }));
    if (i.key === '1.4') parts.push(n.host ? t('coFolder.fact.hostSet') : t('coFolder.fact.noHost'));
    if (i.key === '1.5' && n.of) parts.push(t('coFolder.fact.lunchDays', { count: Number(n.count), of: Number(n.of) }));
    if (i.key === '2.5' && n.count != null) parts.push(t('coFolder.fact.contacts', { count: Number(n.count) }));
    if (i.key === '3.4' && n.count != null) parts.push(t('coFolder.fact.outings', { count: Number(n.count) }));
    if (i.key === '2.1' && Number(n.again) > 0) parts.push(t('coFolder.fact.again', { count: Number(n.again) }));
    return parts.join(' · ');
  };

  // ---- pieces ------------------------------------------------------------

  const header = (
    <View style={[s.band, wide && s.bandWide]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.bandKick}>{t('coFolder.visitKicker', { when })}</Text>
        <Text style={[s.bandTitle, wide && s.bandTitleWide]}>{f.visit.overseer ?? t('coFolder.title')}</Text>
        <Text style={s.bandSub}>{t('coFolder.title')}</Text>
      </View>
      <View style={s.bandRight}>
        <Text style={s.bandKick}>{t('coFolder.dueLabel')}</Text>
        <Text style={s.bandDue}>{day(f.dueOn)}</Text>
        <Text style={s.bandSub}>{left}</Text>
      </View>
    </View>
  );

  const s62 = f.access.full ? (
    <View style={s.s62}>
      <Ionicons
        name={f.s62.sentAt ? 'checkmark-circle' : 'time-outline'}
        size={18}
        color={f.s62.sentAt ? '#047857' : AMBER}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={s.s62Title}>{t('coFolder.s62.title', { date: dayIn(f.s62.dueOn) })}</Text>
        <Text style={s.s62Text}>
          {f.s62.sentAt
            ? t('coFolder.s62.sent', { name: f.s62.sentBy ?? '', date: dayIn(f.s62.sentAt.slice(0, 10)) })
            : `${t('coFolder.s62.body')} ${t('coFolder.s62.none')}`}
          {f.s62.checkedAt ? ` · ${t('coFolder.s62.checked', { date: dayIn(f.s62.checkedAt.slice(0, 10)) })}` : ''}
        </Text>
        <View style={s.s62Btns}>
          <Pressable
            onPress={() => s62M.mutate({ what: 'sent', on: !f.s62.sentAt })}
            style={s.ghost}
            accessibilityRole="button"
          >
            <Text style={s.ghostText}>{f.s62.sentAt ? t('coFolder.s62.undo') : t('coFolder.s62.markSent')}</Text>
          </Pressable>
          {f.s62.sentAt && !f.s62.checkedAt ? (
            <Pressable onPress={() => s62M.mutate({ what: 'checked', on: true })} style={s.ghost} accessibilityRole="button">
              <Text style={s.ghostText}>{t('coFolder.s62.markChecked')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  ) : null;

  const filters = f.access.full ? (
    <View style={s.tabs} accessibilityRole="tablist">
      {(['mine', 'open', 'all'] as FolderFilter[])
        .filter((k) => k !== 'mine' || f.access.roles.length > 0)
        .map((k) => {
          const count = filterItems(f, k).length;
          return (
            <Pressable
              key={k}
              onPress={() => setFilter(k)}
              style={[s.tab, current === k && s.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: current === k }}
            >
              <Text style={[s.tabText, current === k && s.tabTextOn]}>{t(`coFolder.filter.${k}`, { count })}</Text>
            </Pressable>
          );
        })}
    </View>
  ) : null;

  const sections = ROLES.map((role, idx) => {
    const lines = visible.filter((i) => i.role === role);
    if (!lines.length) return null;
    const count = f.byRole.find((r) => r.role === role);
    return (
      <View key={role} style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>
            {idx + 1} · {t(`coFolder.role.${role}`)}
            {f.access.roles.includes(role) ? ` · ${t('coFolder.you')}` : ''}
          </Text>
          {count ? <Text style={s.sectionCount}>{t('coFolder.ofShort', { ready: count.ready, total: count.total })}</Text> : null}
        </View>
        {lines.map((i) => (
          <FolderLine key={i.key} item={i} sub={sub(i)} actions={actions} canMark={canMark} wide={rowWide} />
        ))}
      </View>
    );
  });

  const listCard = (
    <View style={[s.card, wide && { flex: 1, minWidth: 0 }]}>
      {f.access.full ? (
        <View style={s.listTop}>
          {filters}
          {wide ? <Text style={s.note}>{t('coFolder.numbersNote')}</Text> : null}
        </View>
      ) : (
        <Text style={s.body}>{t('coFolder.sectionOnly')}</Text>
      )}
      {s62}
      {sections}
      {canMark ? <Text style={s.printHint}>{t('coFolder.printHint')}</Text> : null}
    </View>
  );

  const pct = f.total ? f.ready / f.total : 0;
  const s62Remind = dayjs(f.s62.dueOn).subtract(1, 'month').format('YYYY-MM-DD');
  const gaps = dayjs(f.dueOn).subtract(7, 'day').format('YYYY-MM-DD');
  const steps: { date: string; label: string; done: boolean }[] = [
    { date: s62Remind, label: t('coFolder.timeline.s62Remind'), done: f.today >= s62Remind },
    { date: f.s62.dueOn, label: t('coFolder.timeline.s62Due'), done: !!f.s62.sentAt || f.today > f.s62.dueOn },
    { date: gaps, label: t('coFolder.timeline.gaps'), done: f.today >= gaps },
    { date: f.dueOn, label: t('coFolder.timeline.due'), done: !!f.handedOver },
  ];
  const nextIdx = steps.findIndex((x) => !x.done);

  const summary = (
    <View style={s.card}>
      <View style={s.sumTop}>
        <Text style={s.big}>{Math.round(pct * 100)}%</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.sumTitle}>{t('coFolder.ofItems', { ready: f.ready, total: f.total })}</Text>
          {f.page2 ? (
            <Text style={s.sumSub}>
              {t('coFolder.page2.title')}: {t('coFolder.page2.progress', { answered: f.page2.answered, total: f.page2.total })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={s.bar}>
        <View style={[s.barFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      {f.byRole.map((r) => (
        <View key={r.role} style={s.roleRow}>
          <Text style={s.roleName}>
            {t(`coFolder.roleShort.${r.role}`)}
            {f.access.roles.includes(r.role) ? ` · ${t('coFolder.you')}` : ''}
          </Text>
          <Text style={[s.roleCount, r.ready < r.total && { color: AMBER }]}>
            {t('coFolder.ofShort', { ready: r.ready, total: r.total })}
          </Text>
        </View>
      ))}
      {f.access.full ? (
        <View style={s.timeline}>
          {steps.map((x, i) => (
            <View key={x.label} style={s.step}>
              <View style={[s.dot, x.done && s.dotDone, i === nextIdx && s.dotNow]} />
              <View style={{ flex: 1 }}>
                <Text style={s.stepDate}>{day(x.date)}</Text>
                <Text style={s.stepLabel}>{x.label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const checks = f.checks ? (
    <View style={s.card}>
      <Text style={s.kick}>{t('coFolder.checks.title')}</Text>
      {f.checks.lunchMissing.length ? (
        <CheckLine text={t('coFolder.checks.lunch', { days: f.checks.lunchMissing.map(dayIn).join(', ') })} />
      ) : null}
      {f.checks.outingsWithoutPartner.length ? (
        <CheckLine text={t('coFolder.checks.partner', { days: f.checks.outingsWithoutPartner.map(dayIn).join(', ') })} />
      ) : null}
      {!f.checks.lunchMissing.length && !f.checks.outingsWithoutPartner.length ? (
        <View style={s.checkRow}>
          <Ionicons name="checkmark-circle" size={18} color={BRAND} />
          <Text style={[s.checkText, { color: MUTED }]}>{t('coFolder.checks.allGood')}</Text>
        </View>
      ) : mayOpen('/cart/co-schedule') ? (
        <Pressable onPress={() => router.push('/cart/co-schedule' as never)} accessibilityRole="link">
          <Text style={s.link}>{t('coFolder.checks.toSchedule')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const page2 = f.page2 ? (
    <View style={s.card}>
      <Text style={s.kick}>{t('coFolder.page2.title')}</Text>
      {f.page2.erasedAt ? (
        <Text style={s.body}>{t('coFolder.page2.erased', { date: dayIn(f.page2.erasedAt.slice(0, 10)) })}</Text>
      ) : (
        <>
          <Text style={s.body}>{t('coFolder.page2.body', { date: dayIn(f.page2.eraseOn) })}</Text>
          <Pressable
            onPress={() => setShowQuestions((v) => !v)}
            style={[s.primary, f.page2.answered >= f.page2.total && s.ghost]}
            accessibilityRole="button"
            accessibilityState={{ expanded: showQuestions }}
          >
            <Text style={[s.primaryText, f.page2.answered >= f.page2.total && s.ghostText]}>
              {showQuestions
                ? t('coFolder.page2.hide')
                : f.page2.answered >= f.page2.total
                  ? t('coFolder.page2.done')
                  : t('coFolder.page2.answer', { count: f.page2.total - f.page2.answered })}
            </Text>
          </Pressable>
          {showQuestions ? (
            <Page2 folder={f} busy={answerM.isPending} onAnswer={(qn, a) => answerM.mutate({ q: qn, a })} />
          ) : null}
          {f.page2.answered > 0 ? (
            <Pressable
              onPress={() => void saveFile('4', async () => answersFile(ctx(f)), false)}
              disabled={!!busyKey}
              style={s.ghost}
              accessibilityRole="button"
            >
              <Text style={s.ghostText}>{t('coFolder.page2.save')}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  ) : null;

  const changedAfter = f.handedOver ? f.items.filter((i) => i.changed) : [];
  const send = f.access.full ? (
    f.handedOver ? (
      <View style={{ gap: 14 }}>
        <View style={s.card}>
          <View style={s.checkRow}>
            <Ionicons name="checkmark-circle" size={30} color={BRAND} />
            <View style={{ flex: 1 }}>
              <Text style={s.sumTitle}>{t('coFolder.done.title', { date: dayIn(f.handedOver.at.slice(0, 10)) })}</Text>
              {f.handedOver.by ? <Text style={s.sumSub}>{t('coFolder.done.by', { name: f.handedOver.by })}</Text> : null}
            </View>
          </View>
          <Pressable onPress={() => handM.mutate(false)} accessibilityRole="button">
            <Text style={s.link}>{t('coFolder.send.undo')}</Text>
          </Pressable>
        </View>
        {f.deletions && f.deletions.length ? (
          <View style={[s.card, s.warnCard]}>
            <Text style={[s.kick, { color: AMBER }]}>{t('coFolder.done.deleteTitle')}</Text>
            <Text style={s.body}>{t('coFolder.done.deleteBody')}</Text>
            {f.deletions.map((d) => (
              <View key={d.userId} style={s.roleRow}>
                <Text style={s.roleName}>
                  {d.name ?? ''}
                  {d.me ? ` · ${t('coFolder.you')}` : ''}
                </Text>
                <Text style={[s.roleCount, { color: d.deletedAt ? '#047857' : AMBER }]}>
                  {d.deletedAt ? t('coFolder.done.deleted', { date: dayIn(d.deletedAt) }) : t('coFolder.done.notYet')}
                </Text>
              </View>
            ))}
            {f.deletions.some((d) => d.me && !d.deletedAt) ? (
              <Pressable onPress={() => deletedM.mutate()} style={s.ghost} accessibilityRole="button">
                <Text style={s.ghostText}>{t('coFolder.done.iDeleted')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {changedAfter.length ? (
          <View style={s.card}>
            <Text style={s.kick}>{t('coFolder.done.changedTitle')}</Text>
            <Text style={s.body}>{t('coFolder.done.changedBody')}</Text>
            {changedAfter.map((i) => (
              <FolderLine key={i.key} item={i} sub={sub(i)} actions={actions} canMark wide={false} />
            ))}
          </View>
        ) : null}
        {f.page2 && !f.page2.erasedAt ? (
          <View style={s.card}>
            <Text style={s.kick}>{t('coFolder.done.eraseTitle', { date: day(f.page2.eraseOn) })}</Text>
            <Text style={[s.body, { color: MUTED }]}>{t('coFolder.done.eraseBody')}</Text>
          </View>
        ) : null}
      </View>
    ) : (
      <View style={s.card}>
        <View style={s.checkRow}>
          <Ionicons name="laptop-outline" size={18} color={BRAND} />
          <Text style={s.sumTitle}>{t('coFolder.send.title')}</Text>
        </View>
        <Text style={s.body}>{t('coFolder.send.body')}</Text>
        <Pressable
          onPress={() => void saveFile('00', async () => tocFile(ctx(f)), false)}
          disabled={!!busyKey}
          style={s.ghost}
          accessibilityRole="button"
        >
          <Text style={s.ghostText}>{t('coFolder.send.toc')}</Text>
        </Pressable>
        {!mayHandOver(f) ? <Text style={s.warn}>{t('coFolder.send.needsPage2')}</Text> : null}
        <Pressable
          onPress={async () => {
            const ok = await confirm({
              title: t('coFolder.send.confirmTitle'),
              body: t('coFolder.send.confirmBody'),
              confirmLabel: t('coFolder.send.confirm'),
            });
            if (ok) handM.mutate(true);
          }}
          disabled={!mayHandOver(f) || handM.isPending}
          style={[s.ghost, !mayHandOver(f) && s.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !mayHandOver(f) }}
        >
          <Text style={s.ghostText}>{t('coFolder.send.handOver')}</Text>
        </Pressable>
      </View>
    )
  ) : null;

  const side = (
    <View style={[{ gap: 14 }, wide && { width: 380, flexShrink: 0 }]}>
      {summary}
      {checks}
      {page2}
      {send}
    </View>
  );

  return (
    <KeyboardScroll
      style={s.screen}
      contentContainerStyle={s.content}
      onLayout={(e) => setColumn(e.nativeEvent.layout.width)}
    >
      {header}
      {wide ? (
        <View style={s.wideRow}>
          {listCard}
          {side}
        </View>
      ) : (
        <View style={{ gap: 14, padding: 16 }}>
          {summary}
          {listCard}
          {checks}
          {page2}
          {send}
        </View>
      )}
    </KeyboardScroll>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <View style={s.checkRow}>
      <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
      <Text style={s.checkText}>{text}</Text>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: BRAND, paddingHorizontal: 18, paddingVertical: 18, gap: 12 },
  bandWide: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 28, paddingVertical: 22 },
  bandKick: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: 'rgba(255,255,255,0.82)', letterSpacing: 0.6, textTransform: 'uppercase' },
  bandTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 21, color: '#fff', marginTop: 2 },
  bandTitleWide: { fontSize: 26 },
  bandSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  bandRight: {},
  bandDue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#fff' },
  wideRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 28, paddingVertical: 20, alignItems: 'flex-start' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 16, gap: 10, ...SHADOW },
  warnCard: { borderColor: '#fcd9a8' },
  listTop: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  note: { marginLeft: 'auto', fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  tabs: { flexDirection: 'row', backgroundColor: '#eceff3', borderRadius: 999, padding: 4, gap: 2, alignSelf: 'flex-start' },
  tab: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  tabOn: { backgroundColor: '#fff', ...SHADOW },
  tabText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: MUTED },
  tabTextOn: { color: INK },
  s62: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#f1f8f6', borderRadius: 12, padding: 12 },
  s62Title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: INK },
  s62Text: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#334155', lineHeight: 18 },
  s62Btns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  section: { marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 6 },
  sectionTitle: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  sectionCount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12.5, color: BRAND },
  printHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18, marginTop: 6 },
  kick: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.9, color: MUTED, textTransform: 'uppercase' },
  body: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#334155', lineHeight: 19 },
  sumTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  big: { fontFamily: 'Manrope_800ExtraBold', fontSize: 30, color: BRAND },
  sumTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  sumSub: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  bar: { height: 8, backgroundColor: '#e8eef1', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: BRAND, borderRadius: 999 },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  roleName: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  roleCount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: BRAND },
  timeline: { borderTopWidth: 1, borderTopColor: '#eef0f3', paddingTop: 10, gap: 10 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#cbd5e1', marginTop: 4 },
  dotDone: { backgroundColor: BRAND },
  dotNow: { backgroundColor: '#f59e0b' },
  stepDate: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: INK },
  stepLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  checkText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK, lineHeight: 19 },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND, textDecorationLine: 'underline' },
  primary: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#fff' },
  ghost: {
    borderWidth: 1.5,
    borderColor: '#cfe2e6',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  ghostText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: BRAND },
  disabled: { opacity: 0.45 },
  warn: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: AMBER, lineHeight: 18 },
});
