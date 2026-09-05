import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createD1 } from './helpers/d1';
import email from '../src/entity/email';
import account from '../src/entity/account';
import { star } from '../src/entity/star';
import { att } from '../src/entity/att';
import emailService from '../src/service/email-service';

let db;
let c;
const params = { accountId: '1', allReceive: '0', size: '2', type: '0', timeSort: '0' };
const ids = result => result.list.map(item => item.emailId);

beforeEach(() => {
  db = createD1([email, account, star, att]);
  c = { env: { db } };
  db.sqlite.exec('INSERT INTO account (account_id,user_id,is_del) VALUES (1,1,0),(2,1,0),(3,2,0),(4,1,1)');
  const insert = db.sqlite.prepare(`INSERT INTO email
    (email_id,user_id,account_id,type,is_del,name,send_email,subject,text,content)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const row of [
    [1, 1, 1, 0, 0, 'Alice Morgan', 'alice@example.test', 'Hello'],
    [2, 1, 1, 0, 0, 'Bob', 'newsletter@MORGAN.test', 'Weekly update'],
    [3, 1, 1, 0, 0, 'Carol', 'carol@example.test', 'Re: Morgan proposal'],
    [4, 1, 1, 0, 0, 'Other', 'other@example.test', 'Unrelated'],
    [5, 1, 2, 0, 0, 'Morgan', 'second@example.test', 'Second mailbox'],
    [6, 2, 3, 0, 0, 'Morgan', 'private@example.test', 'Other user secret'],
    [7, 1, 1, 0, 1, 'Morgan', 'deleted@example.test', 'Deleted message'],
    [8, 1, 4, 0, 0, 'Morgan', 'closed@example.test', 'Deleted mailbox'],
    [9, 1, 1, 1, 0, 'Morgan', 'sent@example.test', 'Sent message'],
    [10, 1, 1, 0, 0, 'Discounts', 'sale@example.test', 'Save 50% on item_A!'],
    [11, 1, 1, 0, 0, 'Discounts', 'sale@example.test', 'Save 500 on itemXA'],
  ]) insert.run(...row, 'Morgan is in every body, which is outside the search scope.', '<p>Full body</p>');
});

afterEach(() => db.close());

describe('ordinary-user server-side email search', () => {
  it('matches sender name, sender address and subject, ignoring surrounding spaces and ASCII case', async () => {
    const result = await emailService.list(c, { ...params, size: '50', search: '  mOrGaN  ' }, 1);
    expect(ids(result)).toEqual([3, 2, 1]);
    expect(result.total).toBe(3);
  });

  it('keeps count independent of descending pagination and skips nonmatching rows', async () => {
    const first = await emailService.list(c, { ...params, search: 'morgan' }, 1);
    const next = await emailService.list(c, { ...params, search: 'morgan', emailId: '2' }, 1);
    expect(ids(first)).toEqual([3, 2]);
    expect(ids(next)).toEqual([1]);
    expect(first.total).toBe(3);
    expect(next.total).toBe(3);
  });

  it('supports ascending search cursors and omitting repeated counts', async () => {
    const first = await emailService.list(c, { ...params, search: 'morgan', timeSort: '1' }, 1);
    const next = await emailService.list(c, { ...params, search: 'morgan', timeSort: '1', emailId: '2', includeTotal: '0' }, 1);
    expect(ids(first)).toEqual([1, 2]);
    expect(ids(next)).toEqual([3]);
    expect(first.total).toBe(3);
    expect(next.total).toBeNull();
  });

  it('searches all owned active mailboxes without leaking other users, deleted mail or sent mail', async () => {
    const result = await emailService.list(c, { ...params, search: 'morgan', allReceive: '1', size: '50' }, 1);
    expect(ids(result)).toEqual([5, 3, 2, 1]);
    expect(result.total).toBe(4);
    const foreign = await emailService.list(c, { ...params, search: 'morgan', accountId: '3' }, 1);
    expect(ids(foreign)).toEqual([]);
    expect(foreign.total).toBe(0);
  });

  it.each(['50%', 'item_', 'A!'])('treats %s as literal text instead of SQL pattern syntax', async search => {
    const result = await emailService.list(c, { ...params, search, size: '50' }, 1);
    expect(ids(result)).toEqual([10]);
    expect(result.total).toBe(1);
  });

  it('returns empty results and a zero total when only body text matches', async () => {
    const result = await emailService.list(c, { ...params, search: 'every body' }, 1);
    expect(ids(result)).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('retains unfiltered behavior for blank searches and existing brief/full payloads', async () => {
    const blank = await emailService.list(c, { ...params, search: '  ', size: '50' }, 1);
    expect(ids(blank)).toEqual([11, 10, 4, 3, 2, 1]);
    expect(blank.total).toBe(6);
    expect(blank.list[0]).not.toHaveProperty('content');
    expect(blank.list[0]).not.toHaveProperty('attList');
    const full = await emailService.list(c, { ...params, search: '50%', full: '1' }, 1);
    expect(ids(full)).toEqual([10]);
    expect(full.list[0].content).toBe('<p>Full body</p>');
    expect(full.list[0].attList).toEqual([]);
  });
});
