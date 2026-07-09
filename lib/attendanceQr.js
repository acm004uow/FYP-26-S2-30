import crypto from "crypto";

// The office QR encodes a token derived from a persisted secret + the current minute,
// TOTP-style, so it rotates automatically without any DB write or owner interaction.
export function minuteBucket(offset = 0) {
  return Math.floor(Date.now() / 60000) + offset;
}

export function deriveToken(secret, bucket) {
  return crypto.createHmac("sha256", secret).update(String(bucket)).digest("hex").slice(0, 16);
}
