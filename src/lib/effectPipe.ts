import { CreateEffectOptions, effect, EffectCleanupRegisterFn, EffectRef, Signal } from '@angular/core';
import { createFilterPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalValues, SKIPPED } from './types';

export type EffectPipeFn<T = any> = (values: T, ctx: EffectPipeContext) => void;

export interface EffectPipeContext {
  onCleanup: EffectCleanupRegisterFn;
  effectRef: EffectRef;
}

type EffectPipe<T = any> = (next: EffectPipeFn<T>) => EffectPipeFn<T>;

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

  /**
   * Delay effect run by the specified milliseconds.
   */
  public debounce(delay: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (value, ctx) => {
        timer = setTimeout(() => {
          next(value, ctx);
          timer = null;
        }, delay);

        ctx.onCleanup(() => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        });
      }
    });

    return this;
  }

  /**
   * Conditionally run effect based on predicate.
   */
  public filter(predicate: (value: T) => boolean): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const filter = createFilterPipe(predicate);
      return (value, ctx) => {
        const result = filter(value);
        if (result !== SKIPPED) {
          next(value, ctx);
        }
      }
    });

    return this;
  }

  /**
   * Skip the first N effect runs.
   */
  public skip(n: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const skip = createSkipPipe<T>(n);
      return (value, ctx) => {
        const result = skip(value);
        if (result !== SKIPPED) {
          next(value, ctx);
        }
      }
    });

    return this;
  }

  /**
   * Run effect N times before destroying it.
   */
  public take(n: number): EffectPipeBuilder<T> {
    this.pipes.push(next => {
      const take = createTakePipe<T>(n);
      return (value, ctx) => {
        const result = take(value);
        if (result !== SKIPPED) {
          next(value, ctx);
        } else {
          ctx.effectRef.destroy();
        }
      }
    });

    return this;
  }

  /**
   * Run the effect with the configured pipes.
   */
  public run(fn: EffectPipeFn<T>, options?: CreateEffectOptions): EffectRef {
    const pipeline = [excludeSkipped<T>].concat(this.pipes).reduceRight((next, pipe) => pipe(next), fn);

    const effectRef = effect(
      onCleanup => pipeline(this.source(), { onCleanup, effectRef }),
      options
    );

    return effectRef;
  }
}

function excludeSkipped<T>(next: EffectPipeFn<T>): EffectPipeFn<T> {
  return (value, ctx) => {
    if (value === SKIPPED) return;
    next(value, ctx);
  };
}
