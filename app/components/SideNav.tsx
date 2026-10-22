import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import BrandLockup from './BrandLockup';
import { HeaderCongregation } from './HeaderCongregation';

/**
 * THE TABS AS A SIDE MENU (22 October 2026, mockup «Ширина экранов: iPad и
 * компьютер», approved by Lionel).
 *
 * From lib/screen-width SIDE_NAV_FROM (an iPad on its side, a computer) the
 * five tabs stand down the left edge with their names beside them, and the
 * screens get the height the bottom bar took. Below that the bottom bar
 * stays, as people know it on a phone and an iPad held upright.
 *
 * The same tabs, the same order, the same rules as the bottom bar: a hidden
 * section lights the tab it belongs to (`litIndex`, from the app layout's
 * PARENT_TAB), and a press goes through the navigator's own tabPress event,
 * so the layout's listener (back to the section's first screen) runs as it
 * does for the bar.
 */
export const SIDE_NAV_WIDTH = 232;

const C = {
  ground: '#0f4c5c',
  text: '#cfe7ec',
  textOn: '#0f4c5c',
  soft: '#a8d3dc',
  line: '#2a6676',
  on: '#ffffff',
};

export function SideNav({
  state,
  descriptors,
  navigation,
  litIndex,
}: BottomTabBarProps & { litIndex: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[s.nav, { paddingTop: 20 + insets.top, paddingBottom: 12 + insets.bottom, paddingLeft: 14 + insets.left }]}
      accessibilityRole="tablist"
      aria-label={t('tabs.menu')}
    >
      <View style={s.brand}>
        <BrandLockup mark={30} markOnly tone="dark" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <HeaderCongregation size={15} leading />
        </View>
      </View>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        // Hidden sections (href: null) are not tabs.
        const hidden =
          (options as { href?: unknown }).href === null ||
          (options.tabBarItemStyle as { display?: string } | undefined)?.display === 'none' ||
          options.tabBarButton !== undefined;
        if (hidden) return null;
        const on = i === litIndex;
        const color = on ? C.textOn : C.text;
        const press = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented && (!on || state.index !== i)) {
            navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
          }
        };
        return (
          <Pressable
            key={route.key}
            onPress={press}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={(st) => [s.item, on ? s.itemOn : (st as { hovered?: boolean }).hovered ? s.itemHover : null]}
          >
            {options.tabBarIcon?.({ focused: on, color, size: 22 })}
            <Text style={[s.label, { color }, on && s.labelOn]} numberOfLines={1}>
              {typeof options.title === 'string' ? options.title : route.name}
            </Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      {user ? (
        <View style={s.who}>
          <Text style={s.whoName} numberOfLines={1}>
            {user.loginName ?? user.email ?? ''}
          </Text>
          <Text style={s.whoRole} numberOfLines={1}>
            {t(`profile.roles.${user.role}`, { defaultValue: user.role })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  nav: {
    width: SIDE_NAV_WIDTH,
    backgroundColor: C.ground,
    paddingRight: 14,
    gap: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 22 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemOn: { backgroundColor: C.on },
  itemHover: { backgroundColor: 'rgba(255,255,255,0.08)' },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 15 },
  labelOn: { fontFamily: 'Manrope_800ExtraBold' },
  who: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, paddingHorizontal: 8, gap: 2 },
  whoName: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#ffffff' },
  whoRole: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: C.soft },
});
