import { Writable } from 'async-toolbox/stream'
import { Transform, TransformCallback, TransformOptions } from 'stream'
import { defaultLogger, Logger } from './logger'
import { Chunk } from './model'
import { parseUrl, URL } from './url'
import { Options } from './util'

export interface ReentryOptions extends TransformOptions {
  objectMode: true

  logger: Logger
}

export class Reentry extends Transform {
  private readonly _checked: Map<string, Chunk>
  private counter: number
  private readonly _options: ReentryOptions

  constructor(options?: Options<ReentryOptions>) {
    const opts: ReentryOptions = Object.assign(
      {
        logger: defaultLogger,
      },
      options,
      {
        objectMode: true,
      })
    super(opts)

    this._options = opts

    this._checked = new Map<string, Chunk>()
    this.counter = 0
  }

  public _transform(chunk: Chunk | string | URL | EOF, encoding: any, cb: TransformCallback): void {
    if (isEOF(chunk)) {
      cb()
      if (this.counter > chunk.counter) {
        // more have been pushed - try end again
        this._options.logger.debug(`new chunks since last EOF: ${this.counter - chunk.counter}`)
        this.tryEnd()
      } else {
        this._options.logger.debug(`end at ${chunk.counter}`)
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
    this._options.logger.debug(`try end at ${this.counter}`)
    this.push(new EOF(this.counter))
  }

  private _run(chunk: Chunk) {
    // The server doesn't care about the hash
    chunk.url.hash = ''
    const checked = this._checked.get(chunk.url.toString())
    if (checked) {
      // Only re-check if this request is not a leaf (i.e. came in from the source stream)
      // and we already checked it as a leaf (i.e. did a HEAD not a GET)
      if (chunk.leaf || !checked.leaf) {
        return
      }
    }
    this._checked.set(chunk.url.toString(), chunk)
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
