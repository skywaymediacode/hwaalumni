export const sessionCookieName = "__Host-hwa_session";
export const csrfCookieName = "__Host-hwa_csrf";
export const gateCookieName = "hwa_gate_ritual";

export function sessionCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: maxAgeSeconds };
}

export function csrfCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: maxAgeSeconds };
}
