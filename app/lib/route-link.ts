/**
 * THE WAY TO A PLACE (19 November 2026, Lionel: «чтобы можно было нажать на
 * адрес и получить маршрут»).
 *
 * The map link the keeper of the event pasted, when there is one and it is a
 * web link; otherwise directions to the address in the phone's own maps
 * (Google Maps, or whatever the phone opens such links with). The user taps
 * it himself; the app sends nothing anywhere.
 */
export function routeLink(
  address: string | null | undefined,
  mapUrl?: string | null,
): string | null {
  const own = mapUrl?.trim();
  if (own && /^https?:\/\//i.test(own)) return own;
  const at = address?.trim();
  if (!at) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}`;
}
