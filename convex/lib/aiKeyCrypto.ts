import { AiSettingsError, type AiProvider } from "./aiModel";

/**
 * Users' AI keys are encrypted with AES-256-GCM under the deployment secret
 * `AI_KEY_ENCRYPTION_SECRET` (32 random bytes as base64). Each key gets a
 * fresh random IV, and the additional authenticated data names the owning
 * user and provider, so a ciphertext copied to another row does not decrypt.
 * Web Crypto is available in both the Convex runtime and Node actions; call
 * these from actions only, where randomness is real.
 */
export const AI_KEY_SCHEME = 1;

export type EncryptedApiKey = { keyCiphertext: string; keyIv: string };

export type ApiKeyContext = { userId: string; provider: AiProvider };

const SECRET_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
let reportedBadSecret = false;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function associatedData({ userId, provider }: ApiKeyContext) {
  return new TextEncoder().encode(`perfectplate:ai-key:v1:${userId}:${provider}`);
}

export function encryptionSecretAvailable(raw: string | undefined) {
  return raw !== undefined && SECRET_PATTERN.test(raw.trim());
}

/** The 32 secret bytes, or AiSettingsError("ai_not_configured"). */
export function parseEncryptionSecret(raw: string | undefined): Uint8Array<ArrayBuffer> {
  if (raw === undefined || !encryptionSecretAvailable(raw)) {
    if (!reportedBadSecret) {
      reportedBadSecret = true;
      console.error("AI_KEY_ENCRYPTION_SECRET is missing or is not 32 bytes of base64");
    }
    throw new AiSettingsError("ai_not_configured");
  }
  return fromBase64(raw.trim());
}

async function importSecret(raw: string | undefined) {
  const secret = parseEncryptionSecret(raw);
  return await crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptApiKey(
  rawSecret: string | undefined,
  apiKey: string,
  context: ApiKeyContext,
): Promise<EncryptedApiKey> {
  const key = await importSecret(rawSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(context) },
    key,
    new TextEncoder().encode(apiKey),
  );
  return { keyCiphertext: toBase64(new Uint8Array(ciphertext)), keyIv: toBase64(iv) };
}

/** The plaintext key; ai_not_configured for a bad secret, ai_key_unreadable otherwise. */
export async function decryptApiKey(
  rawSecret: string | undefined,
  encrypted: EncryptedApiKey,
  context: ApiKeyContext,
): Promise<string> {
  const key = await importSecret(rawSecret);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encrypted.keyIv), additionalData: associatedData(context) },
      key,
      fromBase64(encrypted.keyCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new AiSettingsError("ai_key_unreadable");
  }
}

/** The last four characters, shown to the user to identify a saved key. */
export function apiKeyHint(apiKey: string) {
  return apiKey.slice(-4);
}
