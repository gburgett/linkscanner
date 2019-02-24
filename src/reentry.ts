import { Transform, TransformCallback, TransformOptions } from 'stream'
import { parseUrl } from './url'

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

  private readonly _checked = new Set<string>()

  constructor(private readonly options: ReentryOptions) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))

    this.hostnames = options.hostnames || new Set<string>()
  }

  public _transform(chunk: string | typeof Reentry.EOF, encoding: any, cb: TransformCallback): void {
    if (typeof chunk != 'string') {
      if (chunk instanceof Reentry.EOF) {
        if (this._checked.size > chunk.size) {
          // more have been pushed - try end again
          this.tryEnd()
        } else {
          this.end()
        }
      } else {
        return unknownChunk(chunk)
      }
      return
    }

    // normalize the URL
    const url = parseUrl(chunk)
    if (this.hostnames.size == 0) {
      // the first written string sets the hostname
      this.hostnames.add(url.hostname)
    }

    if (this._checked.has(url.toString())) {
      return
    }
    if (this.hostnames.has(url.hostname)) {
      // only scan URLs matching our known hostnames
      this.push(url)
    }
    this._checked.add(chunk)
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
