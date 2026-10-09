import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/permissions';
import { routeOf, screenAllowed } from '../lib/screen-access';
import { NoAccess } from './NoAccess';
import { LoadFailure } from './LoadFailure';
import { ScreenFailureBoundary } from './ScreenFailure';

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

type ScreenLayout = (props: {
  children: React.ReactElement;
  route: { name: string };
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
    layout = function ScreenLayout({ children, route }) {
      return <Gate route={routeOf(base, route.name)}>{children}</Gate>;
    };
    made.set(base, layout);
  }
  return layout;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#f1f5f9' },
  failed: { paddingTop: 24 },
});
