import execa from 'execa';

import { yabaiPath } from '../config';
import type { Display, Window } from '../types';

/**
 * Creates a windows manager.
 * @param props
 * @param props.expectedCurrentNumMainWindows The expected current number of main
 * windows active on the screen (used as part of a heuristic for determining the main
 * windows).
 */
export function createWindowsManager({
	display: _,
	expectedCurrentNumMainWindows,
}: {
	display: Display;
	expectedCurrentNumMainWindows: number;
}) {
	type GetWindowDataProps = { processId?: string; windowId?: string };

	function getWindowsData() {
		const windowsData = (
			JSON.parse(
				execa.commandSync(`${yabaiPath} -m query --windows`).stdout
			) as Window[]
		).filter((win) => win.split !== 'none');
		return windowsData;
	}

	const windowsManager = {
		expectedCurrentNumMainWindows,
		windowsData: getWindowsData(),
		refreshWindowsData() {
			const newWindowsData = getWindowsData();
			this.windowsData = newWindowsData;
		},
		getUpdatedWindowData(window: Window) {
			return this.windowsData.find((win) => window.id === win.id)!;
		},
		executeYabaiCommand(command: string) {
			const result = execa.commandSync(command);
			this.refreshWindowsData();
			return result;
		},
		getWindowData({ processId, windowId }: GetWindowDataProps): Window {
			if (processId === undefined && windowId === undefined) {
				throw new Error('Must provide at least one of processId or windowId');
			}

			const windowData = this.windowsData.find(
				(window) =>
					window.pid === Number(processId) || window.id === Number(windowId)
			);

			if (windowData === undefined) {
				if (processId !== undefined) {
					throw new Error(`Window with pid ${processId} not found.`);
				} else {
					throw new Error(`Window with id ${windowId} not found.`);
				}
			}

			return windowData;
		},
		getFocusedWindow(): Window | undefined {
			return this.windowsData.find((w) => w.focused === 1);
		},
		getFnWindowId() {
			return process.argv[2] ?? this.getFocusedWindow();
		},
		/**
		 * There is always a line dividing the main windows from the secondary windows. To find this line,
		 * we use two main observations:
		 * 1. The top-right window is always on the right side of the dividing line.
		 * 2. If there is more than one main window, the dividing line must cross the left side of two
		 * windows
		 * Using these observations, we can loop through the windows in descending x-coordinate starting from the top-right window
		 * and for each pair of windows that share x-coordinates, we check if the numMainWindows is less
		 * than the number of windows we've iterated through, and if so, return the x-coordinate of the currently
		 * processed window
		 */
		getDividingLineXCoordinate() {
			const topRightWindow = this.getTopRightWindow();
			console.log(`Top-right window: ${topRightWindow.app}`);

			if (this.expectedCurrentNumMainWindows === 1)
				return topRightWindow.frame.x;

			const nonStackWindows = this.windowsData.filter(
				(window) => !this.isStackWindow(window)
			);
			// Get all the windows to the left of the top-right window which are not a stack window
			const eligibleWindows = nonStackWindows
				.filter((window) => window.frame.x <= topRightWindow.frame.x)
				.sort((window1, window2) => window2.frame.x - window1.frame.x);

			const numWindowsToRightOfTopRightWindow =
				nonStackWindows.length - eligibleWindows.length;

			// If there are enough windows that are to the right of the top-right window, then return
			// the top-right window's x-coordinate
			if (
				numWindowsToRightOfTopRightWindow >= this.expectedCurrentNumMainWindows
			) {
				return topRightWindow.frame.x;
			}

			// Otherwise, iterate through the eligible windows in order and find pairs of windows
			for (let i = 0; i < eligibleWindows.length - 1; i += 1) {
				const curWindow = eligibleWindows[i];
				const nextWindow = eligibleWindows[i + 1];
				if (
					curWindow.frame.x === nextWindow.frame.x &&
					numWindowsToRightOfTopRightWindow + i + 2 >=
						this.expectedCurrentNumMainWindows
				) {
					return curWindow.frame.x;
				}
			}

			// If a pair of windows could not be found (which means all the windows are side-by-side), just
			// return the top-right window's x-coordinate
			return topRightWindow.frame.x;
		},
		/**
		 * The top-left window is the window with the lowest y-coordinate and the lowest x-coordinate.
		 */
		getTopLeftWindow() {
			const leftWindows = this.windowsData.filter(
				(window) => window.frame.x === 0
			);
			let topLeftWindow = leftWindows[0];
			for (const window of leftWindows) {
				if (window.frame.y <= topLeftWindow.frame.y) {
					topLeftWindow = window;
				}
			}
			return topLeftWindow;
		},
		/*
		 * The top-right window is the rightmost window with the lowest y-coordinate.
		 */
		getTopRightWindow() {
			let lowestYCoordinate = this.windowsData[0].frame.y;
			for (const window of this.windowsData) {
				if (window.frame.y < lowestYCoordinate) {
					lowestYCoordinate = window.frame.y;
				}
			}

			const topWindows = this.windowsData.filter(
				(window) => window.frame.y === lowestYCoordinate
			);
			let topRightWindow = topWindows[0];
			for (const window of topWindows) {
				if (window.frame.x > topRightWindow.frame.x) {
					topRightWindow = window;
				}
			}
			return topRightWindow;
		},
		getWidestStackWindow() {
			let widestStackWindow: Window | undefined;
			for (const window of this.getStackWindows()) {
				if (
					widestStackWindow === undefined ||
					window.frame.w > widestStackWindow.frame.w
				) {
					widestStackWindow = window;
				}
			}
			return widestStackWindow;
		},
		getWidestMainWindow() {
			let widestMainWindow: Window | undefined;
			for (const window of this.getMainWindows()) {
				if (
					widestMainWindow === undefined ||
					window.frame.w > widestMainWindow.frame.w
				) {
					widestMainWindow = window;
				}
			}
			return widestMainWindow;
		},
		// In the event that the windows get badly rearranged and all the windows span the entire width of
		// the screen, split the top-right window vertically and then move the windows into the split
		createStack() {
			const topRightWindow = this.getTopRightWindow();
			if (topRightWindow.split === 'horizontal') {
				this.executeYabaiCommand(
					`${yabaiPath} -m window ${topRightWindow.id} --toggle split`
				);
			}

			// Get the top-left window
			const topLeftWindow = this.getTopLeftWindow();

			for (const window of this.windowsData) {
				if (window === topRightWindow || window === topLeftWindow) continue;
				this.executeYabaiCommand(
					`${yabaiPath} -m window ${window.id} --warp ${topLeftWindow.id}`
				);
			}

			this.columnizeStackWindows();
		},
		/**
		 * If the top-right window has a x-coordinate of 0, or if the stack dividing
		 * line is equal to 0, then the stack does not exist
		 */
		doesStackExist() {
			const topRightWindow = this.getTopRightWindow();
			return topRightWindow.frame.x !== 0;
		},
		/**
		 * Turns the stack into a column by making sure the split direction of all the stack windows
		 * is horizontal
		 */
		columnizeStackWindows() {
			const stackWindows = this.windowsData.filter(
				(window) => !this.isMainWindow(window)
			);
			for (const stackWindow of stackWindows) {
				const window = this.getUpdatedWindowData(stackWindow);
				if (window.split === 'vertical') {
					this.executeYabaiCommand(
						`${yabaiPath} -m window ${window.id} --toggle split`
					);
				}
			}
		},
		moveWindowToStack(window: Window) {
			// If there's only two windows, make sure that the window stack exists
			if (this.windowsData.length === 2) {
				if (window.split === 'horizontal') {
					this.executeYabaiCommand(
						`${yabaiPath} -m window ${window.id} --toggle split`
					);
				}
				return;
			}

			this.columnizeStackWindows();

			// Find a window that's touching the left side of the screen
			const stackWindow = this.getWidestStackWindow();

			if (stackWindow === undefined) {
				console.log('No stack windows available.');
				return;
			}

			this.executeYabaiCommand(
				`${yabaiPath} -m window ${window.id} --warp ${stackWindow.id}`
			);
			window = this.getUpdatedWindowData(window);

			if (this.windowsData.length === 2) {
				if (window.split === 'horizontal') {
					this.executeYabaiCommand(
						`${yabaiPath} -m window ${stackWindow.id} --toggle split`
					);
				}
			} else {
				if (window.split === 'vertical') {
					this.executeYabaiCommand(
						`${yabaiPath} -m window ${stackWindow.id} --toggle split`
					);
				}
			}
		},
		moveWindowToMain(window: Window) {
			// Find a window that's touching the right side of the screen
			const mainWindow = this.getWidestMainWindow();

			if (mainWindow === undefined) return;
			this.executeYabaiCommand(
				`${yabaiPath} -m window ${window.id} --warp ${mainWindow.id}`
			);
			window = this.getUpdatedWindowData(window);

			if (window.split === 'vertical') {
				this.executeYabaiCommand(
					`${yabaiPath} -m window ${mainWindow.id} --toggle split`
				);
			}
		},
		/**
		 * A window which is to the right of the dividing line is considered a main window.
		 */
		isMainWindow(window: Window) {
			const dividingLineXCoordinate = this.getDividingLineXCoordinate();
			return window.frame.x >= dividingLineXCoordinate;
		},
		isStackWindow(window: Window) {
			return window.frame.x === 0;
		},
		isMiddleWindow(window: Window) {
			return !this.isStackWindow(window) && !this.isMainWindow(window);
		},
		getMiddleWindows() {
			return this.windowsData.filter((window) => this.isMiddleWindow(window));
		},
		getMainWindows() {
			const dividingLineXCoordinate = this.getDividingLineXCoordinate();
			return this.windowsData.filter(
				(window) => window.frame.x >= dividingLineXCoordinate
			);
		},
		/**
		 * If the window's frame has an x of 0, it is a stack window
		 */
		getStackWindows() {
			return this.windowsData.filter((window) => this.isStackWindow(window));
		},
		async isValidLayout(props?: {
			targetNumMainWindows?: number;
		}): Promise<{ status: true } | { status: false; reason: string }> {
			const targetNumMainWindows =
				props?.targetNumMainWindows ?? this.expectedCurrentNumMainWindows;
			console.log('Starting valid layout check...');
			const curNumMainWindows = this.getMainWindows().length;
			if (targetNumMainWindows !== curNumMainWindows) {
				return {
					status: false,
					reason: `Number of main windows does not equal expected number of main windows (${curNumMainWindows}/${this.expectedCurrentNumMainWindows})`,
				};
			}

			for (const window of this.windowsData) {
				if (this.isMiddleWindow(window)) {
					console.log(this.isStackWindow(window), this.isMainWindow(window));
					return {
						status: false,
						reason: `A middle window (${window.app}) was detected.`,
					};
				}
			}

			return { status: true };
		},
		async updateWindows({
			targetNumMainWindows,
		}: {
			targetNumMainWindows: number;
		}) {
			console.log('updateWindows() called');
			const layoutValidity = await this.isValidLayout({ targetNumMainWindows });
			if (layoutValidity.status === true) {
				console.log('Valid layout detected; no changes were made.');
				return;
			} else {
				console.log('Invalid layout detected...updating windows.');
			}

			const numWindows = this.windowsData.length;

			// If the stack is supposed to exist but doesn't exist
			if (targetNumMainWindows !== numWindows && !this.doesStackExist()) {
				console.log('Stack does not exist, creating it...');
				this.createStack();
			}

			if (numWindows > 2) {
				const mainWindows = this.getMainWindows();
				console.log(`Main windows: ${mainWindows.map((window) => window.app)}`);
				let curNumMainWindows = mainWindows.length;

				// If there are too many main windows, move them to stack
				if (curNumMainWindows > targetNumMainWindows) {
					console.log(
						`Too many main windows (${curNumMainWindows}/${targetNumMainWindows}).`
					);
					// Sort the windows by y-coordinate and x-coordinate so we remove the bottom-left main windows first
					mainWindows.sort((window1, window2) =>
						window1.frame.y !== window2.frame.y
							? window1.frame.y - window2.frame.y
							: window1.frame.x - window2.frame.x
					);
					while (curNumMainWindows > targetNumMainWindows) {
						// Remove the window with the greatest y-coordinate first
						const mainWindow = mainWindows.pop()!;
						console.log(`Moving main window ${mainWindow.app} to stack.`);
						this.moveWindowToStack(mainWindow);
						curNumMainWindows -= 1;
					}
				}

				// If there are windows that aren't touching either the left side or the right side
				// after the move, fill up main and then move the rest to stack
				let middleWindows;
				while ((middleWindows = this.getMiddleWindows()).length > 0) {
					const middleWindow = middleWindows[0];
					console.log(`Middle window ${middleWindow.app} detected.`);
					if (curNumMainWindows < targetNumMainWindows) {
						console.log(`Moving middle window ${middleWindow.app} to main.`);
						this.moveWindowToMain(middleWindow);
						curNumMainWindows += 1;
					} else {
						console.log(`Moving middle window ${middleWindow.app} to stack.`);
						this.moveWindowToStack(middleWindow);
					}
				}

				// If there are still not enough main windows, move some of the stack windows to main
				const stackWindows = this.getStackWindows();
				// Sort the stack windows by reverse y-coordinate and reverse x-coordinate to move the
				// bottom-rightmost windows first
				stackWindows.sort((window1, window2) =>
					window1.frame.x !== window2.frame.x
						? window2.frame.x - window1.frame.x
						: window2.frame.y - window1.frame.y
				);

				while (curNumMainWindows < targetNumMainWindows) {
					console.log(
						`Not enough main windows (${curNumMainWindows}/${targetNumMainWindows})`
					);
					const stackWindow = stackWindows.pop()!;
					console.log(`Moving stack window ${stackWindow.app} to main.`);
					this.moveWindowToMain(stackWindow);
					curNumMainWindows += 1;
				}
			}

			// Note: the following should never be called
			if (
				(await this.isValidLayout({ targetNumMainWindows })).status === false
			) {
				throw new Error(
					`updateLayout() ended with an invalid layout; reason: ${layoutValidity.reason}`
				);
			} else {
				console.log('updateLayout() was successful.');
			}

			this.expectedCurrentNumMainWindows = targetNumMainWindows;
		},
		getTopWindow(windows: Window[]) {
			let topWindow = windows[0];
			for (const w of windows) {
				if (w.frame.y < topWindow.frame.y) {
					topWindow = w;
				}
			}
			return topWindow;
		},
		isTopWindow(windows: Window[], window: Window) {
			return this.getTopWindow(windows).id === window.id;
		},
		getBottomWindow(windows: Window[]) {
			let bottomWindow = windows[0];
			for (const w of windows) {
				if (w.frame.y > bottomWindow.frame.y) {
					bottomWindow = w;
				}
			}
			return bottomWindow;
		},
		isBottomWindow(windows: Window[], window: Window) {
			return this.getBottomWindow(windows).id === window.id;
		},
		getTopStackWindow() {
			return this.getTopWindow(this.getStackWindows());
		},
		getBottomStackWindow() {
			return this.getBottomWindow(this.getStackWindows());
		},
		getTopMainWindow() {
			return this.getTopWindow(this.getMainWindows());
		},
		getBottomMainWindow() {
			return this.getBottomWindow(this.getMainWindows());
		},
	};

	return windowsManager;
}
