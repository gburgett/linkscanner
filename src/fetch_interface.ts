import { Limiter, Semaphore, timeout as timeoutWrapper } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import { Interval } from 'limiter'

import { assign, Options } from './util'

export interface FetchInterface {
  fetch: (input: Request) => Promise<Response>,
  Request: new (url: string, requestInit?: RequestInit) => Request,
}

interface FetchWrapperOptions {
  headers: { [key: string]: string },
  timeout: number
  maxConcurrency: number | { tokens: number, interval: Interval }
}

export class FetchInterfaceWrapper implements FetchInterface {
  public readonly fetch: (input: Request) => Promise<Response>
  // tslint:disable-next-line: variable-name
  public readonly Request: new (url: string, requestInit?: RequestInit) => Request

  private readonly semaphore: Semaphore
  private readonly _options: FetchWrapperOptions

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
    this.Request = class extends fetch.Request {
      constructor(url: string, requestInit?: RequestInit) {
        // add in the headers inside the request constructor call
        requestInit = {
          ...requestInit,
          headers: {
            ...(requestInit && requestInit.headers),
            ...headers,
          },
        }
        super(url, requestInit)
      }
    }

    this.fetch = this.semaphore.synchronize((req: Request) => {
      // timeout inside the synchronize so as to avoid problems with maxConcurrency
      return timeoutWrapper(() => fetch.fetch(req), timeout)
    })
  }

}

export const defaultFetchInterface = new FetchInterfaceWrapper(
  crossFetch,
  {},
)
