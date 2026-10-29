/**
 * THE CHAIRMAN'S SCREEN AT THE LECTERN (18 October 2026) — the canvas
 * «Экран председателя — макет», approved by Lionel the same day.
 *
 * Shown on the device that WATCHES a meeting somebody else taps through (the
 * timekeeper), and on «Проверить экран». Only the chairman sees it: a laptop,
 * later perhaps a tablet, lying by the lectern.
 *
 * Why it looks as it does:
 *  - DARK, unlike the rest of the app: under the hall's light a white screen
 *    glares and lights the chairman's face; a dark one does neither;
 *  - ONE BIG NUMBER, and under it always the same thing in words («осталось»,
 *    «последняя минута», «сверх времени»), so colour is never the only sign;
 *  - grey means «do not trust this number» (no fresh data from the server);
 *  - during the counsel no numbers at all (Lionel, 18 October);
 *  - a single soft pulse of the background when the colour changes — seen
 *    from the corner of the eye, no blinking;
 *  - names on two lines at most: the full title is in the programme.
 *
 * Draws what the screen hands it; decides nothing about the meeting itself.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COUNTDOWN_FROM_SEC, stageTone, warnSecFor, type StageTone } from '../lib/conduct-stage';

/**
 * What the screen on the stage adds around this screen (app/stage.tsx,
 * 21 October 2026): its own menu button, in the header beside the clock, and
 * the device's top inset. On a phone the menu sat in the corner under the
 * status bar — Lionel opened the stage account on his phone on 21 October
 * and could not find the way out of it.
 */
export const StageChrome = createContext<{
  menu: ReactNode;
  topInset: number;
  /**
   * Told while this screen is up, so app/stage.tsx knows its menu is shown
   * here. Every other state of the meeting's screen (loading, no programme,
   * no chairman, the timekeeper's hanging run) has no header of this kind:
   * there the stage lays its own button on top — never a screen without a
   * way out (Lionel, 29 October 2026).
   */
  shown?: (on: boolean) => void;
} | null>(null);

export interface StagePart {
  /** The programme section, as the programme names it («Сокровища из Слова Бога»). */
  section: string | null;
  /** The section's hue, already lightened for the dark ground. */
  sectionColor: string;
  title: string;
  person: string | null;
  minutes: number;
  /** A song: counted up, never amber or red (22 October 2026). */
  soft?: boolean;
  /** A song's name from the catalog. */
  song?: string | null;
}

export interface StageControls {
  primary: { label: string; sub: string | null; onPress: () => void; locked: boolean };
  pause: { label: string; onPress: () => void } | null;
  undo: { label: string; onPress: () => void } | null;
}

export interface StageProps {
  /** «Встреча в будни · среда, 21 октября». */
  heading: string;
  /** The wall clock, «19:12». */
  clock: string;
  /** Who taps: «Время ведёт Лионель». */
  who: { text: string; tone: 'live' | 'muted' | 'mine' } | null;
  /** A warning across the top: no connection to the server. */
  banner: string | null;
  /** «entrance»: the next brother has been called up, his clock not begun. */
  phase: 'before' | 'part' | 'counsel' | 'entrance';
  /** Before the first tap. */
  startAt: string | null;
  untilStart: number | null;
  current: StagePart | null;
  /** The part whose counsel is being given. */
  counselFor: { title: string; person: string | null } | null;
  leftSec: number;
  /** The number cannot be trusted — grey, and words instead of a colour. */
  unsure: boolean;
  /**
   * The part is held — «Пауза с 13:56» (18 October 2026: the countdown stood
   * still in red for twenty minutes and nothing on the screen said why).
   */
  paused: string | null;
  next: StagePart | null;
  then: StagePart | null;
  endsAt: string | null;
  plannedEnd: string | null;
  drift: { text: string; tone: 'ok' | 'behind' | 'ahead' } | null;
  /** «Взять ведение» — on a watching device only. */
  onTake: (() => void) | null;
  /** After «Взять ведение»: this device taps. */
  controls: StageControls | null;
  /** «Проверить экран». */
  check: {
    online: boolean | null;
    awake: boolean | null;
    done: boolean;
    onEnd: () => void;
    onAgain: () => void;
  } | null;
}

