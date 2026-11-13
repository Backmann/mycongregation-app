import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, territoriesApi } from '../../lib/api';
import { formatDayShort, siteOrigin } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

type Way = 'app' | 'link' | 'paper';

/**
 * «Как он получит карту?» (13 November 2026; mockup «Выдача и приём»): the
 * step after a territory is given out. In the app (it is already there),
 * a link without login sent to a messenger, or paper — printed now on a
 * computer or put in the queue of paper maps. A link never carries the
 * «не посещать» addresses, so when there are any and he walks without the
 * app, the servant is reminded to tell them.
 */
export function HandOver({
  assignmentId,
  number,
  holderName,
  dueOn,
  hasApp,
  noCalls,
  onDone,
  onPrintNow,
}: {
  assignmentId: string;
  number: string;
  holderName: string;
  dueOn: string | null;
  hasApp: boolean;
  noCalls: number;
  onDone: () => void;
  /** On a computer: print his map now instead of queueing it. */
  onPrintNow?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [way, setWay] = useState<Way>(hasApp ? 'app' : 'link');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const link = useMutation({
    mutationFn: () => territoriesApi.shareLink(assignmentId),
    onSuccess: async (r) => {
      const url = `${siteOrigin()}${r.path}`;
      const text = t('territories.handover.message', { number, url });
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
          await (navigator as Navigator & { share: (d: { text: string }) => Promise<void> }).share({ text });
        } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          await Share.share({ message: text });
        }
        setSent(true);
      } catch {
        // Closed without sending: the link exists, he may send it again.
        setSent(false);
      }
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const paper = useMutation({
    mutationFn: () => territoriesApi.paper(assignmentId, true),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onDone();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const finish = () => {
    setError(null);
    if (way === 'link' && !sent) link.mutate();
    else if (way === 'paper') paper.mutate();
    else onDone();
  };
  const busy = link.isPending || paper.isPending;

  const option = (w: Way, icon: keyof typeof Ionicons.glyphMap, title: string, hint: string) => {
    const on = way === w;
    return (
      <Pressable
        key={w}
        onPress={() => setWay(w)}
        style={[s.way, on && s.wayOn]}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
      >
        <View style={[s.radio, on && s.radioOn]} />
        <View style={s.icon}>
          <Ionicons name={icon} size={18} color={BRAND} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.hint}>{hint}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 2 }}>
      <View style={s.done}>
        <View style={s.tick}>
          <Ionicons name="checkmark" size={22} color="#15803d" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.doneTitle}>
            {t('territories.handover.given', { number, name: holderName })}
          </Text>
          <Text style={s.hint}>
            {dueOn
              ? t('territories.handover.until', { date: formatDayShort(dueOn, i18n.language) })
              : ''}
            {' · '}
            {t('territories.handover.how')}
          </Text>
        </View>
      </View>
      {hasApp
        ? option('app', 'phone-portrait-outline', t('territories.handover.app'), t('territories.handover.appHint'))
        : null}
      {option('link', 'link-outline', t('territories.handover.link'), t('territories.handover.linkHint'))}
      {option(
        'paper',
        'print-outline',
        t('territories.handover.paper'),
        t(onPrintNow ? 'territories.handover.paperWebHint' : 'territories.handover.paperHint'),
      )}
      {noCalls > 0 && way !== 'app' ? (
        <View style={s.nc}>
          <Ionicons name="hand-left-outline" size={15} color="#c2410c" />
          <Text style={s.ncText}>
            {t(way === 'paper' ? 'territories.handover.noCallsPaper' : 'territories.handover.noCallsLink', {
              count: noCalls,
              number,
            })}
          </Text>
        </View>
      ) : null}
      {sent ? <Text style={s.ok}>{t('territories.handover.sent')}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={s.actions}>
        {way === 'paper' && onPrintNow ? (
          <Pressable onPress={onPrintNow} style={s.second} accessibilityRole="button">
            <Text style={s.secondText}>{t('territories.handover.printNow')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={finish}
          disabled={busy}
          style={({ pressed }) => [s.cta, (busy || pressed) && { opacity: 0.75 }]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.ctaText}>
              {way === 'link' && !sent
                ? t('territories.handover.sendLink')
                : way === 'paper'
                  ? t('territories.handover.queue')
                  : t('territories.handover.done')}
            </Text>
          )}
        </Pressable>
        {way === 'link' && sent ? (
          <Pressable onPress={onDone} style={s.second} accessibilityRole="button">
            <Text style={s.secondText}>{t('territories.handover.done')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  done: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  tick: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ecfdf3', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15.5, color: INK },
  way: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: LINE,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  wayOn: { borderColor: BRAND },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: LINE, marginTop: 2 },
  radioOn: { borderWidth: 6, borderColor: BRAND },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 17 },
  nc: { flexDirection: 'row', gap: 8, backgroundColor: '#fff4ed', borderRadius: 12, padding: 10, marginTop: 10 },
  ncText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#c2410c', lineHeight: 17 },
  ok: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#15803d', marginTop: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 8 },
  actions: { gap: 8, marginTop: 14 },
  cta: { backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  second: { paddingVertical: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: LINE },
  secondText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
});
