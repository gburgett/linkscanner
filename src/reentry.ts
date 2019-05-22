import { Writable } from 'async-toolbox/stream'
import { Transform, TransformCallback, TransformOptions } from 'stream'
import { Chunk } from './model'
import { parseUrl, URL } from './url'

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

  public _transform(chunk: Chunk | string | URL | EOF, encoding: any, cb: TransformCallback): void {
    if (isEOF(chunk)) {
      cb()
      if (this.counter > chunk.counter) {
        // more have been pushed - try end again
        this.tryEnd()
      } else {
        this.end()
      }
      return
    }

    const ch: Chunk =
      typeof(chunk) == 'string' ? { url: parseUrl(chunk) }
        : ('url' in chunk) ? chunk // chunk instanceof Chunk
        : { url: chunk } // chunk instanceof URL

    this.counter++
    this._run(ch)
    cb()
  }

  public tryEnd() {
    this.push(new EOF(this.counter))
  }

  private _run(chunk: Chunk) {
    if (this._checked.has(chunk.url.toString())) {
      return
    }
    this._checked.add(chunk.url.toString())
    this.push(chunk)
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
    transform(chunk: Chunk | EOF, encoding, done) {
      if (isEOF(chunk)) {
        // Once the EOF gets back to the reentry, the reentry can decide
        // that we're finally done.
        if (chunk.counter > lastCounter) {
          lastCounter = chunk.counter
          reentry.write(chunk)
        }
      } else {
        this.push(chunk)
      }
      done()
    },
  })
}
