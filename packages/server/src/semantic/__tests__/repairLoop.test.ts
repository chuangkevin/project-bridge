import { describe, it, expect, vi } from 'vitest';
import { runRepairLoop } from '../repairLoop';

describe('runRepairLoop', () => {
  it('returns on the first valid attempt without re-prompting', async () => {
    const generate = vi.fn().mockResolvedValue('{"ok":true}');
    const result = await runRepairLoop({
      generate, systemInstruction: 'sys', initialPrompt: 'do it',
      parseAndValidate: (raw) => { const d = JSON.parse(raw) as { ok: boolean }; return d.ok ? { valid: true, value: d } : { valid: false, errors: ['not ok'] }; },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('re-prompts with errors and succeeds on a repair attempt', async () => {
    const generate = vi.fn().mockResolvedValueOnce('{"ok":false}').mockResolvedValueOnce('{"ok":true}');
    const result = await runRepairLoop({
      generate, systemInstruction: 'sys', initialPrompt: 'do it',
      parseAndValidate: (raw) => { const d = JSON.parse(raw) as { ok: boolean }; return d.ok ? { valid: true, value: d } : { valid: false, errors: ['ok must be true'] }; },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toMatch(/ok must be true/);
  });

  it('throws after exhausting repairs, including the last errors', async () => {
    const generate = vi.fn().mockResolvedValue('{"ok":false}');
    await expect(runRepairLoop({
      generate, systemInstruction: 'sys', initialPrompt: 'do it',
      parseAndValidate: () => ({ valid: false, errors: ['always bad'] }), maxRepairs: 2,
    })).rejects.toThrow(/always bad/);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('treats a JSON.parse throw as an invalid attempt and repairs', async () => {
    const generate = vi.fn().mockResolvedValueOnce('not json').mockResolvedValueOnce('{"ok":true}');
    const result = await runRepairLoop({
      generate, systemInstruction: 'sys', initialPrompt: 'do it',
      parseAndValidate: (raw) => { const d = JSON.parse(raw) as { ok: boolean }; return d.ok ? { valid: true, value: d } : { valid: false, errors: ['x'] }; },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
