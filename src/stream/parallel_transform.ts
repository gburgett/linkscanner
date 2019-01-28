import { DuplexOptions, Transform, TransformCallback } from 'stream'
import { Semaphore } from '../semaphore'

export interface ParallelTransformOptions extends DuplexOptions {

  maxParallelChunks?: number

  transformAsync?: (chunk: any, encoding: string) => Promise<any>
  flush?: (callback: TransformCallback) => any
}

export abstract class ParallelTransform extends Transform {

  // tslint:disable-next-line:variable-name
  private _semaphore: Semaphore

  constructor(opts: ParallelTransformOptions) {
    super(opts)

    this._semaphore = new Semaphore({maxInflight: opts.maxParallelChunks || Infinity})
    if (opts.transformAsync && !this._transformAsync) {
      this._transformAsync = opts.transformAsync
    }

    if (!this._transformAsync) {
      throw new Error('Please provide a _transformAsync implementation')
    }
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback) {
    this._semaphore.lock(async () => {
      return await this._transformAsync(chunk, encoding)
    })
      .then((data) => callback(data))
      .catch((err) => callback(err))
  }

  protected abstract _transformAsync(chunk: any, encoding: string): Promise<any>
}
