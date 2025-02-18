# NgxSignalPipes

Transform Angular signals with pipes.

## Installation

```bash
npm install ngx-signal-pipes
```

## Requirements
* Angular >= 17.0.0
* TypeScript >= 5.2.0

## Size
* < 2KB minified

## Core Concepts

NgxSignalPipes provides two main functions:
- `effectPipe`: For handling side effects based on signal changes
- `computedPipe`: For transforming signal values

## EffectPipe

### Overview

`effectPipe` handles side effects from signal changes through a chainable API.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { effectPipe } from 'ngx-signal-pipes';

const temperature = signal(20);

effectPipe(temperature)
  .filter(t => t > 30) // Only high temps
  .debounce(1000)      // Avoid spam
  .run(t => {
    console.log(`Warning: Temperature ${t}°C`);
  });
```

### Pipes

#### filter
Filters values based on a predicate:

```typescript
const source = signal(0);

effectPipe(source)
  .filter(x => x % 2 === 0)
  .run(value => {
    console.log('Even number:', value);
  });
```

#### skip
Skips the first N emissions:

```typescript
const source = signal(0);

effectPipe(source)
  .skip(1)
  .run(value => {
    console.log('After initial value:', value);
  });
```

#### take
Takes only the first N emissions and then stops the effect:

```typescript
const source = signal(0);

effectPipe(source)
  .take(3)
  .run(value => {
    console.log('First three values:', value);
  });
```

Effect will automatically be destroyed after N emissions.

#### debounce
Delays emissions by the specified milliseconds:

```typescript
const input = signal('');

effectPipe(input)
  .debounce(500)
  .run(value => {
    console.log('Debounced input:', value);
  });
```

### Cleanup

Effects can register clean-up functions:

```typescript
const theme = signal('light');

effectPipe(theme).run((currentTheme, cleanup) => {
  document.body.classList.add(`theme-${currentTheme}`);
  
  cleanup(() => {
    document.body.classList.remove(`theme-${currentTheme}`);
  });
});
```

## ComputedPipe

### Overview

`computedPipe` transforms signal values through a chainable API.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { computedPipe } from 'ngx-signal-pipes';

const input = signal('');

const normalisedInput = computedPipe(input)
  .skip(1)                    // Skip initial empty value
  .filter(v => v.length > 0)  // Ignore empty strings
  .debounce(500)              // Wait for typing to stop
  .map(v => v.toLowerCase()); // Normalize case

input.set('HELLO'); // After 500ms: "hello"
```

### Pipes

#### map
Transforms values using a mapping function:

```typescript
const source = signal(1);
const doubled = computedPipe(source).map(x => x * 2);
```

#### filter
Filters values based on a predicate, returns `SKIPPED` for non-matching values:

```typescript
const source = signal(0);
const evenOnly = computedPipe(source).filter(x => x % 2 === 0);
```

#### skip
Skips the first N emissions, returning `SKIPPED` for skipped values:

```typescript
const source = signal(0);
const skipFirst = computedPipe(source).skip(1);
```

#### take
Takes only the first N emissions and then stops updating:

```typescript
const source = signal(0);
const firstThree = computedPipe(source).take(3);
```

After 3 emissions, the signal will retain its last value and automatically clean up any internal effects.

#### debounce
Delays emissions by the specified milliseconds:

```typescript
const input = signal('');
const debouncedInput = computedPipe(input).debounce(500);

input.set('a'); // Will emit after 500ms
input.set('ab'); // Resets the 500ms timer
```

Due to the synchronous nature of signals, using `debounce` with `computedPipe` will always emit the initial signal value instantly, then debounce any future value changes.

`debounce` uses an `effect` internally, hence the need for an injection context. The internal `effect` is automatically cleaned-up when the component is destroyed, but it can be done manually by calling `computedPipeSignal.destroy()`.

### Initial values and SKIPPED symbol

#### Understanding Signal Behaviour

Signals in Angular are synchronous in nature and always have a value. This means that computed signals will immediately produce a value upon initialisation, which can lead to unintended behaviour in some scenarios:

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
      return this.employeeApiService.getEmployees({ firstName, lastName });
    }
  });
}
```

In this example, because signals must have an initial value, the resource will immediately make an API call with empty strings.

#### Using SKIPPED to Prevent Initial Requests

To avoid this, use `skip(1)` and handle the `SKIPPED` symbol:

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
        return EMPTY; // Prevent HTTP request
      }
      const [firstName, lastName] = params.request;
      return this.employeeApiService.getEmployees({ firstName, lastName });
    }
  });
}
```

`SKIPPED` is only produced for initial values, all subsequent skipped values are simply not emitted by the signal.

## Working with Multiple Signals

Both `computedPipe` and `effectPipe` support multiple input signals:

```typescript
const name = signal('John');
const age = signal(30);

computedPipe(name, age)
  .map(([n, a]) => `${n} is ${a} years old`);

effectPipe(name, age).run(([n, a]) => {
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

## License

MIT License - see LICENSE.md for details
