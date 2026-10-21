import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { PublicUser, extractErrorMessage, hallsApi, usersApi } from '../lib/api';
import { passwordProblem, PASSWORD_MIN_LENGTH, type PasswordProblem } from '../lib/password';

/** Which of the password rules a problem breaks — the words PasswordRules shows. */
const PASS_CHECK: Record<PasswordProblem, 'length' | 'notCommon' | 'notRepetitive'> = {
  tooShort: 'length',
  tooCommon: 'notCommon',
  looksLikeEmail: 'notCommon',
  tooRepetitive: 'notRepetitive',
};
import { loginNameProblem, loginNameRefusal, LOGIN_NAME_MAX, LOGIN_NAME_MIN } from '../lib/login-name';
import i18n from '../lib/i18n';

/**
 * THE SCREEN ON THE STAGE, as an administrator makes it (20–21 October 2026).
 *
 * A laptop at the lectern signs in with an account of its own — not the
 * chairman's, who changes every week and whose account would stay open on a
 * shared device. It shows the meeting as it runs and nothing else; the server
 * refuses it everything else (server: common/stage.ts). Its menu opens with a
 * few digits that the brothers who set it up know (app/stage.tsx).
 *
 * Made in two steps and a last page (the canvas «Экран сцены — учётная
 * запись», boards 6–9): where it stands and how it signs in; the digits of its
 * menu and what it will show; then what to type on the laptop. The first
 * version was one plain form in a sheet that did not scroll — on a phone its
 * button sat below the screen and could not be reached (Lionel's photo,
 * 21 October 2026).
 */

/** Four to eight digits — the server's rule (common/stage.ts STAGE_PIN_RE). */
export const STAGE_PIN_RE = /^\d{4,8}$/;

const QK_USERS = ['users'];

/**
 * Words for a password typed on the hall's laptop: Latin letters only — its
 * keyboard is German, and «тихий клён» cannot be typed on it — short, common,
 * no umlauts. Four of them make a password nobody guesses and anybody types.
 */
const WORDS = [
  'ahorn', 'birke', 'fluss', 'licht', 'sonne', 'wolke', 'stern', 'berg', 'wald', 'klar',
  'ruhig', 'blau', 'hell', 'stein', 'feder', 'welle', 'insel', 'nord', 'mond', 'regen',
  'wind', 'garten', 'turm', 'lampe', 'apfel', 'brunnen', 'linde', 'quelle', 'wiese', 'tanne',
];

function pick(n: number): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] % n;
  return Math.floor(Math.random() * n);
}

export function stagePassword(): string {
  const out: string[] = [];
  while (out.length < 4) {
    const w = WORDS[pick(WORDS.length)];
    if (!out.includes(w)) out.push(w);
  }
  return out.join('-');
}

/** «Зал Царства Hamm» → «scena.hamm»: the Latin part of the hall's name. */
export function stageLoginFor(hall: string): string {
  const latin = hall
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
    .join('.');
  return latin ? `scena.${latin}`.slice(0, LOGIN_NAME_MAX) : '';
}

