import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/hono/webs';
import r2Service from '../src/service/r2-service';
import jwtUtils from '../src/utils/jwt-utils';
import worker from '../src/index';
import objectAccessService from '../src/service/object-access-service';

const env = { jwt_secret: 'local-test-signing-secret-only', domain: ['example.com'] };
const key = 'attachments/0123456789abcdef0123456789abcdef.png';

afterEach(() => vi.restoreAllMocks());

describe('object download boundary', () => {
  it.each([
    'attachments/12345678-1234-4234-8234-123456789abc/0',
    `attachments/receive-${'a'.repeat(64)}/12`,
    'attachments/0123456789abcdef0123456789abcdef.custom suffix',
    `attachments/0123456789abcdef0123456789abcdef.${'x'.repeat(90)}`,
  ])('serves producer and legacy object key %s', async producedKey => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('attachment'));
    const link = await objectAccessService.signUrl({ env, req: { url: 'https://mail.example.com/api/email/detail' } }, producedKey);
    expect(link).toBeTruthy();
    const response = await worker.fetch(new Request(link), env, {});
    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith(expect.anything(), producedKey);
  });

  it.each(['mail-raw/private.eml', 'attachments/../setting:', 'attachments/receive-not-a-hash/0',
    'attachments/12345678-1234-4234-8234-123456789abc/../setting:', 'attachments/a/b/c'])('never signs invalid namespace/path %s', async badKey => {
    expect(await objectAccessService.signUrl({ env, req: { url: 'https://mail.example.com/' } }, badKey)).toBeNull();
  });

  it('rejects anonymous configuration keys without reading storage', async () => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('fake-secret'));
    const response = await app.request('https://mail.example.com/oss/setting:', {}, env);
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it('requires an attachment capability and does not read unsigned private objects', async () => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('private'));
    const response = await app.request(`https://mail.example.com/oss/${key}`, {}, env);
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('serves a signed attachment with the storage headers and private cache policy', async () => {
    vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('pixels', {
      headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'inline;filename=image.png' },
    }));
    const token = await jwtUtils.generateToken({ env }, { purpose: 'attachment', key }, 900);
    const response = await app.request(`https://mail.example.com/oss/${key}?token=${token}`, {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('pixels');
  });

  it('rejects a valid signature for a different object', async () => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('private'));
    const token = await jwtUtils.generateToken({ env }, { purpose: 'attachment', key: key + '.other' }, 900);
    const response = await app.request(`https://mail.example.com/oss/${key}?token=${token}`, {}, env);
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing public background instead of throwing', async () => {
    vi.spyOn(r2Service, 'getObj').mockResolvedValue(null);
    const response = await app.request('https://mail.example.com/oss/static/background/0123456789abcdef0123456789abcdef.png', {}, env);
    expect(response.status).toBe(404);
  });

  it('does not allow the legacy root attachment path to bypass verification', async () => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('private'));
    const response = await worker.fetch(new Request(`https://mail.example.com/${key}`), env, {});
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { purpose: 'attachment', key, exp: 1 },
    { purpose: 'attachment', key },
    { purpose: 'session', key, exp: Math.floor(Date.now() / 1000) + 60 },
  ])('rejects expired, non-expiring, or wrong-purpose tokens', async payload => {
    const read = vi.spyOn(r2Service, 'getObj').mockResolvedValue(new Response('private'));
    const token = await jwtUtils.generateToken({ env }, payload);
    const response = await app.request(`https://mail.example.com/oss/${key}?token=${token}`, {}, env);
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('forces uploaded active documents to download in a sandbox', async () => {
    const htmlKey = key.replace('.png', '.html');
    vi.spyOn(r2Service, 'getObj').mockResolvedValue({ body: 'untrusted html', httpMetadata: {
      contentType: 'text/html', contentDisposition: 'inline',
    } });
    const token = await jwtUtils.generateToken({ env }, { purpose: 'attachment', key: htmlKey }, 900);
    const response = await app.request(`https://mail.example.com/oss/${htmlKey}?token=${token}`, {}, env);
    expect(response.headers.get('content-disposition')).toBe('attachment');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
  });
});
