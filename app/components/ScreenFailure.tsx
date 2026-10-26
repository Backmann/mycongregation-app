import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../lib/i18n';
import { FONT } from '../lib/typography';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { isRequestError } from '../lib/screen-failure';
import { extractErrorMessage } from '../lib/api';
import { LoadFailure } from './LoadFailure';

/**
 * Where a screen's main request lands when it could not reach the server
 * (lib/screen-failure.ts): «Не удалось загрузить» and «Повторить» in place of
 * the screen — never the screen's own words for an empty list.
 *
 * A request's error reads «Не удалось загрузить». ANYTHING ELSE thrown while
 * drawing is a bug, and is said as one — never dressed up as a lost
 * connection (26 October 2026). It used to be thrown on, and on Android that
 * took the whole app down: on 26 October one screen's «Date value out of
 * bounds» left the phone on an empty dark window for minutes, every other
 * screen with it. Now the bug stays on its own screen: the tabs and the rest
 * of the app keep working, the screen says plainly that it failed, shows
 * the error's words for whoever reports it, and offers «Повторить» and
 * «На главную».
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
    if (!isRequestError(error)) {
      const words = extractErrorMessage(error);
      return (
        <View style={styles.fill} testID="screen-crashed">
          <View style={styles.crash}>
            <Ionicons name="bug-outline" size={30} color="#b45309" />
            <Text style={styles.crashTitle}>{i18n.t('screenCrash.title')}</Text>
            <Text style={styles.crashBody}>{i18n.t('screenCrash.body')}</Text>
            <Text style={styles.crashWords} selectable>
              {words.slice(0, 300)}
            </Text>
            <View style={styles.crashBtns}>
              <Pressable
                style={[styles.crashBtn, styles.crashMain]}
                onPress={() => this.setState({ error: null })}
                accessibilityRole="button"
              >
                <Text style={styles.crashMainText}>{i18n.t('screenCrash.retry')}</Text>
              </Pressable>
              <Pressable
                style={styles.crashBtn}
                onPress={() => {
                  this.setState({ error: null });
                  router.replace('/home' as never);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.crashBtnText}>{i18n.t('screenCrash.home')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }
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
  crash: {
    margin: 16,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    gap: 8,
  },
  crashTitle: { fontFamily: FONT.extrabold, fontSize: 17, color: '#0f172a', textAlign: 'center' },
  crashBody: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: '#475569', textAlign: 'center' },
  crashWords: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 8,
    alignSelf: 'stretch',
  },
  crashBtns: { flexDirection: 'row', gap: 8, marginTop: 6 },
  crashBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
  },
  crashMain: { backgroundColor: '#0f4c5a' },
  crashMainText: { fontFamily: FONT.extrabold, fontSize: 14, color: '#ffffff' },
  crashBtnText: { fontFamily: FONT.extrabold, fontSize: 14, color: '#0f172a' },
});
