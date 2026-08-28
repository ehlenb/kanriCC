import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-CBC encryption for OAuth refresh tokens at rest (recruiter_oauth_tokens).
// OAUTH_ENCRYPTION_KEY must be a stable 32-char string in every environment that
// reads a token it stored -- changing it invalidates existing rows (they must be
// reconnected). Falls back to a dev key when unset.

function encryptionKey(): Buffer {
  const raw = process.env.OAUTH_ENCRYPTION_KEY ?? "kanri-dev-oauth-key-32-chars-pad";
  return Buffer.from(raw.padEnd(32, "0").slice(0, 32));
}

export function encryptToken(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(enc: string): string {
  const [ivHex, encHex] = enc.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", encryptionKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
