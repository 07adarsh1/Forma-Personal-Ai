import { enforceServerPersona, SERVER_PERSONAS } from './personas.js';

export const config = {
  runtime: 'edge',
};

/**
 * Resolves the server-side default API key from environment variables.
 * Never exposed to frontend or bundled in client-side code.
 */
function getServerDefaultApiKey() {
  return (
    process.env.DEFAULT_API_KEY ||
    process.env.FORMA_DEFAULT_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.QWEN_API_KEY ||
    'sk-xt-e55f20a4f3fa8c9c4be36d39de81dd841531acbc599b1b84'
  );
}

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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const data = await req.json();
    const { endpoint, headers = {}, body, personaId } = data || {};

    const targetEndpoint = endpoint || `${process.env.DEFAULT_BASE_URL || 'https://api.xkiro.com/v1'}/chat/completions`;
    if (!targetEndpoint || typeof targetEndpoint !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid endpoint URL' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
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
      if (!parsedBody.model) {
        parsedBody.model = process.env.DEFAULT_MODEL || 'qwen/qwen3.8-max:free';
      }
    }

    // Resolve Authorization: BYOK (user custom key) vs Shared Server-Side Default Key
    const outgoingHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const clientAuth =
      outgoingHeaders.Authorization ||
      outgoingHeaders.authorization ||
      req.headers?.get?.('authorization');

    const rawClientKey = clientAuth ? clientAuth.replace(/^Bearer\s*/i, '').trim() : '';
    const hasValidClientKey = Boolean(
      rawClientKey &&
      !['null', 'undefined', 'none'].includes(rawClientKey.toLowerCase())
    );

    if (hasValidClientKey) {
      // User provided their own valid API key (BYOK mode)
      outgoingHeaders['Authorization'] = clientAuth.startsWith('Bearer ') ? clientAuth : `Bearer ${clientAuth}`;
    } else {
      // Free default experience: inject server-side default API key from environment variables
      const serverKey = getServerDefaultApiKey();
      if (serverKey) {
        outgoingHeaders['Authorization'] = `Bearer ${serverKey}`;
      } else {
        return new Response(
          JSON.stringify({
            error: 'No API key provided and no default server API key is configured. Please provide your own key in Settings or set DEFAULT_API_KEY in server environment variables.',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    // Server-to-server request bypasses browser CORS restrictions
    const upstreamRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers: outgoingHeaders,
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
