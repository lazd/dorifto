export interface Store<State> {
  getState(): Readonly<State>;
  update(patch: Partial<State>): void;
  subscribe(listener: (state: Readonly<State>) => void): () => void;
}

export function createStore<State extends object>(initial: State): Store<State> {
  let state: Readonly<State> = Object.freeze({ ...initial });
  const listeners = new Set<(state: Readonly<State>) => void>();
  return {
    getState: () => state,
    update(patch) {
      const keys = Object.keys(patch) as (keyof State)[];
      if (!keys.some((key) => !Object.is(state[key], patch[key]))) return;
      state = Object.freeze({ ...state, ...patch });
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
  };
}
