import { env } from '../../config/env';
import { TOOLS } from './tools';

interface OpenAIToolCall {
  function: { name: string; arguments: string };
}

export interface OpenAIChatCompletion {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
}

export async function callOpenAI(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>
): Promise<OpenAIChatCompletion> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurado neste ambiente -- bot do WhatsApp indisponível.');
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      tools: TOOLS,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
