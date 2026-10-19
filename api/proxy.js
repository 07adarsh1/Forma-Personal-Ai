import { enforceServerPersona, SERVER_PERSONAS } from './personas.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-target-url, x-persona-id',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await req.json();
    const { endpoint, headers = {}, body, personaId } = data || {};

    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid endpoint URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let parsedBody = typeof body === 'string' ? JSON.parse(body) : (body || {});

    // Validate and enforce authoritative server-side persona prompt
    const targetPersonaId = personaId || parsedBody.personaId || req.headers?.get?.('x-persona-id');
    if (targetPersonaId) {
      const normId = String(targetPersonaId).toLowerCase().trim();
      const isKnownServerPersona = Boolean(SERVER_PERSONAS[normId]);
      const isCustomPersona = normId.startsWith('custom-');

      if (!isKnownServerPersona && !isCustomPersona) {
        return new Response(JSON.stringify({ error: `Invalid or unrecognized persona ID: ${targetPersonaId}` }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      if (isKnownServerPersona && Array.isArray(parsedBody.messages)) {
        const { messages } = enforceServerPersona(normId, parsedBody.messages, parsedBody.libraryContext);
        parsedBody.messages = messages;
      }
    }

    // Clean internal properties before sending to strict upstream providers
    if (parsedBody && typeof parsedBody === 'object') {
      delete parsedBody.personaId;
      delete parsedBody.libraryContext;
    }

    // Server-to-server request bypasses browser CORS restrictions
    const upstreamRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(parsedBody),
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-persona-id');

    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return new Response(
      JSON.stringify({
        error: `Proxy request failed: ${err.message || 'Unknown network error'}`
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

