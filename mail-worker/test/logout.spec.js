import { afterEach, describe, expect, it, vi } from 'vitest';
import loginService from '../src/service/login-service';
import userContext from '../src/security/user-context';
import constant from '../src/const/constant';

afterEach(() => vi.restoreAllMocks());

describe('session logout', () => {
  it('removes only the requested session and preserves the auth TTL', async () => {
    vi.spyOn(userContext, 'getToken').mockResolvedValue('current');
    const put = vi.fn();
    const c = { env: { kv: { get: vi.fn().mockResolvedValue({ tokens: ['current', 'other'] }), put } } };
    await loginService.logout(c, 1);
    expect(JSON.parse(put.mock.calls[0][1]).tokens).toEqual(['other']);
    expect(put.mock.calls[0][2]).toEqual({ expirationTtl: constant.TOKEN_EXPIRE });
  });

  it('does not remove another session when the requested token is absent', async () => {
    vi.spyOn(userContext, 'getToken').mockResolvedValue('absent');
    const put = vi.fn();
    const c = { env: { kv: { get: vi.fn().mockResolvedValue({ tokens: ['other'] }), put } } };
    await loginService.logout(c, 1);
    expect(put).not.toHaveBeenCalled();
  });

  it('is idempotent after the auth record has expired', async () => {
    vi.spyOn(userContext, 'getToken').mockResolvedValue('current');
    const put = vi.fn();
    const c = { env: { kv: { get: vi.fn().mockResolvedValue(null), put } } };
    await expect(loginService.logout(c, 1)).resolves.toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });
});
