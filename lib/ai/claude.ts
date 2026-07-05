// Du phong: san sang chuyen sang Claude khi can (chi can bo comment noi goi
// callQwen -> callClaude o lib/filter.ts). Hien KHONG co noi nao trong
// pipeline goi toi ham nay - dung Qwen lam mac dinh (xem lib/ai/qwen.ts).
const MAX_TOKENS = 4096;

export async function callClaude(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Thieu CLAUDE_API_KEY');
  }

  const response = await fetch(`${process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: MAX_TOKENS,
      temperature: 0,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Claude request failed');
  }

  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Claude returned empty content');
  }

  return text;
}
