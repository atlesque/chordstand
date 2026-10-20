// Pre-generates the song library with the Claude Message Batches API (half price, runs offline).
//
//   npm run library -- plan                    # request count + cost estimate, spends nothing
//   npm run library -- check                   # confirms the API key works, spends nothing
//   npm run library -- submit --limit 3        # small pilot
//   npm run library -- submit --confirm        # the full run (every style x mood x complexity)
//   npm run library -- status [batch_id]       # progress of the last (or a given) batch
//   npm run library -- collect                 # download results, validate, write src/data/library/*.json
//
// Filters for plan/submit: --styles pop,jazz --moods happy,calm --complexities 1,2
// Tuning: --per-combo 2 (requests per style/mood/complexity) --songs 16 (songs per request)
//         --model claude-opus-5-5 --effort medium
// Raw results are kept in scripts/library/.runs/<batch_id>/ (git-ignored) so collect can be re-run.
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkSong, songSignature, LIBRARY_LABELS, PART_BARS } from '../../src/lib/engine/library-check.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const runsDir = join(here, '.runs');
const outDir = join(root, 'src/data/library');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const MOODS = readJson(join(root, 'src/data/moods.json'));
const STYLES = Object.fromEntries(
	readdirSync(join(root, 'src/data/styles'))
		.filter((f) => f.endsWith('.json'))
		.map((f) => readJson(join(root, 'src/data/styles', f)))
		.map((s) => [s.id, s])
);
const STYLE_ORDER = ['pop', 'ballad', 'jazz', 'blues', 'gospel', 'folk', 'lofi', 'jpop', 'jrock', 'shoegaze'];
const STYLE_IDS = [...STYLE_ORDER.filter((id) => id in STYLES), ...Object.keys(STYLES).filter((id) => !STYLE_ORDER.includes(id))];
const MOOD_IDS = Object.keys(MOODS);
const COMPLEXITY_NAMES = ['Simple', 'Easy', 'Medium', 'Rich', 'Advanced'];
const ROLES = Object.keys(PART_BARS);

// Batch prices (50% of standard) in $ per million tokens.
const PRICES = { 'claude-opus-5-5': { input: 2, output: 10 }, 'claude-sonnet-5-5': { input: 1, output: 5 }, 'claude-haiku-5-5': { input: 0.05, output: 0.25 } };

// ---------------------------------------------------------------- args

const [command = 'plan', ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
	const a = rest[i];
	if (!a.startsWith('--')) positional.push(a);
	else if (rest[i + 1] && !rest[i + 1].startsWith('--')) flags[a.slice(2)] = rest[++i];
	else flags[a.slice(2)] = true;
}
const list = (v, all) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()) : all);
const opts = {
	styles: list(flags.styles, STYLE_IDS),
	moods: list(flags.moods, MOOD_IDS),
	complexities: list(flags.complexities, ['1', '2', '3', '4', '5']).map(Number),
	perCombo: Number(flags['per-combo'] ?? 2),
	songs: Number(flags.songs ?? 16),
	limit: flags.limit ? Number(flags.limit) : Infinity,
	model: flags.model ?? 'claude-opus-5-5',
	effort: flags.effort ?? 'medium'
};
for (const s of opts.styles) if (!STYLES[s]) fail(`Unknown style ${s}`);
for (const m of opts.moods) if (!MOODS[m]) fail(`Unknown mood ${m}`);

function fail(msg) {
	console.error(msg);
	process.exit(1);
}

// ---------------------------------------------------------------- prompts

