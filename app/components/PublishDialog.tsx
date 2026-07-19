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
}

/**
 * One publish dialog used everywhere a meeting can be published (meeting
 * blocks and planning mode), so the notify/silent choice is identical
 * across the app. Three outcomes: notify, silent, cancel.
 */
export function PublishDialog({ open, busy, onPublish, onCancel }: Props) {
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
    </Dialog>
  );
}

/** A choice inside a dialog: a bold action with a line explaining it. */
export const choiceStyles = StyleSheet.create({
  subtitle: { fontSize: 13.5, color: '#475569', lineHeight: 19, marginBottom: 14 },
  primary: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  primaryHint: { color: '#e0f2fe', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondaryText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  secondaryHint: { color: '#64748b', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});

