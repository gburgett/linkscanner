import { Semaphore } from 'async-toolbox'
import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import { Duplex } from 'stream'

type HashChunk = (chunk: any) => string | string[]
type CreateStream = (hash: string) => Duplex

type CreateStreamOptions = ParallelTransformOptions & {
  semaphore?: (hash: string) => Semaphore,
}

type DivergentStreamWrapperOptions =
  ParallelTransformOptions &
  CreateStreamOptions &
  {
    hashChunk: HashChunk,
    createStream?: CreateStream,
  }

export class DivergentStreamWrapper extends ParallelTransform {
  private readonly _hashChunk: HashChunk
  private readonly _streams: Map<string, Duplex>
  private readonly _createStreamOptions: CreateStreamOptions

  constructor(options: DivergentStreamWrapperOptions) {
    const {
      hashChunk,
      createStream,
      ...createStreamOptions
    } = options
    super({
      objectMode: true,
      // only one _transformAsync at a time, i.e. we block upstream if any of our
      // divergent streams are not accepting more writes
      maxParallelChunks: 1,
      highWaterMark: 1,
    })

    this._createStreamOptions = createStreamOptions
    this._streams = new Map<string, Duplex>()
    this._hashChunk = hashChunk
    if (createStream) {
      this._createStream = createStream
    }
  }

  public async _transformAsync(chunk: any) {
    // Block until all our streams for this chunk can accept another chunk
    await Promise.all(
      this._streamsFor(chunk).map((stream) => stream.writeAsync(chunk)),
    )
  }

  public async _flushAsync() {
    const promises = [] as Array<Promise<void>>
    this._streams.forEach((stream) => {
      promises.push(stream.endAsync())
    })
    await Promise.all(promises)
  }

  private _streamsFor(chunk: any): Duplex[] {
    let hashes = this._hashChunk(chunk)
    if (!Array.isArray(hashes)) {
      hashes = [hashes]
    }
    return hashes.map((hash) => {
      const existing = this._streams.get(hash)
      if (existing) {
        return existing
      }

      const innerStream = this._createStream(hash)

      this._streams.set(hash, innerStream)
      innerStream.on('data', (transformedChunk) => this.push(transformedChunk))
      innerStream.on('error', (err) => this.emit('error', err))
      innerStream.on('end', () => {
        this._streams.delete(hash)
      })
      return innerStream
    })
  }

  private _createStream(hash: string): Duplex {
    return new ParallelTransform({
      ...this._createStreamOptions,
      semaphore: this._createStreamOptions.semaphore ? this._createStreamOptions.semaphore(hash) : undefined,
    })
  }
}
