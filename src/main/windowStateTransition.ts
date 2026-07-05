import type { ProPresenterWindowState } from '../shared/types';

export const WINDOW_STATE_DEBOUNCE_MS = 5_000;

const RECOVERABLE_WINDOW_STATES = new Set<ProPresenterWindowState>([
  'background',
  'minimized'
]);

export interface WindowStateObservation {
  pendingState?: ProPresenterWindowState;
  pendingSince: number;
}

export interface WindowStateTransition {
  observation: WindowStateObservation;
  committedState?: ProPresenterWindowState;
  shouldReveal: boolean;
}

/**
 * Pure debounce/transition decision for the session watcher: a sampled window
 * state is committed only after it has been observed unchanged for the full
 * debounce window, and the splash is revealed only on a transition from a
 * non-recoverable state into a recoverable one (minimized/background).
 */
export function evaluateWindowStateTransition(
  committedState: ProPresenterWindowState | undefined,
  observation: WindowStateObservation,
  sampledState: ProPresenterWindowState,
  now: number,
  debounceMs: number = WINDOW_STATE_DEBOUNCE_MS
): WindowStateTransition {
  if (observation.pendingState !== sampledState) {
    return {
      observation: { pendingState: sampledState, pendingSince: now },
      shouldReveal: false
    };
  }

  if (now - observation.pendingSince < debounceMs || committedState === sampledState) {
    return { observation, shouldReveal: false };
  }

  return {
    observation,
    committedState: sampledState,
    shouldReveal:
      RECOVERABLE_WINDOW_STATES.has(sampledState) &&
      !RECOVERABLE_WINDOW_STATES.has(committedState as ProPresenterWindowState)
  };
}
