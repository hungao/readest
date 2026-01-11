import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const serverUrl = process.env.VIENEU_TTS_URL || 'http://localhost:7860';

  try {
    const response = await fetch(`${serverUrl}/api/voices`, {
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json();

    // Hardcode model configs from config.yaml
    const backbones = [
      { id: 'VieNeu-TTS (GPU)', label: 'VieNeu-TTS (GPU)', isGGUF: false },
      { id: 'VieNeu-TTS-0.3B (GPU)', label: 'VieNeu-TTS-0.3B (GPU)', isGGUF: false },
      { id: 'VieNeu-TTS-q8-gguf', label: 'VieNeu-TTS-q8-gguf', isGGUF: true },
      { id: 'VieNeu-TTS-q4-gguf', label: 'VieNeu-TTS-q4-gguf', isGGUF: true },
      { id: 'VieNeu-TTS-0.3B-q4-gguf', label: 'VieNeu-TTS-0.3B-q4-gguf', isGGUF: true },
      { id: 'VieNeu-TTS-0.3B-q8-gguf', label: 'VieNeu-TTS-0.3B-q8-gguf', isGGUF: true },
    ];

    const codecs = [
      { id: 'NeuCodec (Standard)', label: 'NeuCodec (Standard)' },
      { id: 'NeuCodec (Distill)', label: 'NeuCodec (Distill)' },
      { id: 'NeuCodec ONNX (Fast CPU)', label: 'NeuCodec ONNX (Fast CPU)' },
    ];

    return NextResponse.json({
      backbones,
      codecs,
      voices: data.voices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch models',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
