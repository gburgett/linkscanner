import { Transform, TransformCallback, TransformOptions } from 'stream'
import { isURL, URL } from './url'

export interface ReentryOptions extends TransformOptions {
  objectMode?: true
}

export class Reentry extends Transform {
  // tslint:disable-next-line:max-classes-per-file
  public static readonly EOF = class {
    constructor(public readonly size: number) {}
  }

  private readonly _checked = new Set<URL>()

  constructor(readonly options?: Partial<ReentryOptions>) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))
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

    if (this._checked.has(url)) {
      return
    }
    this.push(url)
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
