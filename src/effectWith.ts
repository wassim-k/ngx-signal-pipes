import { CreateEffectOptions, effect, EffectCleanupRegisterFn, EffectRef, Signal } from '@angular/core';
import { createFilterOperator, createPairOperator, createSkipOperator, createTakeOperator } from './operators';
import { ExcludeSkipped, SignalLike, SignalValues, SKIPPED } from './types';

type EffectPipeline<T> = (next: EffectPipelineNext<T>, ctx: EffectPipelineContext) => void;

type EffectPipelineNext<T> = (value: T, ctx: EffectPipelineContext) => void;

export interface EffectPipelineContext {
  onCleanup: EffectCleanupRegisterFn;
  effectRef: EffectRef;
}

/**
 * Creates an `effect` pipeline that can be composed with various operators.
 */
export function effectWith<T>(signal: SignalLike<T>): EffectPipelineBuilder<ExcludeSkipped<T>>;
export function effectWith<Signals extends Array<SignalLike>>(...signals: Signals): EffectPipelineBuilder<SignalValues<Signals>>;
export function effectWith(...signals: Array<SignalLike>): any {
  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  return new EffectPipelineBuilder((next, ctx) => excludeSkipped(next)(source(), ctx));
}

export class EffectPipelineBuilder<T> {
  public constructor(private readonly pipeline: EffectPipeline<T>) { }

  /**
   * Delay effect run by the specified milliseconds.
   */
  public debounce(delay: number): EffectPipelineBuilder<T> {
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => {
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
  public filter<S extends T>(predicate: (value: T) => value is S): EffectPipelineBuilder<S>;
  public filter(predicate: (value: T) => boolean): EffectPipelineBuilder<T>;
  public filter(predicate: (value: T) => boolean): EffectPipelineBuilder<T> {
    const filter = createFilterOperator(predicate);
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = filter(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    }, ctx));
  }

  /**
   * Map values using a mapping function.
   */
  public map<R>(fn: (value: T) => R): EffectPipelineBuilder<R> {
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => next(fn(value), ctx), ctx));
  }

  /**
   * Pair each value with its previous value.
   *
   * The first value will be paired with `undefined` (since there is no previous value).
   */
  public pair(): EffectPipelineBuilder<[T, T | undefined]> {
    const pair = createPairOperator<T>();
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => next(pair(value), ctx), ctx));
  }

  /**
   * Skip the first N effect runs.
   */
  public skip(n: number): EffectPipelineBuilder<T> {
    const skip = createSkipOperator<T>(n);
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = skip(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    }, ctx));
  }

  /**
   * Run effect N times before destroying it.
   */
  public take(n: number): EffectPipelineBuilder<T> {
    const take = createTakeOperator<T>(n);
    return new EffectPipelineBuilder((next, ctx) => this.pipeline((value, ctx) => {
      const result = take(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      } else {
        ctx.effectRef.destroy();
      }
    }, ctx));
  }

  /**
   * Run the effect with the configured operators.
   */
  public run(fn: EffectPipelineNext<T>, options?: CreateEffectOptions): EffectRef {
    const effectRef = effect(onCleanup => this.pipeline(fn, { onCleanup, effectRef }), options);
    return effectRef;
  }
}

function excludeSkipped<T>(next: EffectPipelineNext<T>): EffectPipelineNext<T> {
  return (value, ctx) => {
    if (value === SKIPPED) return;
    next(value, ctx);
  };
}
