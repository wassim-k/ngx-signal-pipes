import { Signal } from '@angular/core';

export const SKIPPED = Symbol('NGX_SIGNAL_PIPES_SKIPPED');

export type ExcludeSkipped<T> = Exclude<T, typeof SKIPPED>;

export type SignalValues<S extends Array<Signal<any>>> = {
  [K in keyof S]: S[K] extends Signal<infer U> ? U : never;
};
