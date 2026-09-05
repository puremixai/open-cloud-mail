import jwtUtils from '../utils/jwt-utils';
import r2Service from './r2-service';
import { normalizeContentDisposition } from '../utils/content-disposition';

const ATTACHMENT_TTL = 15 * 60;
// Legacy objects are content hashes plus the original extension. New objects
// use an operation ID and slot, preventing deletion/upload races on shared keys.
const objectName = /^[a-f0-9]{32}(?:\.[^/\\\u0000-\u001f\u007f]*)?$/iu;
const operationObject = /^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|receive-[a-f0-9]{64})\/(?:0|[1-9]\d*)$/i;

export function objectKind(key) {
  if (typeof key !== 'string' || key.length > 1024) return null;
  if (key.startsWith('attachments/') && operationObject.test(key.slice('attachments/'.length))) return 'attachment';
  for (const [prefix, kind] of [['attachments/', 'attachment'], ['static/background/', 'background']]) {
    if (key.startsWith(prefix) && objectName.test(key.slice(prefix.length))) return kind;
  }
  return null;
}

const objectAccessService = {
  async signUrl(c, key) {
    if (objectKind(key) !== 'attachment') return null;
    const token = await jwtUtils.generateToken(c, { purpose: 'attachment', key }, ATTACHMENT_TTL);
    const url = new URL(`/api/oss/${key.split('/').map(encodeURIComponent).join('/')}`, c.req.url);
    url.searchParams.set('token', token);
    return url.toString();
  },

  async response(c, key, token) {
    const kind = objectKind(key);
    if (!kind) return new Response('Not found', { status: 404 });
    if (kind === 'attachment') {
      const capability = token ? await jwtUtils.verifyToken(c, token) : null;
      const now = Math.floor(Date.now() / 1000);
      if (capability?.purpose !== 'attachment' || capability.key !== key
          || !Number.isFinite(capability.exp) || capability.exp <= now
          || capability.exp > now + ATTACHMENT_TTL) {
        return new Response('Download link is invalid or expired', { status: 403 });
      }
    }

    let object;
    try {
      object = await r2Service.getObj(c, key);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return new Response('Not found', { status: 404 });
      }
      throw error;
    }
    if (!object) return new Response('Not found', { status: 404 });

    // KV/S3 return Response; R2 returns R2ObjectBody. Retain metadata for both.
    const headers = object instanceof Response ? new Headers(object.headers) : new Headers();
    if (object.httpMetadata) {
      for (const [name, value] of Object.entries({
        'Content-Type': object.httpMetadata.contentType,
        'Content-Disposition': normalizeContentDisposition(object.httpMetadata.contentDisposition),
      })) {
        if (value) headers.set(name, value);
      }
    }
    const contentType = headers.get('Content-Type') || 'application/octet-stream';
    headers.set('Content-Type', contentType);
    // Uploaded HTML/SVG must never execute on the application origin.
    const rasterImage = /^image\/(png|jpeg|gif|webp|avif|bmp|x-icon)(?:;|$)/i.test(contentType);
    const disposition = headers.get('Content-Disposition');
    if (!rasterImage) {
      headers.set('Content-Disposition', normalizeContentDisposition(disposition, 'attachment'));
    } else {
      headers.set('Content-Disposition', normalizeContentDisposition(disposition) || 'inline');
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', kind === 'attachment' ? 'private, no-store' : 'public, max-age=86400');
    return new Response(object.body, { headers });
  },
};

export default objectAccessService;
