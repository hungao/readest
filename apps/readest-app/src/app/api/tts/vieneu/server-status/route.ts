import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const serverUrl = process.env.VIENEU_TTS_URL || 'http://localhost:7860';

  try {
    const response = await fetch(`${serverUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: 'error',
          connected: false,
        },
        { status: 503 },
      );
    }

    const data = await response.json();
    return NextResponse.json({
      status: 'connected',
      connected: true,
      modelLoaded: data.model_loaded,
      backend: data.backend,
      backbone: data.backbone,
      codec: data.codec,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'disconnected',
        connected: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      },
      { status: 503 },
    );
  }
}
