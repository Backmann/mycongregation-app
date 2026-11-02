import { useWindowDimensions } from 'react-native';
import { WIDE_FROM } from './screen-width';

/**
 * How a stand sheet opens (2 November 2026): from the bottom edge on a
 * phone, in the middle on a wide screen — at 1917 points a bottom sheet ran
 * the whole window, over the side menu, with its time bars a metre long.
 * The same rule as the attendance and hours sheets.
 */
export function useCartSheetVariant(): 'bottom' | 'centered' {
  return useWindowDimensions().width >= WIDE_FROM ? 'centered' : 'bottom';
}
