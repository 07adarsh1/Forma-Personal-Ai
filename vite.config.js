import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function apiProxyPlugin() {
  return {
    name: 'api-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
            const { endpoint, headers = {}, body } = data || {};

            if (!endpoint) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Missing endpoint' }));
            }

            const upstreamRes = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...headers,
              },
              body: typeof body === 'string' ? body : JSON.stringify(body),
            });

            res.statusCode = upstreamRes.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
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
