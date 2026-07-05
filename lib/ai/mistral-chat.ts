// Client Mistral chat completions (khac han lib/ai/mistral-ocr.ts - endpoint
// /v1/chat/completions, dung de AI "suy luan"/ra quyet dinh dua tren text,
// khong phai OCR anh/PDF) - dung cho buoc duyet trang tim BCTC nguon rieng
// (xem lib/custom-source.ts). Dung chung MISTRAL_API_KEY da co san, khong can
// them key moi.

const MAX_NETWORK_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

class NonRetryableError extends Error {}

export interface MistralChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallMistralChatOptions {
  jsonMode?: boolean;
  temperature?: number;
}

// Cung phong cach retry loi mang/tam thoi (429/5xx, ket noi bi cat giua
// chung) nhu lib/ai/mistral-ocr.ts - KHONG retry loi 4xx khac (request/key sai).
export async function callMistralChat(messages: MistralChatMessage[], options?: CallMistralChatOptions): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('Thieu MISTRAL_API_KEY');
  }

  const body = JSON.stringify({
    model: process.env.MISTRAL_CHAT_MODEL || 'mistral-large-latest',
    temperature: options?.temperature ?? 0,
    messages,
    ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NETWORK_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data?.error?.message || `Mistral chat request failed (${response.status})`;
        if (!isRetryableStatus(response.status)) {
          throw new NonRetryableError(message);
        }
        throw new Error(message);
      }

      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) {
        throw new Error('Mistral chat tra ve khong co noi dung');
      }
      return text;
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES - 1) {
        console.warn(`Mistral chat loi mang/tam thoi (thu ${attempt + 1}/${MAX_NETWORK_RETRIES}), thu lai sau ${RETRY_DELAY_MS}ms:`, error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}
