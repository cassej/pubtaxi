import { handleJsonRpc } from '../../src/api-handlers.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean);

  // JSON-RPC endpoint
  if (request.method === 'POST') {
    return handleJsonRpc(request, env, context);
  }

  // OPTIONS for CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32600, message: "Invalid Request: Use POST with JSON body" },
    id: null
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
