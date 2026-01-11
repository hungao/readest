import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const serverUrl = process.env.VIENEU_TTS_URL || 'http://localhost:7860';
  const apiKey = request.headers.get('X-VieNeu-API-Key');

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'API key required',
        details: 'Please configure API key in VieNeu settings',
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${serverUrl}/api/load-model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: 'Failed to load model',
          details: errorData.detail || response.statusText,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Model loading failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
