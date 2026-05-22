function b64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(String(a));
  const bufB = encoder.encode(String(b));

  if (bufA.length !== bufB.length) return false;

  const bufC = new Uint8Array(bufA.length);
  for (let i = 0; i < bufA.length; i++) {
    bufC[i] = bufA[i] ^ bufB[i];
  }

  return bufC.reduce((acc, val) => acc | val, 0) === 0;
}

export async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = b64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const content = b64UrlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 }));
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${content}`)
  );
  
  const signature = b64UrlEncode(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    
  return `${header}.${content}.${signature}`;
}

export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, content, signature] = parts;

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(b64UrlDecode(signature), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(`${header}.${content}`)
    );

    if (!valid) return null;

    const payload = JSON.parse(b64UrlDecode(content));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
