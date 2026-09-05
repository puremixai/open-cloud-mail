import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import objectAccessService from './service/object-access-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
import xaiOAuthService from './service/xai-oauth-service';
import { stripApiPrefix } from './utils/api-path';
import { recoverMailOperations } from './service/mail-operation-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = stripApiPrefix(url.pathname)
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 let key;
			 try { key = decodeURIComponent(url.pathname.substring(1)); }
			 catch { return new Response('Not found', { status: 404 }); }
			 return objectAccessService.response({ env }, key, url.searchParams.get('token'));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await recoverMailOperations({ env });
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
		await xaiOAuthService.clearExpired({ env })
	},
};
