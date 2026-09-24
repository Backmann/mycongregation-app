import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';

export interface HeaderMenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** The icon's colour and its disc behind it, as the section's colour. */
  tint?: string;
  tintBg?: string;
}

/**
 * The secondary actions of a screen's header (23 September).
 *
 * Several actions go behind «…», which opens a sheet of rows — each with its
 * name and a line saying what it is for, because a row of bare icons in a
 * header said nothing: the Programme once carried five of them.
 *
 * ONE action is shown as its own icon instead. A menu of one costs a tap and
 * hides what it holds — both platform guides say not to — and a publisher,
 * who has only the events, opened them in one tap before; he still does. Each
 * person only ever sees their own header, so it differing between a publisher
 * and an elder is not an inconsistency anybody meets.
 */
export function HeaderMenu({
  title,
  items,
  color,
  iconSize = 24,
  pad = 8,
}: {
  /** The sheet's heading — the screen's own name. */
  title: string;
  items: HeaderMenuItem[];
  color: string;
  iconSize?: number;
  pad?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  if (items.length === 0) return null;

  if (items.length === 1) {
    const only = items[0];
    return (
      <Pressable
        onPress={only.onPress}
        style={{ paddingHorizontal: pad }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={only.title}
      >
        <Ionicons name={only.icon} size={iconSize} color={color} />
      </Pressable>
    );
  }

  const choose = (item: HeaderMenuItem) => {
    setOpen(false);
    item.onPress();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ paddingHorizontal: pad }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('schedule.menu.more')}
      >
        <Ionicons name="ellipsis-horizontal" size={iconSize} color={color} />
      </Pressable>
      <Sheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        variant={width >= 900 ? 'centered' : 'bottom'}
      >
        <View style={styles.list}>
          {items.map((item, i) => (
            <Pressable
              key={item.key}
              onPress={() => choose(item)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={[styles.disc, { backgroundColor: item.tintBg ?? '#e0f2fe' }]}>
                <Ionicons name={item.icon} size={21} color={item.tint ?? '#0284c7'} />
              </View>
              <View style={styles.text}>
                <Text style={styles.title}>{item.title}</Text>
                {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 64 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  pressed: { opacity: 0.6 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15.5, color: '#0f172a', fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  subtitle: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
});
