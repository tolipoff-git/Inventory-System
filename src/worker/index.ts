export interface WorkerFetcher {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export interface WorkerKVNamespace {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
}

export interface Env {
  ASSETS: WorkerFetcher;
  INVENTORY_KV?: WorkerKVNamespace;
  KV?: WorkerKVNamespace;
  SYNC_SECRET?: string;
  /** Space or comma separated list of allowed browser origins (CORS). */
  ALLOWED_ORIGIN?: string;
}

// In-memory fallback cache across edge isolate invocations
const memoryStore = new Map<string, string>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const kv = env.INVENTORY_KV || env.KV;

    // CORS origin policy: only explicit allowlisted origins are reflected back.
    // Requests without an Origin header (curl, server-side clients, same-origin
    // navigation) are unaffected; disallowed origins are rejected with 403.
    const originHeader = request.headers.get('Origin');
    const allowedOrigin = originIsAllowed(originHeader, env.ALLOWED_ORIGIN);
    if (originHeader && !allowedOrigin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': 'null',
          'Content-Type': 'application/json',
        },
      });
    }

    // Security & Privacy Headers (Anti-indexing & strict isolation)
    const securityHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': allowedOrigin || 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: securityHeaders, status: 204 });
    }

    // Health & Info Endpoint
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'inventory-system',
          time: new Date().toISOString(),
          hasKv: Boolean(kv),
        }),
        {
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Cloudflare Worker Photo Viewing Endpoint: /photo/:room/:photoId and /api/photo/:room/:photoId
    const photoMatch = url.pathname.match(/^\/(?:api\/)?photo\/([^/]+)\/([^/]+)\/?$/);
    if (photoMatch) {
      // Photo endpoints require the same Bearer auth as sync. Browsers cannot
      // set the Authorization header on navigation or <img> requests, so the
      // token is also accepted as a ?token= query param (used by the PWA and
      // the standalone HTML photo viewer).
      const acceptsHtmlRequest = (request.headers.get('Accept') || '').includes('text/html');
      if (!isAuthorized(request, env.SYNC_SECRET, url)) {
        const body = acceptsHtmlRequest
          ? renderUnauthorizedHtml()
          : JSON.stringify({ error: 'Unauthorized: missing or invalid token' });
        return new Response(body, {
          status: 401,
          headers: {
            ...securityHeaders,
            'Content-Type': acceptsHtmlRequest ? 'text/html; charset=utf-8' : 'application/json',
          },
        });
      }

      const rawRoom = photoMatch[1];
      const rawPhotoId = photoMatch[2];
      const room = safeDecodeURIComponent(rawRoom);
      const photoId = safeDecodeURIComponent(rawPhotoId);

      if (room === null || photoId === null) {
        return new Response(JSON.stringify({ error: 'Malformed URI encoding' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        });
      }

      const cleanRoom = room.trim();
      const cleanPhotoId = photoId.trim();

      if (!cleanRoom || !cleanPhotoId) {
        return new Response(JSON.stringify({ error: 'Missing room or photoId' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isRaw = url.searchParams.get('raw') === '1' || url.searchParams.get('raw') === 'true';
      const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';
      const acceptHeader = request.headers.get('Accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');
      const wantsHtml = acceptsHtml && !isRaw && !isDownload;

      // KV key lookups
      const upperRoom = cleanRoom.toUpperCase();
      const primaryKey = `photo_${upperRoom}_${cleanPhotoId}`;
      const fallbackKey = `photo_${cleanRoom}_${cleanPhotoId}`;

      let rawData: string | null = null;
      if (kv) {
        try {
          rawData = await kv.get(primaryKey);
          if (!rawData && primaryKey !== fallbackKey) {
            rawData = await kv.get(fallbackKey);
          }
        } catch (e) {
          console.error('KV photo read error:', e);
        }
      }

      if (!rawData) {
        rawData = memoryStore.get(primaryKey) || memoryStore.get(fallbackKey) || null;
      }

      if (!rawData) {
        if (wantsHtml) {
          return new Response(renderNotFoundHtml(cleanRoom, cleanPhotoId), {
            status: 404,
            headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response(
          JSON.stringify({
            error: 'Photo not found',
            room: cleanRoom,
            photoId: cleanPhotoId,
            message: 'The photo has not yet synced to the cloud from the station device or has expired after 7 days.',
          }),
          {
            status: 404,
            headers: { ...securityHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      let payload: { id?: string; url?: string; caption?: string; timestamp?: string } = {};
      try {
        payload = JSON.parse(rawData);
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: 'Corrupt photo data', details: err?.message }),
          { status: 500, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const photoUrl = payload.url || '';
      const caption = payload.caption || '';
      const timestamp = payload.timestamp || '';

      // Validate photoUrl (XSS + SSRF prevention): http(s) must point to a
      // public host (no loopback / RFC1918 / link-local / bare hostnames) and
      // data: URLs must be real raster images.
      if (!isSafePhotoUrl(photoUrl)) {
        return new Response(
          JSON.stringify({ error: 'Invalid or insecure photo URL format' }),
          { status: 400, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return binary image directly if requested raw, download, or non-HTML request
      if (isRaw || isDownload || !acceptsHtml) {
        if (photoUrl.startsWith('data:')) {
          const match = photoUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
          if (!match) {
            return new Response('Invalid data URL image encoding', { status: 400, headers: securityHeaders });
          }
          const mimeType = match[1];
          const base64Str = match[2];

          // Sanity guard: only raster image MIME types are served; anything
          // else (HTML, SVG-as-XML, scripts) is rejected outright.
          if (!/^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(mimeType)) {
            return new Response('Unsupported image content type', { status: 415, headers: securityHeaders });
          }
          // Decoded payload must stay under 5 MiB to bound worker memory.
          if (base64Str.length > MAX_PHOTO_BASE64_CHARS) {
            return new Response('Image exceeds 5 MiB limit', { status: 413, headers: securityHeaders });
          }
          const bytes = base64ToUint8Array(base64Str);
          const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
          const disposition = isDownload ? 'attachment' : 'inline';

          return new Response(bytes, {
            status: 200,
            headers: {
              ...securityHeaders,
              'Content-Type': mimeType,
              'Content-Disposition': `${disposition}; filename="${cleanPhotoId}.${ext}"`,
              'Cache-Control': 'public, max-age=604800',
            },
          });
        } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
          try {
            const parsedUrl = new URL(photoUrl);
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
              return Response.redirect(parsedUrl.toString(), 302);
            } else {
              return new Response('Invalid redirect protocol', { status: 400, headers: securityHeaders });
            }
          } catch {
            return new Response('Invalid redirect URL', { status: 400, headers: securityHeaders });
          }
        } else {
          return new Response('Image data empty or invalid', { status: 404, headers: securityHeaders });
        }
      }

      // Default browser request: return standalone responsive dark-mode HTML viewer
      return new Response(renderViewerHtml(cleanRoom, cleanPhotoId, caption, timestamp, photoUrl, url.searchParams.get('token') || ''), {
        status: 200,
        headers: {
          ...securityHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Real-time Sync API: /api/sync/:key
    if (url.pathname.startsWith('/api/sync/')) {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: {
            ...securityHeaders,
            'Allow': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
          },
        });
      }

      // Fail-closed auth: sync endpoints require env.SYNC_SECRET to be set. If
      // the secret is missing the endpoints return 503 and never pass through.
      if (!env.SYNC_SECRET) {
        return new Response(
          JSON.stringify({ error: 'SYNC_SECRET not configured' }),
          {
            status: 503,
            headers: { ...securityHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (!constantTimeEq(request.headers.get('Authorization') || '', `Bearer ${env.SYNC_SECRET}`)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: missing or invalid Bearer token' }),
          {
            status: 401,
            headers: { ...securityHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const rawKey = url.pathname.replace('/api/sync/', '');
      const key = safeDecodeURIComponent(rawKey);

      if (key === null) {
        return new Response(JSON.stringify({ error: 'Malformed URI encoding' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        });
      }

      const cleanKey = key.trim();

      if (!cleanKey) {
        return new Response(JSON.stringify({ error: 'Missing sync key' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/sync/:key
      if (request.method === 'GET') {
        let rawData: string | null = null;

        if (kv) {
          try {
            rawData = await kv.get(cleanKey);
          } catch (e) {
            console.error('KV read error:', e);
          }
        }

        if (!rawData) {
          rawData = memoryStore.get(cleanKey) || null;
        }

        if (!rawData) {
          return new Response(JSON.stringify({ notFound: true, key: cleanKey }), {
            status: 404,
            headers: { ...securityHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(rawData, {
          status: 200,
          headers: {
            ...securityHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      }

      // POST /api/sync/:key
      if (request.method === 'POST') {
        try {
          const bodyText = await request.text();

          // Validate JSON payload
          JSON.parse(bodyText);

          if (kv) {
            try {
              // 7 days expiration TTL
              await kv.put(cleanKey, bodyText, { expirationTtl: 604800 });
            } catch (e) {
              console.error('KV write error:', e);
            }
          }

          // Always update in-memory fallback
          memoryStore.set(cleanKey, bodyText);

          return new Response(
            JSON.stringify({
              success: true,
              key: cleanKey,
              timestamp: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { ...securityHeaders, 'Content-Type': 'application/json' },
            }
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON body', details: err?.message }),
            {
              status: 400,
              headers: { ...securityHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }
    }

    // Default: Static Asset Serving via Cloudflare Assets with Security & Anti-Indexing Headers
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetResponse = await env.ASSETS.fetch(request);
      const assetHeaders = new Headers(assetResponse.headers);
      assetHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
      assetHeaders.set('X-Content-Type-Options', 'nosniff');
      assetHeaders.set('X-Frame-Options', 'SAMEORIGIN');

      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: assetHeaders,
      });
    }

    return new Response('Asset fetcher not available in this isolate', { status: 404 });
  },
};

/** Max base64 chars for a 5 MiB photo: 5 * 1024 * 1024 bytes * 4/3 + slack. */
const MAX_PHOTO_BASE64_CHARS = 5 * 1024 * 1024 * 4 / 3 + 4096;

/**
 * Timing-safe string comparison (fixed-length XOR scan). Length leaks, contents don't.
 */
function constantTimeEq(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Photo endpoints are guarded with the same secret as sync. Browsers cannot set
 * the Authorization header on navigation or <img> requests, so the token is also
 * accepted as a ?token= query parameter (used by the PWA and standalone viewer).
 */
function isAuthorized(request: Request, syncSecret: string | undefined, url: URL): boolean {
  if (!syncSecret) return false;
  const headerToken = request.headers.get('Authorization') || '';
  const queryToken = url.searchParams.get('token') || '';
  return constantTimeEq(headerToken, `Bearer ${syncSecret}`) || constantTimeEq(queryToken, syncSecret);
}

/**
 * Validates that a stored photoUrl is safe to serve (XSS + SSRF guard):
 * - http(s): must have a DNS hostname and a publicly routable, non-reserved IP
 *   (no loopback, RFC1918, link-local, IPv4-mapped IPv6, bare numeric or single
 *   label hosts). Pure CF Workers: no DNS lookup, so private IP checks cover the
 *   obvious SSRF vectors and bare hostnames (which could resolve to internal
 *   hosts / cloud metadata) are rejected outright.
 * - data: must be a base64 raster image of an allowed MIME type.
 */
function isSafePhotoUrl(photoUrl: string): boolean {
  if (!photoUrl) return false;
  if (/^data:/i.test(photoUrl)) {
    const match = photoUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    return !!match && /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(match[1]);
  }

  let parsed: URL;
  try {
    parsed = new URL(photoUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(host)) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;

  // Require a DNS-style hostname with at least two labels (avoids single-label
  // hosts that could resolve to internal networks / cloud metadata).
  const labels = host.split('.');
  if (labels.length < 2) return false;

  // Reject bare IPv4 / bracketed IPv6 literal addresses (no DNS name resolution).
  const literal = parsed.hostname.startsWith('[') ? parsed.hostname : host;
  if (isIpv4(literal) || isIpv6(literal)) return false;

  if (isIpv4(host)) return false; // IPv4 literal in DNS label form (e.g. "0x7f000001")
  const normalized = normalizeIpv4(host);
  if (normalized) {
    return !isPrivateIpv4(normalized);
  }

  return true;
}

function isIpv4(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function isIpv6(s: string): boolean {
  const c = s.trim();
  return c.includes(':');
}

/** Resolves hex / octal / leading-zero IPv4 forms to dotted decimal, else null. */
function normalizeIpv4(s: string): string | null {
  const m = s.match(/^(.+)\.(.+)\.(.+)\.(.+)$/);
  if (!m) return null;
  const parts = m.slice(1).map(parseIpv4Part);
  if (parts.some(n => n === null || n < 0 || n > 255)) return null;
  return (parts as number[]).join('.');
}

/** Parses a dotted-octet component allowing decimal, hex (0x..) and octal (0..) forms. */
function parseIpv4Part(s: string): number | null {
  if (!/^\d+$/.test(s) && !/^0x[0-9a-f]+$/i.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 127)
    || (a === 0)
    || (a === 100 && b >= 64 && b <= 127);
}

/** Minimal dark-mode 401 page for browser navigation to a protected photo. */
function renderUnauthorizedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unauthorized | 5S Tool Command Center</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #05080e;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #0d1527;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      border: 1px solid transparent;
      margin-top: 20px;
    }
    .btn-primary { background: #00d2ff; color: #05080e; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Unauthorized</h1>
    <p>Access to this photo requires a valid access token.</p>
    <div class="badge">Authentication Required</div>
    <div><a href="/" class="btn btn-primary">Return to System</a></div>
  </div>
</body>
</html>`;
}

/**
 * Returns the reflected CORS origin when the request Origin is allowlisted
 * (env.ALLOWED_ORIGIN as space/comma separated list), else null.
 * No Origin header is allowed through (server-side / same-origin calls).
 */
function originIsAllowed(origin: string | null, allowlist: string | undefined): string | null {
  if (!origin) return null;
  if (!allowlist || !allowlist.trim()) return null;
  const allowed = allowlist
    .split(/[\s,]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(origin.toLowerCase()) ? origin : null;
}

function safeDecodeURIComponent(str: string): string | null {
  try {
    return decodeURIComponent(str);
  } catch {
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function renderNotFoundHtml(room: string, photoId: string): string {
  const safeRoom = escapeHtml(room);
  const safeId = escapeHtml(photoId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Photo Not Available | 5S Tool Command Center</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #05080e;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #0d1527;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
    code {
      background: #05080e;
      border: 1px solid #1e293b;
      padding: 2px 8px;
      border-radius: 6px;
      color: #38bdf8;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 13px;
    }
    .badge {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .actions { display: flex; gap: 10px; justify-content: center; margin-top: 24px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }
    .btn-primary { background: #00d2ff; color: #05080e; font-weight: 700; }
    .btn-primary:hover { background: #38bdf8; }
    .btn-secondary { background: #1e293b; color: #e2e8f0; border-color: #334155; }
    .btn-secondary:hover { background: #334155; color: #ffffff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📷</div>
    <h1>Photo Not Found</h1>
    <p>The requested photo <code>${safeId}</code> in sync room <code>${safeRoom}</code> is not available in cloud storage.</p>
    <div class="badge">Unavailable or Expired</div>
    <div class="actions">
      <a href="/" class="btn btn-primary">Return to Dashboard</a>
      <a href="javascript:location.reload()" class="btn btn-secondary">Retry</a>
    </div>
  </div>
</body>
</html>`;
}

function renderViewerHtml(room: string, photoId: string, caption: string, timestamp: string, photoUrl: string, token: string): string {
  const safeRoom = escapeHtml(room);
  const safeId = escapeHtml(photoId);
  const safeCaption = escapeHtml(caption || 'Inspection / Tool Photo');
  const safeTime = escapeHtml(timestamp ? new Date(timestamp).toLocaleString() : 'N/A');
  const safePhotoUrl = escapeHtml(photoUrl);
  const downloadLink = `/api/photo/${encodeURIComponent(room)}/${encodeURIComponent(photoId)}?download=1${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeCaption} | 5S Tool Photo Viewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #05080e;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .container {
      background: #0d1527;
      border: 1px solid #1e293b;
      border-radius: 16px;
      overflow: hidden;
      max-width: 900px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 16px 20px;
      background: #0b1220;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .header h1 {
      font-size: 16px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-tag {
      font-size: 12px;
      background: rgba(0, 210, 255, 0.1);
      border: 1px solid rgba(0, 210, 255, 0.3);
      color: #00d2ff;
      padding: 4px 10px;
      border-radius: 20px;
      font-family: ui-monospace, monospace;
    }
    .img-wrap {
      background: #03060a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      min-height: 320px;
      max-height: 75vh;
      overflow: hidden;
    }
    .img-wrap img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .footer {
      padding: 16px 20px;
      background: #0b1220;
      border-top: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .caption {
      font-size: 13px;
      color: #cbd5e1;
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }
    .btn-primary { background: #00d2ff; color: #05080e; font-weight: 700; }
    .btn-primary:hover { background: #38bdf8; }
    .btn-secondary { background: #1e293b; color: #e2e8f0; border-color: #334155; }
    .btn-secondary:hover { background: #334155; color: #ffffff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📷 5S Photo Record: ${safeId}</h1>
      <span class="meta-tag">Room: ${safeRoom} · ${safeTime}</span>
    </div>
    <div class="img-wrap">
      <img src="${safePhotoUrl}" alt="${safeCaption}">
    </div>
    <div class="footer">
      <div class="caption">
        <strong>Notes:</strong> ${safeCaption}
      </div>
      <div class="actions">
        <a href="${downloadLink}" class="btn btn-secondary">💾 Download</a>
        <a href="/" class="btn btn-primary">Return to System</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
