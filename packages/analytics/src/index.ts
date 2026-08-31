export type AnalyticsEvent = Record<string, string | number | boolean | undefined>;

export interface AnalyticsProvider {
  track(name: string, props?: AnalyticsEvent): void;
  screen(name: string, props?: AnalyticsEvent): void;
  identify(userId: string, traits?: AnalyticsEvent): void;
}

const consoleProvider: AnalyticsProvider = {
  track: (name, props) => console.log(`[analytics] track ${name}`, props ?? ''),
  screen: (name, props) => console.log(`[analytics] screen ${name}`, props ?? ''),
  identify: (userId, traits) => console.log(`[analytics] identify ${userId}`, traits ?? ''),
};

/**
 * Swap in a real provider here (PostHog, Amplitude, Plausible, Umami…).
 * Everything in the app calls the `analytics.*` helpers below only.
 */
let provider: AnalyticsProvider = consoleProvider;

export function setAnalyticsProvider(p: AnalyticsProvider) {
  provider = p;
}

export const analytics = {
  track: (name: string, props?: AnalyticsEvent) => provider.track(name, props),
  screen: (name: string, props?: AnalyticsEvent) => provider.screen(name, props),
  identify: (userId: string, traits?: AnalyticsEvent) => provider.identify(userId, traits),
};
