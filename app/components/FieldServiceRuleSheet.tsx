import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ConductorRule, Hall, ServiceGroup, TemplateSlotInput } from '../lib/api';
import { slotWhenPhrase } from '../lib/field-service-template-phrase';
import { Sheet } from './Sheet';
import { TimeField } from './TimeField';

/**
 * One rule of the template («Встреча в шаблоне», October 2026): which
 * weekday, which of them in the month, at what time, whose meeting, where,
 * and who conducts. The phrase at the top says the rule back as the list
 * will show it.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const EVERY = [1, 2, 3, 4, 5];

export type RuleDraft = TemplateSlotInput;

export function FieldServiceRuleSheet({
  visible,
  rule,
  groups,
  halls,
  onClose,
  onDone,
  onRemove,
}: {
  visible: boolean;
  /** The rule being edited, or null for a new one. */
  rule: RuleDraft | null;
  groups: Pick<ServiceGroup, 'id' | 'name' | 'meetingLocation'>[];
  halls: Hall[];
  onClose: () => void;
  onDone: (rule: RuleDraft) => void;
  /** Offered for a rule already in the template. */
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const [dayOfWeek, setDayOfWeek] = useState(6);
  const [ordinals, setOrdinals] = useState<number[]>(EVERY);
  const [lastOnly, setLastOnly] = useState(false);
  const [startTime, setStartTime] = useState('10:30');
  const [serviceGroupId, setServiceGroupId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [ownAddress, setOwnAddress] = useState(false);
  const [conductorRule, setConductorRule] = useState<ConductorRule>('rotation');

  useEffect(() => {
    if (!visible) return;
    const defHall = (halls.find((h) => h.isDefault) ?? halls[0])?.address ?? '';
    if (rule) {
      setDayOfWeek(rule.dayOfWeek);
      setOrdinals(rule.ordinals.length ? [...rule.ordinals] : []);
      setLastOnly(rule.lastOnly === true);
      setStartTime(rule.startTime);
      setServiceGroupId(rule.serviceGroupId ?? null);
      setAddress(rule.address ?? '');
      setOwnAddress(!!rule.serviceGroupId && !!rule.address);
      setConductorRule(rule.conductorRule ?? 'none');
    } else {
      setDayOfWeek(6);
      setOrdinals(EVERY);
      setLastOnly(false);
      setStartTime('10:30');
      setServiceGroupId(null);
      setAddress(defHall);
      setOwnAddress(false);
      setConductorRule('rotation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rule]);

  const group = serviceGroupId
    ? (groups.find((g) => g.id === serviceGroupId) ?? null)
    : null;
  const groupPlace = group?.meetingLocation?.trim() || '';
  const every = EVERY.every((n) => ordinals.includes(n));
  const toggleOrdinal = (n: number) =>
    setOrdinals((cur) =>
      cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort(),
    );

  const draft: RuleDraft = {
    ordinals: every ? EVERY : ordinals,
    lastOnly: every ? false : lastOnly,
    dayOfWeek,
    startTime,
    serviceGroupId,
    address: serviceGroupId
      ? ownAddress && address.trim()
        ? address.trim()
        : null
      : address.trim() || null,
    conductorRule,
  };
  const landsSomewhere = draft.ordinals.length > 0 || draft.lastOnly === true;
  const canSave =
    landsSomewhere &&
    TIME_RE.test(startTime) &&
    (!!serviceGroupId || !!draft.address);
  const hints: string[] = [];
  if (!landsSomewhere) hints.push(t('fieldService.template.rule.hintWhich'));
  if (!TIME_RE.test(startTime)) hints.push(t('fieldService.form.hintTime'));
  if (!serviceGroupId && !draft.address)
    hints.push(t('fieldService.form.hintAddress'));

  const phrase = landsSomewhere
    ? `${slotWhenPhrase(draft, (k, o) => t(k, o))} · ${
        group ? t('fieldService.row.group', { group: group.name }) : t('fieldService.sheet.general')
      }`
    : t('fieldService.template.rule.hintWhich');

  const chip = (
    key: string | number,
    label: string,
    on: boolean,
    onPress: () => void,
    style?: object,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn, style]}
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      variant="bottom"
      title={t('fieldService.template.rule.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
      hideClose
      footer={
        <View style={styles.footer}>
          {!canSave && hints.length > 0 ? (
            <Text style={styles.hint}>{hints.join(' · ')}</Text>
          ) : null}
          <View style={styles.footerRow}>
            {onRemove ? (
              <Pressable style={[styles.cancelBtn, styles.dangerBtn]} onPress={onRemove}>
                <Text style={[styles.cancelBtnText, styles.dangerBtnText]}>
                  {t('fieldService.template.rule.remove')}
                </Text>
              </Pressable>
            ) : (
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
              disabled={!canSave}
              onPress={() => onDone(draft)}
            >
              <Text style={styles.saveBtnText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.phraseBox}>
        <Text style={styles.phraseText}>{phrase}</Text>
      </View>

      <Text style={styles.label}>{t('fieldService.template.rule.weekday')}</Text>
      <View style={styles.dayRow}>
        {DAYS.map((d) =>
          chip(d, t(`fieldService.days.${d}`), d === dayOfWeek, () => setDayOfWeek(d), styles.dayChip),
        )}
      </View>

      <Text style={styles.label}>{t('fieldService.template.rule.which')}</Text>
      <View style={styles.chipWrap}>
        {chip('every', t('fieldService.template.rule.every'), every, () => {
          setOrdinals(EVERY);
          setLastOnly(false);
        })}
        {chip('last', t('fieldService.template.rule.last'), !every && lastOnly, () => {
          if (every) setOrdinals([]);
          setLastOnly((v) => !v);
        })}
      </View>
      <Text style={styles.subLabel}>{t('fieldService.template.rule.orListed')}</Text>
      <View style={styles.chipWrap}>
        {[1, 2, 3, 4, 5].map((n) =>
          chip(
            n,
            t(`fieldService.template.phrase.ordinal.${t(`fieldService.template.phrase.gender.${dayOfWeek}`)}.${n}`),
            !every && ordinals.includes(n),
            () => {
              if (every) setOrdinals([n]);
              else toggleOrdinal(n);
            },
          ),
        )}
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.inlineLabel}>{t('fieldService.timeLabel')}</Text>
        <TimeField value={startTime} onChange={setStartTime} />
      </View>

      <Text style={styles.label}>{t('fieldService.template.rule.whose')}</Text>
      <View style={styles.segmentTrack}>
        {[{ id: null as string | null, name: t('fieldService.sheet.general') }, ...groups].map((g) => {
          const on = serviceGroupId === g.id;
          return (
            <Pressable
              key={g.id ?? 'general'}
              onPress={() => {
                setServiceGroupId(g.id);
                setOwnAddress(false);
                if (g.id === null) {
                  if (!address.trim()) {
                    setAddress((halls.find((h) => h.isDefault) ?? halls[0])?.address ?? '');
                  }
                  if (conductorRule === 'group_overseer') setConductorRule('rotation');
                } else if (conductorRule === 'rotation') {
                  setConductorRule('group_overseer');
                }
              }}
              style={[styles.segment, on && styles.segmentOn]}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{g.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('fieldService.sheet.where')}</Text>
      {serviceGroupId ? (
        <>
          <View style={styles.chipWrap}>
            {chip('place', t('fieldService.sheet.groupPlace'), !ownAddress, () => setOwnAddress(false))}
            {chip('own', t('fieldService.sheet.otherAddress'), ownAddress, () => setOwnAddress(true), styles.chipDashed)}
          </View>
          {ownAddress ? (
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('fieldService.form.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              maxLength={255}
            />
          ) : (
            <Text style={styles.echo}>
              {groupPlace || t('fieldService.template.rule.noGroupPlace')}
            </Text>
          )}
        </>
      ) : (
        <>
          <View style={styles.chipWrap}>
            {halls.map((h) =>
              chip(h.id, h.name, address.trim() === h.address, () => setAddress(h.address)),
            )}
          </View>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder={t('fieldService.form.addressPlaceholder')}
            placeholderTextColor="#94a3b8"
            maxLength={255}
          />
        </>
      )}

      <Text style={styles.label}>{t('fieldService.sheet.whoLeads')}</Text>
      <View style={styles.listCard}>
        {(
          [
            ...(serviceGroupId ? (['group_overseer'] as ConductorRule[]) : []),
            'rotation',
            'none',
          ] as ConductorRule[]
        ).map((r, i, all) => {
          const on = conductorRule === r;
          return (
            <Pressable
              key={r}
              onPress={() => setConductorRule(r)}
              style={[styles.option, on && styles.optionOn, i === all.length - 1 && styles.optionLast]}
              accessibilityState={{ selected: on }}
            >
              <Text style={styles.optionTitle}>{t(`fieldService.template.conductorRule.${r}`)}</Text>
              <Text style={styles.optionSub}>{t(`fieldService.template.conductorRuleHint.${r}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  phraseBox: { marginTop: 12, backgroundColor: '#e0f2fe', borderRadius: 12, padding: 12 },
  phraseText: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0c4a6e' },
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#64748b', marginTop: 16, marginBottom: 8 },
  subLabel: { fontSize: 12.5, color: '#64748b', marginTop: 8, marginBottom: 6, fontFamily: 'Manrope_500Medium' },
  inlineLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#64748b' },
  dayRow: { flexDirection: 'row', gap: 4 },
  dayChip: { flex: 1, paddingHorizontal: 0, alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    minHeight: 40,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: '#0369a1', borderColor: '#0369a1' },
  chipDashed: { borderStyle: 'dashed' },
  chipText: { fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  chipTextOn: { color: '#ffffff', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  segmentTrack: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#e9eef4', borderRadius: 12, padding: 3, gap: 3 },
  segment: { flexGrow: 1, flexBasis: '30%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 6 },
  segmentOn: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  segmentTextOn: { color: '#0f172a', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 8,
    fontFamily: 'Manrope_500Medium',
  },
  echo: { fontSize: 13.5, color: '#64748b', marginTop: 8, fontFamily: 'Manrope_500Medium' },
  listCard: { borderWidth: 1, borderColor: '#dbe3ea', borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' },
  option: { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  optionOn: { backgroundColor: '#e0f2fe' },
  optionLast: { borderBottomWidth: 0 },
  optionTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  optionSub: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  footer: { gap: 8 },
  hint: { fontSize: 12.5, color: '#b45309', fontFamily: 'Manrope_500Medium' },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#ffffff' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#334155', fontFamily: 'Manrope_600SemiBold' },
  dangerBtn: { borderColor: '#fecaca' },
  dangerBtnText: { color: '#b91c1c' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  saveBtnOff: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
});
