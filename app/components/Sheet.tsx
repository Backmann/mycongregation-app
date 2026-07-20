import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * One shell for the sheets that slide up over a screen — pickers, editors and
 * long forms. They are a different animal from the centred Dialog: a person
 * works inside them, so they take the whole screen and close with a single
 * clear action rather than a confirm/cancel pair. Twenty-seven of them each
 * carried their own header and paddings before this.
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  closeLabel,
  children,
  footer,
  variant = 'full',
  action,
}: {
  visible: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Defaults to "Готово" — the sheet is done, not cancelled. */
  closeLabel?: string;
  children: ReactNode;
  /** Pinned under the content, for a save button and the like. */
  footer?: ReactNode;
  /**
   * 'full' takes the whole screen — for pickers and long forms. 'bottom' rises
   * from the edge over the screen behind it, for short ones such as filters.
   */
  variant?: 'full' | 'bottom';
  /** A second header action, e.g. "Reset". */
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  if (variant === 'bottom') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.bottomOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.bottomCard}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <View style={styles.subtitle}>{subtitle}</View>
                ) : null}
              </View>
              {action}
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <Text style={styles.closeText}>
                  {closeLabel ?? t('common.done')}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.bottomScroll}
              contentContainerStyle={styles.bottomBody}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <View style={styles.subtitle}>{subtitle}</View> : null}
          </View>
          {action}
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Text style={styles.closeText}>{closeLabel ?? t('common.done')}</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  bottomCard: {
    backgroundColor: '#f1f5f9',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '86%',
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  // A bottom sheet holds a form or a short list, so its content sits on the
  // same 16px margin the rest of the app uses. Full-screen sheets hold lists
  // that manage their own padding, so they stay flush.
  //
  // The body scrolls and must be allowed to shrink: a View does not shrink by
  // default in this flexbox, so a long form ignored the card's maxHeight and
  // pushed the footer off the bottom of the screen. Because the shell scrolls,
  // the content inside it must not bring its own scroller.
  bottomScroll: { flexShrink: 1 },
  bottomBody: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8edf3',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  subtitle: { marginTop: 2 },
  closeBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  closeText: {
    fontSize: 15,
    color: '#0ea5e9',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8edf3',
  },
});
