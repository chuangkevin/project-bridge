import { describe, it, expect } from 'vitest';
import { splitSfcBlocks, summarizeSfcStructure } from '../sfcSurgeon';

const SFC = `<template>
  <div>
    <nav>
      <button @click="currentPage='home'">首頁</button>
      <button @click="currentPage='about'">關於我們</button>
    </nav>
    <div v-if="currentPage==='home'">
      <h1>歡迎光臨</h1>
      <p v-show="banner && count > 3">促銷中</p>
    </div>
    <div v-if="currentPage==='about'">
      <h2>關於</h2>
      <template v-slot:footer><span>巢狀 template</span></template>
    </div>
  </div>
</template>
<script>
export default { data() { return { currentPage: 'home', banner: true, count: 5 } } }
</script>
<style>
.hero { color: red; }
</style>`;

describe('splitSfcBlocks', () => {
  it('extracts template content and preserves script/style in after', () => {
    const blocks = splitSfcBlocks(SFC);
    expect(blocks).not.toBeNull();
    expect(blocks!.template).toContain('<nav>');
    expect(blocks!.template).toContain('巢狀 template');
    expect(blocks!.template).not.toContain('export default');
    expect(blocks!.after).toContain('<script>');
    expect(blocks!.after).toContain('.hero { color: red; }');
  });

  it('handles nested <template> tags without truncating at the inner close', () => {
    const blocks = splitSfcBlocks(SFC);
    // The inner v-slot template must remain inside the extracted content
    expect(blocks!.template).toContain('<template v-slot:footer>');
    expect(blocks!.template.trimEnd().endsWith('</div>')).toBe(true);
  });

  it('handles attribute values containing > (count > 3)', () => {
    const blocks = splitSfcBlocks(SFC);
    expect(blocks!.template).toContain('count > 3');
  });

  it('returns null when no template block exists', () => {
    expect(splitSfcBlocks('<script>export default {}</script>')).toBeNull();
  });

  it('round-trips: before + template + close reassembles the original', () => {
    const blocks = splitSfcBlocks(SFC)!;
    const reassembled = SFC.slice(0, blocks.templateStart) + blocks.template + SFC.slice(blocks.templateStart + blocks.template.length);
    expect(reassembled).toBe(SFC);
  });
});

describe('summarizeSfcStructure', () => {
  it('lists page branches, interactive elements, and headings', () => {
    const summary = summarizeSfcStructure(SFC);
    expect(summary).toContain("currentPage==='home'");
    expect(summary).toContain("currentPage==='about'");
    expect(summary).toContain('首頁');
    expect(summary).toContain('h1: 歡迎光臨');
    expect(summary).toContain('元素統計');
  });

  it('degrades gracefully for unparseable input', () => {
    expect(summarizeSfcStructure('not an sfc at all')).toContain('無法解析');
  });
});
