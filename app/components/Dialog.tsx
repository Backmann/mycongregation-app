import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * One shell for every dialog in the app. Before this each screen brought its
 * own — seventeen different sets of styles, so corners, paddings and buttons
 * drifted from window to window. Everything here is optional except the title,
 * so a confirmation and a full form share the same frame.
 */
export function Dialog({
  visible,
  title,
  icon,
  iconTint = '#0ea5e9',
  iconBg = '#e0f2fe',
  children,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  confirmDanger,
  cancelLabel,
  onCancel,
  extraLabel,
  onExtra,
  pending,
  scroll,
}: {
  visible: boolean;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  iconBg?: string;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmDanger?: boolean;
  cancelLabel?: string;
  /** Also runs when the backdrop is tapped or the device back button is used. */
  onCancel: () => void;
  /** A third, quieter action on the left — "clear the plan" and the like. */
  extraLabel?: string;
  onExtra?: () => void;
  pending?: boolean;
  /** For long bodies — keeps the dialog within the screen. */
  scroll?: boolean;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
        />
        <View style={styles.card}>
          <View style={styles.head}>
            {icon ? (
              <View style={[styles.headIcon, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={19} color={iconTint} />
              </View>
            ) : null}
            <Text style={styles.title}>{title}</Text>
          </View>

          <Body style={scroll ? styles.scrollBody : undefined}>{children}</Body>

          {onConfirm || cancelLabel || onExtra ? (
            <View style={styles.actions}>
              {onExtra && extraLabel ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.extra,
                    pressed && styles.pressed,
                  ]}
                  onPress={onExtra}
                  disabled={pending}
                >
                  <Text style={styles.extraText}>{extraLabel}</Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              {cancelLabel ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.cancel,
                    pressed && styles.pressed,
                  ]}
                  onPress={onCancel}
                  disabled={pending}
                >
                  <Text style={styles.cancelText}>{cancelLabel}</Text>
                </Pressable>
              ) : null}
              {onConfirm ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    confirmDanger ? styles.danger : styles.confirm,
                    pressed && styles.pressed,
                    (confirmDisabled || pending) && styles.disabled,
                  ]}
                  onPress={onConfirm}
                  disabled={confirmDisabled || pending}
                >
                  {pending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmText}>{confirmLabel}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    maxHeight: '86%',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  scrollBody: { flexGrow: 0 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    minWidth: 108,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  extra: { minWidth: 0, paddingHorizontal: 4, backgroundColor: 'transparent' },
  extraText: { color: '#b91c1c', fontSize: 14, fontWeight: '600' },
  cancelText: { color: '#334155', fontSize: 14.5, fontWeight: '600' },
  confirm: { backgroundColor: '#0ea5e9' },
  danger: { backgroundColor: '#dc2626' },
  confirmText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
