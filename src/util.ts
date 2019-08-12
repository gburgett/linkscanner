import { Readable } from 'stream'

import { Logger } from './logger'

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

export const isomorphicPerformance: { now(): number } = typeof (performance) != 'undefined' ?
  performance :
  // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
  // the perf_hooks package.
  // tslint:disable-next-line:no-eval
  eval('require')('perf_hooks').performance

export function debugStreams(streams: { [stream: string]: Readable }, logger: Logger = console): NodeJS.Timeout {
  const states: { [stream: string]: any } = {}

  Object.keys(streams).forEach((name) => {
    streams[name].on('error', (err) => {
      logger.error(`${name}: ${err}`)
    })
  })

  return setInterval(() => {
    Object.keys(streams).forEach((name) => {
      const stream = streams[name] as any
      const state = states[name] || { flowing: false, ended: false }
      if (state.flowing != stream._readableState.flowing) {
        logger.debug(name, stream._readableState.flowing ? 'flowing' : 'NOT flowing')
      }
      if (state.ended != stream._readableState.ended) {
        logger.debug(name, stream._readableState.ended ? 'ended' : 'NOT ended')
      }
      if (state.pipes != stream._readableState.pipes) {
        logger.debug(name, stream._readableState.pipes ? 'piped to something' : 'UNPIPED!')
      }
      states[name] = {
        ...stream._readableState,
      }
    })
  }, 10)
}
