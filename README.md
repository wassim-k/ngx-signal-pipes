# NgxSignalPipes

Transform Angular signals with functional pipes.

## Installation

```bash
npm install ngx-signal-pipes
```

## 🔧 Requirements
* Angular >= 17.0.0
* TypeScript >= 5.2.0

## ✨ Features
* Purely written using Signals.
* Depends only on `@angular/core`.
* No dependency on `RxJS`.
* < 2KB minified.

## Motivation
**NgxSignalPipes** was created to provide **clean**, **simple**, and **readable** solutions to common and repeatable signals patterns.

### Examples

#### 1. Skip first effect callback:

This is common, as the first callback is usually with the initial signal values before the user interacts with the component.

Without **NgxSignalPipes**:
```typescript
const input = signal('');

let isFirst = true;

effect(() => {
  const value = input(); // Establish dependency.

  if (isFirst) {
    isFirst = false;
    return;
  }

  console.log($`Input changed to: ${value}`);
});
```

With **NgxSignalPipes**:
```typescript
const input = signal('');

effectPipe(input)
  .skip(1)
  .run(value => console.log($`Input changed to: ${value}`));
```

#### 2. Debounce `computed` value

This is common when working with APIs where user input needs to be debounced to avoid spamming the API:

Without **NgxSignalPipes**:
```typescript
const input = signal('');

const input$ = toObservable(input).pipe(
  debounceTime(500)
);

const debouncedInput = toSignal(input$, {
  initialValue: input()
});
```

With **NgxSignalPipes**:
```typescript
const input = signal('');

const debouncedInput = computedPipe(input).debounce(500);
```

### Comparison to RxJS
While both libraries have a similar functional pipe-based API, they operate on fundamentally different primitives:
* **Signals** are pull-based and always have a value.
* **Observables** are push-based streams.

**NgxSignalPipes** focuses on providing **simple** solutions to common signals patterns. While some functionality may overlap, the implementations are specifically optimised for Signals.

Use **NgxSignalPipes** when working primarily with Signals and simple transformations.

Use **RxJS** when dealing with complex async flows, event streams, error handling or when you need its rich operator ecosystem.

## Core Concepts

**NgxSignalPipes** provides two main functions built entirely on Angular's signals system:
- `effectPipe`: For handling side effects based on signal changes.
- `computedPipe`: For transforming signal values.

### Signals Reactivity Refresher
Signals reactivity works in two phases:
1. **Notifying Dependents Phase**

   When a signal's value changes, it immediately marks all its dependents (such as computed signals, effects or component template) as "dirty".  
   This notification means that any cached values are flagged for update, ensuring that dependent computations know they must refresh their value, but they are not re-evaluated immediately.

2. **Lazy Evaluation Phase**

   The value of dependents is lazily recalculated only when their value is actually accessed. This on-demand "pull" minimises unnecessary recomputation, enhancing performance by recalculating only when needed.

This is crucial for understanding how the various pipes in this library work.

## `effectPipe`

### Overview

`effectPipe` handles side effects from signal changes.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { effectPipe } from 'ngx-signal-pipes';

const temperature = signal(20);

effectPipe(temperature)
  .skip(1)             // Skip initial value
  .filter(t => t > 30) // Only high temps
  .debounce(1000)      // Avoid spam
  .run(t => {
    console.log(`Warning: Temperature ${t}°C`);
  });
```

### Under the Hood
`effectPipe` is implemented using a single `effect` and a pipeline pattern, it roughly translates to this:

```typescript
effect(() => pipe1(pipe2(pipe3(run))));
```

Each pipe decides whether to call the next pipe and so on, until the `run` callback is invoked.

### Timing
`effect`s called from an Angular component run during the change detection stage of the component's lifecycle.

`effect`s called from outside an Angular component or with `forceRoot` option run as a microtask.

**NgxSignalPipes** operates on each one of those **effect runs**.

### Pipes

#### filter
Conditionally run effect based on predicate.

```typescript
const input = signal(0);