const SYSTEM = `You write chord progressions and song structures for Chordstand, a phone app that gives musicians a full song to play from: sections (Intro, Verse, Chorus, Bridge, Outro) with one or two chords per bar.

Write every chord as a Roman-numeral degree relative to the song's tonic, never as a letter name. The app picks the key, and it adds sevenths and extensions on its own according to the complexity level, so write the bare degree only:
- Upper case is a major chord (I, IV, V), lower case is minor (ii, iii, vi).
- A leading b or # alters the root against the major scale: bIII, bVI, bVII, #iv°.
- A trailing ° marks a diminished chord: vii°, #iv°.
- A slash makes a secondary chord: V/V, V/vi, vii°/ii. Only one level deep.
- In minor and Dorian songs the tonic is i, and the natural-minor chords are written bIII, iv, v, bVI, bVII (Dorian's major IV stays IV). In major, Lydian and Mixolydian songs the tonic is I (Lydian's II and Mixolydian's bVII are the colour chords).
No other symbols: no 7, maj7, sus, add, inversions, slash bass notes or letter names.

A bar is a string holding one degree ("vi") or two degrees separated by one space ("ii V", two beats each). Every song has all five parts, each an array of bars:
- intro: 4 bars, verse: 8 bars, chorus: 8 bars, bridge: 8 bars, outro: 4 bars.
The form lists the order the sections are played in, using only the labels Intro, Verse, Chorus, Bridge and Outro (3 to 12 sections, at least one Verse). Sections with the same label repeat the same part.

Complexity levels decide how adventurous the harmony is:
1 Simple: one chord per bar, diatonic chords of the mode, beginner friendly. No secondary chords.
2 Easy: mostly diatonic; a borrowed chord (such as bVII or iv in major) or a two-chord bar at a cadence now and then. No secondary chords.
3 Medium: borrowed chords, an occasional secondary dominant (V/vi, V/V), a few two-chord bars.
4 Rich: secondary dominants, modal mixture, ii–V motion and chromatic movement; several two-chord bars.
5 Advanced: fast harmonic rhythm, chains of secondary dominants, bII and deceptive cadences, a bridge that feels like it travels far before it returns.

Make each song feel like a real piece in the style and mood: a verse that sets up, a chorus that lands (often on or near the tonic), a bridge that contrasts, an outro that resolves. Vary the songs within a set: different progressions, harmonic rhythm, forms and section lengths in feel, rather than one idea transposed. Give each song a short evocative title of one to four words that suits the style and mood, never naming a real song or artist.`;

function comboPrompt(styleId, moodId, complexity, variant) {
	const style = STYLES[styleId];
	const mood = MOODS[moodId];
	const modes = Object.keys(mood.modes);
	const examples = style.pool
		.filter((e) => e.minComplexity <= complexity && (e.moods.includes('*') || e.moods.includes(moodId)))
		.slice(0, 12)
		.map((e) => `- ${e.tonality}${e.modes ? ` (${e.modes.join('/')})` : ''}, ${e.roles.join('/')}: ${e.degrees.join(' | ')}`)
		.join('\n');
	const traits = [
		style.dominantMajors && 'major chords are usually played as dominant sevenths',
		style.substitutions.tritone && 'tritone substitutions are idiomatic',
		style.substitutions.borrowedIv && 'the borrowed minor iv is idiomatic',
		style.substitutions.secondaryDominants && 'secondary dominants are idiomatic'
	].filter(Boolean);
	const lens = [
		'Lean on the moves players of this style know and love, written well.',
		'Favour fresher, less obvious moves that still sit firmly in the style.',
		'Explore the colours of each available mode and contrast between sections.',
		'Play with harmonic rhythm and form: short and long sections, surprising returns.'
	][variant % 4];
	return `Write ${opts.songs} different songs.

Style: ${style.name} (${style.bpm[0]}–${style.bpm[1]} BPM)${traits.length ? `; ${traits.join('; ')}` : ''}.
Mood: ${mood.name}. Use only these modes, roughly in this proportion: ${modes.map((m) => `${m} ${mood.modes[m]}`).join(', ')}.
Complexity: ${complexity} ${COMPLEXITY_NAMES[complexity - 1]}.
${lens}

For flavour, these are progressions the app already uses for this style (one entry per bar). Use them as a reference for the idiom, not as material to copy:
${examples || '- (none at this level)'}`;
}

function outputSchema(moodId) {
	const bars = { type: 'array', items: { type: 'string' } };
	return {
		type: 'object',
		additionalProperties: false,
		required: ['songs'],
		properties: {
			songs: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['name', 'mode', 'form', 'parts'],
					properties: {
						name: { type: 'string' },
						mode: { type: 'string', enum: Object.keys(MOODS[moodId].modes) },
						form: { type: 'array', items: { type: 'string', enum: Object.keys(LIBRARY_LABELS) } },
						parts: {
							type: 'object',
							additionalProperties: false,
							required: ROLES,
							properties: Object.fromEntries(ROLES.map((r) => [r, bars]))
						}
					}
				}
			}
		}
	};
}

function buildRequests() {
	const requests = [];
	for (const style of opts.styles)
		for (const mood of opts.moods)
			for (const complexity of opts.complexities)
				for (let variant = 0; variant < opts.perCombo; variant++) {
					requests.push({
						custom_id: `${style}-${mood}-c${complexity}-r${variant}`,
						params: {
							model: opts.model,
							max_tokens: 32000,
							output_config: { effort: opts.effort, format: { type: 'json_schema', schema: outputSchema(mood) } },
							system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
							messages: [{ role: 'user', content: comboPrompt(style, mood, complexity, variant) }]
						}
					});
				}
	return requests.slice(0, opts.limit);
}

