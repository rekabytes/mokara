export const PASSWORD_MIN_CHARACTERS = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_GUIDANCE =
  "At least 8 characters, up to 72 bytes. Symbols and emoji may use more than one byte.";

const encoder = new TextEncoder();

/** New passwords only. Never trim, normalize or truncate a password. */
export function newPasswordError(password: string): string | null {
  if (Array.from(password).length < PASSWORD_MIN_CHARACTERS) {
    return "Use at least 8 characters for your password.";
  }
  if (encoder.encode(password).byteLength > PASSWORD_MAX_BYTES) {
    return "Password is too long. Use up to 72 bytes; symbols and emoji may use more than one byte.";
  }
  return null;
}
