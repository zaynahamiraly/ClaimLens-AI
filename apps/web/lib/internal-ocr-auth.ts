import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

function getSigningSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Internal OCR signing is not configured.");
  return secret;
}

export function signInternalOcrRequest(body: string, timestamp: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function verifyInternalOcrRequest(body: string, timestamp: string, signature: string) {
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_REQUEST_AGE_MS) return false;

  const expected = signInternalOcrRequest(body, timestamp);
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(signature, "hex");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