effectPipe(input)
  .filter(x => x % 2 === 0)
  .run(value => {
    console.log('Even number:', value);
  });
```

#### skip
Skip the first N effect runs.

```typescript
const input = signal(0);

effectPipe(input)
  .skip(1)
  .run(value => {
    console.log('After initial value:', value);
  });
```

#### take
Run effect N times before destroying it.

```typescript
const input = signal(0);

effectPipe(input)
  .take(1)
  .run(value => {
    console.log('Initial value:', value);
  });
```

#### debounce
Delay effect run by the specified milliseconds.

```typescript
const input = signal('');

effectPipe(input)
  .debounce(500)
  .run(value => {
    console.log('Debounced input:', value);
  });
```

#### run
Executes the effect with the configured pipeline.

```typescript
const input = signal('');

const effectRef = effectPipe(input)
  .filter(value => value.length > 0)
  .run(
    (value, { onCleanup, effectRef }: EffectPipeContext) => {
      // Register cleanup logic if needed
      onCleanup(() => {
        console.log('Cleaning up after:', value);
      });
    },
    { injector }
  );
```

Parameters:
- `fn`: Callback function that receives:
  - `value`: The current value(s) from the source signal(s)
  - `context`: An object with:
    - `onCleanup`: Function to register cleanup handlers
    - `effectRef`: Reference to the effect instance
- `options`: [`CreateEffectOptions`](https://angular.dev/api/core/CreateEffectOptions)

Returns an `EffectRef` that can be used to destroy the effect manually.

## `computedPipe`

### Overview

`computedPipe` transforms computed signal values.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { computedPipe } from 'ngx-signal-pipes';

const input = signal('');

const normalisedInput = computedPipe(input)
  .skip(1)                    // Skip initial empty value
  .filter(v => v.length > 0)  // Ignore empty strings
  .debounce(500)              // Wait for typing to stop
  .map(v => v.toLowerCase()); // Normalise case

input.set('HELLO'); // After 500ms: "hello"
```

### Under the Hood
`computedPipe` is implemented by simply chaining multiple `computed` signals. It roughly translates to:

```typescript
const input =         signal(0);
const intermediate1 = computed(pipe1(input));
const intermediate2 = computed(pipe2(intermediate1));
const output =        computed(pipe3(intermediate2));
```

Each pipe applies a transformation to the value which in turn is pulled by the next `computed` value and so on...

### Timing
`computed` value **computation** is performed when the value is accessed. Then the value is cached until the next time one of its dependencies changes.

The timing of the **computation** depends on when the signal is accessed:
* If the `computed` value is accessed from a component's template, then it will run as part of the component's rendering cycle.
* If the `computed` value is accessed from an `effect`, then it follows the `effect` timing explained previously.

**NgxSignalPipes** operates on each one of those value **computations**.

### Pipes

#### map
Map values using a mapping function.

```typescript
const input = signal(1);
const doubled = computedPipe(input).map(x => x * 2);
```

#### filter
Filter values based on a predicate.  
If the initial value is filtered then `SKIPPED` is returned.

```typescript
const input = signal(0);
const evenOnly = computedPipe(input).filter(x => x % 2 === 0);
```

#### skip
Returns `SKIPPED` for the first N computations, then passes through subsequent values as-is.

```typescript
const input = signal(0);
const skipFirst = computedPipe(input).skip(1);
```

#### take
Returns value as-is for the first N computations, then retains the N-th value for all subsequent computations.  
It also calls `destroy()` on the `computedPipe` to cleanup any internal effects.

```typescript
const input = signal(0);
const takeFirst = computedPipe(input).take(1);
```

#### debounce
Delay value computation by the specified milliseconds.

```typescript
const input = signal('');
const debouncedInput = computedPipe(input).debounce(500);

input.set('a'); // Will emit after 500ms
input.set('ab'); // Resets the 500ms timer
```

