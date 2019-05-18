import { Semaphore } from 'async-toolbox'
import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import { Duplex } from 'stream'

type HashChunk = (chunk: any) => string | string[] | ALL
type CreateStream<T extends Duplex> = (hash: string) => T

type CreateStreamOptions = ParallelTransformOptions & {
  semaphore?: (hash: string) => Semaphore,
}

type DivergentStreamWrapperOptions<T extends Duplex> =
  ParallelTransformOptions &
  CreateStreamOptions &
  {
    hashChunk: HashChunk,
    createStream?: CreateStream<T>,
  }

export class DivergentStreamWrapper<T extends Duplex = Duplex> extends ParallelTransform {
  public static readonly ALL = Symbol('All Hosts')

  public on = this.addListener
  public prependOnceListener: any = raiseNotImplemented('prependOnceListener')
  public off: any = raiseNotImplemented('off')
  public removeAllListeners: any = raiseNotImplemented('removeAllListeners')

  private readonly _hashChunk: HashChunk
  private readonly _streams: Map<string, Duplex>
  private readonly _createStreamOptions: CreateStreamOptions
  private readonly _eventNames = new Set<string | symbol>()

  constructor(options: DivergentStreamWrapperOptions<T>) {
    super({
      objectMode: true,
      // only one _transformAsync at a time, i.e. we block upstream if any of our
      // divergent streams are not accepting more writes
      maxParallelChunks: 1,
      highWaterMark: 1,
    })
    const {
      hashChunk,
      createStream,
      ...createStreamOptions
    } = options

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

  public addListener(event: string | symbol, listener: (...args: any[]) => void): this {
    super.addListener(event, listener)

    if (isOverriddenEvent(event)) {
      return this
    }
    this._eventNames.add(event)
    if (this._streams) { this._streams.forEach((value) => value.on(event, listener)) }
    return this
  }

  public once(event: string | symbol, listener: (...args: any[]) => void): this {
    const wrapper = (...args: any[]) => {
      this.removeListener(event, wrapper)
      listener.call(this, args)
    }
    return this.on(event, wrapper)
  }

  public prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
    super.prependListener(event, listener)

    if (isOverriddenEvent(event)) {
      return this
    }
    this._eventNames.add(event)
    if (this._streams) { this._streams.forEach((value) => value.prependListener(event, listener)) }
    return this
  }

  public removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    super.removeListener(event, listener)

    if (isOverriddenEvent(event)) {
      return this
    }
    if (this._streams) { this._streams.forEach((value) => value.removeListener(event, listener)) }
    return this
  }

  private _streamsFor(chunk: any): Duplex[] {
    let hashes = this._hashChunk(chunk)
    if (isALL(hashes)) {
      hashes = [...this._streams.keys()]
    } else if (!Array.isArray(hashes)) {
      hashes = [hashes]
    }
    return hashes.map((hash) => {
      const existing = this._streams.get(hash)
      if (existing) {
        return existing
      }

      const innerStream = this._createStream(hash)

      this._eventNames.forEach((evt) => {
        this.listeners(evt).forEach((l) => innerStream.on(evt, l as (...args: any[]) => void))
      })

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

export type ALL = typeof DivergentStreamWrapper.ALL

export function isALL(chunk: any): chunk is ALL {
  return chunk == DivergentStreamWrapper.ALL
}

function isOverriddenEvent(event: string | symbol): boolean {
  return typeof(event) == 'string' &&
    ['data', 'error', 'end'].includes(event)
}

function raiseNotImplemented(name: string) {
  return () => { throw new Error(`${name} not implemented!`) }
}
