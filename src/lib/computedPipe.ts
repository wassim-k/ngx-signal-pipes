import { computed, CreateComputedOptions, EffectRef, Injector, signal, Signal } from '@angular/core';
import { effectPipe } from './effectPipe';
import { createFilterPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalValues, SKIPPED } from './types';

export interface ComputedPipeOptions<T> extends CreateComputedOptions<T> {
  injector?: Injector;
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
   * Map values using a mapping function.
   *
   * @param defaultValue The value to return if the initial value is `SKIPPED`
   */
  map<R, D>(fn: (value: ExcludeSkipped<T>) => R, defaultValue: D): ComputedPipeSignal<R | D>;

  /**
   * Replace `SKIPPED` with the specified default value.
   * @param [defaultValue] The value to return if the initial value is `SKIPPED`, defaults to `undefined`.
   */
  default<D = undefined>(defaultValue?: D): ComputedPipeSignal<ExcludeSkipped<T> | D>;

  /**
   * Cleanup any internal effects used by the pipe chain.
   */
  destroy(): void;
};

export function computedPipe<T>(signal: Signal<T>): ComputedPipeSignal<T>;
export function computedPipe<T>(signal: Signal<T>, options: ComputedPipeOptions<T>): ComputedPipeSignal<T>;
export function computedPipe<Signals extends Array<Signal<any>>>(...signals: Signals): ComputedPipeSignal<SignalValues<Signals>>;
export function computedPipe<Signals extends Array<Signal<any>>>(...args: [...signals: Signals, options: ComputedPipeOptions<SignalValues<Signals>>]): ComputedPipeSignal<SignalValues<Signals>>;
export function computedPipe(...args: Array<any>): ComputedPipeSignal<any> {
  let options: ComputedPipeOptions<any> | undefined;
  let signals: Array<Signal<any>> = args;

  if (args.length > 1 && typeof args[args.length - 1] !== 'function') {
    options = args.pop();
    signals = args;
  }

  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  return createComputedPipeSignal(source as Signal<any>, options, []);
}

function createComputedPipeSignal<T>(
  source: Signal<T>,
  options: ComputedPipeOptions<any> | undefined,
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
        let lastValue: T | typeof SKIPPED = SKIPPED;
        const output = computed(() => {
          const value = source();
          if (value === SKIPPED) return lastValue;
          return filter(value as ExcludeSkipped<T>) === SKIPPED
            ? lastValue
            : (lastValue = value);
        }, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      skip(n: number) {
        const skip = createSkipPipe<T>(n);
        let lastValue: T | typeof SKIPPED = SKIPPED;
        const output = computed(() => {
          const value = source();
          if (value === SKIPPED) return lastValue;
          return skip(value) === SKIPPED
            ? lastValue
            : (lastValue = value);
        }, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      take(n: number) {
        const take = createTakePipe<T>(n);
        let lastValue: T | typeof SKIPPED = SKIPPED;
        const output = computed(() => {
          const value = source();
          if (value === SKIPPED) return lastValue as T;
          if (take(value) === SKIPPED) {
            this.destroy();
            return lastValue as T;
          } else {
            return (lastValue = value);
          }
        }, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      map<R, D>(...args: [fn: (value: ExcludeSkipped<T>) => R, defaultValue?: D]) {
        const [fn, defaultValue] = args;
        let lastValue: R | typeof SKIPPED = SKIPPED;
        const output = computed(() => {
          const value = source();

          if (value === SKIPPED) {
            if (lastValue !== SKIPPED) {
              return lastValue;
            } else {
              return args.length === 1 ? SKIPPED : defaultValue;
            }
          }

          return (lastValue = fn(value as ExcludeSkipped<T>));
        }, options);
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
