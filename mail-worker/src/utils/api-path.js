export function stripApiPrefix(pathname) {
	return pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname;
}
