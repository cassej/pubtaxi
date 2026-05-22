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

function fromBase62(str) {
  let num = 0;
  for (let i = 0; i < str.length; i++) {
    num = num * 62 + BASE62_CHARS.indexOf(str[i]);
  }
  return num;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    // 1. Handle Redirects: /r/aB3
    if (path[0] === 'r' && path[1]) {
      const qrId = fromBase62(path[1]);
      // ... existing redirect logic
    }

    // NEW: Bypass worker for static assets (Cloudflare Pages)
    if (path[0] !== 'api' && path[0] !== 'r') {
      return fetch(request);
    }

    // 2. Event API
    if (path[0] === 'api' && path[1] === 'event' && request.method === 'POST') {
      const { qr_id, event_type, metadata } = await request.json();
      const qrNumericId = typeof qr_id === 'string' ? fromBase62(qr_id) : qr_id;
      const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1];
      ctx.waitUntil(env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type, metadata) VALUES (?, ?, ?, ?)`)
          .bind(qrNumericId, clientId, event_type, JSON.stringify(metadata)).run());
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Auth API: Login
    if (path[0] === 'api' && path[1] === 'login' && request.method === 'POST') {
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

    // 4. Admin API: Generate new QR
    if (path[0] === 'api' && path[1] === 'generate-qr' && request.method === 'POST') {
      const { vehicle_id, campaign_id, position } = await request.json();
      const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
          .bind(vehicle_id, campaign_id, position).run();
      const lastId = result.meta.last_row_id;
      return new Response(JSON.stringify({ shortId: toBase62(lastId), id: lastId }), { headers: { "Content-Type": "application/json" } });
    }

    // 5. Stats API
    if (path[0] === 'api' && path[1] === 'stats') {
      const daily = await env.DB.prepare(`SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-7 days') GROUP BY date(created_at) ORDER BY date ASC`).all();
      const hourly = await env.DB.prepare(`SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`).all();
      return new Response(JSON.stringify({ daily: daily.results, hourly: hourly.results }), { headers: { "Content-Type": "application/json" } });
    }

    if (path[0] === 'api' && path[1] === 'update-campaign' && request.method === 'POST') {
        const { id, target_url, redirect_mode } = await request.json();
        await env.DB.prepare("UPDATE campaigns SET target_url = ?, status = 'active' WHERE id = ?").bind(target_url, id).run();
        // Here id is the campaign_id (INTEGER)
        if (redirect_mode) await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?").bind(redirect_mode, id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "API Endpoint not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
};
