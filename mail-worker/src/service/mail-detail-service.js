import { and, eq, getTableColumns } from 'drizzle-orm';
import { parseHTML } from 'linkedom';
import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { star } from '../entity/star';
import { att } from '../entity/att';
import { attConst, isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import permService from './perm-service';
import objectAccessService from './object-access-service';

function imageKey(src, origin) {
  if (!src) return null;
  if (src.startsWith('{{domain}}')) return src.slice('{{domain}}'.length);
  try {
    const path = decodeURIComponent(new URL(src, origin).pathname);
    return path.replace(/^\/(?:api\/)?oss\//, '').replace(/^\//, '');
  } catch { return null; }
}

const mailDetailService = {
  async get(c, id, { admin = false } = {}) {
    const emailId = Number(id);
    if (!Number.isSafeInteger(emailId) || emailId <= 0) throw new BizError('Invalid email ID', 400);
    const viewer = c.get('user');
    if (!viewer?.userId) throw new BizError('Authentication required', 401);
    if (admin && viewer.email !== c.env.admin) {
      const permissions = await permService.userPermKeys(c, viewer.userId);
      if (!permissions.includes('all-email:query')) throw new BizError('Permission denied', 403);
    }

    const filters = [eq(email.emailId, emailId)];
    if (!admin) filters.push(eq(email.userId, viewer.userId), eq(email.isDel, isDel.NORMAL), eq(account.isDel, isDel.NORMAL));
    const row = await orm(c).select({ ...getTableColumns(email), starId: star.starId }).from(email)
      .leftJoin(account, eq(account.accountId, email.accountId))
      .leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, viewer.userId)))
      .where(and(...filters)).get();
    if (!row) throw new BizError('Mail not found', 404);
    row.isStar = row.starId != null ? 1 : 0;
    delete row.starId;
    const attachments = await orm(c).select().from(att).where(eq(att.emailId, emailId)).all();
    return this.withAttachmentUrls(c, row, attachments);
  },

  async withAttachmentUrls(c, row, attachments) {
    // Capabilities are minted only from DB references on the already authorized message.
    const urls = new Map();
    for (const key of new Set(attachments.map(item => item.key))) {
      const url = await objectAccessService.signUrl(c, key);
      if (url) urls.set(key, url);
    }
    const detail = { ...row, attList: attachments.filter(item => item.type === attConst.type.ATT && !item.contentId)
      .map(item => ({ ...item, url: urls.get(item.key) || null })) };
    if (detail.content) {
      const { document } = parseHTML(detail.content);
      for (const image of document.querySelectorAll('img')) {
        const src = image.getAttribute('src');
        let key = imageKey(src, c.req.url);
        if (src?.startsWith('cid:')) {
          const cid = src.slice(4).replace(/^<|>$/g, '');
          key = attachments.find(item => item.contentId?.replace(/^<|>$/g, '') === cid)?.key;
        }
        if (urls.has(key)) image.setAttribute('src', urls.get(key));
      }
      detail.content = document.toString();
    }
    return detail;
  },
};

export default mailDetailService;
