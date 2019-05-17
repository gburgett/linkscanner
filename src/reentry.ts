import { Transform, TransformCallback, TransformOptions } from 'stream'
import { isURL, URL } from './url'

export interface ReentryOptions extends TransformOptions {
  objectMode?: true

  hostnames?: Set<string>
}

export class Reentry extends Transform {
  // tslint:disable-next-line:max-classes-per-file
  public static readonly EOF = class {
    constructor(public readonly size: number) {}
  }

  public readonly hostnames: Set<string>

  private readonly _checked = new Set<URL>()

  constructor(readonly options: ReentryOptions) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))

    this.hostnames = options.hostnames || new Set<string>()
  }

  public _transform(url: URL | typeof Reentry.EOF, encoding: any, cb: TransformCallback): void {
    if (!isURL(url)) {
      if (url instanceof Reentry.EOF) {
        if (this._checked.size > url.size) {
          // more have been pushed - try end again
          this.tryEnd()
        } else {
          this.end()
        }
      } else {
        return unknownChunk(url)
      }
      return
    }

    // normalize the URL
    if (this.hostnames.size == 0) {
      // the first written string sets the hostname
      this.hostnames.add(url.hostname)
    }

    if (this._checked.has(url)) {
      return
    }
    if (this.hostnames.has(url.hostname)) {
      // only scan URLs matching our known hostnames
      this.push(url)
    }
    this._checked.add(url)
  }

  public tryEnd() {
    this.push(new Reentry.EOF(this._checked.size))
  }
}

export type EOF = typeof Reentry.EOF

export function isEOF(chunk: any): chunk is EOF {
  return typeof chunk == 'object' &&
    chunk instanceof Reentry.EOF
}

function unknownChunk(chunk: any): never {
  throw new Error(`Unexpected chunk type ${typeof chunk} - ${chunk}`)
}
