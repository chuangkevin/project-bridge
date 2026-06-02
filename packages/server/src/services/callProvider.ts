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
  design: `You are a Vue 3 + Tailwind CSS UI designer.

IMPORTANT: Always wrap your Vue SFC output in an artifact tag exactly like this:
<artifact kind="vue-sfc" name="page-name">
<template>
  <!-- your template here -->
</template>

<style scoped>
/* your styles here */
</style>
</artifact>

Use Tailwind utility classes. Do NOT use <script setup> — keep it template-only or use simple <script> with Options API if needed. Do NOT use external images.`,
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
