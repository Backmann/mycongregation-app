import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { routeOf, screenAllowed } from '../lib/screen-access';
import { NoAccess } from './NoAccess';
import { LoadFailure } from './LoadFailure';
import { ScreenFailureBoundary } from './ScreenFailure';
import { SIDE_NAV_FROM, TAB_ROOTS, WIDE_FROM, screenMaxWidth } from '../lib/screen-width';
import { BRAND } from '../lib/header';

/**
 * The check that stands before every screen of a stack.
 *
 *   <Stack screenOptions={…} screenLayout={screenGate('/tasks')}>
 *
 * It asks lib/screen-access whether this person may stand on this screen. If
 * not, the screen is never mounted — none of its requests are sent — and
 * NoAccess is drawn under the screen's own header, so the way back is where
 * it always is.
 *
 * While the list of responsibilities is still arriving, a person who would be
 * refused is shown nothing rather than a refusal: for a brother whose right
 * comes from a responsibility, «no» a moment before «yes» would be a flash of
 * a wrong answer.
 */
function Gate({
  route,
  children,
}: {
  route: string;
  children: React.ReactElement;
}) {
  const perms = usePermissions();
  const { user, retryConnection } = useAuth();
  const queryClient = useQueryClient();
  if (screenAllowed(route, perms, user)) {
    return <ScreenFailureBoundary>{children}</ScreenFailureBoundary>;
  }
  if (!perms.loaded) return <View style={styles.fill} />;
  // The list of responsibilities did not arrive (9 October 2026): «no
  // access» would be a guess, and for a brother whose right comes from a
  // responsibility a wrong one. Said as what it is.
  if (perms.failed) {
    return (
      <View style={[styles.fill, styles.failed]} testID="screen-load-failed">
        <LoadFailure
          error={queryClient.getQueryState(['responsibilities'])?.error}
          onRetry={() => {
            retryConnection();
            void queryClient.refetchQueries({ queryKey: ['responsibilities'] });
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.fill}>
      <NoAccess />
    </View>
  );
}

/**
 * A phone on its side: the system buttons (or the camera cut-out) stand at
 * the left or right edge, and edge-to-edge the app draws under them. The
 * header and the tab bar step aside by themselves — the libraries read the
 * insets (react-native-screens CustomToolbar, BottomTabBar) — but every
 * screen's own content ran on underneath: on the right it went under the
 * system buttons (Lionel's phone, 28 September 2026; on the stand, with the
 * insets emulated, the filter button and every row's «›» — 9 October).
 *
 * One place for every screen: each stands under this frame, which keeps its
 * content out of the side insets. Always drawn — zero in portrait — so that
 * turning the phone does not rebuild the screen and lose what was typed.
 */
type HeaderOptions = {
  title?: string;
  headerTitle?: unknown;
  headerLeft?: (p: { canGoBack: boolean; tintColor?: string }) => React.ReactNode;
  headerRight?: (p: { canGoBack: boolean; tintColor?: string }) => React.ReactNode;
};
type Nav = { setOptions: (o: Record<string, unknown>) => void; canGoBack: () => boolean; goBack: () => void };

/**
 * THE PAGE'S OWN HEADING on a computer and an iPad on its side (22 October
 * 2026, mockup «Ширина экранов»). Beside the side menu the teal bar across
 * the top is gone: the screen's title stands in its column, large, where the
 * eye already is, with the way back before it and the screen's actions after
 * it. The actions are the header's own (white on the brand colour), so they
 * keep that ground as a small teal block — nothing in thirty screens changes.
 */
function PageHeader({ options, navigation, root }: { options: HeaderOptions; navigation: Nav; root: boolean }) {
  const { t } = useTranslation();
  const canGoBack = navigation.canGoBack();
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : (options.title ?? '');
  // A tab's first screen: its mark stood at the left of the bar; the side
  // menu carries the brand now.
  const left = root
    ? null
    : options.headerLeft !== undefined ? (
      options.headerLeft({ canGoBack, tintColor: '#ffffff' })
    ) : canGoBack ? (
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()} style={{ paddingHorizontal: 12 }}>
        <Ionicons name="chevron-back" size={28} color="#ffffff" />
      </Pressable>
    ) : null;
  const right = options.headerRight?.({ canGoBack, tintColor: '#ffffff' }) ?? null;
  return (
    <View style={styles.pageHeader} testID="page-header">
      {left ? <View style={styles.chip}>{left}</View> : null}
      <Text style={styles.pageTitle} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {right ? <View style={[styles.chip, styles.chipRight]}>{right}</View> : null}
    </View>
  );
}

function SideInsets({
  children,
  route,
  options,
  navigation,
  root,
}: {
  children: React.ReactNode;
  route: string;
  root: boolean;
  options: HeaderOptions;
  navigation: Nav;
}) {
  const { left, right } = useSafeAreaInsets();
  // ONE WIDTH RULE (lib/screen-width.ts): on an iPad or a computer the
  // screen stands in a centred column of its kind; a phone is untouched.
  // The column is always drawn, only its limit changes, so turning an iPad
  // does not rebuild the screen.
  const { width } = useWindowDimensions();
  const max = width >= WIDE_FROM ? screenMaxWidth(route) : null;
  // In a browser beside the side menu the page carries its own heading; the
  // native app and narrower windows keep the bar.
  const pageHeading = Platform.OS === 'web' && width >= SIDE_NAV_FROM;
  React.useEffect(() => {
    navigation.setOptions({ headerShown: !pageHeading });
  }, [navigation, pageHeading]);
  return (
    <View style={[styles.frame, { paddingLeft: left, paddingRight: right }]} testID="side-insets">
      <View style={[styles.column, max !== null && styles.columnWide, max !== null && { maxWidth: max }]}>
        {pageHeading ? <PageHeader options={options} navigation={navigation} root={root} /> : null}
        {children}
      </View>
    </View>
  );
}

type ScreenLayout = (props: {
  children: React.ReactElement;
  route: { name: string };
  options: object;
  navigation: unknown;
}) => React.ReactElement;

/**
 * One layout per stack, made once. A layout made anew on every render would
 * be a new component each time, and React would throw every screen away and
 * mount it again — losing whatever had been typed into it.
 */
const made = new Map<string, ScreenLayout>();

export function screenGate(base: string): ScreenLayout {
  let layout = made.get(base);
  if (!layout) {
    layout = function ScreenLayout({ children, route, options, navigation }) {
      const path = routeOf(base, route.name);
      return (
        <SideInsets route={path} options={options as HeaderOptions} navigation={navigation as Nav} root={TAB_ROOTS.has(path)}>
          <Gate route={path}>{children}</Gate>
        </SideInsets>
      );
    };
    made.set(base, layout);
  }
  return layout;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#f1f5f9' },
  frame: { flex: 1, backgroundColor: '#f1f5f9' },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  // A gutter of its own, so a screen that draws edge to edge does not touch
  // the side menu or the window's edge.
  columnWide: { paddingHorizontal: 16 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 26,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  pageTitle: {
    flex: 1,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.4,
    color: '#0f1c24',
  },
  chip: {
    backgroundColor: BRAND,
    borderRadius: 12,
    minHeight: 42,
    justifyContent: 'center',
  },
  chipRight: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  failed: { paddingTop: 24 },
});
