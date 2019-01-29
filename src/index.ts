
import * as list from './list'
import * as stream from './stream'

export const Stream = stream
export const List = list

/**
 * Returns a promise which resolves after a given number of milliseconds,
 * using setTimeout.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(), ms),
  )
}
