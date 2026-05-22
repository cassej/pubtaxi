import * as apiHandlers from '../../src/api-handlers.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean);

  const action = path[1];

  if (action === 'event' && request.method === 'POST') return apiHandlers.handleEventTrack(request, env, context);
  if (action === 'login' && request.method === 'POST') return apiHandlers.handleLogin(request, env);
  if (action === 'generate-qr' && request.method === 'POST') return apiHandlers.handleGenerateQr(request, env);
  if (action === 'update-campaign' && request.method === 'POST') return apiHandlers.handleUpdateCampaign(request, env);
  if (action === 'stats') return apiHandlers.handleStats(env);

  return new Response(JSON.stringify({ error: "API Action not found: " + action }), { status: 404 });
}
