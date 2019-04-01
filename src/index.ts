import { Semaphore } from 'async-toolbox'
import { collect } from 'async-toolbox/stream'

import { Duplex } from 'stream'
import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { Fetch } from './fetch'
import { Result } from './model'
import { EOF, isEOF, Reentry } from './reentry'
import { loadSource } from './source'
import { parseUrl } from './url'

export interface Args {
  source: string | string[],
  hostnames?: string | string[]
}

async function Run(args: Args): Promise<void> {
  const hostnames = new HostnameSet(args.hostnames ?
    new Set([...args.hostnames]) :
    new Set([...args.source].map((s) => parseUrl(s).hostname)))

  const source = loadSource(args)

  const reentry = new Reentry({ hostnames: hostnames.hostnames })

  const results = source.pipe(reentry, { end: false })
    .pipe(new DivergentStreamWrapper({
      objectMode: true,
      hashChunk: (url: string | EOF) => {
        if (isEOF(url)) {
          // send the EOF to all streams
          return DivergentStreamWrapper.ALL
        }
        return parseUrl(url).hostname
      },
      createStream: (hostname) => hostnames.streamFor(hostname),
    }))

  await collect(results, (result: Result) => {
    console.log(result)
  })
}

export default Run

class HostnameSet {
  private _locks = new Map<string, Semaphore>()
  private _streams = new Map<string, Duplex>()

  public get hostnames() {
    return this._hostnames
  }

  constructor(private readonly _hostnames: Set<string>) {}

  public lockFor(hostname: string) {
    const existing = this._locks.get(hostname)
    if (existing) {
      return existing
    }

    const semaphore = new Semaphore()
    this._locks.set(hostname, semaphore)
    return semaphore
  }

  public streamFor(hostname: string): Duplex {
    const existing = this._streams.get(hostname)
    if (existing) {
      return existing
    }

    return new Fetch({
      hostnames: this.hostnames,
      semaphore: this.lockFor(hostname),
    })
  }
}
