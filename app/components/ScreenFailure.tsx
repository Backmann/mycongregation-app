import React from 'react';
import { StyleSheet, View } from 'react-native';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { isRequestError } from '../lib/screen-failure';
import { LoadFailure } from './LoadFailure';

/**
 * Where a screen's main request lands when it could not reach the server
 * (lib/screen-failure.ts): «Не удалось загрузить» and «Повторить» in place of
 * the screen — never the screen's own words for an empty list.
 *
 * Only a request's error is caught here. Anything else thrown while drawing
 * is thrown on, exactly as it was before this boundary existed: a bug must
 * not be dressed up as a lost connection.
 *
 * «Повторить» clears the failed requests (QueryErrorResetBoundary) and draws
 * the screen again, which asks the server again.
 */
class Boundary extends React.Component<
  { onReset: () => void; children: React.ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (!isRequestError(error)) throw error;
    return (
      <View style={styles.fill} testID="screen-load-failed">
        <LoadFailure
          error={error}
          onRetry={() => {
            this.props.onReset();
            this.setState({ error: null });
          }}
        />
      </View>
    );
  }
}

export function ScreenFailureBoundary({ children }: { children: React.ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <Boundary onReset={reset}>{children}</Boundary>}
    </QueryErrorResetBoundary>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#f1f5f9', paddingTop: 24 },
});
