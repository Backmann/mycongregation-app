import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { meetingSettingsApi } from '../lib/api';

/**
 * The congregation's own name, shown at the right of the Home header beside
 * the wordmark — so the front door says both what the app is and whose it is.
 *
 * It comes from the meeting-settings overview, which every signed-in user may
 * read. The name changes about never, so it is cached for the session rather
 * than refetched: this sits in a header that mounts on every visit to Home.
 *
 * While it loads, or if the request fails, nothing is rendered. A header is
 * the wrong place to report a problem — the screen underneath already does
 * that, and an error strip where the brand should be looks like a broken app.
 */
export function HeaderCongregation({
  compact,
  size,
  /**
   * The name IS the title rather than a companion to it.
   *
   * Beside the mark it reads as the heading of the screen, so it leads the row
   * instead of yielding to a wordmark that is no longer there: full white,
   * bolder, aligned left, and free to take the width it needs.
   */
  leading,
}: {
  compact?: boolean;
  /** Matches the wordmark opposite it, so the row reads as one line. */
  size: number;
  leading?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const name = data?.congregation?.name?.trim();
  if (!name) return null;

  return (
    <View
      style={{
        paddingRight: leading ? 0 : compact ? 10 : 16,
        paddingLeft: leading ? 0 : 8,
        // Never squeeze the wordmark: this side gives way first.
        flexShrink: 1,
        maxWidth: leading ? 260 : compact ? 150 : 260,
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={1.2}
        style={{
          // Same size as the wordmark across the row — a smaller size made the
          // line look uneven rather than hierarchical. Weight and a touch of
          // transparency carry the hierarchy instead, so the brand still leads
          // while both ends of the row sit on the same optical baseline.
          fontFamily: leading ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
          fontSize: leading ? size + 2 : size,
          letterSpacing: -0.3,
          textAlign: leading ? 'left' : 'right',
          color: leading ? '#ffffff' : 'rgba(255,255,255,0.9)',
        }}
      >
        {name}
      </Text>
    </View>
  );
}
