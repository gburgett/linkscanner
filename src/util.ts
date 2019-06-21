
export type Options<T, Required extends keyof T = never> =
  {
    // optional fields
    readonly [P in keyof T]?: T[P]
  } & {
    // required fields
    readonly [P in Required]-?: T[P]
  }

export function assign<T1, T2>(a: T1, b: T2): T1 & T2
export function assign<T1, T2, T3>(a: T1, b: T2, c: T3): T1 & T2 & T3
export function assign<T1, T2, T3, T4>(a: T1, b: T2, c: T3, d: T4): T1 & T2 & T3 & T4
export function assign(...partials: any[]): any {
  const result: any = {}

  for (const partial of partials) {
    if (!partial) {
      continue
    }

    for (const key of Object.keys(partial)) {
      const newVal = partial[key]
      if (typeof newVal != 'undefined') {
        result[key] = partial[key]
      }
    }
  }

  return result
}

export function present<T>(value: T | null | undefined): value is T {
  if (typeof value == 'string') {
    return value && /\S/.test(value)
  }
  return !!value
}

export const isomorphicPerformance = typeof (performance) != 'undefined' ?
  performance :
  // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
  // the perf_hooks package.
  // tslint:disable-next-line:no-eval
  eval('require')('perf_hooks').performance

// tslint:disable-next-line: no-shadowed-variable
export function timeout<T>(action: () => Promise<T>, timeout: number): Promise<T> {
  let completed = false
  return new Promise<T>(async (resolve, reject) => {
    const start = isomorphicPerformance.now()
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true
        const end = isomorphicPerformance.now()
        reject(new TimeoutError(end - start, timeout))
      }
    }, timeout)

    try {
      const result = await action()
      if (!completed) {
        completed = true
        clearTimeout(timer)
        resolve(result)
      }
    } catch (ex) {
      if (!completed) {
        completed = true
        clearTimeout(timer)
        reject(ex)
      }
    }
  })
}

export class TimeoutError extends Error {
  // tslint:disable-next-line: no-shadowed-variable
  constructor(public readonly elapsed: number, public readonly timeout: number) {
    super(`timed out after ${elapsed}`)
  }
}
