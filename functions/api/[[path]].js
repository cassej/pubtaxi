import { hashPassword, signJWT } from '../../src/crypto.js';
import { fromBase62, toBase62 } from '../../src/index.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean); // e.g., ["api", "login"]
  
  const action = path[1];

  // 1. Event Tracking
  if (action === 'event' && request.method === 'POST') {
    const { qr_id, event_type, metadata } = await request.json();
    const qrNumericId = typeof qr_id === 'string' ? fromBase62(qr_id) : qr_id;
    const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1];
    context.waitUntil(env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type, metadata) VALUES (?, ?, ?, ?)`)
        .bind(qrNumericId, clientId, event_type, JSON.stringify(metadata)).run());
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. Auth API: Login
  if (action === 'login' && request.method === 'POST') {
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

  // 3. Stats API
  if (action === 'stats') {
    const daily = await env.DB.prepare(`SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-7 days') GROUP BY date(created_at) ORDER BY date ASC`).all();
    const hourly = await env.DB.prepare(`SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`).all();
    return new Response(JSON.stringify({ daily: daily.results, hourly: hourly.results }), { headers: { "Content-Type": "application/json" } });
  }

  // 4. Admin API: Generate new QR
  if (action === 'generate-qr' && request.method === 'POST') {
    const { vehicle_id, campaign_id, position } = await request.json();
    const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
        .bind(vehicle_id, campaign_id, position).run();
    const lastId = result.meta.last_row_id;
    return new Response(JSON.stringify({ shortId: toBase62(lastId), id: lastId }), { headers: { "Content-Type": "application/json" } });
  }

  // 5. Update Campaign
  if (action === 'update-campaign' && request.method === 'POST') {
      const { id, target_url, redirect_mode } = await request.json();
      await env.DB.prepare("UPDATE campaigns SET target_url = ?, status = 'active' WHERE id = ?").bind(target_url, id).run();
      if (redirect_mode) await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?").bind(redirect_mode, id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "API Action not found: " + action }), { status: 404 });
}
