import { hashPassword, signJWT, verifyJWT, timingSafeEqual } from './crypto.js';
import { fromBase62, toBase62 } from './utils.js';

const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003
};

function jsonRpcError(code, message, id = null, data = null) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message, ...(data && { data }) },
    id
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function jsonRpcSuccess(result, id) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", result, id }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function authenticate(request, env, allowedRoles) {
  const token = request.headers.get("Cookie")?.match(/token=([^;]+)/)?.[1];
  if (!token) throw Object.assign(new Error("Not authenticated"), { code: ERROR_CODES.UNAUTHORIZED });

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) throw Object.assign(new Error("Invalid or expired token"), { code: ERROR_CODES.UNAUTHORIZED });

  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    throw Object.assign(new Error("Forbidden"), { code: ERROR_CODES.FORBIDDEN });
  }

  const user = await env.DB.prepare("SELECT id, email, role, name FROM users WHERE id = ?").bind(payload.id).first();
  if (!user) throw Object.assign(new Error("User not found"), { code: ERROR_CODES.UNAUTHORIZED });

  return { user, tokenPayload: payload };
}

const METHODS = {

  'event.track': async (params, env, context) => {
    const { qr_id, event_type, metadata } = params;
    if (!qr_id || !event_type) throw new Error("Missing required params: qr_id, event_type");

    const qrNumericId = typeof qr_id === 'string' ? fromBase62(qr_id) : qr_id;
    const clientId = context.request.headers.get("Cookie")?.match(/puid=([^;]+)/)?.[1];

    context.waitUntil(env.DB.prepare(`INSERT INTO events (qr_id, client_id, event_type, metadata) VALUES (?, ?, ?, ?)`)
        .bind(qrNumericId, clientId, event_type, JSON.stringify(metadata || {})).run());

    return { success: true };
  },

  'auth.login': async (params, env) => {
    const { email, password } = params;
    if (!email || !password) throw new Error("Missing required params: email, password");

    const user = await env.DB.prepare("SELECT id, email, password_hash, role, name FROM users WHERE email = ?").bind(email).first();
    if (!user) throw new Error("Invalid credentials");

    const incomingHash = await hashPassword(password);
    if (!await timingSafeEqual(user.password_hash, incomingHash)) {
      throw new Error("Invalid credentials");
    }

    const token = await signJWT({ id: user.id, role: user.role }, env.JWT_SECRET);

    const dashboardMap = {
      admin: '/admin/',
      advertiser: '/advertiser/',
      publisher: '/driver/'
    };
    const redirect = dashboardMap[user.role] || '/';

    return {
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      redirect
    };
  },

  'auth.me': async (params, env, context) => {
    const { user } = await authenticate(context.request, env);
    return { user: { id: user.id, email: user.email, role: user.role, name: user.name } };
  },

  'admin.stats': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);

    const totalUsers = await env.DB.prepare("SELECT COUNT(*) as c FROM users").first();
    const totalAdvertisers = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'advertiser'").first();
    const totalDrivers = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'publisher'").first();
    const totalVehicles = await env.DB.prepare("SELECT COUNT(*) as c FROM vehicles WHERE status = 'active'").first();
    const totalCampaigns = await env.DB.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status = 'active'").first();
    const pausedCampaigns = await env.DB.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status = 'paused'").first();
    const totalScansMonth = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM events WHERE event_type = 'scan' AND created_at > date('now', '-30 days')"
    ).first();
    const scansYesterday = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM events WHERE event_type = 'scan' AND created_at > date('now', '-1 days') AND created_at < date('now')"
    ).first();
    const scansPrevMonth = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM events WHERE event_type = 'scan' AND created_at > date('now', '-60 days') AND created_at < date('now', '-30 days')"
    ).first();

    const daily = await env.DB.prepare(
      `SELECT date(created_at) as date, COUNT(*) as count FROM events WHERE event_type = 'scan' AND created_at > date('now', '-30 days') GROUP BY date(created_at) ORDER BY date ASC`
    ).all();

    const recentUsers = await env.DB.prepare(
      "SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5"
    ).all();

    const scansMonth = totalScansMonth.c;
    const scansPrev = scansPrevMonth.c;
    const pctChange = scansPrev > 0 ? Math.round((scansMonth - scansPrev) / scansPrev * 100) : 0;

    const vehiclesThisMonth = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM vehicles WHERE created_at > date('now', '-30 days')"
    ).first();

    return {
      totalUsers: totalUsers.c,
      totalAdvertisers: totalAdvertisers.c,
      totalDrivers: totalDrivers.c,
      totalVehicles: totalVehicles.c,
      totalCampaigns: totalCampaigns.c,
      pausedCampaigns: pausedCampaigns.c,
      scansMonth,
      scansYesterday: scansYesterday.c,
      scansChange: pctChange,
      vehiclesThisMonth: vehiclesThisMonth.c,
      daily: daily.results,
      recentUsers: recentUsers.results
    };
  },

  'admin.users.list': async (params, env, context) => {
    const auth = await authenticate(context.request, env, ['admin']);
    const role = params.role || null;
    let users;
    if (role) {
      users = await env.DB.prepare("SELECT id, email, name, role, status, created_at FROM users WHERE role = ? ORDER BY created_at DESC").bind(role).all();
    } else {
      users = await env.DB.prepare("SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC").all();
    }
    return { users: users.results };
  },

  'admin.users.create': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { email, password, name, role } = params;
    if (!email || !password || !role) throw new Error("Missing required params: email, password, role");

    const password_hash = await hashPassword(password);
    const result = await env.DB.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
      .bind(email, password_hash, name || '', role).run();

    return { success: true, id: result.meta.last_row_id };
  },

  'admin.vehicles.list': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const vehicles = await env.DB.prepare(`
      SELECT v.id, v.plate_number, v.model, v.status, v.created_at,
             u.id as publisher_id, u.name as publisher_name, u.email as publisher_email,
             (SELECT COUNT(*) FROM qr_codes qc WHERE qc.vehicle_id = v.id) as qr_count,
             (SELECT COUNT(*) FROM events e JOIN qr_codes qc ON e.qr_id = qc.id WHERE qc.vehicle_id = v.id AND e.event_type = 'scan' AND e.created_at > date('now', '-30 days')) as scans_month
      FROM vehicles v
      LEFT JOIN users u ON v.publisher_id = u.id
      ORDER BY v.created_at DESC
    `).all();
    return { vehicles: vehicles.results };
  },

  'admin.campaigns.list': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const campaigns = await env.DB.prepare(`
      SELECT c.id, c.name, c.target_url, c.status, c.advertiser_id, c.created_at,
             u.name as advertiser_name, u.email as advertiser_email,
             (SELECT COUNT(*) FROM qr_codes qc WHERE qc.campaign_id = c.id) as vehicle_count,
             (SELECT COUNT(*) FROM events e JOIN qr_codes qc ON e.qr_id = qc.id WHERE qc.campaign_id = c.id AND e.event_type = 'scan' AND e.created_at > date('now', '-30 days')) as scans_month,
             c.minisite_id
      FROM campaigns c
      LEFT JOIN users u ON c.advertiser_id = u.id
      ORDER BY c.id DESC
    `).all();
    return { campaigns: campaigns.results };
  },

  'admin.vehicles.create': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { publisher_id, plate_number, model } = params;
    if (!publisher_id) throw new Error("Missing required params: publisher_id");

    const result = await env.DB.prepare(
      "INSERT INTO vehicles (publisher_id, plate_number, model) VALUES (?, ?, ?)"
    ).bind(publisher_id, plate_number || '', model || '').run();
    return { success: true, id: result.meta.last_row_id };
  },

  'admin.vehicles.update': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { id, publisher_id, plate_number, model, status } = params;
    if (!id) throw new Error("Missing required params: id");

    await env.DB.prepare(
      "UPDATE vehicles SET publisher_id = ?, plate_number = ?, model = ?, status = ? WHERE id = ?"
    ).bind(publisher_id, plate_number || '', model || '', status || 'active', id).run();
    return { success: true };
  },

  'admin.campaigns.create': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { advertiser_id, name, status } = params;
    if (!advertiser_id || !name) throw new Error("Missing required params: advertiser_id, name");

    const result = await env.DB.prepare(
      "INSERT INTO campaigns (advertiser_id, name, status) VALUES (?, ?, ?)"
    ).bind(advertiser_id, name, status || 'active').run();
    return { success: true, id: result.meta.last_row_id };
  },

  'admin.campaigns.update': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { id, name, status } = params;
    if (!id) throw new Error("Missing required params: id");

    if (name || status) {
      const updates = [];
      const values = [];
      if (name) { updates.push("name = ?"); values.push(name); }
      if (status) { updates.push("status = ?"); values.push(status); }
      values.push(id);
      await env.DB.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    return { success: true };
  },

  'admin.campaigns.qrCodes': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { campaign_id } = params;
    if (!campaign_id) throw new Error("Missing required params: campaign_id");

    const codes = await env.DB.prepare(`
      SELECT qc.id, qc.vehicle_id, qc.position, qc.redirect_mode, qc.created_at,
             v.plate_number, v.model,
             u.name as publisher_name
      FROM qr_codes qc
      JOIN vehicles v ON qc.vehicle_id = v.id
      LEFT JOIN users u ON v.publisher_id = u.id
      WHERE qc.campaign_id = ?
      ORDER BY qc.created_at DESC
    `).bind(campaign_id).all();
    return { codes: codes.results };
  },

  'admin.users.toggleStatus': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { id } = params;
    if (!id) throw new Error("Missing required params: id");

    const user = await env.DB.prepare("SELECT status FROM users WHERE id = ?").bind(id).first();
    if (!user) throw new Error("User not found");

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(newStatus, id).run();
    return { success: true, status: newStatus };
  },

  'admin.users.update': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { id, name, email, role } = params;
    if (!id) throw new Error("Missing required params: id");

    if (email) {
      await env.DB.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?")
        .bind(name || '', email, role, id).run();
    } else {
      await env.DB.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?")
        .bind(name || '', role, id).run();
    }
    return { success: true };
  },

  'admin.payouts.list': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const offset = Math.max(0, parseInt(params.offset) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 20));

    const total = await env.DB.prepare("SELECT COUNT(*) as c FROM payouts").first();
    const payouts = await env.DB.prepare(`
      SELECT p.id, p.publisher_id, p.period_start, p.period_end, p.scans, p.amount, p.status, p.created_at, p.paid_at,
             u.name as publisher_name, u.email as publisher_email
      FROM payouts p
      LEFT JOIN users u ON p.publisher_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    return { payouts: payouts.results, total: total ? total.c : 0 };
  },

  'admin.payouts.create': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { publisher_id, period_start, period_end, scans, amount } = params;
    if (!publisher_id || !period_start || !period_end || scans === undefined || amount === undefined) {
      throw new Error("Missing required params");
    }
    const result = await env.DB.prepare(
      "INSERT INTO payouts (publisher_id, period_start, period_end, scans, amount, status) VALUES (?, ?, ?, ?, ?, 'paid')"
    ).bind(publisher_id, period_start, period_end, scans, amount).run();
    return { success: true, id: result.meta.last_row_id };
  },

  'admin.payouts.pay': async (params, env, context) => {
    await authenticate(context.request, env, ['admin']);
    const { id } = params;
    await env.DB.prepare("UPDATE payouts SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(id).run();
    return { success: true };
  },

  'driver.stats': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['publisher']);

    const today = await env.DB.prepare(`
      SELECT COUNT(*) as scans FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      WHERE v.publisher_id = ? AND e.event_type = 'scan' AND date(e.created_at) = date('now')
    `).bind(user.id).first();

    const month = await env.DB.prepare(`
      SELECT COUNT(*) as scans FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      WHERE v.publisher_id = ? AND e.event_type = 'scan' AND e.created_at > date('now', '-30 days')
    `).bind(user.id).first();

    const pendingPayout = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM payouts WHERE publisher_id = ? AND status = 'pending'"
    ).bind(user.id).first();

    const weeklyEarnings = await env.DB.prepare(`
      SELECT strftime('%W', e.created_at) as week, COUNT(*) as scans, COUNT(*) * 2.5 as earnings
      FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      WHERE v.publisher_id = ? AND e.event_type = 'scan' AND e.created_at > date('now', '-28 days')
      GROUP BY week ORDER BY week ASC
    `).bind(user.id).all();

    const vehiclePerf = await env.DB.prepare(`
      SELECT v.id, v.plate_number, v.model,
             (SELECT COUNT(*) FROM events e2 JOIN qr_codes qc2 ON e2.qr_id = qc2.id WHERE qc2.vehicle_id = v.id AND e2.event_type = 'scan' AND e2.created_at > date('now', '-30 days')) as scans_month
      FROM vehicles v
      WHERE v.publisher_id = ? AND v.status = 'active'
    `).bind(user.id).all();

    const earningsToday = (today.scans || 0) * 2.5;
    const earningsMonth = (month.scans || 0) * 2.5;

    return {
      todayScans: today.scans || 0,
      todayEarnings: earningsToday,
      monthScans: month.scans || 0,
      monthEarnings: earningsMonth,
      pendingAmount: pendingPayout.total || 0,
      weeklyEarnings: weeklyEarnings.results,
      vehicles: vehiclePerf.results
    };
  },

  'driver.vehicles': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['publisher']);

    const vehicles = await env.DB.prepare(`
      SELECT v.id, v.plate_number, v.model, v.status, v.created_at,
             (SELECT COUNT(*) FROM events e2 JOIN qr_codes qc2 ON e2.qr_id = qc2.id WHERE qc2.vehicle_id = v.id AND e2.event_type = 'scan' AND e2.created_at > date('now', '-30 days')) as scans_month,
             (SELECT c.name FROM campaigns c JOIN qr_codes qc3 ON qc3.campaign_id = c.id WHERE qc3.vehicle_id = v.id LIMIT 1) as campaign_name
      FROM vehicles v
      WHERE v.publisher_id = ?
      ORDER BY v.created_at DESC
    `).bind(user.id).all();

    return { vehicles: vehicles.results };
  },

  'driver.payouts': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['publisher']);

    const pending = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM payouts WHERE publisher_id = ? AND status = 'pending'"
    ).bind(user.id).first();

    const history = await env.DB.prepare(
      "SELECT id, period_start, period_end, scans, amount, status, created_at, paid_at FROM payouts WHERE publisher_id = ? ORDER BY created_at DESC"
    ).bind(user.id).all();

    return { pendingAmount: pending.total, history: history.results };
  },

  'driver.logs': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['publisher']);
    const offset = Math.max(0, parseInt(params.offset) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 20));

    const total = await env.DB.prepare(`
      SELECT COUNT(*) as c FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      WHERE v.publisher_id = ?
    `).bind(user.id).first();

    const logs = await env.DB.prepare(`
      SELECT e.id, e.created_at, e.event_type,
             qc.id as qr_id, qc.position,
             v.id as vehicle_id, v.plate_number, v.model,
             c.name as campaign_name
      FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      LEFT JOIN campaigns c ON qc.campaign_id = c.id
      WHERE v.publisher_id = ?
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    return { logs: logs.results, total: total ? total.c : 0 };
  },

  'advertiser.stats': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);
    const days = params.days || 30;

    const campaigns = await env.DB.prepare(
      "SELECT id, name, status FROM campaigns WHERE advertiser_id = ?"
    ).bind(user.id).all();

    const campaignIds = campaigns.results.map(c => c.id);
    if (campaignIds.length === 0) {
      return { totalScans: 0, todayScans: 0, dailyAvg: 0, activeCampaigns: 0, daily: [], hourly: [], campaigns: [] };
    }

    const placeholders = campaignIds.map(() => '?').join(',');

    const totalScans = await env.DB.prepare(`
      SELECT COUNT(*) as c FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      WHERE qc.campaign_id IN (${placeholders}) AND e.event_type = 'scan' AND e.created_at > date('now', '-${days} days')
    `).bind(...campaignIds).first();

    const todayScans = await env.DB.prepare(`
      SELECT COUNT(*) as c FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      WHERE qc.campaign_id IN (${placeholders}) AND e.event_type = 'scan' AND date(e.created_at) = date('now')
    `).bind(...campaignIds).first();

    const daily = await env.DB.prepare(`
      SELECT date(e.created_at) as date, COUNT(*) as count FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      WHERE qc.campaign_id IN (${placeholders}) AND e.event_type = 'scan' AND e.created_at > date('now', '-${days} days')
      GROUP BY date(e.created_at) ORDER BY date ASC
    `).bind(...campaignIds).all();

    const hourly = await env.DB.prepare(`
      SELECT strftime('%H', e.created_at) as hour, COUNT(*) as count FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      WHERE qc.campaign_id IN (${placeholders}) AND e.event_type = 'scan'
      GROUP BY hour
    `).bind(...campaignIds).all();

    const activeCampaigns = campaigns.results.filter(c => c.status === 'active').length;
    const daysDiff = Math.max(days, 1);
    const dailyAvg = daily.results.length > 0 ? (totalScans.c / daysDiff) : 0;

    return {
      totalScans: totalScans.c,
      todayScans: todayScans.c,
      dailyAvg: Math.round(dailyAvg * 10) / 10,
      activeCampaigns,
      daily: daily.results,
      hourly: hourly.results,
      campaigns: campaigns.results
    };
  },

  'advertiser.campaigns': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);

    const campaigns = await env.DB.prepare(`
      SELECT c.id, c.name, c.target_url, c.status, c.minisite_id,
             (SELECT COUNT(*) FROM qr_codes qc WHERE qc.campaign_id = c.id) as vehicle_count,
             (SELECT COUNT(*) FROM events e JOIN qr_codes qc ON e.qr_id = qc.id WHERE qc.campaign_id = c.id AND e.event_type = 'scan' AND e.created_at > date('now', '-30 days')) as scans_month
      FROM campaigns c
      WHERE c.advertiser_id = ?
      ORDER BY c.id DESC
    `).bind(user.id).all();

    return { campaigns: campaigns.results };
  },

  'advertiser.logs': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);
    const offset = Math.max(0, parseInt(params.offset) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 20));

    const total = await env.DB.prepare(`
      SELECT COUNT(*) as c FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN campaigns c ON qc.campaign_id = c.id
      WHERE c.advertiser_id = ?
    `).bind(user.id).first();

    const logs = await env.DB.prepare(`
      SELECT e.id, e.created_at, e.event_type,
             qc.id as qr_id, qc.position,
             v.plate_number, v.model,
             c.name as campaign_name
      FROM events e
      JOIN qr_codes qc ON e.qr_id = qc.id
      JOIN vehicles v ON qc.vehicle_id = v.id
      JOIN campaigns c ON qc.campaign_id = c.id
      WHERE c.advertiser_id = ?
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    return { logs: logs.results, total: total ? total.c : 0 };
  },

  'advertiser.minisite.get': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);

    const minisite = await env.DB.prepare(
      "SELECT id, title, config FROM minisites WHERE advertiser_id = ? LIMIT 1"
    ).bind(user.id).first();

    return { minisite: minisite || null };
  },

  'advertiser.minisite.save': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);
    const { title, config, campaign_id } = params;

    const existing = await env.DB.prepare(
      "SELECT id FROM minisites WHERE advertiser_id = ? LIMIT 1"
    ).bind(user.id).first();

    let minisiteId;
    if (existing) {
      await env.DB.prepare("UPDATE minisites SET title = ?, config = ? WHERE id = ?")
        .bind(title || '', JSON.stringify(config || {}), existing.id).run();
      minisiteId = existing.id;
    } else {
      const result = await env.DB.prepare("INSERT INTO minisites (advertiser_id, title, config) VALUES (?, ?, ?)")
        .bind(user.id, title || '', JSON.stringify(config || {})).run();
      minisiteId = result.meta.last_row_id;
    }

    if (campaign_id) {
      await env.DB.prepare("UPDATE campaigns SET minisite_id = ? WHERE id = ? AND advertiser_id = ?")
        .bind(minisiteId, campaign_id, user.id).run();
    }

    return { success: true, minisite_id: minisiteId };
  },

  'qr.generate': async (params, env, context) => {
    await authenticate(context.request, env, ['advertiser', 'admin']);
    const { vehicle_id, campaign_id, position } = params;
    if (!vehicle_id || !campaign_id) throw new Error("Missing required params: vehicle_id, campaign_id");

    const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
        .bind(vehicle_id, campaign_id, position).run();
    const lastId = result.meta.last_row_id;

    return { shortId: toBase62(lastId), id: lastId };
  },

  'campaign.update': async (params, env, context) => {
    const auth = await authenticate(context.request, env, ['advertiser', 'admin']);
    const { id, target_url, redirect_mode } = params;
    if (!id || !target_url) throw new Error("Missing required params: id, target_url");

    const campaign = await env.DB.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first();
    if (!campaign) throw new Error("Campaign not found");
    if (auth.user.role === 'advertiser' && campaign.advertiser_id !== auth.user.id) {
      throw new Error("Forbidden");
    }

    await env.DB.prepare("UPDATE campaigns SET target_url = ? WHERE id = ?")
        .bind(target_url, id).run();
    if (redirect_mode) {
      await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?")
          .bind(redirect_mode, id).run();
    }

    return { success: true };
  },

  'campaign.list': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);

    const campaigns = await env.DB.prepare(
      "SELECT id, name, target_url, status FROM campaigns WHERE advertiser_id = ? ORDER BY id DESC"
    ).bind(user.id).all();

    return { campaigns: campaigns.results };
  },

  'vehicle.list': async (params, env, context) => {
    const auth = await authenticate(context.request, env, ['advertiser', 'admin']);

    let vehicles;
    if (auth.user.role === 'admin') {
      vehicles = await env.DB.prepare(`
        SELECT v.id, v.plate_number, v.model, v.status, u.name as publisher_name
        FROM vehicles v LEFT JOIN users u ON v.publisher_id = u.id ORDER BY v.id DESC
      `).all();
    } else {
      vehicles = await env.DB.prepare(`
        SELECT v.id, v.plate_number, v.model, v.status,
               (SELECT COUNT(*) FROM qr_codes qc WHERE qc.vehicle_id = v.id AND qc.campaign_id IN (SELECT id FROM campaigns WHERE advertiser_id = ?)) as has_ads
        FROM vehicles v WHERE v.status = 'active' ORDER BY v.id DESC
      `).bind(auth.user.id).all();
    }

    return { vehicles: vehicles.results };
  },

  'vehicle.withAds': async (params, env, context) => {
    const { user } = await authenticate(context.request, env, ['advertiser']);

    const vehicles = await env.DB.prepare(`
      SELECT DISTINCT v.id, v.plate_number, v.model,
             qc.position, qc.redirect_mode, qc.id as qr_id,
             c.id as campaign_id, c.name as campaign_name, c.target_url
      FROM vehicles v
      JOIN qr_codes qc ON qc.vehicle_id = v.id
      JOIN campaigns c ON qc.campaign_id = c.id
      WHERE c.advertiser_id = ?
      ORDER BY v.id
    `).bind(user.id).all();

    return { vehicles: vehicles.results };
  },

  'stats.get': async (params, env, context) => {
    await authenticate(context.request, env);
    const days = params.days || 7;
    const daily = await env.DB.prepare(
      `SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-${days} days') GROUP BY date(created_at) ORDER BY date ASC`
    ).all();
    const hourly = await env.DB.prepare(
      `SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`
    ).all();

    return { daily: daily.results, hourly: hourly.results };
  },

  'user.profile': async (params, env, context) => {
    const { user } = await authenticate(context.request, env);
    return { user: { id: user.id, email: user.email, role: user.role, name: user.name } };
  }

};