Signals always have a value, using `debounce` with `computedPipe` returns the initial signal value instantly, then debounces future value changes.

`debounce` uses an `effect` internally. The internal `effect` is automatically cleaned-up when the component is destroyed, but it can be done manually by calling `computedPipeSignal.destroy()`.

#### default
Replace `SKIPPED` with the specified default value.

```typescript
const input = signal('');
const skipWithDefault = computedPipe(input)
  .skip(1)            // This will produce SKIPPED initially
  .default('None');   // Replace SKIPPED with 'None'
```

### SKIPPED symbol
Since signals always have a value, if a computation results in a skipped value, then a special `SKIPPED` symbol is returned instead.

`SKIPPED` only applies to the **initial value** of a **`computedPipe`**. All subsequent skipped computations simply return the last known value, which in turn does not notify dependents of a value change, essentially, skipping that computation.

#### Working with SKIPPED symbol

In this example, we'd like to `debounce` search parameters that are entered by the user before making an API call:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ⚠️ Will trigger an immediate API call with empty values
  protected readonly employeesResource = rxResource({
    request: computedPipe(this.firstName, this.lastName).debounce(500),
    loader: params => {
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

In this example, because signals always have a value, the resource will immediately make an API call with empty strings.

To avoid this, you can use `skip(1)` and handle the `SKIPPED` symbol:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ✅ No API call until user interaction
  protected readonly employeesResource = rxResource({
    request: computedPipe(this.firstName, this.lastName)
      .skip(1) // <= Skip initial value
      .debounce(500),
    loader: params => {
      if (params.request === SKIPPED) {
        return EMPTY; // Prevent initial HTTP request
      }
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

Or you can use the `default` pipe:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ✅ No API call until user interaction
  protected readonly employeesResource = rxResource({
    request: computedPipe(this.firstName, this.lastName)
      .skip(1) // <= Skip initial value
      .debounce(500)
      .default(), // <= Replace SKIPPED with `undefined`
    loader: params => {
      // rxResource does not invoke the loader function when request is `undefined`
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

## Working with Multiple Signals

Both `computedPipe` and `effectPipe` support multiple input signals:

```typescript
const name = signal('John');
const age = signal(30);

// computedPipe
computedPipe(name, age)
  .map(([n, a]) => `${n} is ${a} years old`);

computedPipe(() => [name(), age()])
  .map(([n, a]) => `${n} is ${a} years old`);

// effectPipe
effectPipe(name, age).run(([n, a]) => {
  console.log(`Update: ${n} is now ${a}`);
});

effectPipe(() => [name(), age()]).run(([n, a]) => {
  console.log(`Update: ${n} is now ${a}`);
});
```

## Injection Context
Both `effectPipe` and `computedPipe` require an injection context. When used outside of constructor or field initialisation, you must provide an `Injector`:

```typescript
@Component({
  /* ... */
})
export class MyComponent implements OnInit {
  private readonly injector = inject(Injector);
  private readonly source = signal(0);
  
  // ✅ No injector needed - field initialisation has context
  private readonly doubled = computedPipe(this.source)
    .map(x => x * 2);

  public ngOnInit() {
    // ❌ ngOnInit has no context, must provide injector
    effectPipe(this.source)
      .run(
        value => console.log(value),
        { injector: this.injector }
      );

    // ❌ Same for computedPipe in methods
    const add1 = computedPipe(this.source, { injector: this.injector })
      .map(x => x + 1);
  }
}
```

## 🤝 Contributing

Contributions are welcome! You can start by [forking the repository](https://github.com/wassim-k/ngx-signal-pipes/fork).

## 🐛 Issues

If you encounter any bugs, have a feature request, or a use case for a new pipe, please [open an issue](https://github.com/wassim-k/ngx-signal-pipes/issues).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/wassim-k/ngx-signal-pipes/blob/main/LICENSE) file for details.
