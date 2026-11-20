import type { ReactNode } from "react";

/**
 * The panel is a computer's (see PanelPortal.web.tsx); on a phone there is no
 * host, and the window stays where it is.
 */
export function PanelPortal({
  children,
}: {
  host: unknown;
  children: ReactNode;
}) {
  return <>{children}</>;
}
