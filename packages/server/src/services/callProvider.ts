import { getProvider, defaultModel } from './provider.js';
import type { GenerateParams } from './provider.js';

export interface CallProviderOptions {
  mode: 'consult' | 'architect' | 'design';
  prompt: string;
  systemInstruction?: string;
  history?: Array<{ role: 'user' | 'model'; parts: string }>;
  streaming?: boolean;
  /** Override the model ID. Defaults to `defaultModel()` from provider settings. */
  model?: string;
}

const MODE_SYSTEM_PROMPT: Record<CallProviderOptions['mode'], string> = {
  consult: 'You are a UI design consultant. Help clarify requirements before generating code.',
  architect: 'You are a UI architect. Propose page-graph structures.',
  design: `You are a Vue 3 + Tailwind CSS UI designer. You can generate one OR multiple pages.

For each page, wrap it in an artifact tag:
<artifact kind="vue-sfc" name="page-name-in-kebab-case">
<template>
  <!-- Tailwind-styled template, NO external images, NO <script setup> -->
</template>
<style scoped>
/* minimal additional styles */
</style>
</artifact>

When the user asks for a complete website or multiple pages:
1. First briefly list the pages you'll generate (1-2 sentences)
2. Then output each page as a separate <artifact> block
3. Make each page self-contained and visually complete

When modifying an existing page, output just that one artifact.
Do NOT use <script setup>. Use Tailwind classes for all styling.`,
};

const THINKING_INSTRUCTION = `
Before your main response, write a brief reasoning section enclosed in <thinking>...</thinking> tags.
Then write your actual response. Both will be shown to the user, but the thinking is rendered as auxiliary content.
`.trim();

/** Resolve the model to use. Falls back to `gemini-2.5-flash` when the
 *  provider has not been initialised (e.g. in unit tests where `getProvider`
 *  is mocked but `initProvider` is not called). */
function resolveModel(override?: string): string {
  if (override) return override;
  try {
    return defaultModel();
  } catch {
    return 'gemini-2.5-flash';
  }
}

export async function* callProvider(opts: CallProviderOptions): AsyncIterable<string> {
  const provider = getProvider();
  const baseSystem = MODE_SYSTEM_PROMPT[opts.mode];
  const userSystem = opts.systemInstruction ?? '';
  const systemInstruction = [baseSystem, userSystem, THINKING_INSTRUCTION].filter(Boolean).join('\n\n');

  const params: GenerateParams = {
    model: resolveModel(opts.model),
    prompt: opts.prompt,
    systemInstruction,
    history: opts.history,
  };

  if (opts.streaming !== false) {
    for await (const tok of provider.streamContent(params)) {
      yield tok;
    }
  } else {
    const res = await provider.generateContent(params);
    yield res.text;
  }
}
