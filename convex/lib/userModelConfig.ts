import type { AiErrorCode } from "./aiErrorCodes";
import { decryptApiKey } from "./aiKeyCrypto";
import {
  AiSettingsError,
  resolveAiModelConfig,
  type AiModelConfig,
  type AiProvider,
} from "./aiModel";

export type StoredAiSettings = {
  provider: AiProvider;
  model?: string;
  keyCiphertext: string;
  keyIv: string;
  unreadableAt?: number;
};

export type UserModelResult =
  | { kind: "ready"; config: AiModelConfig }
  | { kind: "aiFailure"; code: AiErrorCode };

/** The model configuration for a user's saved settings, or why there is none. */
export async function userModelConfig(
  row: StoredAiSettings | null,
  rawSecret: string | undefined,
  userId: string,
): Promise<UserModelResult> {
  if (row === null) return { kind: "aiFailure", code: "ai_key_missing" };
  if (row.unreadableAt !== undefined) return { kind: "aiFailure", code: "ai_key_unreadable" };
  try {
    const apiKey = await decryptApiKey(rawSecret, row, { userId, provider: row.provider });
    return {
      kind: "ready",
      config: resolveAiModelConfig({ provider: row.provider, model: row.model, apiKey }),
    };
  } catch (error) {
    if (error instanceof AiSettingsError) return { kind: "aiFailure", code: error.code };
    throw error;
  }
}
