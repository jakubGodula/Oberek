// Every run of setup or demo leaves a log a teammate can send: the script re-runs itself as a child, the terminal
// shows its output as before, and .devnet/logs/<name>-<time>.log gets the same output, timestamped and redacted.
import { spawn, spawnSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, type WriteStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import type { Readable, Writable } from 'stream';
import { configLines, redactorFor, type Redact } from './redact';

const LOGS_DIR = '.devnet/logs';
const ENV_EXAMPLE = '.env.example';
/** Set in the child, so it runs the script itself instead of logging again. */
const LOGGED_ENV = 'OBEREK_RUN_LOG';
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

/** Returns at once in the logged child; in the caller, runs the child and exits with its code. */
export async function runLogged(name: string): Promise<void> {
	if (process.env[LOGGED_ENV]) return;
	mkdirSync(LOGS_DIR, { recursive: true });
	const path = join(LOGS_DIR, `${name}-${fileTimestamp()}.log`);
	const file = createWriteStream(path);
	const redact = redactorFor(process.env);
	for (const line of header(redact)) file.write(`# ${line}\n`);

	const child = spawn(process.execPath, process.argv.slice(1), {
		env: { ...process.env, [LOGGED_ENV]: path },
		stdio: ['inherit', 'pipe', 'pipe']
	});
	for (const signal of FORWARDED_SIGNALS) process.on(signal, () => child.kill(signal));
	tee(child.stdout, process.stdout, file, redact);
	tee(child.stderr, process.stderr, file, redact);

	const code = await new Promise<number>((resolve) =>
		child.once('close', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)))
	);
	file.write(`# exited with code ${code}\n`);
	await new Promise((resolve) => file.end(resolve));
	console.log(`[log] ${path} (redacted; send it when asking for help)`);
	process.exit(code);
}

/** The terminal gets the output untouched; the file gets each line timestamped and redacted. */
function tee(source: Readable, terminal: Writable, file: WriteStream, redact: Redact): void {
	source.pipe(terminal, { end: false });
	createInterface({ input: source }).on('line', (line) => file.write(`${new Date().toISOString()} ${redact(line)}\n`));
}

function header(redact: Redact): string[] {
	const envExample = existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, 'utf8') : '';
	return [
		`started ${new Date().toISOString()}: bun ${redact(process.argv.slice(1).join(' '))}`,
		`git ${gitRevision()}`,
		`bun ${Bun.version}, ${process.platform} ${process.arch}`,
		...configLines(envExample, process.env, redact)
	];
}

function gitRevision(): string {
	const head = git(['rev-parse', '--short', 'HEAD']);
	if (head === undefined) return 'unknown';
	const changes = git(['status', '--porcelain']) ? ' (uncommitted changes)' : '';
	return `${git(['rev-parse', '--abbrev-ref', 'HEAD'])} ${head}${changes}`;
}

function git(args: string[]): string | undefined {
	const { stdout, status } = spawnSync('git', args, { encoding: 'utf8' });
	return status === 0 ? stdout.trim() : undefined;
}

function fileTimestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}
