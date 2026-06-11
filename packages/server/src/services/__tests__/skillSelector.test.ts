import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectSkills } from '../skillSelector';
import * as providerModule from '../provider';
import * as registryModule from '../skillRegistry';

beforeEach(() => { vi.restoreAllMocks(); });

const SKILLS = [
  { name: 'houseprice-business-member', description: '房價網 B 端會員 domain', body: 'B端會員知識'.repeat(10) },
  { name: 'houseprice-order-quota', description: '訂單與額度 domain', body: '訂單知識' },
  { name: 'council-pm', description: 'council persona', body: 'pm persona' },
  { name: 'frontend-design', description: 'art director', body: 'aesthetics' },
];

function mockRegistry() {
  vi.spyOn(registryModule, 'listSkills').mockReturnValue(SKILLS as never);
  vi.spyOn(registryModule, 'readSkill').mockImplementation(((name: string) =>
    SKILLS.find(s => s.name === name) ?? null) as never);
}

function mockSelectorResponse(text: string | Error) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    generateWithSelection: async () => {
      if (text instanceof Error) throw text;
      return { selection: { provider: 'opencode', model: 'gpt-5.5', credentialType: 'api' }, response: { text } };
    },
  } as never);
  vi.spyOn(providerModule, 'defaultModel').mockReturnValue('gpt-5.5');
}

describe('selectSkills', () => {
  it('injects bodies of selected skills', async () => {
    mockRegistry();
    mockSelectorResponse('{"skills": ["houseprice-business-member"]}');
    const r = await selectSkills({ userText: '設計會員管理頁', projectId: 'p1' });
    expect(r.selected).toEqual(['houseprice-business-member']);
    expect(r.block).toContain('### Skill: houseprice-business-member');
    expect(r.block).toContain('B端會員知識');
  });

  it('empty selection → no injection', async () => {
    mockRegistry();
    mockSelectorResponse('{"skills": []}');
    const r = await selectSkills({ userText: '畫一個貓咪頁面', projectId: 'p1' });
    expect(r.selected).toEqual([]);
    expect(r.block).toBe('');
  });

  it('selector failure → empty selection, never throws', async () => {
    mockRegistry();
    mockSelectorResponse(new Error('provider down'));
    const r = await selectSkills({ userText: 'x', projectId: 'p1' });
    expect(r.selected).toEqual([]);
    expect(r.block).toBe('');
  });

  it('hallucinated and excluded names are dropped', async () => {
    mockRegistry();
    mockSelectorResponse('{"skills": ["not-a-skill", "council-pm", "frontend-design", "houseprice-order-quota"]}');
    const r = await selectSkills({ userText: '訂單頁', projectId: 'p1' });
    expect(r.selected).toEqual(['houseprice-order-quota']);
  });

  it('markdown-fenced JSON is parsed', async () => {
    mockRegistry();
    mockSelectorResponse('```json\n{"skills": ["houseprice-order-quota"]}\n```');
    const r = await selectSkills({ userText: '訂單頁', projectId: 'p1' });
    expect(r.selected).toEqual(['houseprice-order-quota']);
  });
});
