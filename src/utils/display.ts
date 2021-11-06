import execa from 'execa';

import { yabaiPath } from '../config';
import type { Display } from '../types';
import { getYabaiOutput } from './yabai';

export async function getDisplays() {
	const yabaiProcess = execa.command(`${yabaiPath} -m query --displays`);
	const yabaiOutput = await getYabaiOutput(yabaiProcess);
	return JSON.parse(yabaiOutput) as Display[];
}

export async function getFocusedDisplay() {
	const yabaiProcess = execa.command(
		`${yabaiPath} -m query --displays --display`
	);
	const yabaiOutput = await getYabaiOutput(yabaiProcess);
	return JSON.parse(yabaiOutput) as Display;
}