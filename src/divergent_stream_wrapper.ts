import { ReadLock, Semaphore } from 'async-toolbox'
import {onceAsync} from 'async-toolbox/events'
import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import { Duplex } from 'stream'

import { EventForwarder, StreamEvents } from './event_forwarder'
import { EOF, isEOF } from './reentry'

type HashChunk = (chunk: any) => string | string[]
type CreateStream<T extends Duplex> = (hash: string) => T | Promise<T>

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

  private readonly _hashChunk: HashChunk
  private readonly _streams: Map<string, Duplex>
  private readonly _createStreamOptions: CreateStreamOptions
  private readonly _forwarder = new EventForwarder({
      // Don't forward the normal stream events from inner streams, just the
      // special Linkscanner events
      ignore: StreamEvents,
    }).to(this)

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

  public async _transformAsync(chunk: any | EOF, lock: ReadLock) {
    if (isEOF(chunk)) {
      if (this._streams.size == 0) {
        // we haven't opened any streams yet.  Just pipe through a pass-through stream.
        this.push(chunk)
        return
      }

      // we're going to flush all streams before pushing the EOF.  This ensures
      // all the currently in-progress fetches finish before the EOF gets passed
      // along.  We can always recreate the streams later.
      await lock.upgrade()
      await this._flushAsync()
      this.push(chunk)
      return
    }

    // Block until all our streams for this chunk can accept another chunk
    await Promise.all(
      this._streamsFor(chunk).map(async (stream) => (await stream).writeAsync(chunk)),
    )
  }

  public async _flushAsync() {
    const promises = [] as Array<Promise<any>>
    this._streams.forEach((stream) => {
      promises.push(stream.endAsync())
      promises.push(onceAsync(stream, 'end'))
    })
    await Promise.all(promises)
  }

  private _streamsFor(chunk: any): Array<Promise<Duplex>> {
    let hashes = this._hashChunk(chunk)
    if (!Array.isArray(hashes)) {
      hashes = [hashes]
    }
    return hashes.map(async (hash) => {
      const existing = this._streams.get(hash)
      if (existing) {
        return existing
      }

      const innerStream = await this._createStream(hash)

      this._forwarder.from(innerStream)

      this._streams.set(hash, innerStream)
      this._registerNewStream(innerStream, hash)
      return innerStream
    })
  }

  private _registerNewStream(stream: Duplex, hash?: string) {
    stream.on('data', (transformedChunk) => this.push(transformedChunk))
    stream.on('error', (err) => this.emit('error', err))
    if (hash) {
      stream.on('end', () => {
        this._streams.delete(hash)
      })
    }
  }

  private _createStream(hash: string): Duplex | Promise<Duplex> {
    return new ParallelTransform({
      ...this._createStreamOptions,
      semaphore: this._createStreamOptions.semaphore ? this._createStreamOptions.semaphore(hash) : undefined,
    })
  }
}
