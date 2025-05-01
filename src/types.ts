export const SKIPPED = Symbol('NGX_SIGNAL_OPERATORS_SKIPPED');

export type ExcludeSkipped<T> = Exclude<T, typeof SKIPPED>;

export type SignalLike<T = any> = () => T;

export type SignalValues<S extends Array<SignalLike>> = {
  [K in keyof S]: S[K] extends () => infer U ? U : never;
};
