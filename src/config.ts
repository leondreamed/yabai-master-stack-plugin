export const yabaiPath = process.env.YABAI_PATH!;

// eslint-disable-next-line import/no-mutable-exports
export let debug = process.env.DEBUG === '1';

export const port = process.env.PORT || 7513;

export function setDebug(d: boolean) {
	debug = d;
}
