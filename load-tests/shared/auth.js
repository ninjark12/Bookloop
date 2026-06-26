// shared/auth.js
// Helpers for authenticated requests to Bookloop.
// Better Auth uses a session cookie. Pass AUTH_TOKEN env var
// which is the value of the __Secure-better-auth.session_token cookie.

export function authHeaders() {
  return {
    Cookie: `__Secure-better-auth.session_token=${__ENV.AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export function gatorHeaders() {
  return {
    "X-Api-Key": __ENV.GATOR_API_KEY,
    "Content-Type": "application/json",
  };
}
