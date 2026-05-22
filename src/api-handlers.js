import { hashPassword, signJWT, timingSafeEqual } from './crypto.js';
import { fromBase62, toBase62 } from './index.js';

// JSON-RPC 2.0 Error codes
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

function jsonRpcError(code, message, id = null, data = null) {
  const response = {
    jsonrpc: "2.0",
    error: { code, message, ...(data && { data }) },
    id
  };
  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function jsonRpcSuccess(result, id) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    result,
    id
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// Method handlers
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

    const user = await env.DB.prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?").bind(email).first();
    if (!user) throw new Error("Invalid credentials");

    const incomingHash = await hashPassword(password);
    if (!await timingSafeEqual(user.password_hash, incomingHash)) {
      throw new Error("Invalid credentials");
    }

    const token = await signJWT({ id: user.id, role: user.role }, env.JWT_SECRET);

    // Determine redirect based on role
    const dashboardMap = {
      admin: '/admin/',
      advertiser: '/advertiser/',
      driver: '/driver/'
    };
    const redirect = dashboardMap[user.role] || '/';

    return {
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role },
      redirect
    };
  },

  'qr.generate': async (params, env) => {
    const { vehicle_id, campaign_id, position } = params;
    if (!vehicle_id || !campaign_id) throw new Error("Missing required params: vehicle_id, campaign_id");

    const result = await env.DB.prepare("INSERT INTO qr_codes (vehicle_id, campaign_id, position) VALUES (?, ?, ?)")
        .bind(vehicle_id, campaign_id, position).run();
    const lastId = result.meta.last_row_id;

    return { shortId: toBase62(lastId), id: lastId };
  },

  'campaign.update': async (params, env) => {
    const { id, target_url, redirect_mode } = params;
    if (!id || !target_url) throw new Error("Missing required params: id, target_url");

    await env.DB.prepare("UPDATE campaigns SET target_url = ?, status = 'active' WHERE id = ?")
        .bind(target_url, id).run();
    if (redirect_mode) {
      await env.DB.prepare("UPDATE qr_codes SET redirect_mode = ? WHERE campaign_id = ?")
          .bind(redirect_mode, id).run();
    }

    return { success: true };
  },

  'stats.get': async (params, env) => {
    const days = params.days || 7;
    const daily = await env.DB.prepare(
      `SELECT date(created_at) as date, count(*) as count FROM events WHERE created_at > date('now', '-${days} days') GROUP BY date(created_at) ORDER BY date ASC`
    ).all();
    const hourly = await env.DB.prepare(
      `SELECT strftime('%H', created_at) as hour, count(*) as count FROM events GROUP BY hour`
    ).all();

    return {
      daily: daily.results,
      hourly: hourly.results
    };
  },

  'user.profile': async (params, env, context) => {
    const token = context.request.headers.get("Cookie")?.match(/token=([^;]+)/)?.[1];
    if (!token) throw new Error("Not authenticated");

    // Simple JWT verification (you might want to add this to crypto.js)
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error("Invalid token");

    const payload = JSON.parse(atob(parts[1]));
    const user = await env.DB.prepare("SELECT id, email, role FROM users WHERE id = ?").bind(payload.id).first();
    if (!user) throw new Error("User not found");

    return { user };
  }
};

export async function handleJsonRpc(request, env, context) {
  console.log(JSON.stringify({ event: "rpc_request", url: request.url, method: request.method }));

  if (request.headers.get("content-type") !== "application/json") {
    console.log(JSON.stringify({ event: "rpc_content_type_error", contentType: request.headers.get("content-type") }));
    return jsonRpcError(ERROR_CODES.INVALID_REQUEST, "Content-Type must be application/json");
  }

  let rpcRequest;
  try {
    rpcRequest = await request.json();
    console.log(JSON.stringify({ event: "rpc_request_body", body: rpcRequest }));
  } catch (err) {
    console.log(JSON.stringify({ event: "rpc_parse_error", error: String(err) }));
    return jsonRpcError(ERROR_CODES.PARSE_ERROR, "Parse error");
  }

  // Handle batch requests
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
      context.request = request; // Pass request for header access
      const result = await method(req.params || {}, env, context);
      console.log(JSON.stringify({ event: "rpc_success", method: req.method, result }));
      responses.push({ jsonrpc: "2.0", result, id: req.id });
    } catch (err) {
      console.log(JSON.stringify({ event: "rpc_error", method: req.method, error: String(err), stack: err.stack }));
      responses.push({
        jsonrpc: "2.0",
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: err.message || "Internal error"
        },
        id: req.id
      });
    }
  }

  const response = isArray ? responses : responses[0];
  console.log(JSON.stringify({ event: "rpc_response", response }));

  if (isArray) {
    return new Response(JSON.stringify(responses), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// Legacy handlers for backward compatibility
export async function handleEventTrack(request, env, context) {
  return handleJsonRpc(request, env, context);
}

export async function handleLogin(request, env) {
  return handleJsonRpc(request, env, {});
}

export async function handleGenerateQr(request, env) {
  return handleJsonRpc(request, env, {});
}

export async function handleUpdateCampaign(request, env) {
  return handleJsonRpc(request, env, {});
}

export async function handleStats(env) {
  return handleJsonRpc({ json: async () => ({ method: 'stats.get', params: { days: 7 } }) }, env, {});
}
