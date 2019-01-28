import { Writable } from 'stream'
import { Semaphore } from '../semaphore'

export interface ParallelWritableOptions {
  highWaterMark?: number
  decodeStrings?: boolean
  objectMode?: boolean

  maxParallelChunks?: number

  writeAsync?: (chunk: string | Buffer, encoding: string) => Promise<void>
  destroy?: (error: Error | null, callback: (error: Error | null) => void) => void
  final?: (callback: (error?: Error) => void) => void
}

export abstract class ParallelWritable extends Writable {

  // tslint:disable-next-line:variable-name
  private _semaphore: Semaphore

  constructor(opts: ParallelWritableOptions) {
    super(opts)

    this._semaphore = new Semaphore({maxInflight: opts.maxParallelChunks || Infinity})
    if (opts.writeAsync && !this._writeAsync) {
      this._writeAsync = opts.writeAsync
    }

    if (!this._writeAsync) {
      throw new Error('Please provide a _writeAsync implementation')
    }
  }

  public _write(chunk: any, encoding: string, callback: (err?: any) => void) {
    this._semaphore.lock(async () => {
      await this._writeAsync(chunk, encoding)
    })
      .then(() => callback())
      .catch((err) => callback(err))
  }

  public _writev(chunks: Array<{ chunk: any, encoding: string }>, callback: (err?: any) => void) {
    const promises = chunks.map(async (c) => {
      await this._semaphore.lock(async () => {
        await this._writeAsync(c.chunk, c.encoding)
      })
    })
    Promise.all(promises)
      .then(() => callback())
      .catch((err) => callback(err))
  }

  protected abstract _writeAsync(chunk: any, encoding: string): Promise<void>
}