/** The programme's section hues, lightened to read on the dark ground. */
export const STAGE_SECTION_COLORS: Record<string, string> = {
  opening: '#94a3b8',
  closing: '#94a3b8',
  treasures: '#7ac6d6',
  apply_yourself: '#e0a33a',
  christian_life: '#e57373',
  public_talk: '#a78bfa',
  watchtower: '#b9a3f5',
  concluding_talk: '#5ec4a8',
};

const C = {
  ground: '#0b1220',
  panel: '#121b2e',
  line: '#22304a',
  lineStrong: '#2c3b57',
  text: '#f8fafc',
  textSoft: '#e2e8f0',
  textMid: '#cbd5e1',
  muted: '#94a3b8',
  faint: '#8592a8',
  calm: '#f8fafc',
  bar: '#67e8f9',
  amber: '#fbbf24',
  amberSoft: '#fcd34d',
  amberBg: '#3a2a07',
  red: '#f87171',
  redSoft: '#fca5a5',
  redBg: '#3b1218',
  stale: '#475569',
  live: '#34d399',
  mine: '#67e8f9',
  entrance: '#67e8f9',
};

/** Late by this much and not begun: no more count of the delay. */
const NOT_RUN_AFTER_SEC = 30 * 60;

export function mmssSigned(seconds: number): string {
  const s = Math.round(seconds);
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  return `${s < 0 ? '+' : ''}${m}:${String(r).padStart(2, '0')}`;
}

