// Redaction for run logs a teammate can share: secret env values, keys inside URLs and the owner's chat id never
// reach the file.

type Env = Record<string, string | undefined>;
export type Redact = (text: string) => string;

const SECRET_NAME = /TOKEN|SECRET|PASSWORD|PASSPHRASE|API_KEY|PRIVATE|CHAT_ID/;
/** Shorter values (ids like "1") would mask unrelated text. */
const MIN_SECRET_LENGTH = 6;
const KEY_IN_QUERY = /([?&](?:api[-_]?key|key|token|secret|access_token)=)[^&\s"']+/gi;
const REDACTED = '<redacted>';
const CONFIG_NAME = /^#?\s*([A-Z][A-Z0-9_]*)=/gm;

export function redactorFor(env: Env): Redact {
	const replacements = [...secretValues(env)].sort(([a], [b]) => b.length - a.length);
	return (text) => {
		let redacted = text;
		for (const [secret, replacement] of replacements) redacted = redacted.replaceAll(secret, replacement);
		return redacted.replace(KEY_IN_QUERY, `$1${REDACTED}`);
	};
}

/** The settings documented in .env.example with their current values, redacted; anything else in env stays out. */
export function configLines(envExample: string, env: Env, redact: Redact): string[] {
	const names = new Set([...envExample.matchAll(CONFIG_NAME)].map((match) => match[1]));
	return [...names].map((name) => `${name}=${env[name] ? redact(env[name]) : '(unset)'}`);
}

function secretValues(env: Env): Map<string, string> {
	const secrets = new Map<string, string>();
	for (const [name, value] of Object.entries(env)) {
		if (!value || value.length < MIN_SECRET_LENGTH) continue;
		if (SECRET_NAME.test(name)) secrets.set(value, `<${name}>`);
		else if (name.endsWith('_URL')) {
			const masked = maskedUrl(value);
			if (masked !== value) secrets.set(value, masked);
		}
	}
	return secrets;
}

/** An RPC provider's key sits in the URL's path, query or user info; a bare origin carries none. */
function maskedUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return value;
	}
	const bare = !url.username && !url.password && !url.search && (url.pathname === '' || url.pathname === '/');
	return bare ? value : `${url.protocol}//${url.host}/${REDACTED}`;
}
