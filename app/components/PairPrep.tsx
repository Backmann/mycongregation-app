import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Sheet } from './Sheet';
import {
  extractErrorMessage,
  pairPrepApi,
  PairPrepItem,
  PairPrepOption,
} from '../lib/api';
import { notify } from '../lib/error-bus';
import {
  dayShort,
  momentName,
  momentTitle,
  momentWhen,
  PAIR_PREP_KEY,
  pairOf,
  usePairPrep,
} from '../lib/pair-prep';
import { FONT } from '../lib/typography';

/**
 * «Договориться о подготовке» on a part's card (10 November 2026): the two
 * people of a part agree when to prepare it — a moment the congregation
 * already has, or «we'll arrange it ourselves». No telephone number and no
 * typed word; one open proposal a pair; the other one answers it.
 *
 * Drawn under the «в паре: …» line, in My assignments and on Home. Draws
 * nothing for a part without a partner, or before the list has loaded.
 */
export function PairPrep({
  agendaId,
  partName,
  compact,
}: {
  agendaId?: string;
  /** For the sheet's heading: «Начинайте разговор». */
  partName: string;
  /** Home: the quieter, outlined button. */
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { data } = usePairPrep();
  const item = pairOf(data, agendaId);
  const [choosing, setChoosing] = useState(false);
  // Through useMutation like every other save: the app's one place then
  // gives the tap its feel and a refusal its words (app/_layout.tsx).
  const act = useMutation({
    mutationFn: ({ f }: { f: () => Promise<PairPrepItem>; done?: string }) => f(),
    onSuccess: (next, { done }) => {
      qc.setQueryData<PairPrepItem[]>(PAIR_PREP_KEY, (old) =>
        (old ?? []).map((i) => (i.assignmentId === next.assignmentId ? next : i)),
      );
      if (done) notify(done, undefined, 'success');
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: PAIR_PREP_KEY });
    },
  });
  const busy = act.isPending;
  if (!item) return null;

  const a = item.agreement;
  const run = (f: () => Promise<PairPrepItem>, done?: string) => act.mutate({ f, done });

  if (!item.partnerHasApp) {
    return (
      <Line icon="information-circle-outline" tone="quiet">
        <Text style={s.lineMain}>{t('pairPrep.noApp', { name: item.partnerName })}</Text>
      </Line>
    );
  }

  const canStart = item.open && !item.startedToday;
  const chooser = (
    <ChooseSheet
      visible={choosing}
      item={item}
      partName={partName}
      onClose={() => setChoosing(false)}
      onChosen={(key) => {
        setChoosing(false);
        run(() => pairPrepApi.propose(item.assignmentId, key), t('pairPrep.sent'));
      }}
    />
  );
  const tomorrowHint = item.open && item.startedToday ? (
    <Text style={s.hint}>{t('pairPrep.nextTomorrow')}</Text>
  ) : null;

  // Nothing yet (or a proposal taken back).
  if (!a) {
    if (!item.open) return null;
    return (
      <View style={s.wrap}>
        <Pressable
          onPress={() => setChoosing(true)}
          disabled={!canStart || busy}
          style={({ pressed }) => [
            compact ? s.btnOutline : s.btnSolid,
            (!canStart || busy) && s.disabled,
            pressed && s.pressed,
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="people-outline" size={17} color={compact ? '#12687d' : '#ffffff'} />
          <Text style={compact ? s.btnOutlineText : s.btnSolidText}>
            {t('pairPrep.button')}
          </Text>
        </Pressable>
        {tomorrowHint}
        {chooser}
      </View>
    );
  }

  const when = momentWhen(a, t, lang);
  const isSelf = a.kind === 'self';

  if (a.status === 'proposed' && a.proposedByMe) {
    const quiet = dayjs().diff(dayjs(a.proposedAt), 'day') >= 2;
    return (
      <View style={s.wrap}>
        <Line icon="time-outline" tone="info">
          <Text style={s.lineMain}>
            {isSelf ? t('pairPrep.mine.self') : t('pairPrep.mine.moment', { moment: momentName(a, t) })}
          </Text>
          <Text style={s.lineSub}>
            {isSelf ? t('pairPrep.waiting') : `${when} · ${t('pairPrep.waiting')}`}
          </Text>
          {quiet ? <Text style={s.lineSub}>{t('pairPrep.remindInPerson')}</Text> : null}
        </Line>
        {item.open ? (
          <View style={s.links}>
            <Link text={t('pairPrep.change')} onPress={() => setChoosing(true)} disabled={busy} />
            <Link
              text={t('pairPrep.takeBack')}
              muted
              disabled={busy}
              onPress={() => run(() => pairPrepApi.cancel(item.assignmentId))}
            />
          </View>
        ) : null}
        {chooser}
      </View>
    );
  }

  if (a.status === 'proposed') {
    return (
      <View style={s.wrap}>
        <Line icon="chatbubble-ellipses-outline" tone="info">
          <Text style={s.lineMain}>
            {isSelf
              ? t('pairPrep.theirs.self', { name: item.partnerName })
              : t('pairPrep.theirs.moment', { name: item.partnerName, moment: momentName(a, t) })}
          </Text>
          {!isSelf ? <Text style={s.lineSub}>{when}</Text> : null}
        </Line>
        {item.open ? (
          <View style={s.answers}>
            <Pressable
              onPress={() => run(() => pairPrepApi.answer(item.assignmentId, 'agree'))}
              disabled={busy}
              style={({ pressed }) => [s.btnSolid, busy && s.disabled, pressed && s.pressed]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#ffffff" /> : null}
              <Text style={s.btnSolidText}>{t('pairPrep.agree')}</Text>
            </Pressable>
            <View style={s.answerRow}>
              <Pressable
                onPress={() => setChoosing(true)}
                disabled={busy}
                style={({ pressed }) => [s.btnOutline, s.half, pressed && s.pressed]}
                accessibilityRole="button"
              >
                <Text style={s.btnOutlineText}>{t('pairPrep.otherTime')}</Text>
              </Pressable>
              <Pressable
                onPress={() => run(() => pairPrepApi.answer(item.assignmentId, 'decline'))}
                disabled={busy}
                style={({ pressed }) => [s.btnGrey, s.half, pressed && s.pressed]}
                accessibilityRole="button"
              >
                <Text style={s.btnGreyText}>{t('pairPrep.decline')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {chooser}
      </View>
    );
  }

  if (a.status === 'agreed') {
    return (
      <View style={s.wrap}>
        <Line icon="checkmark" tone="good">
          <Text style={s.goodMain}>
            {isSelf ? t('pairPrep.agreed.self') : t('pairPrep.agreed.moment', { moment: momentName(a, t) })}
          </Text>
          {!isSelf ? <Text style={s.goodSub}>{when}</Text> : null}
        </Line>
        {canStart ? (
          <View style={s.links}>
            <Link text={t('pairPrep.changeAgreed')} onPress={() => setChoosing(true)} disabled={busy} />
          </View>
        ) : null}
        {tomorrowHint}
        {chooser}
      </View>
    );
  }

  // Declined.
  return (
    <View style={s.wrap}>
      <Line icon="person-outline" tone="quiet">
        <Text style={s.lineMain}>
          {a.proposedByMe
            ? t('pairPrep.declined.theirs', { name: item.partnerName })
            : t('pairPrep.declined.mine')}
        </Text>
        <Text style={s.lineSub}>{t('pairPrep.declined.inPerson')}</Text>
      </Line>
      {canStart ? (
        <View style={s.links}>
          <Link text={t('pairPrep.proposeOther')} onPress={() => setChoosing(true)} disabled={busy} />
        </View>
      ) : null}
      {tomorrowHint}
      {chooser}
    </View>
  );
}

function Line({
  icon,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'info' | 'good' | 'quiet';
  children: ReactNode;
}) {
  const color = tone === 'good' ? '#15803d' : tone === 'info' ? '#12687d' : '#64748b';
  return (
    <View style={[s.line, tone === 'good' ? s.lineGood : tone === 'info' ? s.lineInfo : s.lineQuiet]}>
      <Ionicons name={icon} size={17} color={color} style={s.lineIcon} />
      <View style={s.lineBody}>{children}</View>
    </View>
  );
}

function Link({
  text,
  onPress,
  muted,
  disabled,
}: {
  text: string;
  onPress: () => void;
  muted?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.link, disabled && s.disabled, pressed && s.pressed]}
      accessibilityRole="button"
    >
      <Text style={[s.linkText, muted && s.linkMuted]}>{text}</Text>
    </Pressable>
  );
}

function ChooseSheet({
  visible,
  item,
  partName,
  onClose,
  onChosen,
}: {
  visible: boolean;
  item: PairPrepItem;
  partName: string;
  onClose: () => void;
  onChosen: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['pair-prep', 'options', item.assignmentId],
    queryFn: () => pairPrepApi.options(item.assignmentId),
    enabled: visible,
    throwOnError: false,
    staleTime: 0,
  });
  const options: PairPrepOption[] = q.data?.options ?? [];
  const chosen = picked && options.some((o) => o.key === picked) ? picked : options[0]?.key ?? null;
  const centered = Platform.OS === 'web' && width >= 700;
  const hidden = (q.data?.hidden ?? []).slice(0, 2);

  return (
    <Sheet
      visible={visible}
      variant={centered ? 'centered' : 'bottom'}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('pairPrep.button')}
      subtitle={`${partName} · ${dayShort(item.meetingDate, lang)}\n${t('home.next.pair', { name: item.partnerName })}`}
      footer={
        <View style={s.footer}>
          <Pressable
            onPress={() => chosen && onChosen(chosen)}
            disabled={!chosen}
            style={({ pressed }) => [s.btnSolid, !chosen && s.disabled, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.btnSolidText}>{t('pairPrep.send')}</Text>
          </Pressable>
          <Text style={s.hint}>{t('pairPrep.sendNote')}</Text>
        </View>
      }
    >
      <View style={s.sheetBody}>
        <Text style={s.caption}>{t('pairPrep.whenCaption')}</Text>
        {q.isPending ? <ActivityIndicator color="#12687d" /> : null}
        {q.isError ? <Text style={s.hint}>{extractErrorMessage(q.error)}</Text> : null}
        {options.map((o) => {
          const on = o.key === chosen;
          return (
            <Pressable
              key={o.key}
              onPress={() => setPicked(o.key)}
              style={({ pressed }) => [s.option, on && s.optionOn, pressed && s.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <Text style={s.optionTitle}>{momentTitle(o, t)}</Text>
              <Text style={s.optionSub}>{momentWhen(o, t, lang)}</Text>
            </Pressable>
          );
        })}
        {hidden.map((h) => (
          <Text key={`${h.date}-${h.kind}-${h.reason}`} style={s.hint}>
            {t('pairPrep.notOffered', {
              day: dayShort(h.date, lang),
              reason: t(`pairPrep.hiddenReason.${h.reason}`),
            })}
          </Text>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  lineInfo: { backgroundColor: '#f1f7f9', borderWidth: 1, borderColor: '#cfe3e9' },
  lineGood: { backgroundColor: '#e8f6ef' },
  lineQuiet: { backgroundColor: '#f4f6f8' },
  lineIcon: { marginTop: 1 },
  lineBody: { flex: 1, gap: 2 },
  lineMain: { fontSize: 14, fontFamily: FONT.bold, color: '#0f4c5c' },
  lineSub: { fontSize: 13, fontFamily: FONT.medium, color: '#335f6c' },
  goodMain: { fontSize: 14, fontFamily: FONT.bold, color: '#14532d' },
  goodSub: { fontSize: 13, fontFamily: FONT.medium, color: '#166534' },
  hint: { fontSize: 12.5, lineHeight: 18, fontFamily: FONT.medium, color: '#64748b' },
  btnSolid: { minHeight: 44, borderRadius: 12, backgroundColor: '#12687d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  btnSolidText: { fontSize: 15, fontFamily: FONT.bold, color: '#ffffff' },
  btnOutline: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#b9cbd4', backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  btnOutlineText: { fontSize: 14.5, fontFamily: FONT.bold, color: '#12687d' },
  btnGrey: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#d5dee6', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnGreyText: { fontSize: 14.5, fontFamily: FONT.bold, color: '#475569' },
  answers: { gap: 8 },
  answerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 140 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 14, fontFamily: FONT.bold, color: '#12687d' },
  linkMuted: { color: '#64748b' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  footer: { gap: 8 },
  sheetBody: { gap: 8, paddingBottom: 4 },
  caption: { fontSize: 12.5, fontFamily: FONT.extrabold, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase' },
  option: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: '#d5dee6', backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  optionOn: { borderWidth: 2, borderColor: '#12687d', backgroundColor: '#e3f1f4' },
  optionTitle: { fontSize: 15, fontFamily: FONT.bold, color: '#0f172a' },
  optionSub: { fontSize: 13, fontFamily: FONT.medium, color: '#64748b' },
});
