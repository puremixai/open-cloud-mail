import BizError from '../error/biz-error';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION = 'v1';
const HKDF_SALT = encoder.encode('cloud-mail-sealed-value-v1');

function toBase64Url(value) {
	let binary = '';
	const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value) {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
	let encoded = value.replace(/-/g, '+').replace(/_/g, '/');
	while (encoded.length % 4) encoded += '=';
	return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
}

async function deriveKey(masterSecret, purpose) {
	if (typeof masterSecret !== 'string' || !masterSecret || typeof purpose !== 'string' || !purpose) {
		throw new BizError('服务端加密配置无效');
	}

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(masterSecret),
		'HKDF',
		false,
		['deriveKey'],
	);

	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: HKDF_SALT,
			info: encoder.encode(purpose),
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

function additionalData(purpose) {
	return encoder.encode(`${VERSION}:${purpose}`);
}

export async function sealValue(masterSecret, purpose, plaintext) {
	if (typeof plaintext !== 'string') throw new BizError('待加密数据无效');

	const key = await deriveKey(masterSecret, purpose);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: additionalData(purpose) },
		key,
		encoder.encode(plaintext),
	);

	return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

export async function openValue(masterSecret, purpose, sealed) {
	try {
		const [version, ivValue, ciphertextValue, extra] = String(sealed).split('.');
		if (version !== VERSION || !ivValue || !ciphertextValue || extra) throw new Error('invalid format');

		const iv = fromBase64Url(ivValue);
		if (iv.length !== 12) throw new Error('invalid iv');

		const key = await deriveKey(masterSecret, purpose);
		const plaintext = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv, additionalData: additionalData(purpose) },
			key,
			fromBase64Url(ciphertextValue),
		);

		return decoder.decode(plaintext);
	} catch (error) {
		if (error instanceof BizError) throw error;
		throw new BizError('加密数据无效或已损坏');
	}
}
