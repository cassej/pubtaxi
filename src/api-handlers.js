import { hashPassword, signJWT, timingSafeEqual } from './crypto.js';
import { fromBase62, toBase62 } from './index.js';

export async function handleEventTrack(request, env, context) {
  if (request.headers.get("content-type") !== "application/json") {
    return new Response("Invalid content-type", { status: 415 });
  }
  try {
    const { qr_id, event_type, metadata } = await request.json();
    const qrNumericId = typeof qr_id === 'string' ? fromBase62(qr_id) : qr_id;
    const clientId = request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1];
    context.waitUntil(env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type, metadata) VALUES (?, ?, ?, ?)`)
        .bind(qrNumericId, clientId, event_type, JSON.stringify(metadata)).run());
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
  }
}

export async function handleLogin(request, env) {
  if (request.headers.get("content-type") !== "application/json") {
    return new Response("Invalid content-type", { status: 415 });
  }
  try {
    const { email, password } = await request.json();
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    const incomingHash = await hashPassword(password);
    if (user && await timingSafeEqual(user.password_hash, incomingHash)) {
      const token = await signJWT({ id: user.id, role: user.role }, env.JWT_SECRET);
      return new Response(JSON.stringify({ success: true, role: user.role }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        }
      });
    }
    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
  }
}

export async function handleGenerateQr(request, env) {
  if (request.headers.get("content-type") !== "application/json") {
    return new Response("Invalid content-type", { status: 415 });
  }
  try {
    const { vehicle_id, campaign_id, position } = await request.json();
    const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
        .bind(vehicle_id, campaign_id, position).run();
    const lastId = result.meta.last_row_id;
    return new Response(JSON.stringify({ shortId: toBase62(lastId), id: lastId }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
  }
}

export async function handleUpdateCampaign(request, env) {
  if (request.headers.get("content-type") !== "application/json") {
    return new Response("Invalid content-type", { status: 415 });
  }
  try {
    const { id, target_url, redirect_mode } = await request.json();
    await env.DB.prepare("UPDATE campaigns SET target_url = ?, status = 'active' WHERE id = ?").bind(target_url, id).run();
    if (redirect_mode) await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?").bind(redirect_mode, id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
  }
}

export async function handleStats(env) {
  try {
    const daily = await env.DB.prepare(`SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-7 days') GROUP BY date(created_at) ORDER BY date ASC`).all();
    const hourly = await env.DB.prepare(`SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`).all();
    return new Response(JSON.stringify({ daily: daily.results, hourly: hourly.results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
  }
}
