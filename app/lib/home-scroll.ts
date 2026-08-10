import { Animated } from 'react-native';

/**
 * How far the home list has travelled, shared between the screen and its header.
 *
 * The header is rendered by the NAVIGATOR and the list by the SCREEN — two
 * separate components with no parent between them to hold state. A module-level
 * value is the smallest honest way across: there is exactly one home screen and
 * exactly one header above it, so there is nothing to collide with.
 *
 * Driven on the JS side deliberately: the bar's HEIGHT changes as it collapses,
 * and height is not something the native driver can animate. Opacity alone
 * could have gone native, but two drivers for one gesture is how you get a
 * title that lags behind its own background.
 */
export const homeScroll = new Animated.Value(0);
