/**
 * The push token this phone last registered, kept where both the registration
 * hook and the sign-out can reach it without importing each other.
 */
let current: string | null = null;

export function rememberPushToken(token: string | null): void {
  current = token;
}

export function rememberedPushToken(): string | null {
  return current;
}
