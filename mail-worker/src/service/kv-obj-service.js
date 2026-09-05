import { normalizeContentDisposition } from '../utils/content-disposition';

const kvObjService = {

	async putObj(c, key, content, metadata) {
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async getObj(c, key) {
		const obj = await c.env.kv.getWithMetadata(key, { type: "arrayBuffer"});
		if (!obj.value) {
			return null;
		}

		const disposition = normalizeContentDisposition(obj.metadata?.contentDisposition);
		return new Response(obj.value, {
			headers: {
				'Content-Type': obj.metadata?.contentType || 'application/octet-stream',
				...(disposition ? { 'Content-Disposition': disposition } : {}),
				'Cache-Control': obj.metadata?.cacheControl || null
			}
		});
	},

	async toObjResp(c, key) {

		return await this.getObj(c, key);

	}

};

export default kvObjService;
