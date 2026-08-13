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
  const body: Record<string, unknown> = {
    model: env.OPENAI_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    tools: TOOLS,
  };

  // Modelo gpt-5 recusa com 400 o esforço de raciocínio padrão (que ele
  // aplica sozinho quando o parâmetro é omitido) combinado com function
  // tools -- por isso vai explicitamente zerado, e não removido.
  //
  // Condicionado ao modelo de propósito: modelos que não são de raciocínio
  // (o .env local roda gpt-4o-mini) rejeitam reasoning_effort com o mesmo
  // 400, ou seja, mandar sempre trocaria um erro pelo outro.
  if (env.OPENAI_MODEL?.startsWith('gpt-5')) {
    body.reasoning_effort = 'none';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
