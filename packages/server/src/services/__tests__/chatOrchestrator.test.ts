import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, parseArtifactsFromResponse, type BuildPromptOpts } from '../chatOrchestrator';
import type { MemorySnapshot } from '../memorySnapshot';

function emptySnapshot(): MemorySnapshot {
  return { facts: [], turns: [], earlierTurnCount: 0 };
}

describe('buildSystemPrompt', () => {
  it('empty snapshot → minimal prompt with skill list and closing instruction only', () => {
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: emptySnapshot(),
      skillDescriptions: 'Available skills:\n- skill-a: desc a',
    });
    expect(result).toContain('Available skills');
    expect(result).toContain('skill-a');
    expect(result).not.toContain('Facts known');
    expect(result).not.toContain('Recent conversation');
    expect(result).toContain('<facts>');
  });

  it('closing instruction always present', () => {
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: emptySnapshot(),
      skillDescriptions: '',
    });
    expect(result).toContain('<facts>');
    expect(result).toContain('[{kind, text}');
  });

  it('snapshot with facts and turns → both sections present in order', () => {
    const snapshot: MemorySnapshot = {
      facts: [{ id: 'f1', projectId: 'p', turnId: 't', kind: 'requirement', text: 'must be fast', supersededBy: null, createdAt: '' }],
      turns: [{
        id: 't1', projectId: 'p', mode: 'consult',
        userText: 'hello', aiResponse: { text: 'world' },
        createdAt: '',
      }],
      earlierTurnCount: 0,
    };
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: snapshot,
      skillDescriptions: 'Available skills:\n- s: d',
    });

    const factsIdx = result.indexOf('## Facts known about this project');
    const turnsIdx = result.indexOf('## Recent conversation');
    const skillsIdx = result.indexOf('## Available skills');
    const closingIdx = result.indexOf('<facts>');

    expect(factsIdx).toBeGreaterThanOrEqual(0);
    expect(turnsIdx).toBeGreaterThan(factsIdx);
    expect(skillsIdx).toBeGreaterThan(turnsIdx);
    expect(closingIdx).toBeGreaterThan(skillsIdx);

    expect(result).toContain('[requirement] must be fast');
    expect(result).toContain('User: hello | AI: world');
  });

  it('earlierTurnCount > 0 → notice present', () => {
    const snapshot: MemorySnapshot = {
      facts: [],
      turns: [],
      earlierTurnCount: 5,
    };
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: snapshot,
      skillDescriptions: '',
    });
    expect(result).toContain('5 earlier turns omitted for brevity.');
  });

  it('forcedSkillBody → Forced skill body section present, body inlined', () => {
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: emptySnapshot(),
      skillDescriptions: '',
      forcedSkillBody: 'Consult: ask clarifying questions before proposing.',
    });
    expect(result).toContain('## Forced skill body');
    expect(result).toContain('Consult: ask clarifying questions before proposing.');
  });

  it('attachments with parsedText → section present, names and truncated text', () => {
    const longText = 'x'.repeat(3000);
    const result = buildSystemPrompt({
      mode: 'consult',
      memorySnapshot: emptySnapshot(),
      skillDescriptions: '',
      attachments: [
        { kind: 'pdf', parsedText: longText, originalName: 'spec.pdf' },
        { kind: 'docx', parsedText: 'short text', originalName: 'brief.docx' },
      ],
    });
    expect(result).toContain('## Attachments');
    expect(result).toContain('spec.pdf');
    expect(result).toContain('brief.docx');
    // parsedText truncated to 2000 chars
    const pdfContent = result.slice(result.indexOf('spec.pdf'));
    const xxxBlock = pdfContent.match(/x+/)?.[0] ?? '';
    expect(xxxBlock.length).toBeLessThanOrEqual(2000);
    expect(xxxBlock.length).toBeGreaterThan(0);
    expect(result).toContain('short text');
  });
});

describe('parseArtifactsFromResponse', () => {
  it('single artifact block → 1 result with correct kind/name/payload', () => {
    const text = 'Some text\n<artifact kind="page-graph" name="ia">{"nodes":[],"edges":[]}</artifact>\nMore text';
    const result = parseArtifactsFromResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('page-graph');
    expect(result[0].name).toBe('ia');
    expect(result[0].payload).toBe('{"nodes":[],"edges":[]}');
  });

  it('multiple artifact blocks → multiple results', () => {
    const text = [
      '<artifact kind="page-graph" name="ia">{"nodes":[{"id":"home"}],"edges":[]}</artifact>',
      'some content',
      '<artifact kind="design-tokens" name="tokens">{"color":"red"}</artifact>',
    ].join('\n');
    const result = parseArtifactsFromResponse(text);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('page-graph');
    expect(result[1].kind).toBe('design-tokens');
    expect(result[1].name).toBe('tokens');
  });
});

describe('buildSystemPrompt — active artifact source (design-generation-context)', () => {
  const SMALL_SFC = '<template>\n  <div v-if="currentPage===\'home\'"><h1>首頁</h1></div>\n</template>\n<script>export default {}</script>';

  it('injects full source for a normal-sized artifact', () => {
    const result = buildSystemPrompt({
      mode: 'design',
      memorySnapshot: { facts: [], turns: [], earlierTurnCount: 0 },
      skillDescriptions: '',
      activeArtifact: { id: 'a1', name: 'site', source: SMALL_SFC },
    });
    expect(result).toContain('## Active artifact source (id: a1, name: site)');
    expect(result).toContain(SMALL_SFC);
    expect(result).toContain('preserve everything they did not mention');
  });

  it('degrades to structural summary with warning when source exceeds limit', () => {
    const bigBody = '<p>' + 'x'.repeat(70_000) + '</p>';
    const bigSfc = `<template>\n<div>\n<div v-if="currentPage==='home'"><h1>首頁標題</h1>${bigBody}</div>\n</div>\n</template>`;
    const result = buildSystemPrompt({
      mode: 'design',
      memorySnapshot: { facts: [], turns: [], earlierTurnCount: 0 },
      skillDescriptions: '',
      activeArtifact: { id: 'a2', name: 'big', source: bigSfc },
    });
    expect(result).toContain('## Active artifact structure (id: a2, name: big)');
    expect(result).toContain('原始碼過大');
    expect(result).toContain("currentPage==='home'");
    // No mid-payload truncated source dump
    expect(result).not.toContain('x'.repeat(1000));
  });

  it('falls back to bare id line when only activeArtifactId is known', () => {
    const result = buildSystemPrompt({
      mode: 'design',
      memorySnapshot: { facts: [], turns: [], earlierTurnCount: 0, activeArtifactId: 'a3' },
      skillDescriptions: '',
    });
    expect(result).toContain('## Active artifact: a3');
  });
});
