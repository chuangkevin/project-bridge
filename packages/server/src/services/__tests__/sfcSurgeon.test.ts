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

import { locateByPath, validateSubtree, replaceByPath, relatedStyles } from '../sfcSurgeon';

const EDIT_SFC = `<template>
  <div class="app">
    <!-- header comment -->
    <header class="hero">
      <h1>歡迎</h1>
      <button @click="go" :class="btnCls">開始</button>
    </header>
    <main>
      <div v-for="item in items" :key="item.id" class="card">
        <span>{{ item.name }}</span>
        <img :src="item.img" />
      </div>
    </main>
  </div>
</template>
<script>
export default { data() { return { items: [], btnCls: 'primary' } }, methods: { go() {} } }
</script>
<style>
.card { border: 1px solid #eee; }
.hero { background: black; }
.unrelated { color: blue; }
</style>`;

describe('locateByPath / replaceByPath (sfc-element-editing)', () => {
  it('locates by element-child indices, skipping text and comment nodes', () => {
    // [0] = div.app, [0,0] = header (comment skipped), [0,0,1] = button
    const located = locateByPath(EDIT_SFC, [0, 0, 1]);
    expect(located).not.toBeNull();
    expect(located!.tag).toBe('button');
    expect(located!.source).toBe('<button @click="go" :class="btnCls">開始</button>');
  });

  it('locates the v-for template node (repeats share one node)', () => {
    const located = locateByPath(EDIT_SFC, [0, 1, 0]);
    expect(located!.tag).toBe('div');
    expect(located!.source).toContain('v-for="item in items"');
    expect(located!.source).toContain('<img :src="item.img" />');
  });

  it('returns null for out-of-range or invalid paths', () => {
    expect(locateByPath(EDIT_SFC, [0, 9])).toBeNull();
    expect(locateByPath(EDIT_SFC, [])).toBeNull();
    expect(locateByPath(EDIT_SFC, [-1])).toBeNull();
  });

  it('extract→replace with identical snippet is byte-identical (round trip)', () => {
    const located = locateByPath(EDIT_SFC, [0, 1, 0])!;
    const replaced = replaceByPath(EDIT_SFC, [0, 1, 0], located.source);
    expect(replaced.ok).toBe(true);
    expect((replaced as { sfc: string }).sfc).toBe(EDIT_SFC);
  });

  it('replaces only the addressed subtree; everything else byte-identical', () => {
    const snippet = '<button @click="go" class="rounded-full">開始</button>';
    const replaced = replaceByPath(EDIT_SFC, [0, 0, 1], snippet);
    expect(replaced.ok).toBe(true);
    const out = (replaced as { sfc: string }).sfc;
    expect(out).toContain(snippet);
    expect(out).not.toContain(':class="btnCls"');
    // Outside the replaced range: byte-identical prefix and suffix
    const located = locateByPath(EDIT_SFC, [0, 0, 1])!;
    expect(out.slice(0, located.start)).toBe(EDIT_SFC.slice(0, located.start));
    expect(out.slice(located.start + snippet.length)).toBe(EDIT_SFC.slice(located.end));
  });

  it('rejects multi-root and stray-text snippets', () => {
    expect(validateSubtree('<div>a</div><div>b</div>').ok).toBe(false);
    expect(validateSubtree('hello <div>a</div>').ok).toBe(false);
    expect(validateSubtree('   <div>ok</div>  ').ok).toBe(true);
  });

  it('tolerates fences-stripped snippet with leading comment', () => {
    const v = validateSubtree('<!-- updated -->\n<section class="p-4">新</section>');
    expect(v.ok).toBe(true);
    expect((v as { element: string }).element).toBe('<section class="p-4">新</section>');
  });
});

describe('relatedStyles', () => {
  it('keeps rules whose class tokens appear in the subtree, drops unrelated', () => {
    const located = locateByPath(EDIT_SFC, [0, 1, 0])!; // .card subtree
    const css = relatedStyles(EDIT_SFC, located.source);
    expect(css).toContain('.card');
    expect(css).not.toContain('.unrelated');
  });

  it('returns empty string when subtree has no classes', () => {
    expect(relatedStyles(EDIT_SFC, '<span>純文字</span>')).toBe('');
  });
});
