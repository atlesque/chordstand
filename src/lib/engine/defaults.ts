import type { SetupChoices } from './types';

// Kept free of engine imports so the first screen can load without the generator.

export const DEFAULT_SETUP: SetupChoices = {
	style: 'pop',
	mood: 'happy',
	complexity: 2,
	form: 'vcvcbc',
	length: 6,
	key: 'random',
	timeSignature: '4/4',
	barsPerSection: 8,
	seed: null
};

export function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
