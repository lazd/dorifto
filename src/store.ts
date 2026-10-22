export interface Store<State> {
  getState(): Readonly<State>;
  update(patch: Partial<State>): void;
  subscribe(listener: (state: Readonly<State>) => void, keys?: readonly (keyof State)[]): () => void;
}

export function createStore<State extends object>(initial: State): Store<State> {
  let state: Readonly<State> = Object.freeze({ ...initial });
  const listeners = new Map<(state: Readonly<State>) => void, readonly (keyof State)[] | undefined>();
  return {
    getState: () => state,
    update(patch) {
      const keys = Object.keys(patch) as (keyof State)[];
      const changed = keys.filter((key) => !Object.is(state[key], patch[key]));
      if (!changed.length) return;
      state = Object.freeze({ ...state, ...patch });
      for (const [listener, watched] of listeners) {
        if (!watched || watched.some((key) => changed.includes(key))) listener(state);
      }
    },
    subscribe(listener, keys) {
      listeners.set(listener, keys);
      listener(state);
      return () => { listeners.delete(listener); };
    },
  };
}
