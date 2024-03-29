import { Limiter, Semaphore, timeout as timeoutWrapper } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import { Interval } from 'limiter'
import { Logger } from './logger'

import { assign, Options } from './util'

export interface FetchInterface {
  fetch: (input: Request) => Promise<Response>,
  Request: new (url: string, requestInit?: RequestInit) => Request,
}

interface FetchWrapperOptions {
  headers: { [key: string]: string },
  timeout: number
  maxConcurrency: number | { tokens: number, interval: Interval }
  logger?: Logger
}

export class FetchInterfaceWrapper implements FetchInterface {
  public readonly fetch: (input: Request) => Promise<Response>
  // tslint:disable-next-line: variable-name
  public readonly Request: new (url: string, requestInit?: RequestInit) => Request

  private readonly semaphore: Semaphore
  private readonly _options: FetchWrapperOptions

  /** contains a promise if currently paused */
  private _pause: Promise<void> | undefined = undefined
  private _resume: (() => void) | undefined = undefined

  constructor(fetch: FetchInterface, options?: Options<FetchWrapperOptions>) {
    this._options = assign({
      headers: {},
      timeout: 10000,
      maxConcurrency: 5,
    }, options)

    const { maxConcurrency, headers, timeout } = this._options

    this.semaphore =
      typeof(maxConcurrency) == 'number' ?
        new Semaphore({
          tokens: maxConcurrency,
        }) :
        new Limiter({
          tokensPerInterval: maxConcurrency.tokens,
          interval: maxConcurrency.interval,
        })

    // tslint:disable-next-line: max-classes-per-file
    this.Request = class {
      constructor(url: string, requestInit?: RequestInit) {
        // add in the headers inside the request constructor call
        requestInit = {
          ...requestInit,
          headers: {
            ...(requestInit && requestInit.headers),
            ...headers,
          },
        }
        // We actually want a real fetch.Request but with our injected params
        return new fetch.Request(url, requestInit) as any
      }
    } as any

    this.fetch = this.semaphore.synchronize(async (req: Request) => {
      if (this._pause) {
        await this._pause
      }

      // timeout inside the synchronize so as to avoid problems with maxConcurrency
      return timeoutWrapper(() => fetch.fetch(req), timeout)
    })
  }

  public pause(): void {
    this._pause = new Promise((resolve) => {
      this._resume = () => {
        resolve()
      }
    })
  }

  public resume() {
    if (this._resume) {
      this._resume()
    }
  }

}

export const defaultFetchInterface = new FetchInterfaceWrapper(
  crossFetch,
  {},
)
