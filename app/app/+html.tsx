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
      </head>
      <body>{children}</body>
    </html>
  );
}
