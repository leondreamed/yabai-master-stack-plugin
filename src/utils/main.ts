import onExit from 'signal-exit';

import { acquireHandlerLock, releaseHandlerLock } from './handler';

export function handleMasterError(error: Error & { code?: string }) {
	if (error.code === 'ELOCKED') {
		console.info('Lock found...aborting');
	} else {
		console.error(error);
	}
}

onExit(() => {
	releaseHandlerLock();
});

export function main(cb: () => Promise<void>) {
	acquireHandlerLock();
	cb()
		.catch(handleMasterError)
		.finally(() => {
			releaseHandlerLock();
		});
}
