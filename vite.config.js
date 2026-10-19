import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { enforceServerPersona, SERVER_PERSONAS } from './api/personas.js';

function apiProxyPlugin() {
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
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }

        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(raw);
            const { endpoint, headers = {}, body, personaId } = data || {};

            if (!endpoint) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
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
            }

            const upstreamRes = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...headers,
              },
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
            res.end(JSON.stringify({ error: err.message || 'Proxy error' }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiProxyPlugin()],
});
