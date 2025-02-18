import { computed, CreateComputedOptions, EffectRef, Injector, signal, Signal } from '@angular/core';
import { effectPipe } from './effectPipe';
import { createFilterPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalValues, SKIPPED } from './types';

export interface ComputedPipeOptions<T> extends CreateComputedOptions<T> {
  injector?: Injector;
}

export type ComputedPipeSignal<T> = Signal<T> & {
  filter(fn: (value: ExcludeSkipped<T>) => boolean): ComputedPipeSignal<T | typeof SKIPPED>;
  debounce(delay: number): ComputedPipeSignal<T>;
  skip(n: number): ComputedPipeSignal<T | typeof SKIPPED>;
  take(n: number): ComputedPipeSignal<T>;
  map<R>(fn: (value: ExcludeSkipped<T>) => R): ComputedPipeSignal<R | Extract<T, typeof SKIPPED>>;
  map<R, D>(fn: (value: ExcludeSkipped<T>) => R, defaultValue: D): ComputedPipeSignal<R | D>;
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

  const aggregator = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  return createComputedPipeSignal(aggregator as Signal<any>, options, []);
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
        let lastValue: any = SKIPPED;
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
        let lastValue: any = SKIPPED;
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
        let lastValue: any = SKIPPED;
        const output = computed(() => {
          const value = source();
          if (value === SKIPPED) return lastValue;
          if (take(value) === SKIPPED) {
            this.destroy();
            return lastValue;
          } else {
            return (lastValue = value);
          }
        }, options);
        return createComputedPipeSignal(output, options, effectRefs);
      },
      map<R, D>(...args: [fn: (value: ExcludeSkipped<T>) => R, defaultValue?: D]) {
        const [fn, defaultValue] = args;
        const output = computed(() => {
          const value = source();
          return value === SKIPPED
            ? args.length === 1 ? value : defaultValue
            : fn(value as ExcludeSkipped<T>);
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
