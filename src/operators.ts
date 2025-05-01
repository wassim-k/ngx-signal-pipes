import { SKIPPED } from './types';

export function createSkipOperator<V>(n: number): (value: V) => V | typeof SKIPPED {
  if (n <= 0) {
    throw new Error('The number of skipped signal values must be greater than 0.');
  }
  return (value: V) => {
    return --n < 0 ? value : SKIPPED;
  };
}

export function createTakeOperator<V>(n: number): (value: V) => V | typeof SKIPPED {
  if (n <= 0) {
    throw new Error('The number of taken signal values must be greater than 0.');
  }
  return (value: V) => {
    return --n < 0 ? SKIPPED : value;
  };
}

export function createFilterOperator<V>(predicate: (value: V) => boolean): (value: V) => V | typeof SKIPPED {
  return (value: V) => predicate(value) ? value : SKIPPED;
}

export function createPairOperator<V>(): (value: V) => [V, V | undefined] {
  let prev: V | undefined = undefined;
  return (value: V) => {
    const pair: [V, V | undefined] = [value, prev];
    prev = value;
    return pair;
  };
}