// ---------------------------------------------------------------- commands

function estimate(requests) {
	const price = PRICES[opts.model] ?? PRICES['claude-opus-5-5'];
	// ~3.5 characters per token for this English/JSON mix; the schema adds a few hundred tokens.
	const input = requests.reduce((n, r) => n + Math.ceil((SYSTEM.length + r.params.messages[0].content.length) / 3.5) + 400, 0);
	// ~230 output tokens per song as JSON, plus thinking at the chosen effort.
	const think = { low: [500, 2000], medium: [1500, 6000], high: [4000, 12000] }[opts.effort] ?? [1500, 6000];
	const out = (t) => requests.length * (opts.songs * 230 + t);
	const cost = (o) => (input * price.input + o * price.output) / 1e6;
	return { input, outLow: out(think[0]), outHigh: out(think[1]), low: cost(out(think[0])), high: cost(out(think[1])) };
}

function plan() {
	const requests = buildRequests();
	const e = estimate(requests);
	const combos = opts.styles.length * opts.moods.length * opts.complexities.length;
	console.log(`${requests.length} requests (${combos} style/mood/complexity combos x ${opts.perCombo}), ${opts.songs} songs each`);
	console.log(`=> up to ${requests.length * opts.songs} songs before validation and de-duplication`);
	console.log(`Model ${opts.model}, effort ${opts.effort}, batch pricing`);
	console.log(`Estimated input ~${(e.input / 1e6).toFixed(2)}M tokens, output ${(e.outLow / 1e6).toFixed(1)}–${(e.outHigh / 1e6).toFixed(1)}M tokens`);
	console.log(`Estimated cost $${e.low.toFixed(0)}–$${e.high.toFixed(0)}`);
	mkdirSync(runsDir, { recursive: true });
	writeFileSync(join(runsDir, 'plan.jsonl'), requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
	console.log(`Requests written to ${join(runsDir, 'plan.jsonl')} for inspection.`);
	return requests;
}

// Always talk to the public API: some sandboxes point ANTHROPIC_BASE_URL elsewhere. Without
// ANTHROPIC_API_KEY we assume an egress proxy injects the x-api-key header for api.anthropic.com.
const client = () =>
	new Anthropic({ baseURL: 'https://api.anthropic.com', apiKey: process.env.ANTHROPIC_API_KEY || 'injected-by-proxy' });

async function check() {
	const model = await client().models.retrieve(opts.model);
	console.log(`Authenticated: ${model.id} is available.`);
}

async function submit() {
	const requests = plan();
	if (requests.length > 10 && !flags.confirm) fail('\nMore than 10 requests: re-run with --confirm to spend the credits, or --limit N for a pilot.');
	const batch = await client().messages.batches.create({ requests });
	const dir = join(runsDir, batch.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'batch.json'), JSON.stringify({ ...batch, options: opts }, null, 2));
	writeFileSync(join(runsDir, 'latest'), batch.id);
	console.log(`\nSubmitted ${batch.id} (${batch.processing_status}). Check with: npm run library -- status`);
}

function batchId() {
	const id = positional[0] ?? (existsSync(join(runsDir, 'latest')) ? readFileSync(join(runsDir, 'latest'), 'utf8').trim() : '');
	if (!id) fail('No batch id given and no previous submit found.');
	return id;
}

async function status() {
	const batch = await client().messages.batches.retrieve(batchId());
	console.log(`${batch.id}: ${batch.processing_status}`, batch.request_counts);
	return batch;
}

async function download(id) {
	const dir = join(runsDir, id);
	const file = join(dir, 'results.jsonl');
	if (existsSync(file)) return;
	const batch = await client().messages.batches.retrieve(id);
	if (batch.processing_status !== 'ended') fail(`${id} is still ${batch.processing_status}; try again later.`);
	const lines = [];
	for await (const result of await client().messages.batches.results(id)) lines.push(JSON.stringify(result));
	mkdirSync(dir, { recursive: true });
	writeFileSync(file, lines.join('\n') + '\n');
	console.log(`Downloaded ${lines.length} results for ${id}`);
}

function normalizeBar(bar) {
	return String(bar)
		.replace(/[º˚o](?=$|\/|\s)/g, '°')
		.replace(/♭/g, 'b')
		.replace(/♯/g, '#')
		.trim()
		.split(/\s+/)
		.join(' ');
}

