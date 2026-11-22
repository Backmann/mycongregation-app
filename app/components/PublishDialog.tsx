import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

interface Props {
  /** Open when non-null. */
  open: boolean;
  busy?: boolean;
  /** Called with notify=true (notify) or notify=false (silent). */
  onPublish: (notify: boolean) => void;
  onCancel: () => void;
  /**
   * Places still empty in the meeting (R-16, 22 November 2026): publishing
   * stays possible, but not without seeing how many — «Не заполнено 7 мест».
   */
  empty?: number;
}

/**
 * One publish dialog used everywhere a meeting can be published (meeting
 * blocks and planning mode), so the notify/silent choice is identical
 * across the app. Three outcomes: notify, silent, cancel.
 */
export function PublishDialog({ open, busy, onPublish, onCancel, empty = 0 }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog
      visible={open}
      title={t('schedule.publishDialog.title')}
      icon="cloud-upload-outline"
      cancelLabel={t('common.cancel')}
      onCancel={onCancel}
      pending={busy}
    >
      {empty > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [emptyStyles.box, pressed && choiceStyles.pressed]}
        >
          <Text style={emptyStyles.title}>{t('schedule.publishDialog.empty', { count: empty })}</Text>
          <Text style={emptyStyles.link}>{t('schedule.publishDialog.fillFirst')}</Text>
        </Pressable>
      ) : null}
      <Text style={choiceStyles.subtitle}>
        {t('schedule.publishDialog.subtitle')}
      </Text>

      <Pressable
        style={({ pressed }) => [
          choiceStyles.primary,
          pressed && choiceStyles.pressed,
          busy && choiceStyles.disabled,
        ]}
        disabled={busy}
        onPress={() => onPublish(true)}
      >
        <Text style={choiceStyles.primaryText}>
          {t('schedule.publishDialog.notify')}
        </Text>
        <Text style={choiceStyles.primaryHint}>
          {t('schedule.publishDialog.notifyHint')}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          choiceStyles.secondary,
          pressed && choiceStyles.pressed,
          busy && choiceStyles.disabled,
        ]}
        disabled={busy}
        onPress={() => onPublish(false)}
      >
        <Text style={choiceStyles.secondaryText}>
          {t('schedule.publishDialog.silent')}
        </Text>
        <Text style={choiceStyles.secondaryHint}>
          {t('schedule.publishDialog.silentHint')}
        </Text>
      </Pressable>
      <Text style={emptyStyles.note}>{t('schedule.publishDialog.journalNote')}</Text>
    </Dialog>
  );
}

/** A choice inside a dialog: a bold action with a line explaining it. */
export const choiceStyles = StyleSheet.create({
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#475569', lineHeight: 19, marginBottom: 14 },
  primary: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  primaryHint: { fontFamily: 'Manrope_400Regular', color: '#e0f2fe', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondaryText: { color: '#0f172a', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  secondaryHint: { fontFamily: 'Manrope_400Regular', color: '#64748b', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});


const emptyStyles = StyleSheet.create({
  box: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#78350f' },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#b45309', marginTop: 4 },
  note: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 10 },
});
