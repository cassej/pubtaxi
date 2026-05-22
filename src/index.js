import { renderMinisite } from './minisite.js';
import { hashPassword, signJWT } from './crypto.js';

const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function toBase62(num) {
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
...
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    // 1. Handle Redirects: /r/aB3
    if (path[0] === 'r' && path[1]) {
      const qrId = fromBase62(path[1]);
      
      const qr = await env.DB.prepare(`
        SELECT q.*, c.target_url, c.minisite_id 
        FROM qr_codes q
        JOIN campaigns c ON q.campaign_id = c.id
        WHERE q.id = ? AND c.status = 'active'
      `).bind(qrId).first();

      if (!qr) return new Response("Not Found", { status: 404 });

      const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1] || crypto.randomUUID();
      const userAgent = request.headers.get("User-Agent");
      const country = request.headers.get("CF-IPCountry");

      ctx.waitUntil((async () => {
        await env.DB.prepare(`INSERT OR IGNORE INTO clients (id, user_agent, ip_country) VALUES (?, ?, ?)`).bind(clientId, userAgent, country).run();
        await env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type) VALUES (?, ?, 'scan')`).bind(qrId, clientId).run();
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

    // 2. API Routes
    if (path[0] === 'api') {
        // Event Tracking
        if (path[1] === 'event' && request.method === 'POST') {
            const { qr_id, event_type, metadata } = await request.json();
            const qrNumericId = typeof qr_id === 'string' ? fromBase62(qr_id) : qr_id;
            const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1];
            ctx.waitUntil(env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type, metadata) VALUES (?, ?, ?, ?)`)
                .bind(qrNumericId, clientId, event_type, JSON.stringify(metadata)).run());
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        // Login
        if (path[1] === 'login' && request.method === 'POST') {
            const { email, password } = await request.json();
            const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
            const incomingHash = await hashPassword(password);
            if (user && user.password_hash === incomingHash) { 
                const token = await signJWT({ id: user.id, role: user.role }, env.JWT_SECRET);
                return new Response(JSON.stringify({ success: true, role: user.role }), {
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
                }
                });
            }
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
        }

        // Stats
        if (path[1] === 'stats') {
            const daily = await env.DB.prepare(`SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-7 days') GROUP BY date(created_at) ORDER BY date ASC`).all();
            const hourly = await env.DB.prepare(`SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`).all();
            return new Response(JSON.stringify({ daily: daily.results, hourly: hourly.results }), { headers: { "Content-Type": "application/json" } });
        }

        // Generate QR
        if (path[1] === 'generate-qr' && request.method === 'POST') {
            const { vehicle_id, campaign_id, position } = await request.json();
            const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
                .bind(vehicle_id, campaign_id, position).run();
            const lastId = result.meta.last_row_id;
            return new Response(JSON.stringify({ shortId: toBase62(lastId), id: lastId }), { headers: { "Content-Type": "application/json" } });
        }

        // Update Campaign
        if (path[1] === 'update-campaign' && request.method === 'POST') {
            const { id, target_url, redirect_mode } = await request.json();
            await env.DB.prepare("UPDATE campaigns SET target_url = ?, status = 'active' WHERE id = ?").bind(target_url, id).run();
            if (redirect_mode) await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?").bind(redirect_mode, id).run();
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }
    }

    // FALLBACK: Serve static content from Cloudflare Pages
    // We assume the static site is available on the same infrastructure.
    // In Cloudflare, if the worker is on a custom domain, fetch(request) 
    // without the worker interception will hit the origin (Pages).
    // To avoid the loop, we use a different way to reach the origin.
    
    try {
      const response = await fetch(request);
      // If the response is from the worker itself (loop), we'll see it here.
      // But if it's the origin, it will work. 
      return response;
    } catch (e) {
      return new Response("Static Asset Error: " + e.message, { status: 500 });
    }
  }
};
