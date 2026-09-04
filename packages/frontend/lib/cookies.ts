// Single source of truth for the auth cookie's name. The backend mirrors this
// exact condition in packages/backend/src/lib/jwt.ts (COOKIE_NAME) — a change
// here is a change there, and a prod-built frontend must never be paired with
// a backend running ENV=development.
//
// Production uses the __Host- prefix: browsers then reject the cookie outright
// unless it is Secure, scoped to Path=/, and shared with no parent domain.
// Dev keeps the plain name because the Secure flag cannot store over plain
// http. NODE_ENV is the runtime's value, so it matches the backend's ENV in
// both the dev server and the CI-built standalone artifact.
export const AUTH_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-mokara_token" : "mokara_token";
