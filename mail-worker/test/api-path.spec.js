import { describe, expect, it } from 'vitest';

import { stripApiPrefix } from '../src/utils/api-path';

describe('Worker API path dispatch', () => {
	it('maps the exact external XAI callback to its Hono route', () => {
		expect(stripApiPrefix('/api/oauth/xai/callback')).toBe('/oauth/xai/callback');
	});

	it('does not rewrite static or similarly prefixed paths', () => {
		expect(stripApiPrefix('/static/xai.svg')).toBe('/static/xai.svg');
		expect(stripApiPrefix('/apiary/example')).toBe('/apiary/example');
	});
});
