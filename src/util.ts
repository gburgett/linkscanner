
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
