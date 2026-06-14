import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{t('schedule.publishDialog.title')}</Text>
          <Text style={styles.subtitle}>
            {t('schedule.publishDialog.subtitle')}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
            disabled={busy}
            onPress={() => onPublish(true)}
          >
            <Text style={styles.primaryText}>
              {t('schedule.publishDialog.notify')}
            </Text>
            <Text style={styles.primaryHint}>
              {t('schedule.publishDialog.notifyHint')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.silentBtn,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
            disabled={busy}
            onPress={() => onPublish(false)}
          >
            <Text style={styles.silentText}>
              {t('schedule.publishDialog.silent')}
            </Text>
            <Text style={styles.silentHint}>
              {t('schedule.publishDialog.silentHint')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            disabled={busy}
            onPress={onCancel}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 6 },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  primaryHint: { color: '#e0f2fe', fontSize: 12, marginTop: 2 },
  silentBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  silentText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  silentHint: { color: '#64748b', fontSize: 12, marginTop: 2 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  cancelText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