export async function handleJsonRpc(request, env, context) {
  if (request.headers.get("content-type") !== "application/json") {
    return jsonRpcError(ERROR_CODES.INVALID_REQUEST, "Content-Type must be application/json");
  }

  let rpcRequest;
  try {
    rpcRequest = await request.json();
  } catch {
    return jsonRpcError(ERROR_CODES.PARSE_ERROR, "Parse error");
  }

  const isArray = Array.isArray(rpcRequest);
  const requests = isArray ? rpcRequest : [rpcRequest];
  const responses = [];

  for (const req of requests) {
    if (!req || typeof req !== 'object') {
      responses.push({ jsonrpc: "2.0", error: { code: ERROR_CODES.INVALID_REQUEST, message: "Invalid Request" }, id: null });
      continue;
    }

    if (req.jsonrpc !== "2.0" || !req.method) {
      responses.push({ jsonrpc: "2.0", error: { code: ERROR_CODES.INVALID_REQUEST, message: "Invalid Request" }, id: req.id });
      continue;
    }

    const method = METHODS[req.method];
    if (!method) {
      responses.push({ jsonrpc: "2.0", error: { code: ERROR_CODES.METHOD_NOT_FOUND, message: "Method not found" }, id: req.id });
      continue;
    }

    try {
      context.request = request;
      const result = await method(req.params || {}, env, context);
      responses.push({ jsonrpc: "2.0", result, id: req.id });
    } catch (err) {
      const code = err.code || ERROR_CODES.INTERNAL_ERROR;
      responses.push({
        jsonrpc: "2.0",
        error: { code, message: err.message || "Internal error" },
        id: req.id
      });
    }
  }

  return new Response(JSON.stringify(isArray ? responses : responses[0]), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
