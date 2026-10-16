import bcrypt from "bcryptjs";
import { newPasswordError } from "./password-policy.ts";

const COST = 10;

// Hashes are bcrypt $2a$ format — compatible with Go's golang.org/x/crypto/bcrypt,
// so the Go-style seed hashes (also $2a$10$...) verify correctly.
export async function hashPassword(password: string): Promise<string> {
  // Defend callers outside HTTP validation too; bcrypt silently truncates otherwise.
  const message = newPasswordError(password);
  if (message) throw new RangeError(message);
  return bcrypt.hash(password, COST);
}

// Keep verification compatible with existing hashes, including older passwords
// longer than bcrypt's input limit. Enforce the new policy only when writing.
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
