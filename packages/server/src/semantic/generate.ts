import { getProvider, withJsonInstruction, defaultModel } from '../services/provider';

/** Injectable AI call: takes a system + user prompt, returns the model's RAW text. */
export type GenerateFn = (args: {
  systemInstruction: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
}) => Promise<string>;

/** Default GenerateFn — provider with JSON-only instruction; returns raw text (caller repairs). */
export const defaultGenerate: GenerateFn = async ({ systemInstruction, prompt, model, maxOutputTokens }) => {
  const resp = await getProvider().generateContent({
    model: model ?? defaultModel(),
    systemInstruction: withJsonInstruction(systemInstruction),
    prompt,
    maxOutputTokens: maxOutputTokens ?? 65536,
  });
  return resp.text;
};
