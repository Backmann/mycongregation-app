import type { ReactNode } from "react";

// react-dom ships no types here, and package.json is not to be touched (it
// feeds the Expo fingerprint): the one function used, typed by hand.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require("react-dom") as {
  createPortal: (children: ReactNode, host: Element) => ReactNode;
};

/**
 * A window opened from inside the part panel (variant «В», 20 November 2026)
 * is drawn over the panel, not over the whole screen: the week stays in view
 * while a person is chosen. Web only — the panel exists on a computer.
 */
export function PanelPortal({
  host,
  children,
}: {
  host: HTMLElement;
  children: ReactNode;
}) {
  return createPortal(children, host);
}
