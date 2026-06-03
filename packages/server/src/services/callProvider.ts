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

CRITICAL RULES:
1. Always wrap your output in ONE artifact tag per page:
   <artifact kind="vue-sfc" name="page-name-in-kebab-case">
   <template>...</template>
   <style scoped>/* optional */</style>
   </artifact>

2. For multi-page websites: generate ONE single-artifact SFC that contains ALL pages
   with WORKING navigation using a simple currentPage variable:

   <artifact kind="vue-sfc" name="full-website">
   <template>
     <div>
       <!-- Navigation -->
       <nav>
         <button @click="currentPage='home'">首頁</button>
         <button @click="currentPage='about'">關於</button>
       </nav>
       <!-- Pages -->
       <div v-if="currentPage==='home'"><!-- home content --></div>
       <div v-if="currentPage==='about'"><!-- about content --></div>
     </div>
   </template>
   <script>
   export default {
     data() { return { currentPage: 'home' } }
   }
   </script>
   </artifact>

3. ALL buttons, links, and navigation MUST be interactive with @click handlers.
   Use v-if/v-show to switch between pages. NO dead buttons.
4. Use Tailwind classes. NO <script setup>. NO external images.
5. When modifying an existing design, output just the updated artifact.`,
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
  // Design mode: skip the thinking instruction — the AI should focus on generating
  // the artifact directly. Thinking in design mode causes the UI to show "推理中..."
  // for a long time before the artifact appears, which looks broken.
  const thinkingInstr = opts.mode === 'design' ? '' : THINKING_INSTRUCTION;
  const systemInstruction = [baseSystem, userSystem, thinkingInstr].filter(Boolean).join('\n\n');

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
