/**
 * Internal: decode a SubjectPublicKeyInfo PEM to the raw 32-byte Ed25519
 * public key. Kept private to the `commands/` directory because the
 * public surface for callers is `pemToRawEd25519SecretKey` (for the
 * publisher signing path); this helper is for the verify command only.
 */

export function pemToRawEd25519PublicKey(pem: string): Uint8Array {
  const begin = "-----BEGIN PUBLIC KEY-----";
  const end = "-----END PUBLIC KEY-----";
  const startIdx = pem.indexOf(begin);
  const endIdx = pem.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error("PEM missing PUBLIC KEY markers");
  }
  const body = pem.slice(startIdx + begin.length, endIdx).replace(/\s+/g, "");
  const der = base64ToBytes(body);
  // SubjectPublicKeyInfo's BIT STRING with 0x00 unused-bits prefix; the
  // last 32 bytes are the raw Ed25519 public key.
  if (der.length < 32) {
    throw new Error(`SPKI PEM too short for Ed25519: ${der.length} bytes`);
  }
  return der.slice(der.length - 32);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
