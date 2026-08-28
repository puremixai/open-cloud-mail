import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const oauthSession = sqliteTable('oauth_session', {
	state: text('state').primaryKey(),
	platform: text('platform').notNull(),
	nonce: text('nonce').notNull(),
	codeVerifier: text('code_verifier').notNull(),
	redirectUri: text('redirect_uri').notNull(),
	status: text('status').default('pending').notNull(),
	oauthUserId: text('oauth_user_id').default('').notNull(),
	createTime: integer('create_time').notNull(),
	expiresAt: integer('expires_at').notNull(),
});

export default oauthSession;