async function collect() {
	// Download any finished batch we submitted but have not fetched yet (needs a key), then rebuild from disk.
	if (existsSync(runsDir)) {
		for (const id of readdirSync(runsDir).filter((d) => d.startsWith('msgbatch_'))) {
			if (!existsSync(join(runsDir, id, 'results.jsonl'))) await download(id);
		}
	}
	const files = existsSync(runsDir)
		? readdirSync(runsDir)
				.filter((d) => existsSync(join(runsDir, d, 'results.jsonl')))
				.map((d) => join(runsDir, d, 'results.jsonl'))
		: [];
	if (!files.length) fail('No downloaded results yet.');

	const byStyle = {};
	const seen = new Set();
	const problems = {};
	let usage = { input: 0, output: 0 };
	let failed = 0;
	let rejected = 0;
	let duplicates = 0;
	for (const file of files) {
		for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
			const { custom_id, result } = JSON.parse(line);
			const [style, mood, c] = custom_id.split('-');
			const complexity = Number(c.slice(1));
			if (result.type !== 'succeeded') {
				failed++;
				console.warn(`${custom_id}: ${result.type}`);
				continue;
			}
			const msg = result.message;
			usage.input += (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
			usage.output += msg.usage.output_tokens ?? 0;
			const text = msg.content.find((b) => b.type === 'text')?.text;
			if (msg.stop_reason !== 'end_turn' || !text) {
				failed++;
				console.warn(`${custom_id}: stopped with ${msg.stop_reason}`);
				continue;
			}
			let songs;
			try {
				songs = JSON.parse(text).songs;
			} catch {
				failed++;
				console.warn(`${custom_id}: unreadable JSON`);
				continue;
			}
			for (const raw of songs) {
				const parts = Object.fromEntries(ROLES.map((r) => [r, (raw.parts?.[r] ?? []).map(normalizeBar).join('|')]));
				const song = { id: '', name: String(raw.name ?? '').trim(), mood, complexity, mode: raw.mode, form: raw.form ?? [], parts };
				const issues = checkSong(song, Object.keys(MOODS[mood].modes));
				if (issues.length) {
					rejected++;
					for (const issue of issues) {
						const key = issue.replace(/"[^"]*"/g, '"…"').replace(/\b\d+ bars\b/, 'N bars');
						problems[key] = (problems[key] ?? 0) + 1;
					}
					continue;
				}
				const signature = songSignature(song);
				if (seen.has(signature)) {
					duplicates++;
					continue;
				}
				seen.add(signature);
				song.id = `${style}-${createHash('sha1').update(`${mood}/${complexity}/${signature}`).digest('hex').slice(0, 10)}`;
				(byStyle[style] ??= []).push(song);
			}
		}
	}

	mkdirSync(outDir, { recursive: true });
	for (const [style, songs] of Object.entries(byStyle)) {
		songs.sort((a, b) => MOOD_IDS.indexOf(a.mood) - MOOD_IDS.indexOf(b.mood) || a.complexity - b.complexity || a.id.localeCompare(b.id));
		// One song per line keeps diffs readable and the file compact.
		const body = songs.map((s) => '    ' + JSON.stringify(s)).join(',\n');
		writeFileSync(join(outDir, `${style}.json`), `{\n  "version": 1,\n  "style": "${style}",\n  "songs": [\n${body}\n  ]\n}\n`);
		console.log(`${style}: ${songs.length} songs`);
	}
	const total = Object.values(byStyle).reduce((n, s) => n + s.length, 0);
	console.log(`\n${total} songs kept, ${rejected} rejected, ${duplicates} duplicates, ${failed} failed requests`);
	for (const [issue, n] of Object.entries(problems).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n} x ${issue}`);
	const price = PRICES[opts.model] ?? PRICES['claude-opus-5-5'];
	console.log(`Usage: ${(usage.input / 1e6).toFixed(2)}M input, ${(usage.output / 1e6).toFixed(2)}M output tokens ≈ $${((usage.input * price.input + usage.output * price.output) / 1e6).toFixed(2)} at batch prices`);
	// Thin combos are worth a top-up run: npm run library -- submit --styles x --moods y --complexities z
	const thin = [];
	for (const style of STYLE_IDS)
		for (const mood of MOOD_IDS)
			for (let c = 1; c <= 5; c++) {
				const n = (byStyle[style] ?? []).filter((s) => s.mood === mood && s.complexity === c).length;
				if (n < 5) thin.push(`${style}/${mood}/${c}: ${n}`);
			}
	if (thin.length) console.log(`\nCombos with fewer than 5 songs (${thin.length}):\n  ${thin.slice(0, 40).join('\n  ')}`);
}

const commands = { plan, check, submit, status, collect };
if (!commands[command]) fail(`Unknown command ${command}. Use plan, check, submit, status or collect.`);
await commands[command]();
