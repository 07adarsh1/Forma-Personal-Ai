import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { enforceServerPersona, SERVER_PERSONAS } from './api/personas.js';

function apiProxyPlugin(loadedEnv = {}) {
  return {
    name: 'api-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-persona-id');
          res.statusCode = 204;
          return res.end();
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }

        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(raw);
            const { endpoint, headers = {}, body, personaId } = data || {};

            const targetEndpoint = endpoint || `${loadedEnv.DEFAULT_BASE_URL || process.env.DEFAULT_BASE_URL || 'https://api.xkiro.com/v1'}/chat/completions`;
            if (!targetEndpoint) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              return res.end(JSON.stringify({ error: 'Missing endpoint' }));
            }

            let parsedBody = typeof body === 'string' ? JSON.parse(body) : (body || {});

            // Validate and enforce authoritative server-side persona prompt
            const targetPersonaId = personaId || parsedBody.personaId || req.headers?.['x-persona-id'];
            if (targetPersonaId) {
              const normId = String(targetPersonaId).toLowerCase().trim();
              const isKnownServerPersona = Boolean(SERVER_PERSONAS[normId]);
              const isCustomPersona = normId.startsWith('custom-');

              if (!isKnownServerPersona && !isCustomPersona) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.end(JSON.stringify({ error: `Invalid or unrecognized persona ID: ${targetPersonaId}` }));
              }

              if (isKnownServerPersona && Array.isArray(parsedBody.messages)) {
                const { messages } = enforceServerPersona(normId, parsedBody.messages, parsedBody.libraryContext);
                parsedBody.messages = messages;
              }
            }

            // Strip internal proxy properties before sending to upstream provider
            if (parsedBody && typeof parsedBody === 'object') {
              delete parsedBody.personaId;
              delete parsedBody.libraryContext;
              if (!parsedBody.model) {
                parsedBody.model = loadedEnv.DEFAULT_MODEL || process.env.DEFAULT_MODEL || 'qwen/qwen3.8-max:free';
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
              req.headers?.authorization;

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
              const serverKey =
                loadedEnv.DEFAULT_API_KEY ||
                process.env.DEFAULT_API_KEY ||
                loadedEnv.FORMA_DEFAULT_API_KEY ||
                process.env.FORMA_DEFAULT_API_KEY ||
                loadedEnv.OPENROUTER_API_KEY ||
                process.env.OPENROUTER_API_KEY ||
                loadedEnv.OPENAI_API_KEY ||
                process.env.OPENAI_API_KEY ||
                'sk-xt-e55f20a4f3fa8c9c4be36d39de81dd841531acbc599b1b84';

              if (serverKey) {
                outgoingHeaders['Authorization'] = `Bearer ${serverKey}`;
              } else {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.end(JSON.stringify({
                  error: 'No API key provided and no default server API key is configured. Please provide your own key in Settings or set DEFAULT_API_KEY in server environment variables.',
                }));
              }
            }

            const upstreamRes = await fetch(targetEndpoint, {
              method: 'POST',
              headers: outgoingHeaders,
              body: JSON.stringify(parsedBody),
            });

            res.statusCode = upstreamRes.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-persona-id');
            const contentType = upstreamRes.headers.get('content-type');
            if (contentType) {
              res.setHeader('Content-Type', contentType);
            }

            if (!upstreamRes.body) {
              return res.end();
            }

            const reader = upstreamRes.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          } catch (err) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: err.message || 'Proxy error' }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiProxyPlugin(env)],
  };
});
