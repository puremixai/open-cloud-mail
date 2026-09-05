function cleanFilename(value) {
	// Replace lone surrogates before percent encoding, and never retain header controls.
	return new TextDecoder().decode(new TextEncoder().encode(String(value ?? 'attachment')))
		.replace(/[\u0000-\u001f\u007f]/g, '') || 'attachment';
}

export function contentDisposition(filename, disposition = 'attachment') {
	const name = cleanFilename(filename);
	const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
	const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
	return `${disposition === 'inline' ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// Old storage metadata used raw Unicode and sometimes unquoted filenames. Normalize
// before passing it to Response/Headers; prefer a valid RFC 5987 UTF-8 filename*.
export function normalizeContentDisposition(value, forceDisposition) {
	if (value == null || value === '' || value === 'null') return forceDisposition || null;
	const raw = String(value).replace(/[\u0000-\u001f\u007f]/g, '');
	const disposition = forceDisposition || (raw.split(';', 1)[0].trim().toLowerCase() === 'inline' ? 'inline' : 'attachment');
	const extended = raw.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"\\]*)"|([^;]*))/i);
	if (extended) {
		const encoded = (extended[1] ?? extended[2]).trim().match(/^UTF-8'[^']*'(.*)$/i);
		if (encoded) {
			try { return contentDisposition(decodeURIComponent(encoded[1]), disposition); }
			catch { /* Malformed legacy filename*: fall back to filename. */ }
		}
	}
	const filename = raw.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"\s*(?=;|$)|([^;]*))/i);
	if (!filename) return disposition;
	const name = filename[1] != null ? filename[1].replace(/\\(.)/g, '$1') : filename[2].trim();
	return contentDisposition(name, disposition);
}
