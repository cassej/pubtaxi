import { renderMinisite } from './src/minisite.js';
import { handleJsonRpc } from './src/api-handlers.js';
import { toBase62, fromBase62 } from './src/utils.js';

export default {
  fetch: async (request, env, ctx) => {
    // Clone URL before potential modification
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    console.log(JSON.stringify({ event: "request", path, method: request.method }));

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

    // 2. JSON-RPC API endpoint
    if (path[0] === 'rpc' && request.method === 'POST') {
      return handleJsonRpc(request, env, ctx);
    }

    // 3. Clean URL redirects for static pages
    if (request.method === 'GET') {
      if (path[0] === 'auth') {
        return new Response(null, { status: 302, headers: { "Location": "/auth.html" } });
      }
      if (path[0] === 'admin' && !path[1]) {
        return new Response(null, { status: 302, headers: { "Location": "/admin/index.html" } });
      }
      if (path[0] === 'advertiser' && !path[1]) {
        return new Response(null, { status: 302, headers: { "Location": "/advertiser/index.html" } });
      }
      if (path[0] === 'driver' && !path[1]) {
        return new Response(null, { status: 302, headers: { "Location": "/driver/index.html" } });
      }
    }

    // 4. Everything else - serve from Pages Assets
    console.log(JSON.stringify({ event: "fetch_asset", url: url.pathname }));

    // Use ASSETS binding for static files
    return env.ASSETS.fetch(request);
  }
};
