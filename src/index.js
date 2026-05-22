import { renderMinisite } from './minisite.js';
import { handleJsonRpc } from './api-handlers.js';

const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function toBase62(num) {
  if (num === 0) return BASE62_CHARS[0];
  let result = "";
  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

export function fromBase62(str) {
  let num = 0;
  for (let i = 0; i < str.length; i++) {
    num = num * 62 + BASE62_CHARS.indexOf(str[i]);
  }
  return num;
}

export default {
  fetch: async (request, env, ctx) => {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    // 1. Handle Redirects: /r/aB3
    if (path[0] === 'r' && path[1]) {
      const qrId = fromBase62(path[1]);

      console.log(JSON.stringify({
        event: "qr_redirect_attempt",
        shortId: path[1],
        timestamp: Date.now()
      }));

      const qr = await env.DB.prepare(`
        SELECT q.*, c.target_url, c.minisite_id
        FROM qr_codes q
        JOIN campaigns c ON q.campaign_id = c.id
        WHERE q.id = ? AND c.status = 'active'
      `).bind(qrId).first();

      if (!qr) {
        console.log(JSON.stringify({
          event: "qr_not_found",
          shortId: path[1],
          timestamp: Date.now()
        }));
        return new Response("Not Found", { status: 404 });
      }

      const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1] || crypto.randomUUID();
      const userAgent = request.headers.get("User-Agent");
      const country = request.headers.get("CF-IPCountry");

      ctx.waitUntil((async () => {
        try {
          await env.DB.prepare(`INSERT OR IGNORE INTO clients (id, user_agent, ip_country) VALUES (?, ?, ?)`).bind(clientId, userAgent, country).run();
          await env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type) VALUES (?, ?, 'scan')`).bind(qrId, clientId).run();
          console.log(JSON.stringify({
            event: "qr_scan_logged",
            qrId,
            clientId,
            timestamp: Date.now()
          }));
        } catch (err) {
          console.log(JSON.stringify({
            event: "qr_scan_log_failed",
            error: String(err),
            timestamp: Date.now()
          }));
        }
      })());

      if (qr.redirect_mode === 'minisite') {
        const minisite = await env.DB.prepare("SELECT * FROM minisites WHERE id = ?").bind(qr.minisite_id).first();
        if (minisite) {
          return new Response(renderMinisite(minisite, path[1]), {
            headers: { 
              "Content-Type": "text/html",
              "Set-Cookie": `puid=${clientId}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`
            }
          });
        }
      }

      return new Response(null, {
        status: 302,
        headers: {
          "Location": qr.target_url,
          "Set-Cookie": `puid=${clientId}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }

    // 2. Clean URL redirects for static pages
    if (path[0] === 'auth' && request.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { "Location": "/auth.html" }
      });
    }
    if (path[0] === 'admin' && request.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { "Location": "/admin/index.html" }
      });
    }
    if (path[0] === 'advertiser' && request.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { "Location": "/advertiser/index.html" }
      });
    }
    if (path[0] === 'driver' && request.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { "Location": "/driver/index.html" }
      });
    }

    // 3. JSON-RPC API endpoint
    if (path[0] === 'rpc' && request.method === 'POST') {
      return handleJsonRpc(request, env, ctx);
    }

    // Legacy API routes (backward compatibility - converts to JSON-RPC)
    if (path[0] === 'api' && request.method === 'POST') {
      const action = path[1];
      const methodMap = {
        'event': 'event.track',
        'login': 'auth.login',
        'generate-qr': 'qr.generate',
        'update-campaign': 'campaign.update',
        'stats': 'stats.get'
      };
      const method = methodMap[action];
      if (method) {
        console.log(JSON.stringify({ event: "legacy_api_convert", action, method }));
        // Convert legacy request to JSON-RPC
        const body = await request.json().catch((e) => {
          console.log(JSON.stringify({ event: "legacy_parse_error", error: String(e) }));
          return {};
        });
        const rpcBody = {
          jsonrpc: "2.0",
          method: method,
          params: body,
          id: 1
        };
        console.log(JSON.stringify({ event: "legacy_converted", rpcBody }));
        const newRequest = new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcBody)
        });
        return handleJsonRpc(newRequest, env, ctx);
      }
    }

    // FALLBACK: Serve static content from Pages
    return new Response(null, {
      headers: { "x-skip-worker": "true" } 
    });
  }
};
