# CalcDown Standard Library 1.2

Status: **current**. CalcDown Standard Library 1.2 is additive relative to CalcDown Standard Library 1.1. Unless explicitly stated, all rules from `docs/stdlib-1.1.md` remain in force.

CalcDown 1.2 expands the standard library primarily with **logic**, **array**, **stats**, and **date** helpers needed for real-world financial models.

Goals:

- **Deterministic + sandboxable:** no ambient I/O, time, randomness, globals.
- **Fail-fast by default:** throw on invalid types, non-finite numbers, and shape mismatches.
- **Vector-friendly:** where reasonable, support scalar/array broadcasting consistent with existing `std.text.concat`.

## 0) Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described in RFC 2119.

## 1) Proposed additions

### 1.1 `std.logic`

#### `std.logic.cond(...args)`

Multi-way conditional (like Excel’s IFS).

Signature (informative):

```ts
cond<T>(
  cond1: boolean, value1: T,
  cond2: boolean, value2: T,
  ...,
  defaultValue: T
): T
```

Rules:

- Arguments MUST be an odd-length list of `boolean, value` pairs followed by a default value.
- Conditions MUST be boolean scalars.
- Conditions MUST be evaluated left-to-right.
- The first `valueN` whose `condN` is `true` MUST be returned.
- If no condition is true, the default value MUST be returned.

#### `std.logic.coalesce(...values)`

Return the first non-nullish value (`!== null` and `!== undefined`).

Signature (informative):

```ts
coalesce<T>(...values: Array<T | null | undefined | Array<T | null | undefined>>): T | T[]
```

Rules:

- If all inputs are scalars, return a scalar.
- If any input is an array, then:
  - all array inputs MUST have the same length
  - scalar inputs MUST be broadcast to that length
  - the return value MUST be an array, selecting the first non-nullish value at each index

#### `std.logic.isPresent(value)`

Test whether a value is not nullish.

Signature (informative):

```ts
isPresent(value: unknown | unknown[]): boolean | boolean[]
```

Rules:

- For a scalar input, return `value !== null && value !== undefined`.
- For an array input, return an array of booleans computed element-wise.

#### `std.logic.where(test, whenTrue, whenFalse)`

Vectorized conditional selection (a deterministic alternative to “array if/else”).

Signature (informative):

```ts
where<T>(
  test: boolean | boolean[],
  whenTrue: T | T[],
  whenFalse: T | T[]
): T | T[]
```

Rules:

- `test` MUST be a boolean scalar or a boolean array.
- If any argument is an array, all array arguments MUST have the same length; scalars MUST be broadcast.
- The return value MUST be:
  - a scalar if all inputs are scalars
  - otherwise an array of the broadcasted length
- For each element, if `test` is truthy, select `whenTrue`, else select `whenFalse`.

### 1.2 `std.array`

`std.array` provides common array utilities not covered by `std.data.*`.

#### `std.array.take(items, n)`

```ts
take<T>(items: T[], n: number): T[]
```

Rules:

- `n` MUST be a non-negative integer.
- Returns the first `n` items (or all items if `n >= items.length`).

#### `std.array.drop(items, n)`

```ts
drop<T>(items: T[], n: number): T[]
```

Rules:

- `n` MUST be a non-negative integer.
- Returns the items after the first `n` (or `[]` if `n >= items.length`).

#### `std.array.concat(a, b)`

```ts
concat<T>(a: T[], b: T[]): T[]
```

Rules:

- Returns a new array equal to `a` followed by `b`.

#### `std.array.zip(a, b)`

```ts
zip<A, B>(a: A[], b: B[]): Array<[A, B]>
```

Rules:

- `a` and `b` MUST have the same length (otherwise throw).
- Returns an array of pairs in order.

#### `std.array.flatten(items)`

Flatten a single level of nesting.

```ts
flatten<T>(items: Array<T | T[]>): T[]
```

Rules:

- Elements that are arrays are concatenated (one level).
- Non-array elements are appended as-is.

#### `std.array.at(items, index)`

Safe index access.

```ts
at<T>(items: T[], index: number): T | null
```

Rules:

- `index` MUST be an integer.
- Negative indices MUST count from the end (`-1` is the last item).
- Out-of-bounds indices MUST return `null` (not throw).

#### `std.array.indexOf(items, needle)`

```ts
indexOf(items: unknown[], needle: unknown): number
```

Rules:

- `items` and `needle` MUST be comparable scalar values (number/string/boolean/date/null/undefined).
- Equality MUST follow CalcScript scalar equality rules (including date equality by timestamp, and `null !== undefined`).
- Returns the first matching index, or `-1` if not found.

#### `std.array.find(items, predicate)`

```ts
find<T>(items: T[], predicate: (item: T) => boolean): T | null
```

Rules:

- `predicate` MUST return a boolean scalar.
- Returns the first matching element, else `null`.

#### `std.array.some(items, predicate)` / `std.array.every(items, predicate)`

```ts
some<T>(items: T[], predicate: (item: T) => boolean): boolean
every<T>(items: T[], predicate: (item: T) => boolean): boolean
```

Rules:

- `predicate` MUST return a boolean scalar.
- `some` returns `true` if any item matches.
- `every` returns `true` if all items match.

#### `std.array.distinct(items)`

```ts
distinct(items: unknown[]): unknown[]
```

Rules:

- Items MUST be comparable scalar values (as for `indexOf`).
- Equality MUST follow CalcScript scalar equality rules (as for `indexOf`).
- The return order MUST preserve the first occurrence of each distinct value.

