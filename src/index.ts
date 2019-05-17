import { Semaphore } from 'async-toolbox'
import { collect } from 'async-toolbox/stream'
import { Transform } from 'stream'

import { Duplex } from 'stream'
import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { Fetcher } from './fetcher'
import { Result } from './model'
import { EOF, isEOF, Reentry } from './reentry'
import { loadSource } from './source'
import { parseUrl, URL } from './url'

export interface Args {
  source: string | string[],
  hostnames?: string | string[]
}

async function Run(args: Args): Promise<void> {
  const hostnames = new HostnameSet(args.hostnames ?
    new Set([...args.hostnames]) :
    new Set([...args.source].map((s) => parseUrl(s).hostname)))

  const source = loadSource(args)
    .pipe(parseUrls())

  const reentry = new Reentry({ hostnames: hostnames.hostnames })

  const results = source
    .pipe(reentry, { end: false })
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

  const sourceUrls = new Set<URL>()
  source.on('data', (url: URL) => {
    sourceUrls.add(url)
  })
  results.on('url', (data: { url: URL, parent: URL }) => {
    if (sourceUrls.has(data.parent)) {
      reentry.push(data.url)
    }
  })

  await collect(results, (result: Result) => {
    console.log(`${result.status}: ${result.url.toString()}`)
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

    return new Fetcher({
      hostnames: this.hostnames,
      semaphore: this.lockFor(hostname),
    })
  }
}

function parseUrls() {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, done) {
      try {
        this.push(parseUrl(chunk))
        done()
      } catch (ex) {
        done(ex)
      }
    },
  })
}