export function ConductStage(p: StageProps) {
  const { t } = useTranslation();
  const chrome = useContext(StageChrome);
  const shown = chrome?.shown;
  useEffect(() => {
    shown?.(true);
    return () => shown?.(false);
  }, [shown]);
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  // The number must fit its column on one line — «+21:06» is six signs.
  // On an iPad in landscape (1180 wide) the height alone made it 246 and
  // «29:44» broke over two lines (18 October 2026). «+21:06», the widest it
  // gets, is about 3.3 of the font's size.
  const column = wide ? ((width - 80 - 40) * 1.75) / 2.75 : width - 48;
  const digits = Math.round(
    Math.min(
      column / 3.4,
      wide ? Math.min(248, Math.max(150, height * 0.3)) : Math.min(236, Math.max(110, width * 0.27)),
    ),
  );

  const tone: StageTone | 'stale' =
    p.unsure
      ? 'stale'
      : p.phase === 'part' && p.current && !p.current.soft
        ? stageTone(p.leftSec, p.current.minutes)
        : 'calm';

  // One soft pulse when the colour turns amber or red.
  const flash = useRef(new Animated.Value(0)).current;
  const lastTone = useRef(tone);
  useEffect(() => {
    if (tone !== lastTone.current && (tone === 'soon' || tone === 'over')) {
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]).start();
    }
    lastTone.current = tone;
  }, [tone, flash]);

  const numberColor =
    p.paused && tone !== 'stale' ? C.muted : tone === 'stale' ? C.stale : tone === 'over' ? C.red : tone === 'soon' ? C.amber : C.calm;
  const barColor = p.paused || tone === 'stale' ? '#334155' : tone === 'over' ? C.red : tone === 'soon' ? C.amber : C.bar;

  const heading = (
    <View style={[s.header, !wide && { gap: 12 }]}>
      <View style={s.headLeft}>
        <View style={s.mark}>
          <Text style={s.markText}>C</Text>
        </View>
        <Text style={[s.heading, !wide && s.headingNarrow]} numberOfLines={wide ? 1 : undefined}>
          {/* On a phone the meeting and its day go on two lines of their own,
              not three broken ones beside the clock (21 October 2026). */}
          {wide ? p.heading : p.heading.replace(' · ', '\n')}
        </Text>
      </View>
      {wide ? <Text style={s.clock}>{p.clock}</Text> : null}
      {p.who && wide ? <WhoPill who={p.who} /> : null}
      {!wide ? <Text style={[s.clock, s.clockNarrow]}>{p.clock}</Text> : null}
      {chrome?.menu ?? null}
    </View>
  );

  const checkBar = p.check ? (
    <View style={s.checkBar}>
      <View style={{ flex: 1 }}>
        <Text style={s.checkTitle}>{t('conduct.stage.check.title')}</Text>
        <Text style={s.checkSub}>{t('conduct.stage.check.sub')}</Text>
      </View>
      <Pressable style={s.checkEnd} onPress={p.check.onEnd} accessibilityRole="button">
        <Text style={s.checkEndText}>{t('conduct.stage.check.end')}</Text>
      </Pressable>
    </View>
  ) : null;

  const banner = p.banner ? (
    <View style={s.banner}>
      <Ionicons name="cloud-offline-outline" size={22} color={C.amberSoft} />
      <Text style={s.bannerText}>{p.banner}</Text>
    </View>
  ) : null;

  // ── the left column: what is on now ─────────────────────────────────────
  let main: ReactNode;
  if (p.check?.done) {
    main = (
      <View style={s.counselBox}>
        <Text style={s.counselWord}>{t('conduct.stage.check.done')}</Text>
        <Pressable style={[s.ghost, { alignSelf: 'flex-start', marginTop: 24 }]} onPress={p.check.onAgain} accessibilityRole="button">
          <Ionicons name="refresh" size={18} color={C.muted} />
          <Text style={s.ghostText}>{t('conduct.stage.check.again')}</Text>
        </Pressable>
      </View>
    );
  } else if (p.phase === 'before' && p.untilStart !== null && p.untilStart < -NOT_RUN_AFTER_SEC) {
    // Half an hour late and still not begun: most likely not run in the app
    // tonight. No count growing all evening (22 October 2026).
    main = (
      <View style={s.mainCol}>
        <Text style={s.overline}>{t('conduct.stage.notStarted')}</Text>
        <Text style={s.title}>{t('conduct.stage.notRunTitle')}</Text>
        <Text style={s.person}>{t('conduct.stage.notRunHint')}</Text>
      </View>
    );
  } else if (p.phase === 'before') {
    const late = p.untilStart !== null && p.untilStart <= 0;
    main = (
      <View style={s.mainCol}>
        <Text style={[s.overline, late && { color: C.amberSoft }]}>{t('conduct.stage.notStarted')}</Text>
        <Text style={s.title}>
          {p.startAt
            ? late
              ? t('conduct.stage.byProgrammeAt', { time: p.startAt })
              : t('conduct.stage.startsAt', { time: p.startAt })
            : t('conduct.live.waitingNobody')}
        </Text>
        <Text style={s.person}>
          {late ? t('conduct.stage.lateHint') : t('conduct.stage.startHint')}
        </Text>
        <View style={{ flex: 1, minHeight: 16 }} />
        {p.untilStart !== null && p.untilStart > COUNTDOWN_FROM_SEC && p.startAt ? (
          // Hours or days away: no long count, the title says when.
          <Text style={s.ofMinutes}>{t('conduct.stage.countSoon')}</Text>
        ) : p.untilStart !== null ? (
          late ? (
            <View>
              <View style={[s.pill, { backgroundColor: C.amberBg }]}>
                <Text style={[s.pillText, { color: C.amberSoft }]}>{t('conduct.stage.delayed')}</Text>
              </View>
              <Text style={[s.digits, { fontSize: digits * 0.9, lineHeight: digits * 0.95, color: C.amber }]}>
                {mmssSigned(p.untilStart)}
              </Text>
            </View>
          ) : (
            <View style={s.rowBaseline}>
              <Text style={s.inWord}>{t('conduct.stage.in')}</Text>
              <Text style={[s.digits, { fontSize: digits * 0.9, lineHeight: digits * 0.95, color: C.textSoft }]}>
                {mmssSigned(p.untilStart)}
              </Text>
            </View>
          )
        ) : null}
        <View style={s.track} />
      </View>
    );
  } else if (p.phase === 'entrance' && p.current) {
    // «Выходит»: the chairman sees whom he is to call, and the number is the
    // part's own minutes, grey — it starts when the brother does.
    main = (
      <View style={s.mainCol}>
        <Text style={[s.overline, { color: C.entrance }]}>{t('conduct.stage.comesOut')}</Text>
        <Text style={s.title}>{p.current.title}</Text>
        {p.current.song ? <Text style={s.song}>{t('common.quoted', { text: p.current.song })}</Text> : null}
        {p.current.person ? <Text style={s.person}>{p.current.person}</Text> : null}
        <View style={{ flex: 1, minHeight: 16 }} />
        <Text style={[s.digits, { fontSize: digits, lineHeight: digits * 1.02, color: C.muted }]} numberOfLines={1}>
          {mmssSigned(p.current.soft ? 0 : p.current.minutes * 60)}
        </Text>
        <View style={s.stateRow}>
          <Text style={s.leftWord}>{t(p.current.soft ? 'conduct.stage.songWithHim' : 'conduct.stage.startsWithHim')}</Text>
        </View>
        <View style={s.track} />
      </View>
    );
  } else if (p.phase === 'counsel' && p.counselFor) {
    main = (
      <View style={s.counselBox}>
        <Text style={s.overline}>
          {[p.counselFor.title, p.counselFor.person].filter(Boolean).join(' · ').toUpperCase()}
        </Text>
        <Text style={s.counselWord}>{t('conduct.stage.counsel')}</Text>
      </View>
    );
  } else if (p.current) {
    const words =
      tone === 'stale'
        ? null
        : tone === 'over'
          ? t('conduct.overtime')
          : tone === 'soon'
            ? warnSecFor(p.current.minutes) >= 60
              ? t('conduct.stage.lastMinute')
              : t('conduct.lastSeconds')
            : null;
    const full = p.current.minutes * 60;
    const done = full > 0 ? Math.min(1, Math.max(0, 1 - p.leftSec / full)) : 0;
    // A song runs as long as it runs: the time it has gone, upward.
    const soft = !!p.current.soft;
    const shown = soft ? mmssSigned(Math.max(0, full - p.leftSec)) : mmssSigned(p.leftSec);
    main = (
      <View style={s.mainCol}>
        {p.current.section ? (
          <View style={s.sectionRow}>
            <View style={[s.sectionBar, { backgroundColor: p.unsure ? C.stale : p.current.sectionColor }]} />
            <Text style={s.overline}>
              {p.current.section.toUpperCase()}
            </Text>
          </View>
        ) : null}
        <Text style={[s.title, p.unsure && { color: C.textMid }]}>
          {p.current.title}
        </Text>
        {p.current.song ? <Text style={s.song}>{t('common.quoted', { text: p.current.song })}</Text> : null}
        {p.current.person ? (
          <Text style={s.person}>
            {p.current.person}
          </Text>
        ) : null}
        <View style={{ flex: 1, minHeight: 16 }} />
        <Text
          style={[s.digits, { fontSize: digits, lineHeight: digits * 1.02, color: numberColor }]}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {shown}
        </Text>
        <View style={s.stateRow}>
          {soft && !p.unsure ? (
            <Text style={s.leftWord}>{t('conduct.stage.going')}</Text>
          ) : p.unsure ? (
            <Text style={s.unsureText}>{t('conduct.live.unsure')}</Text>
          ) : p.paused ? (
            <View style={[s.pill, { backgroundColor: '#1e293b', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <Ionicons name="pause" size={18} color={C.textMid} />
              <Text style={[s.pillText, { color: C.textMid }]}>{p.paused}</Text>
            </View>
          ) : words ? (
            <View style={[s.pill, { backgroundColor: tone === 'over' ? C.redBg : C.amberBg }]}>
              <Text style={[s.pillText, { color: tone === 'over' ? C.redSoft : C.amberSoft }]}>{words}</Text>
            </View>
          ) : (
            <Text style={s.leftWord}>{t('conduct.stage.left')}</Text>
          )}
          {!p.unsure ? (
            <Text style={s.ofMinutes}>
              {soft
                ? t('conduct.stage.aboutMinutes', { minutes: p.current.minutes })
                : tone === 'over'
                ? t('conduct.stage.byProgrammeMin', { minutes: p.current.minutes })
                : t('conduct.stage.ofMinutes', { minutes: p.current.minutes })}
            </Text>
          ) : null}
        </View>
        <View style={s.track}>
          {soft ? null : <View style={[s.fill, { width: `${Math.round(done * 100)}%`, backgroundColor: barColor }]} />}
        </View>
      </View>
    );
  } else {
    main = <View style={s.mainCol} />;
  }

  // ── the right column: who comes next, and the end ────────────────────────
  const nextCard = p.next ? (
    <View style={[s.nextCard, p.phase === 'counsel' && { borderColor: '#2f4466' }]}>
      <Text style={[s.small, p.phase === 'counsel' && { color: C.mine }]}>
        {p.phase === 'before'
          ? t('conduct.stage.first')
          : p.phase === 'counsel'
            ? t('conduct.stage.nextUp')
            : t('conduct.stage.next')}
      </Text>
      <Text style={s.nextTitle}>
        {p.next.title}
      </Text>
      <View style={s.nextRow}>
        <Text style={s.nextPerson}>
          {p.next.person ?? ''}
        </Text>
        <Text style={s.nextMin}>{t('conduct.stage.min', { minutes: p.next.minutes })}</Text>
      </View>
    </View>
  ) : null;
  const thenLine = p.then ? (
    <View style={{ paddingHorizontal: 4 }}>
      <Text style={[s.small, { color: C.faint }]}>{t('conduct.stage.then')}</Text>
      <View style={s.nextRow}>
        <Text style={s.thenText}>
          {[p.then.title, p.then.person].filter(Boolean).join(' · ')}
        </Text>
        <Text style={s.thenText}>{t('conduct.stage.min', { minutes: p.then.minutes })}</Text>
      </View>
    </View>
  ) : null;
  const endBlock =
    p.endsAt || p.plannedEnd ? (
      <View style={s.endBlock}>
        <View style={s.endRow}>
          <Text style={s.endLabel}>{p.endsAt ? t('conduct.stage.end') : t('conduct.stage.endPlanned')}</Text>
          <Text style={[s.endTime, p.unsure && { color: C.muted }]}>{p.endsAt ? `≈ ${p.endsAt}` : p.plannedEnd}</Text>
        </View>
        {p.endsAt && p.plannedEnd ? (
          <View style={s.endRow}>
            <Text style={s.endSub}>{t('conduct.byProgramme', { time: p.plannedEnd })}</Text>
            {p.drift ? (
              <Text
                style={[
                  s.endSub,
                  { fontFamily: 'Manrope_700Bold' },
                  !p.unsure && p.drift.tone === 'behind' && { color: C.redSoft },
                  !p.unsure && p.drift.tone === 'ahead' && { color: '#6ee7b7' },
                  (p.unsure || p.drift.tone === 'ok') && { color: C.textMid },
                ]}
              >
                {p.drift.text}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null;

  const checkStatus = p.check ? (
    <View style={s.checkStatus}>
      <Status label={t('conduct.stage.check.online')} ok={p.check.online} />
      <Status label={t('conduct.stage.check.awake')} ok={p.check.awake} />
    </View>
  ) : null;

  const footer = p.controls ? (
    <View style={[s.controls, !wide && { flexDirection: 'column' }]}>
      <Pressable
        style={[s.primary, p.controls.primary.locked && { opacity: 0.55 }]}
        onPress={p.controls.primary.onPress}
        accessibilityRole="button"
      >
        <Text style={s.primaryText}>
          {p.controls.primary.sub ? `${p.controls.primary.label} · ${p.controls.primary.sub}` : p.controls.primary.label}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {p.controls.pause ? (
          <Pressable style={s.secondary} onPress={p.controls.pause.onPress} accessibilityRole="button">
            <Text style={s.secondaryText}>{p.controls.pause.label}</Text>
          </Pressable>
        ) : null}
        {p.controls.undo ? (
          <Pressable style={s.secondary} onPress={p.controls.undo.onPress} accessibilityRole="button">
            <Text style={s.secondaryText}>{p.controls.undo.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  ) : p.onTake ? (
    <View style={s.footer}>
      <Pressable style={s.ghost} onPress={p.onTake} accessibilityRole="button">
        <Ionicons name="hand-left-outline" size={18} color={C.muted} />
        <Text style={s.ghostText}>{t('conduct.live.take')}</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={s.ground}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: tone === 'over' ? C.red : C.amber,
            opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
          },
        ]}
      />
      {checkBar}
      <ScrollView contentContainerStyle={[s.page, !wide && s.pageNarrow, chrome ? { paddingTop: (wide ? 28 : 22) + chrome.topInset } : null]}>
        {heading}
        {!wide && p.who ? (
          <View style={{ marginTop: 14, alignSelf: 'flex-start' }}>
            <WhoPill who={p.who} />
          </View>
        ) : null}
        {checkStatus}
        {banner}
        {wide ? (
          <View style={s.columns}>
            <View style={{ flex: 1.75, minWidth: 0 }}>{main}</View>
            <View style={s.side}>
              {nextCard}
              {thenLine}
              <View style={{ flex: 1, minHeight: 12 }} />
              {endBlock}
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 28, gap: 28 }}>
            <View style={{ minHeight: digits * 2 }}>{main}</View>
            {nextCard}
            {endBlock}
          </View>
        )}
        {footer}
      </ScrollView>
    </View>
  );
}

function WhoPill({ who }: { who: { text: string; tone: 'live' | 'muted' | 'mine' } }) {
  const mine = who.tone === 'mine';
  return (
    <View style={[s.whoPill, mine && { backgroundColor: '#0c2f3a', borderColor: '#155e75' }]}>
      <View
        style={[
          s.dot,
          who.tone === 'live' && { backgroundColor: C.live },
          mine && { backgroundColor: C.mine },
          who.tone === 'muted' && { borderWidth: 2, borderColor: '#64748b' },
        ]}
      />
      <Text style={[s.whoText, mine && { color: '#a5f3fc', fontFamily: 'Manrope_700Bold' }, who.tone === 'muted' && { color: C.muted }]}>
        {who.text}
      </Text>
    </View>
  );
}

function Status({ label, ok }: { label: string; ok: boolean | null }) {
  const { t } = useTranslation();
  return (
    <View style={s.statusItem}>
      <Text style={s.statusLabel}>{label}</Text>
      <View style={[s.statusPill, ok === false && { backgroundColor: C.redBg }, ok === null && { backgroundColor: C.panel }]}>
        <Text style={[s.statusPillText, ok === false && { color: C.redSoft }, ok === null && { color: C.muted }]}>
          {ok === null ? '…' : ok ? t('conduct.stage.check.yes') : t('conduct.stage.check.no')}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  ground: { flex: 1, backgroundColor: C.ground },
  page: { flexGrow: 1, paddingHorizontal: 40, paddingTop: 28, paddingBottom: 32 },
  pageNarrow: { paddingHorizontal: 24, paddingTop: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, minHeight: 44 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  mark: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0e7490', alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#ffffff' },
  heading: { fontFamily: 'Manrope_600SemiBold', fontSize: 17, color: C.textMid, flexShrink: 1 },
  headingNarrow: { fontSize: 15, lineHeight: 20 },
  clockNarrow: { fontSize: 22 },
  clock: { fontFamily: 'Manrope_700Bold', fontSize: 28, color: C.textSoft, fontVariant: ['tabular-nums'] },
  whoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    maxWidth: 420,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  whoText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: C.textMid },
  checkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#2e1065',
    borderBottomWidth: 3,
    borderBottomColor: '#6d28d9',
  },
  checkTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: '#ede9fe', letterSpacing: 1 },
  checkSub: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: '#c4b5fd', marginTop: 2 },
  checkEnd: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#ede9fe', justifyContent: 'center' },
  checkEndText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#2e1065' },
  checkStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 16 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusLabel: { fontFamily: 'Manrope_500Medium', fontSize: 16, color: C.muted },
  statusPill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#0b2e22' },
  statusPillText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#6ee7b7' },
  banner: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#1f1a0b',
    borderWidth: 1,
    borderColor: '#4a3a12',
  },
  bannerText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 18, color: '#fde68a' },
  columns: { flex: 1, flexDirection: 'row', gap: 40, marginTop: 30, minHeight: 440 },
  side: { flex: 1, minWidth: 0, gap: 18 },
  mainCol: { flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBar: { width: 6, height: 22, borderRadius: 3 },
  overline: { fontFamily: 'Manrope_700Bold', fontSize: 16, letterSpacing: 1.6, color: '#9fb7c6' },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 40, lineHeight: 46, color: C.text, marginTop: 14 },
  person: { fontFamily: 'Manrope_500Medium', fontSize: 23, color: C.muted, marginTop: 8 },
  song: { fontFamily: 'Manrope_500Medium', fontSize: 23, color: C.textMid, marginTop: 6 },
  digits: { fontFamily: 'Manrope_800ExtraBold', fontVariant: ['tabular-nums'], letterSpacing: -4 },
  rowBaseline: { flexDirection: 'row', alignItems: 'baseline', gap: 22 },
  inWord: { fontFamily: 'Manrope_700Bold', fontSize: 38, color: C.muted },
  stateRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  leftWord: { fontFamily: 'Manrope_700Bold', fontSize: 26, color: C.textSoft },
  ofMinutes: { fontFamily: 'Manrope_500Medium', fontSize: 20, color: C.muted },
  unsureText: { fontFamily: 'Manrope_700Bold', fontSize: 23, color: C.muted },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 23 },
  track: { marginTop: 20, height: 10, borderRadius: 5, backgroundColor: '#1c2840', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  counselBox: {
    flex: 1,
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    borderRadius: 28,
    paddingVertical: 40,
    paddingHorizontal: 44,
  },
  counselWord: { fontFamily: 'Manrope_800ExtraBold', fontSize: 112, lineHeight: 120, color: '#a5d8e6', marginTop: 14 },
  nextCard: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingVertical: 22, paddingHorizontal: 24 },
  small: { fontFamily: 'Manrope_700Bold', fontSize: 14, letterSpacing: 1.6, color: C.muted },
  nextTitle: { fontFamily: 'Manrope_700Bold', fontSize: 27, lineHeight: 33, color: '#f1f5f9', marginTop: 10 },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  nextPerson: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 19, color: C.muted },
  nextMin: { fontFamily: 'Manrope_600SemiBold', fontSize: 19, color: C.muted, fontVariant: ['tabular-nums'] },
  thenText: { fontFamily: 'Manrope_500Medium', fontSize: 18, color: '#a3b0c2', flexShrink: 1 },
  endBlock: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 18, paddingHorizontal: 4, gap: 4 },
  endRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  endLabel: { fontFamily: 'Manrope_500Medium', fontSize: 17, color: C.muted },
  endTime: { fontFamily: 'Manrope_700Bold', fontSize: 30, color: '#f1f5f9', fontVariant: ['tabular-nums'] },
  endSub: { fontFamily: 'Manrope_500Medium', fontSize: 17, color: C.muted },
  footer: { marginTop: 26, flexDirection: 'row', justifyContent: 'flex-end' },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.lineStrong,
  },
  ghostText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: C.muted },
  controls: { marginTop: 22, flexDirection: 'row', gap: 14 },
  primary: { flex: 1, minHeight: 76, borderRadius: 18, backgroundColor: '#0e7490', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 23, color: '#ffffff' },
  secondary: {
    minWidth: 150,
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryText: { fontFamily: 'Manrope_700Bold', fontSize: 19, color: C.textMid },
});
