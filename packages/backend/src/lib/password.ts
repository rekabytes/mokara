import bcrypt from "bcryptjs";

const COST = 10;

// Hashes are bcrypt $2a$ format — compatible with Go's golang.org/x/crypto/bcrypt,
// so the Go-style seed hashes (also $2a$10$...) verify correctly.
export const hashPassword = (password: string) => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);
