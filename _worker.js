import { renderMinisite } from './src/minisite.js';
import { handleJsonRpc } from './src/api-handlers.js';
import { toBase62, fromBase62 } from './src/utils.js';

function stubPage(campaignName) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>pubtaxi.lat</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
<div class="text-center p-8 max-w-sm">
  <div class="w-16 h-16 bg-[#FFB800] rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">🚕</div>
  <h1 class="text-xl font-bold text-[#003366] mb-3">Campaña no activa</h1>
  <p class="text-sm text-gray-500 mb-2">${campaignName ? `La campaña <strong>${campaignName}</strong> no está activa en este momento.` : 'Esta campaña no está activa en este momento.'}</p>
  <p class="text-xs text-gray-400">Escanea otro código QR en tu taxi.</p>
  <div class="mt-8 text-[10px] text-gray-300">⚡ pubtaxi.lat</div>
</div></body></html>`;
}

export default {
  fetch: async (request, env, ctx) => {
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
        SELECT q.*, c.target_url, c.minisite_id, c.status as campaign_status, c.name as campaign_name
        FROM qr_codes q
        JOIN campaigns c ON q.campaign_id = c.id
        WHERE q.id = ?
      `).bind(qrId).first();

      if (!qr) {
        console.log(JSON.stringify({
          event: "qr_not_found",
          shortId: path[1],
          timestamp: Date.now()
        }));
        return new Response("Not Found", { status: 404 });
      }

      if (qr.campaign_status !== 'active') {
        return new Response(stubPage(qr.campaign_name), {
          status: 200,
          headers: { "Content-Type": "text/html" }
        });
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

      ctx.waitUntil((async () => {
        try {
          await env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type) VALUES (?, ?, 'redirect')`).bind(qrId, clientId).run();
        } catch (err) {
          console.log(JSON.stringify({ event: "qr_redirect_log_failed", error: String(err) }));
        }
      })());

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

    // 4. Everything else - serve from Pages Assets (auto-provided by Cloudflare Pages)
    console.log(JSON.stringify({ event: "fetch_asset", url: url.pathname }));

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  }
};
