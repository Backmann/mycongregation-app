import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Top-level collapsible container for one meeting (midweek / weekend) in the
 * week view. The header shows the meeting label, its calendar date and an
 * assigned/total progress badge, so gaps are visible even when collapsed.
 * Open/closed state is screen-local and intentionally not persisted.
 */
export function CollapsibleMeetingBlock({
  title,
  meta,
  assigned,
  total,
  actionLabel,
  onAction,
  actionBusy,
  initiallyOpen = false,
  children,
}: {
  title: string;
  meta?: string | null;
  assigned: number;
  total: number;
  /** Header action (e.g. Publish); rendered only when both are set. */
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const complete = total > 0 && assigned === total;
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.actionBtnPressed,
              actionBusy && styles.actionBtnDisabled,
            ]}
            onPress={onAction}
            disabled={!!actionBusy}
          >
            <Text style={styles.actionBtnText}>
              {actionBusy ? '…' : actionLabel}
            </Text>
          </Pressable>
        ) : null}
        <View
          style={[styles.badge, complete ? styles.badgeDone : styles.badgeOpen]}
        >
          <Text
            style={[
              styles.badgeText,
              complete ? styles.badgeTextDone : styles.badgeTextOpen,
            ]}
          >
            {assigned}/{total}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#64748b"
        />
      </Pressable>
      {open && children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerPressed: { backgroundColor: '#f8fafc' },
  actionBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnPressed: { opacity: 0.8 },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  meta: { fontSize: 12, color: '#64748b', marginTop: 1 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeOpen: { backgroundColor: '#fef3c7' },
  badgeDone: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextOpen: { color: '#92400e' },
  badgeTextDone: { color: '#166534' },
});
