import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../env.ts";
import { GitHubError, type GitHubCredentials } from "./github.ts";

const credentialsSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).nullable(),
    expiresAt: z.number().int().positive().nullable(),
    refreshExpiresAt: z.number().int().positive().nullable(),
  })
  .strict();

function key(): Buffer {
  const bytes = Buffer.from(env.GITHUB_TOKEN_ENCRYPTION_KEY, "base64");
  if (bytes.length !== 32)
    throw new GitHubError(503, "github_credentials_unavailable", "GitHub credentials unavailable");
  return bytes;
}

export function encryptGitHubCredentials(userId: string, credentials: GitHubCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`mokara:github:${userId}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentialsSchema.parse(credentials))),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptGitHubCredentials(userId: string, encrypted: string): GitHubCredentials {
  try {
    const [version, nonce, tag, ciphertext, extra] = encrypted.split(".");
    if (version !== "v1" || !nonce || !tag || !ciphertext || extra !== undefined) throw new Error();
    const iv = Buffer.from(nonce, "base64url");
    const authTag = Buffer.from(tag, "base64url");
    if (iv.length !== 12 || authTag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(Buffer.from(`mokara:github:${userId}`));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]);
    return credentialsSchema.parse(JSON.parse(plaintext.toString("utf8")));
  } catch {
    throw new GitHubError(503, "github_credentials_unavailable", "GitHub credentials unavailable");
  }
}
