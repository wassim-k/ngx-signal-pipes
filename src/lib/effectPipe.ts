import { CreateEffectOptions, effect, EffectCleanupRegisterFn, EffectRef, Signal } from '@angular/core';
import { createFilterPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalValues, SKIPPED } from './types';

type EffectPipe<T = any> = (next: EffectPipeFn<T>) => EffectPipeFn<T>;
type EffectPipeFn<T = any> = (values: T, onCleanup: EffectCleanupRegisterFn, ref: EffectRef) => void;

export function effectPipe<T>(signal: Signal<T>): EffectPipeBuilder<ExcludeSkipped<T>>;
export function effectPipe<Signals extends Array<Signal<any>>>(...signals: Signals): EffectPipeBuilder<SignalValues<Signals>>;
export function effectPipe(...signals: Array<Signal<any>>): any {
  const source = signals.length === 1
    ? signals[0]
    : () => signals.map((s: Signal<any>) => s());

  return new EffectPipeBuilder(source as Signal<any>);
}

export class EffectPipeBuilder<T> {
  private readonly pipes: Array<EffectPipe<T>> = [];

  public constructor(private readonly source: Signal<T>) { }

  public debounce(delay: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (value, onCleanup, ref) => {
        timer = setTimeout(() => {
          next(value, onCleanup, ref);
          timer = null;
        }, delay);

        onCleanup(() => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        });
      }
    });

    return this;
  }

  public filter(predicate: (value: T) => boolean): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const filter = createFilterPipe(predicate);
      return (value, onCleanup, ref) => {
        const result = filter(value);
        if (result !== SKIPPED) {
          next(value, onCleanup, ref);
        }
      }
    });

    return this;
  }

  public skip(n: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const skip = createSkipPipe<T>(n);
      return (value, onCleanup, ref) => {
        const result = skip(value);
        if (result !== SKIPPED) {
          next(value, onCleanup, ref);
        }
      }
    });

    return this;
  }

  public take(n: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const take = createTakePipe<T>(n);
      return (value, onCleanup, ref) => {
        const result = take(value);
        if (result !== SKIPPED) {
          next(value, onCleanup, ref);
        } else {
          ref.destroy();
        }
      }
    });

    return this;
  }

  public run(fn: EffectPipeFn<T>, options?: CreateEffectOptions): EffectRef {
    const pipeline = [excludeSkipped<T>].concat(this.pipes).reduceRight((next, pipe) => pipe(next), fn);

    const ref = effect(
      onCleanup => pipeline(this.source(), onCleanup, ref),
      options
    );

    return ref;
  }
}

function excludeSkipped<T>(next: EffectPipeFn<T>): EffectPipeFn<T> {
  return (value, onCleanup, ref) => {
    if (value === SKIPPED) return;
    next(value, onCleanup, ref);
  };
}
