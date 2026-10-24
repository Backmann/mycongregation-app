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
        {/* The name under the home-screen icon, set once for the whole site
            before any language is known: the congregation's own word. */}
        {/* cyrillic-ok: see above */}
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
            brand header faded to pale, and the clock was drawn in black.

            Tried on the device with /screen-check.html. «Б» — html AND body
            in the brand colour, the page itself (#root) in its own — made the
            band the header's colour and the clock white. The first attempt
            here gave only html the colour and left body white, to keep what
            the screens stand on: the header stayed pale, so it is the body's
            colour the system reads. This is «Б» exactly: both in the brand
            colour, and #root — which fills the body — white, the same white
            every screen has stood on until now. */}
        {/* AN iPAD THAT FLICKERS FROM ITS ICON (21 October 2026). On iPadOS
            27.0.1 the app opened from the Home Screen flickers — parts of a
            still page blank out and come back — while the same app in a
            Safari tab is fine, and so is /screen-check.html from an icon,
            with the same page height. The cause cannot be seen from here: no
            Safari runs outside an Apple device. So the device is asked.

            /screen-check.html links into the app with `?diag=…`; the choice
            is kept on this device until `?diag=off`, and shown in a corner so
            nobody forgets it is on. Each switch takes away ONE thing that
            only the icon has, or that every list has:
              nolvh — the page height taken from 100lvh (below);
              nobg  — the brand colour behind the page (below);
              no3d  — react-native-web's translateZ(0) on every ScrollView
                      (its atomic class r-agouwx), which makes each list a
                      layer of its own for the compositor.
            Nothing changes for anybody who never follows such a link. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=/[?&]diag=([a-z0-9,]+)/.exec(location.search);if(m){if(m[1]==='off')localStorage.removeItem('diag');else localStorage.setItem('diag',m[1]);}var d=localStorage.getItem('diag');if(d){var h=document.documentElement;h.setAttribute('data-diag',d);d.split(',').forEach(function(x){h.classList.add('diag-'+x);});}}catch(e){}})();",
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html:
              '@media (display-mode: standalone){@supports (-webkit-touch-callout: none){html:not(.diag-nolvh){height:100vh;height:100lvh}html:not(.diag-nobg),html:not(.diag-nobg) body{background:#0e7490}#root{background:#fff}}}' +
              'html.diag-no3d .r-agouwx{transform:none!important}' +
              'html[data-diag]::after{content:"diag: " attr(data-diag);position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1.4 -apple-system,system-ui,sans-serif;background:#7c2d12;color:#fff;padding:2px 6px;border-radius:6px;pointer-events:none}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
