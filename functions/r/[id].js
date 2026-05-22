import { renderMinisite } from '../../src/minisite.js';
import { fromBase62 } from '../../src/index.js'; // I'll need to export this or move it

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean);
  const shortId = path[1];

  console.log(JSON.stringify({
    event: "qr_redirect_attempt",
    shortId,
    timestamp: Date.now()
  }));

  const qrId = fromBase62(shortId);

  const qr = await env.DB.prepare(`
    SELECT q.*, c.target_url, c.minisite_id
    FROM qr_codes q
    JOIN campaigns c ON q.campaign_id = c.id
    WHERE q.id = ? AND c.status = 'active'
  `).bind(qrId).first();

  if (!qr) {
    console.log(JSON.stringify({
      event: "qr_not_found",
      shortId,
      timestamp: Date.now()
    }));
    return new Response("Not Found", { status: 404 });
  }

  const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1] || crypto.randomUUID();
  const userAgent = request.headers.get("User-Agent");
  const country = request.headers.get("CF-IPCountry");

  context.waitUntil((async () => {
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
      return new Response(renderMinisite(minisite, shortId), {
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
