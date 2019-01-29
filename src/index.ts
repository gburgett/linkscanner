
import * as stream from './stream'

export const Stream = stream

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(), ms),
  )
}
