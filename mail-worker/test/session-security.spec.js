import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/hono/webs';
import jwtUtils from '../src/utils/jwt-utils';

afterEach(() => vi.restoreAllMocks());
describe('authentication request boundaries', () => {
  it('does not exempt unrelated routes that merely start with a public route name', async () => {
    const verify = vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue(null);
    const response = await app.request('https://mail.example.com/login-private', {}, {});
    expect(await response.json()).toMatchObject({ code: 401 });
    expect(verify).toHaveBeenCalled();
  });
  it('rejects a download capability as a login session before reading auth storage', async () => {
    vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue({ purpose: 'attachment', key: 'attachments/image.png' });
    const get = vi.fn().mockResolvedValue(null);
    const response = await app.request('https://mail.example.com/my/loginUserInfo', {}, { kv: { get } });
    expect(await response.json()).toMatchObject({ code: 401 });
    expect(get).not.toHaveBeenCalled();
  });
});
