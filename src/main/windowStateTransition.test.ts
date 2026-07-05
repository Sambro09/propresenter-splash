import { describe, expect, it } from 'vitest';
import {
  evaluateWindowStateTransition,
  WINDOW_STATE_DEBOUNCE_MS,
  type WindowStateObservation
} from './windowStateTransition';

const freshObservation: WindowStateObservation = { pendingSince: 0 };

describe('evaluateWindowStateTransition', () => {
  it('starts a new observation when the sampled state changes', () => {
    const transition = evaluateWindowStateTransition(
      'foreground',
      freshObservation,
      'minimized',
      1_000
    );

    expect(transition.observation).toEqual({ pendingState: 'minimized', pendingSince: 1_000 });
    expect(transition.committedState).toBeUndefined();
    expect(transition.shouldReveal).toBe(false);
  });

  it('does not commit while the sample is inside the debounce window', () => {
    const observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 1_000 };
    const transition = evaluateWindowStateTransition(
      'foreground',
      observation,
      'minimized',
      1_000 + WINDOW_STATE_DEBOUNCE_MS - 1
    );

    expect(transition.observation).toEqual(observation);
    expect(transition.committedState).toBeUndefined();
    expect(transition.shouldReveal).toBe(false);
  });

  it('restarts the debounce clock when the state flaps', () => {
    let observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 0 };

    observation = evaluateWindowStateTransition(
      'foreground',
      observation,
      'foreground',
      3_000
    ).observation;
    expect(observation).toEqual({ pendingState: 'foreground', pendingSince: 3_000 });

    observation = evaluateWindowStateTransition(
      'foreground',
      observation,
      'minimized',
      3_500
    ).observation;
    expect(observation).toEqual({ pendingState: 'minimized', pendingSince: 3_500 });

    const stillPending = evaluateWindowStateTransition(
      'foreground',
      observation,
      'minimized',
      3_500 + WINDOW_STATE_DEBOUNCE_MS - 1
    );
    expect(stillPending.committedState).toBeUndefined();

    const committed = evaluateWindowStateTransition(
      'foreground',
      observation,
      'minimized',
      3_500 + WINDOW_STATE_DEBOUNCE_MS
    );
    expect(committed.committedState).toBe('minimized');
  });

  it('commits and reveals on a sustained transition into a recoverable state', () => {
    const observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 1_000 };
    const transition = evaluateWindowStateTransition(
      'foreground',
      observation,
      'minimized',
      1_000 + WINDOW_STATE_DEBOUNCE_MS
    );

    expect(transition.committedState).toBe('minimized');
    expect(transition.shouldReveal).toBe(true);
  });

  it('reveals when no state was committed yet and the sample is recoverable', () => {
    const observation: WindowStateObservation = { pendingState: 'background', pendingSince: 0 };
    const transition = evaluateWindowStateTransition(
      undefined,
      observation,
      'background',
      WINDOW_STATE_DEBOUNCE_MS
    );

    expect(transition.committedState).toBe('background');
    expect(transition.shouldReveal).toBe(true);
  });

  it('commits without revealing when moving between recoverable states', () => {
    const observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 0 };
    const transition = evaluateWindowStateTransition(
      'background',
      observation,
      'minimized',
      WINDOW_STATE_DEBOUNCE_MS
    );

    expect(transition.committedState).toBe('minimized');
    expect(transition.shouldReveal).toBe(false);
  });

  it('commits recovery back to the foreground without revealing', () => {
    const observation: WindowStateObservation = { pendingState: 'foreground', pendingSince: 0 };
    const transition = evaluateWindowStateTransition(
      'minimized',
      observation,
      'foreground',
      WINDOW_STATE_DEBOUNCE_MS
    );

    expect(transition.committedState).toBe('foreground');
    expect(transition.shouldReveal).toBe(false);
  });

  it('commits an unknown state without revealing', () => {
    const observation: WindowStateObservation = { pendingState: 'unknown', pendingSince: 0 };
    const transition = evaluateWindowStateTransition(
      'foreground',
      observation,
      'unknown',
      WINDOW_STATE_DEBOUNCE_MS
    );

    expect(transition.committedState).toBe('unknown');
    expect(transition.shouldReveal).toBe(false);
  });

  it('does not recommit a state that already matches the session', () => {
    const observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 0 };
    const transition = evaluateWindowStateTransition(
      'minimized',
      observation,
      'minimized',
      WINDOW_STATE_DEBOUNCE_MS * 2
    );

    expect(transition.observation).toEqual(observation);
    expect(transition.committedState).toBeUndefined();
    expect(transition.shouldReveal).toBe(false);
  });

  it('honors a custom debounce window', () => {
    const observation: WindowStateObservation = { pendingState: 'minimized', pendingSince: 0 };

    expect(
      evaluateWindowStateTransition('foreground', observation, 'minimized', 99, 100).committedState
    ).toBeUndefined();
    expect(
      evaluateWindowStateTransition('foreground', observation, 'minimized', 100, 100).committedState
    ).toBe('minimized');
  });
});
