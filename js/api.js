function getToken() {
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? match[1] : null;
}

function getUser() {
  try {
    const data = localStorage.getItem('pubtaxi_user');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function rpcCall(method, params) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  const response = await fetch('/rpc', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params: params || {}, id: 1 })
  });
  const data = await response.json();
  if (data.error) {
    if (data.error.code === -32001) {
      window.location.href = '/auth.html';
      return null;
    }
    throw new Error(data.error.message);
  }
  return data.result;
}

async function api(method, params) {
  try {
    return await rpcCall(method, params);
  } catch (err) {
    console.error(`RPC ${method}:`, err);
    throw err;
  }
}

function logout() {
  document.cookie = 'token=; Max-Age=0; Path=/';
  document.cookie = 'puid=; Max-Age=0; Path=/';
  localStorage.removeItem('pubtaxi_user');
  window.location.href = '/auth.html';
}

function formatCurrency(amount) {
  return '$' + Number(amount || 0).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
