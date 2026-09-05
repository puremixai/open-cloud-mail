import objectAccessService from '../service/object-access-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	let key;
	try {
		key = decodeURIComponent(c.req.path.slice('/oss/'.length));
	} catch {
		return c.text('Not found', 404);
	}
	return objectAccessService.response(c, key, c.req.query('token'));
});


