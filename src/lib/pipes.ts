import { SKIPPED } from './types';

export function createSkipPipe<V>(n: number): (value: V) => V | typeof SKIPPED {
  if (n <= 0) {
    throw new Error('The number of skipped signals must be greater than 0.');
  }
  return (value: V) => {
    return --n < 0 ? value : SKIPPED;
  };
}

export function createTakePipe<V>(n: number): (value: V) => V | typeof SKIPPED {
  if (n <= 0) {
    throw new Error('The number of taken signals must be greater than 0.');
  }
  return (value: V) => {
    return --n < 0 ? SKIPPED : value;
  };
}

export function createFilterPipe<V>(predicate: (value: V) => boolean): (value: V) => V | typeof SKIPPED {
  return (value: V) => predicate(value) ? value : SKIPPED;
}
