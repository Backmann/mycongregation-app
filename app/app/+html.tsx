import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only document wrapper for the static export. Lets us pin the favicon,
 * apple-touch icon, and theme color to predictable /public URLs so the brand
 * icon is served deterministically (instead of relying on Expo's hashed
 * favicon link).
 *
 * It also links the manifest, and that line is what makes the site an app on
 * an iPhone or iPad. The push machinery has been complete for a long time —
 * the service worker, the subscription, the server — but iOS hands push to a
 * web app ONLY once it has been added to the Home Screen, and it only treats
 * it as an app when a manifest says `display: standalone`. Without the
 * manifest the shortcut opened in a browser chrome and no notification could
 * ever arrive. Android and desktop browsers never needed it, which is why it
 * went unnoticed.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
        <meta name="theme-color" content="#0e7490" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Older iOS reads these rather than the manifest; harmless elsewhere
            and it costs nothing to keep both. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Собрание" />
        <meta name="mobile-web-app-capable" content="yes" />
        <ScrollViewStyleReset />
        {/* THE WHITE STRIP UNDER THE TAB BAR on an iPad or iPhone (3 October
            2026). Opened from the Home Screen with a translucent status bar,
            iOS draws the page from the very top of the screen but gives
            «100%» the height of the screen WITHOUT the status bar — so the
            page ends that much above the bottom edge.

            This is WebKit bug 301108 (iOS 26, still open). What a 13″ iPad
            itself measured on 3 October 2026 (/screen-check.html): screen
            1032, «100%» 1000, 100vh and 100lvh 1032, top inset 32 — and
            100dvh 1344, a number that is simply wrong, so that unit is never
            to size the page. The page therefore takes its height from 100lvh,
            with 100vh for a browser that does not know the unit.

            Only where both conditions hold — a web app on the
            Home Screen, and iOS (nothing else knows -webkit-touch-callout):
            in a browser tab 100vh is TALLER than what is seen, and there the
            rule would push the tab bar under Safari's toolbar. Where iOS has
            no such fault 100vh and 100% are the same number and the rule
            changes nothing — the rule can fail to help, but cannot harm.

            THE WASHED-OUT HEADER, same place, same evening. iOS 26 lays a
            band of its own under the status bar and tints it with the colour
            BEHIND the page — the canvas, which was white: the top of the
            brand header faded to pale, and the clock was drawn in black. With
            the canvas in the brand colour the band is the header's own colour
            and the clock turns white (tried on the device: «Б» on
            /screen-check.html). The body keeps white, exactly what every
            screen has stood on until now, so nothing shows through that did
            not before; the canvas is only what the system looks at. */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              '@media (display-mode: standalone){@supports (-webkit-touch-callout: none){html{height:100vh;height:100lvh;background:#0e7490}body{background:#fff}}}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