/** The digits as boxes; a hidden field under them takes the typing. */
function PinCells({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const cells = Math.min(8, Math.max(4, value.length + 1));
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={label} style={s.cellsRow}>
      {Array.from({ length: cells }, (_, i) => {
        const active = focused && i === Math.min(value.length, 7);
        return (
          <View key={i} style={[s.cell, i < value.length && s.cellFull, active && s.cellActive]}>
            {i < value.length ? (
              <Text style={s.cellText}>{value[i]}</Text>
            ) : active ? (
              <View style={s.caret} />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 8))}
        keyboardType="number-pad"
        maxLength={8}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={s.hiddenInput}
        accessibilityLabel={label}
        caretHidden
      />
    </Pressable>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
      {note ?? null}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  right,
  last,
  placeholder,
  plain,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  right?: React.ReactNode;
  last?: boolean;
  placeholder?: string;
  /** Typed as is: a login name, a password. */
  plain?: boolean;
}) {
  return (
    <View style={[s.field, !last && s.fieldLine]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.fieldRow}>
        <TextInput
          style={s.fieldInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          accessibilityLabel={label}
          autoCapitalize={plain ? 'none' : 'sentences'}
          autoCorrect={!plain}
          maxLength={80}
        />
        {right}
      </View>
    </View>
  );
}

function Hint({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <View style={s.hintRow}>
      {ok === undefined ? null : (
        <Ionicons name={ok ? 'checkmark' : 'alert-circle-outline'} size={15} color={ok ? '#15803d' : '#b45309'} />
      )}
      <Text style={[s.hint, ok === true && { color: '#15803d' }, ok === false && { color: '#b45309' }]}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, disabled && s.primaryOff, pressed && !disabled && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon ? <Ionicons name={icon} size={18} color="#67e8f9" /> : null}
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

type Made = { label: string; loginName: string; password: string; pin: string };

export function StageNewSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const halls = useQuery({ queryKey: ['halls'], queryFn: () => hallsApi.list(), enabled: visible, staleTime: 10 * 60 * 1000 });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [label, setLabel] = useState<string | null>(null);
  const [loginName, setLoginName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [made, setMade] = useState<Made | null>(null);

  // A first guess from the congregation's own hall: its name, and a login
  // built from its Latin part. Both stay editable.
  const hall = useMemo(() => {
    const list = halls.data ?? [];
    return (list.find((h) => h.isDefault) ?? list[0])?.name ?? '';
  }, [halls.data]);
  const shownLabel = label ?? hall;
  const shownLogin = loginName ?? stageLoginFor(shownLabel);

  useEffect(() => {
    if (visible && !password) setPassword(stagePassword());
  }, [visible, password]);

  const reset = () => {
    setStep(1);
    setLabel(null);
    setLoginName(null);
    setPassword('');
    setPin('');
    setMade(null);
    create.reset();
  };
  const close = () => {
    onClose();
    reset();
  };

  const create = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      usersApi.create({
        role: 'stage',
        displayLabel: shownLabel.trim(),
        loginName: shownLogin.trim().toLowerCase(),
        password: password.trim(),
        stagePin: pin,
        uiLanguage: i18n.language,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK_USERS });
      setMade({ label: shownLabel.trim(), loginName: shownLogin.trim().toLowerCase(), password: password.trim(), pin });
      setStep(3);
    },
    onError: (e) => {
      // A login name already taken is said where it is typed.
      if (loginNameRefusal(e, t)) setStep(1);
    },
  });

  const nameProblem = shownLogin ? loginNameProblem(shownLogin.trim().toLowerCase()) : 'tooShort';
  const passProblem = passwordProblem(password.trim());
  const stepOneOk = !!shownLabel.trim() && !nameProblem && !passProblem;
  const latinOnly = /^[\x20-\x7e]*$/.test(password);
  const takenText = create.isError ? loginNameRefusal(create.error, t) : null;

  const footer =
    step === 1 ? (
      <PrimaryButton label={t('stage.admin.next')} onPress={() => setStep(2)} disabled={!stepOneOk} />
    ) : step === 2 ? (
      <View style={{ gap: 10 }}>
        <PrimaryButton
          label={t('stage.admin.create')}
          icon="tv-outline"
          onPress={() => create.mutate()}
          disabled={!STAGE_PIN_RE.test(pin) || create.isPending}
        />
        <Pressable onPress={() => setStep(1)} style={s.secondary} accessibilityRole="button">
          <Text style={s.secondaryText}>{t('stage.admin.back')}</Text>
        </Pressable>
      </View>
    ) : (
      <Pressable onPress={close} style={s.done} accessibilityRole="button">
        <Text style={s.doneText}>{t('common.done')}</Text>
      </Pressable>
    );

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={step === 3 ? t('stage.admin.doneTitle') : t('stage.admin.newTitle')}
      closeLabel={t('common.close')}
      footer={footer}
    >
      <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <View style={s.hero}>
              <View style={s.heroIcon}>
                <Ionicons name="tv-outline" size={28} color="#e0f2fe" />
              </View>
              <Text style={s.heroText}>{t('stage.admin.newHint')}</Text>
            </View>
            <Section title={t('stage.admin.whereTitle')} note={<Hint text={t('stage.admin.nameNote')} />}>
              <Field
                label={t('stage.admin.name')}
                value={shownLabel}
                onChange={setLabel}
                placeholder={t('stage.admin.namePlaceholder')}
                last
              />
            </Section>
            <Section
              title={t('stage.admin.signInTitle')}
              note={
                takenText ? (
                  <Hint ok={false} text={takenText} />
                ) : shownLogin && nameProblem ? (
                  <Hint ok={false} text={t(`loginName.problem.${nameProblem}`, { min: LOGIN_NAME_MIN, max: LOGIN_NAME_MAX })} />
                ) : password && passProblem ? (
                  <Hint ok={false} text={t(`password.checks.${PASS_CHECK[passProblem]}`, { count: PASSWORD_MIN_LENGTH })} />
                ) : password && !latinOnly ? (
                  <Hint ok={false} text={t('stage.admin.latinWarn')} />
                ) : (
                  <Hint ok text={t('stage.admin.latinOk')} />
                )
              }
            >
              <Field
                label={t('stage.admin.loginName')}
                value={shownLogin}
                onChange={(v) => {
                  setLoginName(v);
                  create.reset();
                }}
                placeholder={t('stage.admin.loginPlaceholder')}
                plain
              />
              <Field
                label={t('stage.admin.password')}
                value={password}
                onChange={setPassword}
                plain
                last
                right={
                  <Pressable onPress={() => setPassword(stagePassword())} style={s.chip} accessibilityRole="button">
                    <Ionicons name="refresh" size={14} color="#0e7490" />
                    <Text style={s.chipText}>{t('stage.admin.another')}</Text>
                  </Pressable>
                }
              />
            </Section>
          </>
        ) : step === 2 ? (
          <>
            <Section title={t('stage.admin.pinTitle')} note={<Hint text={t('stage.admin.pinHint')} />}>
              <View style={{ paddingVertical: 14 }}>
                <PinCells value={pin} onChange={setPin} label={t('stage.admin.pin')} autoFocus />
              </View>
            </Section>
            <Section title={t('stage.admin.showsTitle')}>
              <View style={[s.lineRow, s.fieldLine]}>
                <View style={s.okIcon}>
                  <Ionicons name="checkmark" size={16} color="#0e7490" />
                </View>
                <Text style={s.lineText}>{t('stage.admin.shows1')}</Text>
              </View>
              <View style={[s.lineRow, s.fieldLine]}>
                <View style={s.okIcon}>
                  <Ionicons name="checkmark" size={16} color="#0e7490" />
                </View>
                <Text style={s.lineText}>{t('stage.admin.shows2')}</Text>
              </View>
              <View style={s.lineRow}>
                <View style={s.noIcon}>
                  <Ionicons name="ban-outline" size={16} color="#c2410c" />
                </View>
                <Text style={[s.lineText, { color: '#334155' }]}>{t('stage.admin.not')}</Text>
              </View>
            </Section>
            {create.isError && !takenText ? <Hint ok={false} text={extractErrorMessage(create.error)} /> : null}
          </>
        ) : made ? (
          <Credentials made={made} />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

/** What to type on the laptop — shown once, with a way to pass it on. */
function Credentials({ made }: { made: Made }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const message = t('stage.admin.shareText', {
    label: made.label,
    login: made.loginName,
    password: made.password,
    pin: made.pin,
  });
  const give = (key: string, text: string) => {
    // On a computer the clipboard; on a phone the share sheet, to a messenger
    // (components/PublisherAccessContent.tsx does the same for invitations).
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(text)
        .then(() => setCopied(key))
        .catch(() => void Share.share({ message: text }));
    } else {
      void Share.share({ message: text });
    }
  };
  const row = (key: string, title: string, value: string, last?: boolean, spaced?: boolean) => (
    <View style={[s.credRow, !last && s.credLine]}>
      <View style={{ flex: 1 }}>
        <Text style={s.credLabel}>{title}</Text>
        <Text style={[s.credValue, spaced && { letterSpacing: 6 }]} selectable>
          {value}
        </Text>
      </View>
      <Pressable onPress={() => give(key, value)} style={s.copyBtn} accessibilityRole="button" accessibilityLabel={t('stage.admin.copyOne', { what: title })}>
        <Ionicons name={copied === key ? 'checkmark' : Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={18} color="#67e8f9" />
      </Pressable>
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <View style={s.doneHead}>
        <View style={s.doneIcon}>
          <Ionicons name="checkmark" size={32} color="#15803d" />
        </View>
        <Text style={s.doneTitle}>{made.label}</Text>
        <Text style={s.doneText2}>{t('stage.admin.doneHint')}</Text>
      </View>
      <View style={s.credCard}>
        {row('login', t('stage.admin.loginName'), made.loginName)}
        {row('password', t('stage.admin.password'), made.password)}
        {row('pin', t('stage.admin.pinShort'), made.pin, true, true)}
      </View>
      <Pressable onPress={() => give('all', message)} style={s.shareAll} accessibilityRole="button">
        <Ionicons name={Platform.OS === 'web' ? 'copy-outline' : 'share-social-outline'} size={18} color="#0e7490" />
        <Text style={s.shareAllText}>
          {copied === 'all' ? t('stage.admin.copied') : Platform.OS === 'web' ? t('stage.admin.copyAll') : t('stage.admin.shareAll')}
        </Text>
      </Pressable>
      <View style={s.warn}>
        <Ionicons name="warning-outline" size={18} color="#b45309" />
        <Text style={s.warnText}>{t('stage.admin.onceWarn')}</Text>
      </View>
    </View>
  );
}

/** A stage screen's name and its menu digits, changed. */
export function StageEditSheet({ user, onClose }: { user: PublicUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const shownLabel = label ?? user?.displayLabel ?? '';

  const close = () => {
    setLabel(null);
    setPin('');
    setNewPassword('');
    save.reset();
    onClose();
  };
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      if (label !== null || pin) {
        await usersApi.updateStage(user!.id, {
          displayLabel: label !== null ? label.trim() : undefined,
          stagePin: pin ? pin : undefined,
        });
      }
      // A new password ends the display's open sign-in: the laptop asks for it again.
      if (newPassword.trim()) await usersApi.resetPassword(user!.id, newPassword.trim());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK_USERS });
      close();
    },
  });
  const passBad = !!newPassword.trim() && !!passwordProblem(newPassword.trim());
  const ready =
    !!shownLabel.trim() &&
    (pin === '' || STAGE_PIN_RE.test(pin)) &&
    !passBad &&
    (label !== null || pin !== '' || !!newPassword.trim());

  return (
    <Sheet
      visible={!!user}
      onClose={close}
      title={t('stage.admin.editTitle')}
      closeLabel={t('common.close')}
      footer={<PrimaryButton label={t('common.save')} onPress={() => save.mutate()} disabled={!ready || save.isPending} />}
    >
      <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Section title={t('stage.admin.whereTitle')}>
          <Field label={t('stage.admin.name')} value={shownLabel} onChange={setLabel} last />
        </Section>
        <Section title={t('stage.admin.newPin')} note={<Hint text={t('stage.admin.pinKeep')} />}>
          <View style={{ paddingVertical: 14 }}>
            <PinCells value={pin} onChange={setPin} label={t('stage.admin.newPin')} />
          </View>
        </Section>
        <Section
          title={t('stage.admin.signInTitle')}
          note={<Hint ok={newPassword ? !passBad : undefined} text={newPassword ? (passBad ? t('stage.admin.passwordWeak') : t('stage.admin.passwordNewNote')) : t('stage.admin.passwordKeep')} />}
        >
          <View style={[s.field, s.fieldLine]}>
            <Text style={s.fieldLabel}>{t('stage.admin.loginName')}</Text>
            <Text style={[s.fieldInput, { paddingVertical: 2 }]}>{user?.loginName ?? '—'}</Text>
          </View>
          <Field
            label={t('stage.admin.newPassword')}
            value={newPassword}
            onChange={setNewPassword}
            plain
            last
            placeholder={t('stage.admin.passwordKeepShort')}
            right={
              <Pressable onPress={() => setNewPassword(stagePassword())} style={s.chip} accessibilityRole="button">
                <Ionicons name="refresh" size={14} color="#0e7490" />
                <Text style={s.chipText}>{t('stage.admin.another')}</Text>
              </Pressable>
            }
          />
        </Section>
        {save.isError ? <Hint ok={false} text={extractErrorMessage(save.error)} /> : null}
      </ScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  // The grey runs to the footer: the scroller fills the sheet, not only its content.
  scroll: { flex: 1, backgroundColor: '#f1f5f9' },
  body: { padding: 16, paddingTop: 20, gap: 20, flexGrow: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0e7490',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#475569' },
  sectionTitle: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: '#64748b', marginHorizontal: 4, textTransform: 'uppercase' },
  card: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16 },
  field: { paddingVertical: 12 },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  fieldLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#64748b' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 17,
    color: '#0f172a',
    paddingVertical: 4,
    paddingHorizontal: 0,
    // The browser's black focus frame sat on the card's own field line.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#ecfeff' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#0e7490' },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 4 },
  hint: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 12.5, lineHeight: 18, color: '#64748b' },
  // Up to eight on one line at phone width: the boxes share the row.
  cellsRow: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, maxWidth: 52, height: 58, borderRadius: 12, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  cellFull: { borderColor: '#94a3b8', backgroundColor: '#ffffff' },
  cellActive: { borderColor: '#0e7490', borderWidth: 2, backgroundColor: '#ffffff' },
  cellText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: '#0f172a' },
  caret: { width: 2, height: 24, backgroundColor: '#0e7490' },
  hiddenInput: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.01, color: 'transparent', fontFamily: 'Manrope_400Regular' },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11 },
  okIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' },
  noIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#0f172a', paddingTop: 3 },
  primary: { height: 52, borderRadius: 14, backgroundColor: '#0b1220', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryOff: { opacity: 0.35 },
  primaryText: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#ffffff' },
  secondary: { height: 40, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#475569' },
  done: { height: 52, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a' },
  doneHead: { alignItems: 'center', gap: 10 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#0f172a', textAlign: 'center' },
  doneText2: { fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#64748b', textAlign: 'center', maxWidth: 320 },
  credCard: { backgroundColor: '#0b1220', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 4 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  credLine: { borderBottomWidth: 1, borderBottomColor: '#22304a' },
  credLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: '#94a3b8', textTransform: 'uppercase' },
  credValue: { fontFamily: 'Manrope_700Bold', fontSize: 19, color: '#f1f5f9', marginTop: 4 },
  copyBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#2c3b57', backgroundColor: '#121b2e', alignItems: 'center', justifyContent: 'center' },
  shareAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#a5f3fc' },
  shareAllText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0e7490' },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 12 },
  warnText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#78350f' },
});
