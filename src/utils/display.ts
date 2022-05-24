import { execaCommand } from 'execa';

import { getConfig } from '~/utils/config.js';

import type { Display, DisplayIndex } from '../types/index.js';
import { getYabaiOutput } from './yabai.js';

export async function getDisplays() {
	const { yabaiPath } = getConfig();
	const yabaiProcess = execaCommand(`${yabaiPath} -m query --displays`);
	const yabaiOutput = await getYabaiOutput(yabaiProcess);
	return JSON.parse(yabaiOutput) as Display[];
}

export async function getFocusedDisplay() {
	const { yabaiPath } = getConfig();
	const yabaiProcess = execaCommand(
		`${yabaiPath} -m query --displays --display`
	);
	const yabaiOutput = await getYabaiOutput(yabaiProcess);
	return JSON.parse(yabaiOutput) as Display;
}

export async function focusDisplay(displayIndex: DisplayIndex) {
	const { yabaiPath } = getConfig();
	await execaCommand(`${yabaiPath} -m display --focus ${displayIndex}`);
}
