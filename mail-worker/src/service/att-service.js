import BizError from '../error/biz-error';
import { contentDisposition } from '../utils/content-disposition';
import { contentIdentity, recoverObjectCleanup } from './mail-operation-service';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from "./setting-service";

const attService = {

	async validateSendAttachments(c, attachments) {
		if (!Array.isArray(attachments) || attachments.length > 10) throw new BizError('At most 10 attachments are allowed', 400);
		const normalized = [];
		let total = 0;
		for (const attachment of attachments) {
			if (!attachment || typeof attachment.filename !== 'string' || !attachment.filename || /[\r\n]/.test(attachment.filename)) throw new BizError('Invalid attachment filename', 400);
			let content = attachment.content;
			if (typeof content === 'string') {
				content = content.replace(/^data:[^,]*;base64,/, '').replace(/\s/g, '');
				if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw new BizError('Invalid attachment content', 400);
				content = fileUtils.base64ToUint8Array(content);
			}
			if (content instanceof ArrayBuffer) content = new Uint8Array(content);
			if (!(content instanceof Uint8Array)) throw new BizError('Attachment content is missing', 400);
			total += content.byteLength;
			if (total > 20 * 1024 * 1024) throw new BizError('Attachments exceed 20 MiB', 400);
			const mimeType = attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream';
			if (typeof mimeType !== 'string' || /[\r\n]/.test(mimeType)) throw new BizError('Invalid attachment type', 400);
			normalized.push({ ...attachment, content, buff: content, size: content.byteLength, mimeType });
		}
		return normalized;
	},

	async addAtt(c, attachments) {
		// Persist references BEFORE storage writes. An interrupted upload remains recoverable.
		for (let index = 0; index < attachments.length; index++) {
			const attachment = attachments[index];
			const slot = attachment.operationSlot ?? await contentIdentity(JSON.stringify([index, attachment.key, attachment.filename, attachment.contentId]));
			await c.env.db.prepare(`INSERT INTO attachments(user_id,email_id,account_id,key,filename,mime_type,size,disposition,related,content_id,encoding,type,operation_slot)
				VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email_id,operation_slot) DO NOTHING`).bind(
				attachment.userId, attachment.emailId, attachment.accountId, attachment.key, attachment.filename ?? null,
				attachment.mimeType ?? null, attachment.size ?? attachment.content?.byteLength ?? 0, attachment.disposition ?? null,
				attachment.related == null ? null : String(attachment.related), attachment.contentId ?? null, attachment.encoding ?? null,
				typeof attachment.type === 'number' ? attachment.type : attConst.type.ATT, String(slot)
			).run();
		}
		for (const attachment of attachments) {
			await r2Service.putObj(c, attachment.key, attachment.content, {
				contentType: attachment.mimeType || 'application/octet-stream',
				contentDisposition: contentDisposition(attachment.filename, attachment.contentId ? 'inline' : 'attachment'),
			});
		}
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content, userId = c.get?.('user')?.userId) {

		const { r2Domain } = await settingService.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			// Detail URLs carry short-lived capabilities. Resolve to owned bytes before forwarding.
			let key;
			if (src?.startsWith('attachments/')) key = src.split('?')[0];
			if (src && r2Domain && src.startsWith(domainUtils.toOssDomain(r2Domain) + '/attachments/')) key = src.slice((domainUtils.toOssDomain(r2Domain) + '/').length).split('?')[0];
			if (src && /\/api\/oss\/attachments\//.test(src)) {
				const url = new URL(src, c.req?.url || 'https://mail.invalid');
				if (c.req?.url && url.origin !== new URL(c.req.url).origin) throw new BizError('Invalid inline attachment origin', 400);
				key = decodeURIComponent(url.pathname.slice('/api/oss/'.length));
			}
			if (key) {
				const cid = uuidv4().replace(/-/g, '');
				img.setAttribute('src', 'cid:' + cid);
				imageDataList.push({ key, contentId: cid, type: attConst.type.EMBED });
			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		const dbImageList = keys.length ? await orm(c).select().from(att).where(and(inArray(att.key, keys), eq(att.userId, userId ?? -1))).all() : [];

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) throw new BizError('Inline attachment is missing or not owned by this user', 403);

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key);
			if (!obj) throw new BizError('Inline attachment content is missing', 400);

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: contentDisposition(att.filename)
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: contentDisposition(attData.filename, 'inline')
			});
			delete attData.buff;
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, fieldName, fieldValues) {
		if (!['user_id', 'email_id', 'account_id'].includes(fieldName)) throw new Error('Invalid attachment field');
		for (let i = 0; i < fieldValues.length; i += 80) {
			const values = fieldValues.slice(i, i + 80);
			const marks = values.map(() => '?').join(',');
			await c.env.db.batch([
				c.env.db.prepare(`INSERT OR IGNORE INTO mail_object_cleanup(key) SELECT key FROM attachments WHERE ${fieldName} IN (${marks})`).bind(...values),
				c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} IN (${marks})`).bind(...values),
			]);
		}
		await recoverObjectCleanup(c);
	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	}
};

export default attService;
