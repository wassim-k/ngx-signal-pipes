import { Injector, runInInjectionContext, signal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { computedPipe } from './computedPipe';
import { SKIPPED } from './types';

describe('computedPipe', () => {
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  it('should return a computed signal that reflects the source signal', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const cp = computedPipe(source);
      expect(cp()).toBe(1);

      source.set(2);
      expect(cp()).toBe(2);
    });
  }));

  it('should support .map to transform the value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | typeof SKIPPED>(2);
      const output = computedPipe(source).map(value => value * 2);
      expect(output()).toBe(4);

      source.set(4);
      expect(output()).toBe(8);

      source.set(SKIPPED);
      expect(output()).toBe(8);
    });
  }));

  it('should support .map with default value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | typeof SKIPPED>(SKIPPED);
      const output = computedPipe(source).map(value => value * 2, 0);
      expect(output()).toBe(0);

      source.set(2);
      expect(output()).toBe(4);

      source.set(SKIPPED);
      expect(output()).toBe(4);
    });
  }));

  it('should support .skip to ignore the first emission', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(10);
      const cp = computedPipe(source).skip(1);

      // Initially, the computed signal is set to SKIPPED.
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      // First update is still skipped.
      source.set(20);
      flushMicrotasks();
      expect(cp()).toBe(20);

      // Second update should pass through.
      source.set(30);
      flushMicrotasks();
      expect(cp()).toBe(30);
    });
  }));

  it('should support .take to take only the specified number of emissions', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);
      const cp = computedPipe(source).take(3);

      // After the initial emission.
      flushMicrotasks();
      expect(cp()).toBe(0);

      // First update.
      source.set(1);
      flushMicrotasks();
      expect(cp()).toBe(1);

      // Second update.
      source.set(2);
      flushMicrotasks();
      expect(cp()).toBe(2);

      // Further updates are ignored; computed value remains at the last taken value.
      source.set(3);
      flushMicrotasks();
      expect(cp()).toBe(2);

      source.set(4);
      flushMicrotasks();
      expect(cp()).toBe(2);
    });
  }));

  it('should support .debounce to delay updates', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(100);
      const cp = computedPipe(source).debounce(1000);

      // Initially, the computed value is the source value.
      expect(cp()).toBe(100);

      // Update the source; the debounced signal will not update immediately.
      source.set(200);
      expect(cp()).toBe(100);

      // Advance time partially.
      tick(500);
      expect(cp()).toBe(100);

      // Advance time to complete the debounce period.
      tick(500);
      expect(cp()).toBe(200);
    });
  }));

  it('should work with multiple signals and aggregate their values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const a = signal(1);
      const b = signal(2);
      // computedPipe aggregates multiple signals into an array.
      const cp = computedPipe(a, b).map((values: [number, number]) => values[0] + values[1]);
      expect(cp()).toBe(3);

      a.set(3);
      b.set(4);
      expect(cp()).toBe(7);
    });
  }));

  it('should accept options with an injector without errors', fakeAsync(() => {
    const source = signal(5);
    const cp = computedPipe(source, { injector });
    expect(cp()).toBe(5);

    source.set(10);
    expect(cp()).toBe(10);
  }));

  it('should chain .skip(2).skip(2) correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Chain two skip pipes, each set to skip 2 emissions.
      const cp = computedPipe(source).skip(2).skip(2);

      // (skip: 1, skip: 0)
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      // (skip: 2, skip: 0)
      source.set(2);
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      // (skip: 2, skip: 1)
      source.set(3);
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      // (skip: 2, skip: 2)
      source.set(4);
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      source.set(5);
      flushMicrotasks();
      expect(cp()).toBe(5);
    });
  }));

  it('should chain .skip(1).debounce correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(10);
      const cp = computedPipe(source).skip(1).debounce(1000);

      // Initially, cp() is SKIPPED.
      expect(cp()).toBe(SKIPPED);

      source.set(20);
      tick(1000);
      expect(cp()).toBe(20);

      // Debounced
      source.set(30);
      expect(cp()).toBe(20);

      // Advance time to flush the debounce timer.
      tick(1000);
      expect(cp()).toBe(30);
    });
  }));

  it('should only update when the predicate is true', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Filter to only allow even numbers.
      const cp = computedPipe(source).filter(value => value % 2 === 0);

      // Starts with the initial value, even if it doesn't pass the predicate.
      expect(cp()).toBe(SKIPPED);

      source.set(3); // Odd, should be ignored.
      flushMicrotasks();
      expect(cp()).toBe(SKIPPED);

      source.set(4); // Even, should update.
      flushMicrotasks();
      expect(cp()).toBe(4);

      source.set(5); // Odd, ignored.
      flushMicrotasks();
      expect(cp()).toBe(4);
    });
  }));

  it('should narrow types using filter correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | string>(1);

      const cp = computedPipe(source)
        .filter((value): value is number => typeof value === 'number')
        .default(0);

      expect(cp() + 1).toBe(2);
    });
  }));

  it('should replace SKIPPED with the provided default value using default(defaultValue)', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number>(0);
      const cp = computedPipe(source).skip(1).default(42);

      // Initially the source is SKIPPED, so default returns provided value.
      expect(cp()).toBe(42);

      // When source emits a valid value, it propagates.
      source.set(10);
      flushMicrotasks();
      expect(cp()).toBe(10);
    });
  }));

  it('should replace SKIPPED with undefined using default() overload without arguments', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number>(0);
      const cp = computedPipe(source).skip(1).default();

      // With no default provided, SKIPPED is replaced by undefined.
      expect(cp()).toBeUndefined();

      // When source emits a valid value, it propagates.
      source.set(5);
      flushMicrotasks();
      expect(cp()).toBe(5);
    });
  }));

  it('should work in a chain with other pipes', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(2);
      // Chain: first filter even numbers, then double the value.
      const cp = computedPipe(source)
        .filter(value => value % 2 === 0)
        .map(value => value * 2);

      // Initial value 2 passes filter, mapped to 4.
      flushMicrotasks();
      expect(cp()).toBe(4);

      source.set(3); // Fails filter, remains 4.
      flushMicrotasks();
      expect(cp()).toBe(4);

      source.set(6); // Passes filter, mapped to 12.
      flushMicrotasks();
      expect(cp()).toBe(12);
    });
  }));

  it('should stop propagating changes after destroy is called', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Use skip(1) to register an internal effect
      const cp = computedPipe(source).debounce(10);

      // Flush initial tasks: the computed value should be SKIPPED due to skip(1)
      expect(cp()).toBe(1);

      // Update the source to trigger the effect
      source.set(2);
      tick(10);
      expect(cp()).toBe(2);

      // Now destroy all nested effects
      cp.destroy();

      // Update the source again. With the effects cleaned up, the computed signal should no longer update.
      source.set(3);
      tick(10);
      expect(cp()).toBe(2);
    });
  }));
});
