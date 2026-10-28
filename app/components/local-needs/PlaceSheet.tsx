import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { FormChips } from '../FormChips';
import { localNeedsApi, type LocalNeedsTopic, type LocalNeedsWeek } from '../../lib/api';
import { reportSuccess } from '../../lib/error-bus';
import { BRAND } from '../../lib/header';
import { byFit, fitOf, fullName, mondayOfISO, shortDayLabel } from '../../lib/local-needs';

/**
 * «Поставить на неделю» — the three ways the body of elders puts a topic into
 * the programme (Lionel, 28 October 2026): instead of the «Местные
 * потребности» part, instead of another «В жизни христианина» part, or as one
 * more part. A week whose programme is not there yet takes the topic as a
 * plan only; the screen offers «Поставить» once the workbook is imported.
 *
 * Opened from a topic (the topic is fixed, the week is chosen) or from an
 * empty week (the week and its part are fixed, the topic is chosen).
 */
export function PlaceSheet({
  visible,
  onClose,
  topic,
  bank,
  topics,
  weeks,
  initialWeek,
  initialPartId,
}: {
  visible: boolean;
  onClose: () => void;
  /** The topic to place; null — choose it here from `bank`. */
  topic: LocalNeedsTopic | null;
  bank: LocalNeedsTopic[];
  topics: LocalNeedsTopic[];
  weeks: LocalNeedsWeek[];
  initialWeek?: string | null;
  initialPartId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const centered = Platform.OS === 'web' && width >= 700;

  const [topicId, setTopicId] = useState<string | null>(null);
  const [week, setWeek] = useState<string | 'other' | null>(null);
  const [choice, setChoice] = useState<string | 'extra' | null>(null);
  const [minutes, setMinutes] = useState<number>(10);
  const [otherDate, setOtherDate] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTopicId(topic?.id ?? null);
    setWeek(initialWeek ?? null);
    setChoice(initialPartId ?? null);
    setMinutes(10);
    setOtherDate('');
  }, [visible, topic, initialWeek, initialPartId]);

  const chosenTopic = topic ?? bank.find((b) => b.id === topicId) ?? null;
  const titleOf = (id: string | null) => topics.find((x) => x.id === id)?.title ?? null;
  const theWeek = weeks.find((w) => w.weekStartDate === week) ?? null;
  const minLabel = (n: number) => t('localNeeds.place.min', { n });

  // The part the topic is going to — its minutes are what a topic must fit.
  const targetPart =
    theWeek && choice && choice !== 'extra'
      ? (theWeek.parts.find((p) => p.id === choice) ?? null)
      : null;
  const partMin = targetPart?.partDurationMin ?? null;

  // A new part is as long as the topic is meant to be, unless changed.
  useEffect(() => {
    if (chosenTopic?.durationMin) setMinutes(chosenTopic.durationMin);
  }, [visible, chosenTopic?.id, chosenTopic?.durationMin]);

  /** What the bank row says on its right: does it fit the part? */
  const fitNote = (x: LocalNeedsTopic): { text?: string; tone?: 'free' | 'quiet' | 'warn' } => {
    if (!x.durationMin) return {};
    const f = fitOf(x.durationMin, partMin);
    if (f === 'fits') return { text: t('localNeeds.fit.fits', { n: x.durationMin }), tone: 'free' };
    if (f === 'longer') return { text: t('localNeeds.fit.meantFor', { n: x.durationMin }), tone: 'warn' };
    return { text: t('localNeeds.fit.meantFor', { n: x.durationMin }), tone: 'quiet' };
  };

  // The week's local-needs part is the usual place: chosen for the person.
  useEffect(() => {
    if (!theWeek || choice) return;
    const ln = theWeek.parts.find((p) => p.localNeeds && !p.topicId);
    setChoice(ln ? ln.id : 'extra');
  }, [theWeek, choice]);

  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: ['local-needs'] });
    void qc.invalidateQueries({ queryKey: ['assignments'] });
    reportSuccess(msg);
    onClose();
  };

  const placeMut = useMutation({
    mutationFn: () =>
      localNeedsApi.place(chosenTopic!.id, {
        weekStartDate: week as string,
        ...(choice && choice !== 'extra' ? { assignmentId: choice } : { durationMin: minutes }),
      }),
    onSuccess: () =>
      done(
        t('localNeeds.place.done', {
          day: shortDayLabel(theWeek?.meetingDate ?? (week as string), lang),
        }),
      ),
  });
  const planMut = useMutation({
    mutationFn: () => localNeedsApi.update(chosenTopic!.id, { plannedWeek: mondayOfISO(otherDate) }),
    onSuccess: () => done(t('localNeeds.place.planned', { day: shortDayLabel(mondayOfISO(otherDate), lang) })),
  });

  const ready =
    !!chosenTopic &&
    ((week === 'other' && !!otherDate) || (!!theWeek && !!choice));
  const busy = placeMut.isPending || planMut.isPending;

  const weekStatus = (w: LocalNeedsWeek): { text: string; free: boolean } => {
    const ln = w.parts.find((p) => p.localNeeds);
    if (!ln) return { text: t('localNeeds.place.noLnPart'), free: false };
    if (ln.topicId) return { text: t('localNeeds.place.taken', { title: titleOf(ln.topicId) ?? ln.partTitle }), free: false };
    const free = t('localNeeds.place.free');
    return { text: ln.partDurationMin ? `${free} · ${minLabel(ln.partDurationMin)}` : free, free: true };
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      variant={centered ? 'centered' : 'bottom'}
      title={chosenTopic && topic ? t('localNeeds.place.titleFor', { title: chosenTopic.title }) : t('localNeeds.place.title')}
      closeLabel={t('common.cancel')}
      footer={
        <Pressable
          style={[styles.primary, (!ready || busy) && styles.disabled]}
          disabled={!ready || busy}
          onPress={() => (week === 'other' ? planMut.mutate() : placeMut.mutate())}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {week === 'other' ? t('localNeeds.place.planCta') : t('localNeeds.place.cta')}
          </Text>
        </Pressable>
      }
    >
      {!topic ? (
        <>
          <Text style={styles.head}>
            {partMin ? t('localNeeds.place.topicHeadFor', { n: partMin }) : t('localNeeds.place.topicHead')}
          </Text>
          {bank.length === 0 ? (
            <Text style={styles.quiet}>{t('localNeeds.place.noBank')}</Text>
          ) : (
            <View style={styles.list}>
              {byFit(bank, partMin).map((b) => {
                const note = fitNote(b);
                return (
                  <Option
                    key={b.id}
                    on={topicId === b.id}
                    title={b.title}
                    sub={fullName(b.speaker) ?? undefined}
                    right={note.text}
                    rightTone={note.tone}
                    onPress={() => setTopicId(b.id)}
                  />
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {!initialWeek ? (
        <>
          <Text style={styles.head}>{t('localNeeds.place.weekHead')}</Text>
          <View style={styles.list}>
            {weeks.map((w) => {
              const st = weekStatus(w);
              return (
                <Option
                  key={w.weekStartDate}
                  on={week === w.weekStartDate}
                  title={shortDayLabel(w.meetingDate ?? w.weekStartDate, lang)}
                  right={st.text}
                  rightTone={st.free ? 'free' : 'quiet'}
                  onPress={() => {
                    setWeek(w.weekStartDate);
                    setChoice(null);
                  }}
                />
              );
            })}
            <Option
              on={week === 'other'}
              title={t('localNeeds.place.otherWeek')}
              right={t('localNeeds.place.otherWeekSub')}
              rightTone="quiet"
              onPress={() => {
                setWeek('other');
                setChoice(null);
              }}
            />
          </View>
          {week === 'other' ? (
            <View style={{ marginTop: 6 }}>
              <DateField
                label={t('localNeeds.place.otherDate')}
                value={otherDate}
                onChange={setOtherDate}
                placeholder={t('localNeeds.place.otherDatePh')}
              />
              <Text style={styles.quiet}>{t('localNeeds.place.otherHint')}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {theWeek && !initialPartId ? (
        <>
          <Text style={styles.head}>
            {t('localNeeds.place.howHead', { day: shortDayLabel(theWeek.meetingDate ?? theWeek.weekStartDate, lang) })}
          </Text>
          <View style={styles.list}>
            {[...theWeek.parts]
              .sort((a, b) => Number(b.localNeeds) - Number(a.localNeeds))
              .map((p) => {
                const other = p.topicId && p.topicId !== chosenTopic?.id ? titleOf(p.topicId) : null;
                const longer = fitOf(chosenTopic?.durationMin, p.partDurationMin) === 'longer';
                const who = fullName(p.speaker) ?? (p.localNeeds ? t('localNeeds.place.usual') : null);
                const plain = [p.partDurationMin ? minLabel(p.partDurationMin) : null, who]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Option
                    key={p.id}
                    on={choice === p.id}
                    title={
                      p.localNeeds
                        ? t('localNeeds.place.instead', { title: t('localNeeds.title.list') })
                        : t('localNeeds.place.instead', { title: p.partTitle ?? '' })
                    }
                    sub={
                      other
                        ? t('localNeeds.place.replaces', { title: other })
                        : longer
                          ? t('localNeeds.fit.longerThanPart', {
                              n: chosenTopic?.durationMin,
                              part: p.partDurationMin,
                            })
                          : plain || undefined
                    }
                    warn={!!other || longer}
                    onPress={() => setChoice(p.id)}
                  />
                );
              })}
            <Option
              on={choice === 'extra'}
              title={t('localNeeds.place.extra')}
              sub={t('localNeeds.place.extraSub')}
              onPress={() => setChoice('extra')}
            />
          </View>
          {choice === 'extra' ? (
            <View style={{ marginTop: 10 }}>
              <FormChips
                label={t('localNeeds.place.minutes')}
                value={minutes}
                options={[...new Set([5, 10, 15, minutes])]
                  .sort((a, b) => a - b)
                  .map((m) => ({ value: m, label: minLabel(m) }))}
                onChange={setMinutes}
              />
            </View>
          ) : null}
        </>
      ) : null}
      <Text style={[styles.quiet, { marginTop: 12 }]}>{t('localNeeds.place.speakerNote')}</Text>
    </Sheet>
  );
}

function Option({
  on,
  title,
  sub,
  right,
  rightTone,
  warn,
  onPress,
}: {
  on: boolean;
  title: string;
  sub?: string;
  right?: string;
  rightTone?: 'free' | 'quiet' | 'warn';
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? BRAND : '#94a3b8'} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        {sub ? <Text style={[styles.optionSub, warn && styles.warn]}>{sub}</Text> : null}
      </View>
      {right ? (
        <Text
          style={[styles.right, rightTone === 'free' && styles.free, rightTone === 'warn' && styles.warn]}
          numberOfLines={2}
        >
          {right}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  list: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  optionOn: { backgroundColor: '#ecfeff' },
  optionTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 14.5, color: '#0f172a' },
  optionSub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 1 },
  warn: { color: '#b45309' },
  right: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#64748b', maxWidth: '50%', textAlign: 'right' },
  free: { color: '#047857' },
  quiet: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#94a3b8', lineHeight: 17 },
  primary: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
  disabled: { opacity: 0.45 },
});
