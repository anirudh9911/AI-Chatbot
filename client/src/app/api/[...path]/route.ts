import { NextRequest, NextResponse } from 'next/server';

// Read at request time (not build time) — picks up the configmap value correctly.
const BACKEND_URL = process.env.INTERNAL_API_URL || 'http://localhost:8000';

// Force dynamic so responses are never cached (critical for SSE streaming).
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${BACKEND_URL}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const body =
    request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.arrayBuffer()
      : undefined;

  const response = await fetch(url, {
    method: request.method,
    headers,
    body: body ? Buffer.from(body) : undefined,
  });

  // Forward all response headers (including Content-Type: text/event-stream for SSE).
  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}
