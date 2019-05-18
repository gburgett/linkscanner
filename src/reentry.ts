import { Writable } from 'async-toolbox/stream'
import { Transform, TransformCallback, TransformOptions } from 'stream'
import * as util from 'util'
import { isURL, URL } from './url'

export interface ReentryOptions extends TransformOptions {
  objectMode?: true
}

export class Reentry extends Transform {
  private readonly _checked = new Set<string>()
  private counter = 0

  constructor(readonly options?: Partial<ReentryOptions>) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))
  }

  public _transform(url: URL | typeof EOF, encoding: any, cb: TransformCallback): void {
    if (!isURL(url)) {
      cb()
      if (url instanceof EOF) {
        if (this.counter > url.counter) {
          // more have been pushed - try end again
          this.tryEnd()
        } else {
          this.end()
        }
        return
      } else {
        return unknownChunk(url)
      }
    }

    this.counter++
    this._run(url)
    cb()
  }

  public tryEnd() {
    this.push(new EOF(this.counter))
  }

  private _run(url: URL) {
    if (this._checked.has(url.toString())) {
      return
    }
    this._checked.add(url.toString())
    this.push(url)
  }
}

// tslint:disable-next-line:max-classes-per-file
export class EOF {
  constructor(public readonly counter: number) {}
}

export function isEOF(chunk: any): chunk is EOF {
  return typeof chunk == 'object' &&
    chunk instanceof EOF
}

function unknownChunk(chunk: any): never {
  throw new Error(`Unexpected chunk type ${typeof chunk} - ${chunk}`)
}

export function handleEOF(reentry: Writable<EOF>) {
  let lastCounter = -1

  return new Transform({
    objectMode: true,
    transform(url: URL | EOF, encoding, done) {
      if (isEOF(url)) {
        // Once the EOF gets back to the reentry, the reentry can decide
        // that we're finally done.
        if (url.counter > lastCounter) {
          lastCounter = url.counter
          reentry.write(url)
        }
      } else {
        this.push(url)
      }
      done()
    },
  })
}
