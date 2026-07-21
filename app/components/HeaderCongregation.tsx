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
export function HeaderCongregation({ compact }: { compact?: boolean }) {
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
        paddingRight: compact ? 10 : 16,
        paddingLeft: 8,
        // Never squeeze the wordmark: this side gives way first.
        flexShrink: 1,
        maxWidth: compact ? 140 : 220,
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={1.2}
        style={{
          fontFamily: 'Manrope_600SemiBold',
          fontSize: compact ? 12 : 13,
          textAlign: 'right',
          // Deliberately quieter than the wordmark: it names the congregation
          // without competing with the brand it sits next to.
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        {name}
      </Text>
    </View>
  );
}
