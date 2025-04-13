import { computed, CreateComputedOptions, EffectRef, Injector, isSignal, signal, Signal } from '@angular/core';
import { effectPipe } from './effectPipe';
import { createFilterPipe, createPairPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalLike, SignalValues, SKIPPED } from './types';

export interface ComputedPipeOptions {
  injector?: Injector;
  debugName?: string;
}

export type ComputedPipeSignal<T> = Signal<T> & {
  /**
   * Filter values based on a predicate.
   *
   * If the initial value is filtered then `SKIPPED` is returned.
   */
  filter<S extends ExcludeSkipped<T>>(predicate: (value: ExcludeSkipped<T>) => value is S): ComputedPipeSignal<S | typeof SKIPPED>;
  filter(predicate: (value: ExcludeSkipped<T>) => boolean): ComputedPipeSignal<T | typeof SKIPPED>;

  /**
   * Delay value computation by the specified milliseconds.
   *
   * Returns the initial signal value instantly, then debounces future value changes.
   */
  debounce(delay: number): ComputedPipeSignal<T>;

  /**
   * Returns `SKIPPED` for the first N computations, then passes through subsequent values as-is.
   */
  skip(n: number): ComputedPipeSignal<T | typeof SKIPPED>;

  /**
   * Returns value as-is for the first N computations, then retains the N-th value for all subsequent computations.
   */
  take(n: number): ComputedPipeSignal<T>;

  /**
   * Map values using a mapping function.
   */
  map<R>(fn: (value: ExcludeSkipped<T>) => R): ComputedPipeSignal<R | Extract<T, typeof SKIPPED>>;

  /**
   * Pair each value with its previous value.
   *
   * The first value will be paired with `undefined` (since there is no previous value).
   */
  pair(): ComputedPipeSignal<[ExcludeSkipped<T>, ExcludeSkipped<T> | undefined] | Extract<T, typeof SKIPPED>>;

  /**
   * Replace `SKIPPED` with the specified default value.
   *
   * Generally, `default` should be the last pipe in the chain to allow for `SKIPPED` to propagate through the previous pipes.
   *
   * @param [defaultValue] The value to return instead of `SKIPPED`, defaults to `undefined`.
   */
  default<D = undefined>(defaultValue?: D): ComputedPipeSignal<ExcludeSkipped<T> | D>;

  /**
   * Cleanup any internal effects used by the pipe chain.
   */
  destroy(): void;
};

export function computedPipe<T>(signal: SignalLike<T>): ComputedPipeSignal<T>;
export function computedPipe<T>(signal: SignalLike<T>, options: ComputedPipeOptions): ComputedPipeSignal<T>;
export function computedPipe<Signals extends Array<SignalLike>>(...signals: Signals): ComputedPipeSignal<SignalValues<Signals>>;
export function computedPipe<Signals extends Array<SignalLike>>(...args: [...signals: Signals, options: ComputedPipeOptions]): ComputedPipeSignal<SignalValues<Signals>>;
export function computedPipe(...args: Array<any>): ComputedPipeSignal<any> {
  let options: ComputedPipeOptions | undefined;
  let signals: Array<Signal<any>> = args;

  if (args.length > 1 && typeof args[args.length - 1] !== 'function') {
    options = args.pop();
    signals = args;
  }

  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  const signal = isSignal(source) ? source : computed(source);
  return createComputedPipeSignal(signal, options, []);
}

function createComputedPipeSignal<T>(
  source: Signal<T>,
  options: ComputedPipeOptions | undefined,
  effectRefs: Array<EffectRef>
): ComputedPipeSignal<T> {
  return Object.assign(
    source,
    {
      debounce(delay: number) {
        const output = signal(source());
        effectRefs.push(effectPipe(source)
          .debounce(delay)
          .run(value => output.set(value), { injector: options?.injector, forceRoot: true }));
        return createComputedPipeSignal(output, options, effectRefs);
      },
      filter(predicate: (value: ExcludeSkipped<T>) => boolean) {
        const filter = createFilterPipe(predicate);
        const output = computedWithLastValue(source, value => filter(value as ExcludeSkipped<T>) === SKIPPED ? SKIPPED : value, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      skip(n: number) {
        const skip = createSkipPipe<T>(n);
        const output = computedWithLastValue(source, value => skip(value) === SKIPPED ? SKIPPED : value, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      take(n: number) {
        const take = createTakePipe<T>(n);
        const output = computedWithLastValue(source, value => {
          if (take(value) === SKIPPED) {
            this.destroy();
            return SKIPPED;
          } else {
            return value;
          }
        }, options) as Signal<T>;
        return createComputedPipeSignal(output, options, effectRefs);
      },
      map<R>(fn: (value: ExcludeSkipped<T>) => R) {
        const output = computedWithLastValue(source, value => fn(value as ExcludeSkipped<T>), options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      pair() {
        const pair = createPairPipe<ExcludeSkipped<T>>();
        const output = computedWithLastValue(source, pair, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      default<D = undefined>(defaultValue?: D) {
        const output = computed(() => {
          const value = source();
          return (value === SKIPPED ? defaultValue : value) as ExcludeSkipped<T> | D;
        }, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      destroy() {
        for (const effectRef of effectRefs) {
          effectRef.destroy();
        }
      }
    }
  );
}

function computedWithLastValue<T, R>(source: SignalLike<T>, fn: (value: ExcludeSkipped<T>) => R, options: ComputedPipeOptions | undefined): Signal<R | Extract<T, typeof SKIPPED>> {
  let lastValue: R | typeof SKIPPED = SKIPPED;
  return computed(() => {
    const value = source();
    if (value === SKIPPED) return lastValue as Extract<T, typeof SKIPPED>;
    const newValue = fn(value as ExcludeSkipped<T>);
    return (newValue === SKIPPED
      ? lastValue
      : (lastValue = newValue)) as R;
  }, options);
}
