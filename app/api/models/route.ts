import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { OpenRouterModel } from '@/lib/types';

interface OpenRouterModelResponse {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-openrouter-key');

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  try {
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': req.headers.get('origin') || 'http://localhost:3000',
        'X-Title': 'OpenRouter Chat',
      },
    });

    const modelsResponse = await openai.models.list();
    
    // Only return free models (those with :free suffix)
    const freeModels: OpenRouterModel[] = (modelsResponse.data as OpenRouterModelResponse[])
      .filter((m) => m.id.includes(':free'))
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length || 128000,
        pricing: {
          prompt: m.pricing?.prompt || '0',
          completion: m.pricing?.completion || '0',
        },
        architecture: m.architecture,
      }))
      .sort((a, b) => {
        // Prefer well-known high-quality free models
        const priority = (id: string) => {
          if (id.includes('gemini-2')) return 0;
          if (id.includes('llama-3.3')) return 1;
          if (id.includes('qwen-2.5')) return 2;
          if (id.includes('mistral')) return 3;
          return 4;
        };
        return priority(a.id) - priority(b.id);
      });

    return NextResponse.json({ models: freeModels });
  } catch (error: unknown) {
    console.error('Models fetch error:', error);
    const status = (error as { status?: number })?.status || 500;
    const message = (error as Error)?.message || 'Failed to fetch models';
    return NextResponse.json({ error: message }, { status });
  }
}
