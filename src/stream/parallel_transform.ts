import { DuplexOptions, Transform, TransformCallback } from 'stream'
import { Semaphore } from '../semaphore'

export interface ParallelTransformOptions extends DuplexOptions {

  /**
   * The maximum number of chunks that can be transformed in parallel.  Use this
   * to, for instance, restrict the number of outgoing API calls you make in the
   * transformAsync implementation.
   */
  maxParallelChunks?: number
  flush?: (callback: TransformCallback) => any

  /**
   * Implement this function to transform a single chunk, calling `this.push()` to
   * pass values to the next stream in the chain.  Multiple instances
   * of _transformAsync may be invoked simultaneously to perform batch processing,
   * up to the given value of `maxParallelChunks`.
   * @param chunk The chunk to transform
   * @param encoding The encoding of the current chunk
   */
  transformAsync?(this: ParallelTransform, chunk: any, encoding: string): Promise<void>
}

/**
 * An extension of a Transform stream which can process chunks in parallel.
 * Ordering is not preserved, because the individual transformations may complete
 * in any order.
 *
 * Implementers should not implement `_transform`, but rather `_transformAsync`.
 */
export class ParallelTransform extends Transform {

  // tslint:disable-next-line:variable-name
  private _semaphore: Semaphore

  constructor(opts: ParallelTransformOptions) {
    super(opts)

    this._semaphore = new Semaphore({maxInflight: opts.maxParallelChunks || Infinity})
    if (opts.transformAsync) {
      this._transformAsync = opts.transformAsync
    }

    if (!this._transformAsync) {
      throw new Error('Please provide a _transformAsync implementation')
    }
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback) {
    this._semaphore.lock(async () => {
      // Tell the stream lib to send us more data
      callback(undefined)
      return await this._transformAsync(chunk, encoding)
    })
      .catch((err) => this.emit('error', err))
  }

  public _flush(callback: TransformCallback) {
    if (this._semaphore.isEmpty()) {
      callback(undefined)
    } else {
      this._semaphore.on('empty', () => {
        callback(undefined)
      })
    }
  }

  /**
   * @see ParallelTransformOptions['transformAsync']
   */
  protected _transformAsync(this: ParallelTransform, chunk: any, encoding: string): Promise<void> {
    throw new Error('No implementation given for _transformAsync')
  }
}
