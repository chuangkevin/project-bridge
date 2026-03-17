import OpenAI from 'openai';

export type Intent = 'generate' | 'question';

export async function classifyIntent(message: string, apiKey: string): Promise<Intent> {
  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the user message as either "generate" (create/modify/update UI or prototype) or "question" (ask about specs, design, or prototype). Reply with ONLY "generate" or "question".`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase();
    return result === 'question' ? 'question' : 'generate';
  } catch {
    return 'generate'; // Default to generate on error
  }
}
