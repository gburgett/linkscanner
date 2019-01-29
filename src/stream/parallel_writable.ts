import { Writable } from 'stream'
import { Semaphore } from '../semaphore'

export interface ParallelWritableOptions {
  highWaterMark?: number
  decodeStrings?: boolean
  objectMode?: boolean

  /**
   * The maximum number of chunks that can be written in parallel.  Use this
   * to, for instance, restrict the number of outgoing API calls you make in the
   * writeAsync implementation.
   */
  maxParallelChunks?: number

  /**
   * Implement this function to write a single chunk. Multiple instances
   * of _transformAsync may be invoked simultaneously to perform batch processing,
   * up to the given value of `maxParallelChunks`.
   * @param chunk The chunk to transform
   * @param encoding The encoding of the current chunk
   */
  writeAsync?: (chunk: any, encoding: string) => Promise<any>
  destroy?: (error: Error | null, callback: (error: Error | null) => void) => void
  final?: (callback: (error?: Error) => void) => void
}

/**
 * An extension of a Writable stream which can process chunks in parallel.
 *
 * Implementers should not implement `_write`, but rather `_writeAsync`.
 */
export class ParallelWritable extends Writable {

  // tslint:disable-next-line:variable-name
  private _semaphore: Semaphore

  constructor(opts: ParallelWritableOptions) {
    super(opts)

    this._semaphore = new Semaphore({maxInflight: opts.maxParallelChunks || Infinity})
    if (opts.writeAsync) {
      this._writeAsync = opts.writeAsync
    }

    if (!this._writeAsync) {
      throw new Error('Please provide a _writeAsync implementation')
    }
  }

  public _write(chunk: any, encoding: string, callback: (err?: any) => void) {
    this._semaphore.lock(async () => {
      // Tell the stream library to send us more data
      callback()
      await this._writeAsync(chunk, encoding)
    })
      .catch((err) => callback(err))
  }

  public _writev(chunks: Array<{ chunk: any, encoding: string }>, callback: (err?: any) => void) {
    let gtg = true
    const promises = chunks.map(async (c) => {
      await this._semaphore.lock(async () => {
        if (gtg) {
          // Tell the stream library to send us more data
          callback()
          gtg = false
        }
        await this._writeAsync(c.chunk, c.encoding)
      })
    })
    promises.forEach((p) => p.catch((err) => this.emit('error', err)))
  }

  public _final(callback: (error?: Error | null) => void) {
    if (this._semaphore.isEmpty()) {
      callback(undefined)
    } else {
      this._semaphore.on('empty', () => {
        callback(undefined)
      })
    }
  }

  /**
   * @see ParallelWritableOptions['writeAsync']
   */
  protected _writeAsync(chunk: any, encoding: string): Promise<void> {
    throw new Error('No implementation given for _writeAsync')
  }
}
