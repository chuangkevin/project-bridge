import { getProvider, defaultModel } from './provider.js';
import type { GenerateParams } from './provider.js';
import { readSkill } from './skillRegistry.js';

/** Art-director knowledge: the embedded frontend-design skill body, loaded once.
 *  Every design-mode generation carries it so the AI acts as a 美術 agent with
 *  real design-quality standards instead of generic AI aesthetics. */
let frontendDesignSkillCache: string | null | undefined;
export function frontendDesignSkillBody(): string {
  if (frontendDesignSkillCache !== undefined) return frontendDesignSkillCache ?? '';
  try {
    frontendDesignSkillCache = readSkill('frontend-design')?.body ?? null;
  } catch {
    // skill registry not initialised (unit tests) — degrade gracefully
    frontendDesignSkillCache = null;
  }
  return frontendDesignSkillCache ?? '';
}

export interface ProviderCallMeta {
  /** Provider that actually served the call (e.g. "opencode", "gemini"). */
  provider: string;
  /** Model that actually served the call. */
  model: string;
  /** Model the caller asked for (after default resolution). */
  requestedModel: string;
  /** True when the serving model differs from the requested model — i.e. a
   *  cross-model fallback degraded the request. Provider switches that keep
   *  the same model are legitimate configured routes and not flagged. */
  fallback: boolean;
  credentialRef?: string;
}

export interface CallProviderOptions {
  mode: 'consult' | 'architect' | 'design' | 'element-edit' | 'replicate';
  prompt: string;
  systemInstruction?: string;
  history?: Array<{ role: 'user' | 'model'; parts: string }>;
  streaming?: boolean;
  /** Override the model ID. Defaults to `defaultModel()` from provider settings. */
  model?: string;
  /** Inline images riding the generation call (replicate mode). */
  images?: Array<{ type: 'inline'; mimeType: string; data: string }>;
  /** Fired once with the actual routing selection before tokens flow. */
  onMeta?: (meta: ProviderCallMeta) => void;
}

const MODE_SYSTEM_PROMPT: Record<CallProviderOptions['mode'], string> = {
  consult: 'You are a UI design consultant. Help clarify requirements before generating code.',
  architect: `You are a UI architect. When the user asks you to design a website structure or page flow, output a page-graph artifact in this EXACT format:

<artifact kind="page-graph" name="site-map">
{"version":1,"nodes":[{"id":"home","label":"首頁","type":"page","description":"主要入口頁面"},{"id":"about","label":"關於","type":"page","description":"品牌介紹"}],"edges":[{"source":"home","target":"about","label":"點選關於"}]}
</artifact>

RULES:
- ALWAYS output a page-graph artifact, never plain text only
- node id must be kebab-case, label in user's language (繁體中文)
- edges describe how users navigate between pages
- include 3-8 pages typical for the requested site type
- after the artifact, briefly explain the structure in 2-3 sentences`,
  design: `You are a Vue 3 + Tailwind CSS UI designer.

CRITICAL RULES:
1. ALWAYS output EXACTLY ONE <artifact> tag total. Never output multiple artifacts.
   Wrap everything in one:
   <artifact kind="vue-sfc" name="descriptive-name">
   <template>...</template>
   <script>...</script>
   </artifact>

2. For multi-page websites: put ALL pages inside ONE single artifact
   with WORKING navigation using a currentPage data property:

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
  'element-edit': `You are editing exactly ONE element of an existing Vue 3 + Tailwind page.

CRITICAL RULES:
1. Output ONLY the updated element as a single root element inside one \`\`\`html code fence.
2. NO <artifact> tags, NO <script>, NO <style>, NO explanations outside the fence.
3. Keep every Vue directive (v-if / v-for / v-show / @click / :class / {{ }}) intact
   unless the instruction explicitly asks to change it.
4. Use Tailwind classes consistent with the provided element and style context.
5. Do not invent content the instruction did not ask for — this is surgery, not redesign.`,
  replicate: `You are a pixel-faithful UI replicator. The user provided a design (image and/or crawled page source). Reproduce it as Vue 3 + Tailwind, AS CLOSE TO THE ORIGINAL AS POSSIBLE.

CRITICAL RULES:
1. FIDELITY FIRST: clone the layout, spacing, alignment, typography scale, exact colors
   (use the provided hex values / sampled pixel colors), border radii, and shadows.
   Do NOT "improve", restyle, or reinterpret the design. 照抄就是照抄。
2. ALWAYS output EXACTLY ONE <artifact> tag total:
   <artifact kind="vue-sfc" name="descriptive-name">
   <template>...</template>
   <script>...</script>
   </artifact>
3. Use Tailwind classes (arbitrary values like w-[372px] / text-[#1a2b3c] are encouraged
   for fidelity). NO <script setup>. Replace external images with neutral placeholder
   blocks of the SAME dimensions (bg-slate-200 + centered label).
4. Reproduce ALL visible text verbatim. Keep the original language of the source.
5. Interactive elements must at least be visually identical; behavior can be minimal.`,
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
  const artifactModes = new Set(['design', 'element-edit', 'replicate']);
  const thinkingInstr = artifactModes.has(opts.mode) ? '' : THINKING_INSTRUCTION;
  // Design mode: inject the frontend-design skill so generation follows
  // art-director-level aesthetics (bold direction, distinctive typography,
  // intentional color, no generic AI design).
  const artDirectorBlock = opts.mode === 'design' ? frontendDesignSkillBody() : '';
  const systemInstruction = [baseSystem, artDirectorBlock, userSystem, thinkingInstr].filter(Boolean).join('\n\n');

  const requestedModel = resolveModel(opts.model);
  const params: GenerateParams = {
    model: requestedModel,
    prompt: opts.prompt,
    systemInstruction,
    history: opts.history,
    ...(opts.images && opts.images.length > 0 ? { images: opts.images } : {}),
  };

  const emitMeta = (selection: { provider: string; model: string; credentialRef?: string }): void => {
    opts.onMeta?.({
      provider: selection.provider,
      model: selection.model,
      requestedModel,
      fallback: selection.model !== requestedModel,
      credentialRef: selection.credentialRef,
    });
  };

  if (opts.streaming !== false) {
    // streamWithSelection resolves the route eagerly and ai-core performs no
    // mid-stream candidate fallback, so this selection is the serving one.
    const routed = provider.streamWithSelection(params);
    emitMeta(routed.selection);
    for await (const tok of routed.stream) {
      yield tok;
    }
  } else {
    const exec = await provider.generateWithSelection(params);
    emitMeta(exec.selection);
    yield exec.response.text;
  }
}
