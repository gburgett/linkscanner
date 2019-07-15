import { ReadLock, Semaphore } from 'async-toolbox'
import {onceAsync} from 'async-toolbox/events'
import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import { Duplex } from 'stream'

import { EventForwarder, StreamEvents } from './event_forwarder'
import { Host } from './hostname_set'
import { Chunk } from './model'
import { EOF, isEOF } from './reentry'

type Hashable<T> = (T & {hash(this: T): string})
type CreateStream = (hash: Hashable<Host>) => Duplex | Promise<Duplex>

type CreateStreamOptions = ParallelTransformOptions & {
  semaphore?: (host: Host) => Semaphore,
}

type DivergentStreamWrapperOptions =
  ParallelTransformOptions &
  CreateStreamOptions &
  {
    createStream?: CreateStream,
  }

export class DivergentStreamWrapper extends ParallelTransform {
  public static readonly ALL = Symbol('All Hosts')

  private readonly _streams: Map<string, Duplex>
  private readonly _createStreamOptions: CreateStreamOptions
  private readonly _forwarder = new EventForwarder({
      // Don't forward the normal stream events from inner streams, just the
      // special Linkscanner events
      ignore: StreamEvents,
    }).to(this)

  constructor(options: DivergentStreamWrapperOptions) {
    super({
      objectMode: true,
      // only one _transformAsync at a time, i.e. we block upstream if any of our
      // divergent streams are not accepting more writes
      maxParallelChunks: 1,
      highWaterMark: 1,
    })
    const {
      createStream,
      ...createStreamOptions
    } = options

    this._createStreamOptions = createStreamOptions
    this._streams = new Map<string, Duplex>()
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

    const stream = await this._streamFor(chunk)
    await stream.writeAsync(chunk)
  }

  public async _flushAsync() {
    const promises = [] as Array<Promise<any>>
    this._streams.forEach((stream) => {
      promises.push(stream.endAsync())
      promises.push(onceAsync(stream, 'end'))
    })
    await Promise.all(promises)
  }

  private async _streamFor(chunk: any): Promise<Duplex> {
    const key = this._getKey(chunk)

    const hash: string = key.hash()
    const existing = this._streams.get(hash)
    if (existing) {
      return existing
    }

    const innerStream = await this._createStream(key)

    this._forwarder.from(innerStream)

    this._streams.set(hash.toString(), innerStream)
    this._registerNewStream(innerStream, hash)
    return innerStream
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

  private _createStream(host: Host): Duplex | Promise<Duplex> {
    return new ParallelTransform({
      ...this._createStreamOptions,
      semaphore: this._createStreamOptions.semaphore ? this._createStreamOptions.semaphore(host) : undefined,
    })
  }

  private _getKey = (chunk: Chunk): Hashable<Host> => {
    return {
      hostname: chunk.url.hostname,
      protocol: chunk.url.protocol,
      port: chunk.url.port,
      hash() {
        // parallelize streams by protocol, hostname, and port.  This uniquely
        // describes a server.
        const {hostname, protocol, port} = this
        return [hostname, protocol, port].join('/')
      },
    }
  }
}
