import { Semaphore } from 'async-toolbox'
import { Duplex } from 'stream'

import { Fetcher, FetchInterface } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { assign, Options } from './util'

interface HostnameSetOptions {
  followRedirects: boolean,
  logger: Logger
  fetch?: FetchInterface
}

export class HostnameSet {
  private _locks = new Map<string, Semaphore>()
  private _streams = new Map<string, Duplex>()
  private readonly _options: HostnameSetOptions

  constructor(public readonly hostnames: Set<string>,
              options?: Options<HostnameSetOptions>) {
    this._options = assign({
      followRedirects: false,
      logger: defaultLogger,
    },
      options)
  }

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
      ...this._options,
      hostnames: this.hostnames,
      semaphore: this.lockFor(hostname),
    })
  }
}
