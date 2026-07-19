import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
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
}) {
  const { t } = useTranslation();
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
