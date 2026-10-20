import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { PasswordRules } from './PasswordRules';
import { PublicUser, extractErrorMessage, usersApi } from '../lib/api';
import { passwordProblem } from '../lib/password';
import { loginNameProblem, loginNameRefusal, LOGIN_NAME_MAX, LOGIN_NAME_MIN } from '../lib/login-name';
import i18n from '../lib/i18n';

/**
 * THE SCREEN ON THE STAGE, as an administrator makes it (20 October 2026).
 *
 * A laptop at the lectern signs in with an account of its own — not the
 * chairman's, who changes every week and whose account would stay open on a
 * shared device. It shows the meeting as it runs and nothing else; the server
 * refuses it everything else (server: common/stage.ts). Its menu opens with a
 * few digits that the brothers who set it up know (app/stage.tsx).
 */

/** Four to eight digits — the server's rule (common/stage.ts STAGE_PIN_RE). */
export const STAGE_PIN_RE = /^\d{4,8}$/;

const QK_USERS = ['users'];

export function StageNewSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');

  const create = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      usersApi.create({
        role: 'stage',
        displayLabel: label.trim(),
        loginName: loginName.trim().toLowerCase(),
        password: password.trim(),
        stagePin: pin,
        uiLanguage: i18n.language,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK_USERS });
      setLabel('');
      setLoginName('');
      setPassword('');
      setPin('');
      onClose();
    },
  });

  const nameProblem = loginName ? loginNameProblem(loginName.trim().toLowerCase()) : 'empty';
  const ready =
    !!label.trim() && !nameProblem && !passwordProblem(password.trim()) && STAGE_PIN_RE.test(pin);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('stage.admin.newTitle')} closeLabel={t('common.close')}>
      <View style={{ gap: 12 }}>
        <Text style={s.hint}>{t('stage.admin.newHint')}</Text>

        <Text style={s.label}>{t('stage.admin.name')}</Text>
        <TextInput
          style={s.input}
          value={label}
          onChangeText={setLabel}
          placeholder={t('stage.admin.namePlaceholder')}
          placeholderTextColor="#94a3b8"
          maxLength={80}
          accessibilityLabel={t('stage.admin.name')}
        />

        <Text style={s.label}>{t('stage.admin.loginName')}</Text>
        <TextInput
          style={s.input}
          value={loginName}
          onChangeText={setLoginName}
          placeholder={t('stage.admin.loginPlaceholder')}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('stage.admin.loginName')}
        />
        {loginName && nameProblem ? (
          <Text style={s.error}>
            {t(`loginName.problem.${nameProblem}`, { min: LOGIN_NAME_MIN, max: LOGIN_NAME_MAX })}
          </Text>
        ) : null}

        <Text style={s.label}>{t('stage.admin.password')}</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('stage.admin.password')}
        />
        <PasswordRules password={password} />

        <Text style={s.label}>{t('stage.admin.pin')}</Text>
        <TextInput
          style={s.input}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
          keyboardType="number-pad"
          placeholder="2468"
          placeholderTextColor="#94a3b8"
          accessibilityLabel={t('stage.admin.pin')}
        />
        <Text style={s.small}>{t('stage.admin.pinHint')}</Text>

        <View style={s.box}>
          <Text style={s.boxHead}>{t('stage.admin.seesTitle')}</Text>
          <Text style={s.boxText}>{t('stage.admin.sees')}</Text>
          <Text style={[s.boxHead, { color: '#b45309', marginTop: 6 }]}>{t('stage.admin.notTitle')}</Text>
          <Text style={s.boxText}>{t('stage.admin.not')}</Text>
        </View>

        {create.isError ? (
          <Text style={s.error}>
            {loginNameRefusal(create.error, t) ?? extractErrorMessage(create.error)}
          </Text>
        ) : null}
        <Pressable
          style={[s.btn, (!ready || create.isPending) && s.btnOff]}
          disabled={!ready || create.isPending}
          onPress={() => create.mutate()}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t('stage.admin.create')}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/** A stage screen's name and its menu digits, changed. */
export function StageEditSheet({ user, onClose }: { user: PublicUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const shownLabel = label ?? user?.displayLabel ?? '';

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      usersApi.updateStage(user!.id, {
        displayLabel: label !== null ? label.trim() : undefined,
        stagePin: pin ? pin : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK_USERS });
      setLabel(null);
      setPin('');
      onClose();
    },
  });
  const ready = !!shownLabel.trim() && (pin === '' || STAGE_PIN_RE.test(pin)) && (label !== null || pin !== '');

  return (
    <Sheet visible={!!user} onClose={onClose} title={t('stage.admin.editTitle')} closeLabel={t('common.close')}>
      <View style={{ gap: 12 }}>
        <Text style={s.label}>{t('stage.admin.name')}</Text>
        <TextInput
          style={s.input}
          value={shownLabel}
          onChangeText={setLabel}
          maxLength={80}
          accessibilityLabel={t('stage.admin.name')}
        />
        <Text style={s.label}>{t('stage.admin.newPin')}</Text>
        <TextInput
          style={s.input}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))}
          keyboardType="number-pad"
          placeholder={t('stage.admin.pinKeep')}
          placeholderTextColor="#94a3b8"
          accessibilityLabel={t('stage.admin.newPin')}
        />
        <Text style={s.small}>{t('stage.admin.pinHint')}</Text>
        {save.isError ? <Text style={s.error}>{extractErrorMessage(save.error)}</Text> : null}
        <Pressable
          style={[s.btn, (!ready || save.isPending) && s.btnOff]}
          disabled={!ready || save.isPending}
          onPress={() => save.mutate()}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  hint: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#475569', lineHeight: 19 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#334155', marginBottom: -6 },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', marginTop: -6 },
  input: {
    fontFamily: 'Manrope_400Regular',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  box: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 4 },
  boxHead: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#0e7490', letterSpacing: 0.4 },
  boxText: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#334155', lineHeight: 18 },
  error: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
});