#### `std.array.product(xs)`

```ts
product(xs: number[]): number
```

Rules:

- Each element MUST be a finite number.
- MUST throw if `xs` is empty.
- Returns the multiplicative product of all elements.

#### `std.array.countBy(items, key)`

Count items grouped by a key.

```ts
countBy(items: Record<string, unknown>[], key: string): Record<string, number>
```

Rules:

- `key` MUST be a string.
- Each `items[i]` MUST be an object with `key` as an own-property.
- Key values MUST be either a string or a finite number (numbers are converted to strings).
- The return value MUST be a plain record mapping key → count.

### 1.3 `std.stats`

`std.stats` provides deterministic statistical helpers over numeric arrays.

#### `std.stats.median(xs)`

```ts
median(xs: number[]): number
```

Rules:

- `xs` MUST be a non-empty array of finite numbers.
- The median MUST be computed over the sorted values.
- For even-length arrays, the median MUST be the mean of the two middle values.

#### `std.stats.variance(xs)` / `std.stats.stdev(xs)`

Sample variance and sample standard deviation.

```ts
variance(xs: number[]): number
stdev(xs: number[]): number
```

Rules:

- `xs` MUST be an array of finite numbers with length ≥ 2.
- Variance MUST use the sample denominator `n - 1`.
- `stdev(xs)` MUST equal `sqrt(variance(xs))`.

#### `std.stats.percentile(xs, p)`

```ts
percentile(xs: number[], p: number): number
```

Rules:

- `xs` MUST be a non-empty array of finite numbers.
- `p` MUST be a finite number in `[0, 100]`.
- Engines MUST use deterministic linear interpolation over sorted values:
  - Let `ys` be `xs` sorted ascending.
  - Let `n = ys.length`.
  - Let `rank = (p / 100) * (n - 1)`.
  - Let `lo = floor(rank)`, `hi = ceil(rank)`.
  - If `lo === hi`, return `ys[lo]`.
  - Otherwise return `ys[lo] + (rank - lo) * (ys[hi] - ys[lo])`.

#### `std.stats.quartiles(xs)`

```ts
quartiles(xs: number[]): [number, number, number]
```

Rules:

- MUST return `[Q1, Q2, Q3]` where:
  - `Q1 = percentile(xs, 25)`
  - `Q2 = percentile(xs, 50)`
  - `Q3 = percentile(xs, 75)`

#### `std.stats.covariance(xs, ys)` / `std.stats.correlation(xs, ys)`

```ts
covariance(xs: number[], ys: number[]): number
correlation(xs: number[], ys: number[]): number
```

Rules:

- `xs` and `ys` MUST be arrays of finite numbers with the same length ≥ 2.
- Covariance MUST be sample covariance (denominator `n - 1`).
- Correlation MUST be Pearson correlation.
- Engines MUST throw if correlation is undefined (e.g. zero variance in either input).

#### `std.stats.linearFit(xs, ys)`

Simple linear regression fit.

```ts
linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number }
```

Rules:

- `xs` and `ys` MUST be arrays of finite numbers with the same length ≥ 2.
- Engines MUST throw if a fit is undefined (e.g. zero variance in `xs`).
- `r2` MUST be computed deterministically as the coefficient of determination for the fitted line.

#### `std.stats.predict(fit, x)`

```ts
predict(fit: { slope: number; intercept: number }, x: number): number
```

Rules:

- `x` MUST be a finite number.
- Returns `fit.intercept + fit.slope * x`.

### 1.4 `std.date` (extensions)

CalcDown dates are represented as `Date` values at UTC midnight for the given calendar date.

#### Components

```ts
year(d: Date): number
month(d: Date): number        // 1..12
day(d: Date): number          // 1..31
quarter(d: Date): number      // 1..4
weekday(d: Date): number      // 1..7 (ISO: Monday=1, Sunday=7)
```

Rules:

- Each function MUST throw if `d` is not a valid `Date`.

#### Arithmetic

```ts
addDays(d: Date, days: number): Date
addYears(d: Date, years: number): Date
diffDays(d1: Date, d2: Date): number
diffMonths(d1: Date, d2: Date): number
```

Rules:

- `days` and `years` MUST be integers.
- `diffDays` MUST return the signed integer number of UTC days from `d1` to `d2`.
- `diffMonths` MUST return the signed integer difference in `(year, month)` between `d1` and `d2`:
  - `(d2.year - d1.year) * 12 + (d2.month - d1.month)` (ignores day-of-month).

#### Boundaries and sequences

```ts
startOfMonth(d: Date): Date
endOfMonth(d: Date): Date
startOfQuarter(d: Date): Date
monthRange(start: Date, end: Date): Date[]
workdays(start: Date, end: Date): Date[]
```

Rules:

- `monthRange` MUST return month-start dates from `start` to `end` (inclusive), stepping by calendar month.
- `workdays` MUST return dates between `start` and `end` (inclusive) excluding Saturdays and Sundays.

## Appendix A) Proposed changes from 1.1 → 1.2

- Adds `std.logic` (`cond`, `coalesce`, `isPresent`, `where`).
- Adds `std.array` (take/drop/concat/zip/flatten/at/indexOf/find/some/every/distinct/product/countBy).
- Adds `std.stats` (median/variance/stdev/percentile/quartiles/covariance/correlation/linearFit/predict).
- Extends `std.date` with component, arithmetic, and range helpers.
