// Roman-numeral chord degrees such as 'vi', 'bVII', 'ii°' or 'V/V'. No music library needed here,
// so storage validation can use it without pulling in the theory engine.

const DEGREE_RE = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°)?(?:\/(.+))?$/;

export type ParsedDegree = {
	accidental: '' | 'b' | '#';
	numeral: string; // upper-case numeral
	minor: boolean; // lower-case numeral
	diminished: boolean;
	target?: ParsedDegree; // for secondary chords such as V/V
};

export function parseDegree(degree: string): ParsedDegree | null {
	const m = DEGREE_RE.exec(degree);
	if (!m) return null;
	const [, acc, numeral, dim, target] = m;
	let parsedTarget: ParsedDegree | undefined;
	if (target) {
		const t = parseDegree(target);
		if (!t || t.target) return null;
		parsedTarget = t;
	}
	return {
		accidental: (acc ?? '') as ParsedDegree['accidental'],
		numeral: numeral.toUpperCase(),
		minor: numeral !== numeral.toUpperCase(),
		diminished: Boolean(dim),
		target: parsedTarget
	};
}

export function isValidDegree(degree: string): boolean {
	return parseDegree(degree) !== null;
}
