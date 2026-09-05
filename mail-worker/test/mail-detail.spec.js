import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1 } from './helpers/d1';
import { email } from '../src/entity/email';
import { account } from '../src/entity/account';
import { star } from '../src/entity/star';
import { att } from '../src/entity/att';
import detailService from '../src/service/mail-detail-service';
import objectAccessService from '../src/service/object-access-service';
import permService from '../src/service/perm-service';
import jwtUtils from '../src/utils/jwt-utils';

let db;
const key = 'attachments/0123456789abcdef0123456789abcdef.png';
let c;
beforeEach(() => {
  db = createD1([email, account, star, att]);
  db.sqlite.prepare('INSERT INTO account (account_id,user_id,is_del) VALUES (1,1,0),(2,2,0)').run();
  db.sqlite.prepare('INSERT INTO email (email_id,user_id,account_id,is_del,content,text) VALUES (1,1,1,0,?,?),(2,2,2,0,?,?)')
    .run(`<img src="{{domain}}${key}">`, 'full mail', 'another user secret', 'other');
  db.sqlite.prepare('INSERT INTO attachments (att_id,email_id,user_id,account_id,key,type) VALUES (1,1,1,1,?,0)').run(key);
  c = { env: { db, jwt_secret: 'local-detail-secret', admin: 'admin@example.com' },
    req: { url: 'https://mail.example.com/api/email/detail' }, get: name => name === 'user' ? { userId: 1, email: 'user@example.com' } : null };
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe('authorized on-demand mail detail', () => {
  it('returns a complete owned message and signs only its attachment references', async () => {
    const detail = await detailService.get(c, 1);
    expect(detail.text).toBe('full mail');
    expect(detail.attList[0].key).toBe(key);
    expect(detail.attList[0].url).toMatch(/^https:\/\/mail.example.com\/api\/oss\/attachments\//);
    const token = new URL(detail.attList[0].url).searchParams.get('token');
    expect(await jwtUtils.verifyToken(c, token)).toMatchObject({ purpose: 'attachment', key });
    expect(detail.content).toContain('/api/oss/attachments/');
    expect(detail.content).not.toContain('{{domain}}');
  });
  it('cannot read another user message or mint its attachment URLs', async () => {
    const sign = vi.spyOn(objectAccessService, 'signUrl');
    await expect(detailService.get(c, 2)).rejects.toMatchObject({ code: 404 });
    expect(sign).not.toHaveBeenCalled();
  });
  it('does not authorize HTML references to attachments belonging to another mail', async () => {
    const foreign = 'attachments/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
    db.sqlite.prepare('UPDATE email SET content=? WHERE email_id=1').run(`<img src="{{domain}}${foreign}">`);
    const detail = await detailService.get(c, 1);
    expect(detail.content).not.toContain('token=');
  });
  it('denies administrator mode to ordinary users even on direct service calls', async () => {
    vi.spyOn(permService, 'userPermKeys').mockResolvedValue([]);
    await expect(detailService.get(c, 2, { admin: true })).rejects.toMatchObject({ code: 403 });
  });
  it('allows explicitly authorized administrators to inspect other messages', async () => {
    vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['all-email:query']);
    expect(await detailService.get(c, 2, { admin: true })).toMatchObject({ emailId: 2, content: 'another user secret' });
  });
  it('rejects invalid IDs and deleted mailboxes', async () => {
    await expect(detailService.get(c, '-1')).rejects.toMatchObject({ code: 400 });
    db.sqlite.exec('UPDATE account SET is_del=1 WHERE account_id=1');
    await expect(detailService.get(c, 1)).rejects.toMatchObject({ code: 404 });
  });
});
