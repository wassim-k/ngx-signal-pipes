import { CreateEffectOptions, effect, EffectCleanupRegisterFn, EffectRef, Signal } from '@angular/core';
import { createFilterPipe, createPairPipe, createSkipPipe, createTakePipe } from './pipes';
import { ExcludeSkipped, SignalLike, SignalValues, SKIPPED } from './types';

export type EffectPipeFn<T> = (value: T, ctx: EffectPipeContext) => void;

export interface EffectPipeContext {
  onCleanup: EffectCleanupRegisterFn;
  effectRef: EffectRef;
}

type EffectPipeline<T> = (next: EffectPipeFn<T>, ctx: EffectPipeContext) => void;

/**
 * Creates an effect pipeline that can be composed with various pipes.
 */
export function effectPipe<T>(signal: SignalLike<T>): EffectPipeBuilder<ExcludeSkipped<T>>;
export function effectPipe<Signals extends Array<SignalLike>>(...signals: Signals): EffectPipeBuilder<SignalValues<Signals>>;
export function effectPipe(...signals: Array<SignalLike>): any {
  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  return new EffectPipeBuilder((next, ctx) => excludeSkipped(next)(source(), ctx));
}

export class EffectPipeBuilder<T> {
  public constructor(private readonly pipeline: EffectPipeline<T>) { }

  /**
   * Delay effect run by the specified milliseconds.
   */
  public debounce(delay: number): EffectPipeBuilder<T> {
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

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
    }, ctx));
  }

  /**
   * Conditionally run effect based on predicate.
   */
  public filter<S extends T>(predicate: (value: T) => value is S): EffectPipeBuilder<S>;
  public filter(predicate: (value: T) => boolean): EffectPipeBuilder<T>;
  public filter(predicate: (value: T) => boolean): EffectPipeBuilder<T> {
    const filter = createFilterPipe(predicate);
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = filter(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    }, ctx));
  }

  /**
   * Map values using a mapping function.
   */
  public map<R>(fn: (value: T) => R): EffectPipeBuilder<R> {
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => next(fn(value), ctx), ctx));
  }

  /**
   * Pair each value with its previous value.
   *
   * The first value will be paired with `undefined` (since there is no previous value).
   */
  public pair(): EffectPipeBuilder<[T, T | undefined]> {
    const pair = createPairPipe<T>();
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => next(pair(value), ctx), ctx));
  }

  /**
   * Skip the first N effect runs.
   */
  public skip(n: number): EffectPipeBuilder<T> {
    const skip = createSkipPipe<T>(n);
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = skip(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    }, ctx));
  }

  /**
   * Run effect N times before destroying it.
   */
  public take(n: number): EffectPipeBuilder<T> {
    const take = createTakePipe<T>(n);
    return new EffectPipeBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = take(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      } else {
        ctx.effectRef.destroy();
      }
    }, ctx));
  }

  /**
   * Run the effect with the configured pipes.
   */
  public run(fn: EffectPipeFn<T>, options?: CreateEffectOptions): EffectRef {
    const effectRef = effect(onCleanup => this.pipeline(fn, { onCleanup, effectRef }), options);
    return effectRef;
  }
}

function excludeSkipped<T>(next: EffectPipeFn<T>): EffectPipeFn<T> {
  return (value, ctx) => {
    if (value === SKIPPED) return;
    next(value, ctx);
  };
}
