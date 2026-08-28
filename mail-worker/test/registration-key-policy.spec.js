import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
	querySettings: vi.fn(),
	selectAccountByEmail: vi.fn(),
	insertAccount: vi.fn(),
	selectDefaultRole: vi.fn(),
	selectRoleById: vi.fn(),
	hasAvailableDomainPermission: vi.fn(),
	insertUser: vi.fn(),
	updateUserInfo: vi.fn(),
	selectUserById: vi.fn(),
	selectUserByEmail: vi.fn(),
	runOAuthUpdate: vi.fn(),
}));

vi.mock('../src/entity/orm', () => ({
	default: () => ({
		update: () => ({
			set: () => ({
				where: () => ({
					run: dependencies.runOAuthUpdate,
				}),
			}),
		}),
	}),
}));

vi.mock('../src/service/setting-service', () => ({
	default: {
		query: dependencies.querySettings,
	},
}));

vi.mock('../src/service/account-service', () => ({
	default: {
		selectByEmailIncludeDel: dependencies.selectAccountByEmail,
		insert: dependencies.insertAccount,
	},
}));

vi.mock('../src/service/role-service', () => ({
	default: {
		selectDefaultRole: dependencies.selectDefaultRole,
		selectById: dependencies.selectRoleById,
		hasAvailDomainPerm: dependencies.hasAvailableDomainPermission,
	},
}));

vi.mock('../src/service/user-service', () => ({
	default: {
		insert: dependencies.insertUser,
		updateUserInfo: dependencies.updateUserInfo,
		selectByIdIncludeDel: dependencies.selectUserById,
		selectByEmail: dependencies.selectUserByEmail,
	},
}));

import loginService from '../src/service/login-service';
import oauthService from '../src/service/oauth-service';

describe('registration key policy', () => {
	const context = {
		env: {
			domain: ['example.com'],
		},
	};
	const registration = {
		email: 'new-user@example.com',
		password: 'secure-password',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		dependencies.querySettings.mockResolvedValue({
			regKey: 0,
			register: 0,
			registerVerify: 1,
			regVerifyCount: 1,
			minEmailPrefix: 0,
			emailPrefixFilter: [],
		});
		dependencies.selectAccountByEmail.mockResolvedValue(null);
		dependencies.selectDefaultRole.mockResolvedValue({ roleId: 1 });
		dependencies.selectRoleById.mockResolvedValue({ availDomain: '' });
		dependencies.hasAvailableDomainPermission.mockReturnValue(true);
		dependencies.insertUser.mockResolvedValue(1);
		dependencies.insertAccount.mockResolvedValue(undefined);
		dependencies.updateUserInfo.mockResolvedValue(undefined);
		dependencies.selectUserById.mockResolvedValue(null);
		dependencies.selectUserByEmail.mockResolvedValue({
			userId: 1,
			email: registration.email,
		});
		dependencies.runOAuthUpdate.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('allows a verified Linux.do OAuth user to register without a registration key', async () => {
		await expect(loginService.register(context, registration, {
			oauth: true,
			oauthPlatform: 'linuxdo',
		})).resolves.toEqual({ regVerifyOpen: false });
	});

	it('still requires a registration key for ordinary self-registration', async () => {
		await expect(loginService.register(context, registration)).rejects.toMatchObject({
			name: 'BizError',
		});
	});

	it('still requires a registration key for other OAuth providers', async () => {
		await expect(loginService.register(context, registration, {
			oauth: true,
			oauthPlatform: 'github',
		})).rejects.toMatchObject({
			name: 'BizError',
		});
	});

	it('derives the Linux.do exemption from the verified OAuth record', async () => {
		vi.spyOn(oauthService, 'getById').mockResolvedValue({
			oauthUserId: 'linuxdo-user-1',
			platform: 'linuxdo',
			userId: 0,
		});
		vi.spyOn(loginService, 'login').mockResolvedValue('signed-token');

		await expect(oauthService.bindUser(context, {
			email: registration.email,
			oauthUserId: 'linuxdo-user-1',
		})).resolves.toMatchObject({
			token: 'signed-token',
			userInfo: {
				platform: 'linuxdo',
			},
		});
	});
});

describe('OAuth binding registration key fields', () => {
	it('hides the registration key for Linux.do without changing other providers', async () => {
		const verifyUtils = await import('../../mail-vue/src/utils/verify-utils.js');

		expect(verifyUtils.getRegistrationKeyPolicy?.(0, 'linuxdo')).toEqual({
			visible: false,
			required: false,
		});
		expect(verifyUtils.getRegistrationKeyPolicy?.(0, 'github')).toEqual({
			visible: true,
			required: true,
		});
	});
});
