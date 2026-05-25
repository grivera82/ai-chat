import { NextRequest } from 'next/server';

export const runtime = 'edge';

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterDelta {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequest;
  const { messages, model, temperature = 0.7, max_tokens } = body;
  const apiKey = req.headers.get('x-openrouter-key');

  if (!apiKey) {
    return new Response('Missing OpenRouter API key', { status: 401 });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response('Messages are required', { status: 400 });
  }

  const referer = req.headers.get('origin') || 'https://ai-chat.vercel.app';
  const title = 'OpenRouter Chat';

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': title,
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini',
        messages,
        stream: true,
        temperature,
        ...(max_tokens ? { max_tokens } : {}),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      let errorData: Record<string, unknown> | null = null;
      try {
        errorData = await upstream.json();
      } catch {
        const text = await upstream.text().catch(() => '');
        errorData = { message: text || 'Upstream error' };
      }

      const openRouterError = (errorData?.error ?? errorData) as Record<string, unknown> & {
        metadata?: Record<string, unknown>;
        headers?: Record<string, unknown>;
      };
      const retryAfter = (openRouterError.metadata?.retry_after_seconds as number | undefined)
        ?? (openRouterError.retry_after_seconds as number | undefined)
        ?? (openRouterError.headers?.['Retry-After']
            ? parseFloat(String(openRouterError.headers['Retry-After']))
            : undefined);

      return Response.json(
        {
          error: openRouterError?.message || openRouterError?.raw || 'Provider error',
          code: upstream.status,
          retryAfter: retryAfter ? Math.ceil(retryAfter) : undefined,
          provider: openRouterError?.metadata?.provider_name,
          model,
        },
        { status: upstream.status }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;

              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6)) as OpenRouterDelta;
                  const delta = json.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    controller.enqueue(encoder.encode(delta));
                  }
                } catch {
                  // ignore malformed chunk
                }
              }
            }
          }

          // flush any remaining buffer
          if (buffer.trim().startsWith('data: ')) {
            try {
              const json = JSON.parse(buffer.trim().slice(6)) as OpenRouterDelta;
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {}
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Chat proxy error:', error);
    const message = (error as Error)?.message || 'Failed to generate response';
    return new Response(message, { status: 500 });
  }
}
