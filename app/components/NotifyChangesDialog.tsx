import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { choiceStyles } from './PublishDialog';

interface Props {
  open: boolean;
  busy?: boolean;
  /** Called with notify=true (send push) or notify=false (apply silently). */
  onConfirm: (notify: boolean) => void;
  onCancel: () => void;
}

/**
 * Shown when a scheduler edits an already-published programme. Three
 * outcomes: notify the congregation, apply the changes silently (no push),
 * or cancel.
 */
export function NotifyChangesDialog({ open, busy, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog
      visible={open}
      title={t('schedule.notifyChanges.dialog.title')}
      icon="notifications-outline"
      cancelLabel={t('common.cancel')}
      onCancel={onCancel}
      pending={busy}
    >
      <Text style={choiceStyles.subtitle}>
        {t('schedule.notifyChanges.dialog.subtitle')}
      </Text>

      <Pressable
        style={({ pressed }) => [
          choiceStyles.primary,
          pressed && choiceStyles.pressed,
          busy && choiceStyles.disabled,
        ]}
        disabled={busy}
        onPress={() => onConfirm(true)}
      >
        <Text style={choiceStyles.primaryText}>
          {t('schedule.notifyChanges.dialog.confirm')}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          choiceStyles.secondary,
          pressed && choiceStyles.pressed,
          busy && choiceStyles.disabled,
        ]}
        disabled={busy}
        onPress={() => onConfirm(false)}
      >
        <Text style={choiceStyles.secondaryText}>
          {t('schedule.notifyChanges.dialog.silent')}
        </Text>
        <Text style={choiceStyles.secondaryHint}>
          {t('schedule.notifyChanges.dialog.silentHint')}
        </Text>
      </Pressable>
    </Dialog>
  );
}

