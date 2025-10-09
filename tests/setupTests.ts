import { vi } from 'vitest';

// If running under jsdom (window exists) enable testing-library and DOM mocks
if (typeof window !== 'undefined') {
	// jest-dom for DOM matchers
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require('@testing-library/jest-dom');

	// Mock embla-carousel-react used by Carousel so api.on/off exist in tests
	vi.mock('embla-carousel-react', () => {
		return {
			__esModule: true,
			default: () => {
				const carouselRef = () => {};
				const api = {
					on: (_: string, __: unknown) => {},
					off: (_: string, __: unknown) => {},
					canScrollPrev: () => false,
					canScrollNext: () => false,
					scrollPrev: () => {},
					scrollNext: () => {},
				};
				return [carouselRef, api];
			},
		};
	});
} else {
	// Node environment (integration tests): provide minimal localStorage polyfill
	// so storage.initializeDemoData and other localStorage-using code works.
	// This is intentionally tiny and only supports what tests need.
	// @ts-ignore
	global.localStorage = (function () {
		let store: Record<string, string> = {};
		return {
			getItem(key: string) {
				return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
			},
			setItem(key: string, value: string) {
				store[key] = String(value);
			},
			removeItem(key: string) {
				delete store[key];
			},
			clear() {
				store = {};
			},
		};
	})();
}
