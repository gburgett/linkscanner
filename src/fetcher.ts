import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import 'cross-fetch/polyfill'
import { Robots } from '../vendor/robots-parser'

import { defaultFetchInterface, FetchInterface } from './fetch_interface'
import { defaultLogger, Logger } from './logger'
import { Chunk, ErrorResult, Result, SkippedResult, SuccessResult } from './model'
import { defaultParsers, findParser, ParserOptions, Parsers } from './parsers'
import { EOF, isEOF } from './reentry'
import { parseUrl, URL } from './url'
import { assign, isomorphicPerformance, Options } from './util'

export interface FetchOptions extends ParallelTransformOptions {
  objectMode: true

  acceptMimeTypes: string[]
  followRedirects: boolean
  /** Always executes a GET request even on leaf nodes */
  forceGet: boolean

  parsers: Parsers
  robots?: Robots
  logger: Logger
  fetch: FetchInterface
}

export class Fetcher extends ParallelTransform {
  private readonly options: FetchOptions

  constructor(options: Options<FetchOptions & ParserOptions>) {
    const opts = assign(
      {
        logger: defaultLogger,
        followRedirects: false,
        forceGet: false,
        timeout: 30000,
        acceptMimeTypes: ['text/html', 'application/json'],
        // default to the global fetch
        fetch: defaultFetchInterface,
      },
      options,
      {
        objectMode: true,
        parsers: assign({}, defaultParsers(options), options.parsers),
      },
    )

    super(opts)
    this.options = opts
  }

  public async _transformAsync(chunk: Chunk | EOF, lock: ReadLock): Promise<void> {
    if (isEOF(chunk)) {
      await lock.upgrade()
      this.push(chunk)
      return
    }

    await this._fetch(chunk)
  }

  private async _fetch(chunk: Chunk, method?: 'GET' | 'HEAD'): Promise<void> {
    const { url, parent, leaf } = chunk
    const { followRedirects, logger } = this.options
    if (!method) {
      if (this.options.forceGet) {
        method = 'GET'
      } else {
        method = leaf ? 'HEAD' : 'GET'
      }
    }

    const { fetch, Request } = this.options.fetch

    const partialResult = {
      parent,
      leaf,
      links: [] as URL[],
      method,
      url,
      host: url.hostname,
    }

    const { robots } = this.options
    if (robots && robots.isAllowed(url.toString()) === false) {
      const result: SkippedResult = {
        ...partialResult,
        type: 'skip',
        leaf: true,
        reason: 'disallowed',
      }
      logger.debug('disallowed', url.toString(), robots.isDisallowed(url.toString()))
      this.push(result)
      return
    }

    const request = new Request(url.toString(),
      this.requestInit(chunk, partialResult))

    logger.debug(`${request.method} ${request.url}`)
    const start = isomorphicPerformance.now()

    let response: Response
    try {
      this.emit('fetch', request)
      response = await fetch(request)
    } catch (ex) {
      const errorResult: ErrorResult = {
        ...partialResult,
        type: 'error',
        leaf: true,
        status: undefined,
        reason: ex.name == 'TimeoutError' ? 'timeout' : 'error',
        error: typeof ex == 'string' ? new Error(ex) : ex,
      }
      this.emit('fetchError', request)
      this.push(errorResult)
      return
    }
    this.emit('response', response, request)

    let contentType = response.headers.get('content-type')
    if (contentType) {
      // text/html; charset=utf-8
      contentType = contentType.split(';')[0]
    }
    const parser = findParser(this.options.parsers, contentType)

    logger.debug(`${request.method} ${request.url} ${response.status}`)

    if (!chunk.leaf && response.status >= 200 && response.status < 300) {
      await parser.parse(response, request, (u) => {
        if (!partialResult.links.includes(u)) {
          partialResult.links.push(u)

          this.emit('url', {
            url: u,
            parent: partialResult,
          })
        }
      })
    }
    const end = isomorphicPerformance.now()

    // Assign back to the same object, so that the emitted object tree is maintained.
    const fullResult: SuccessResult = Object.assign(partialResult, {
      type: 'success' as const,
      status: response.status,
      contentType,
      ms: end - start,
    })

    if (followRedirects && [301, 302, 307].includes(response.status)) {
      fullResult.leaf = false

      // single redirect
      const location = response.headers.get('Location')
      if (location) {
        let parsedLocation: URL
        try {
          parsedLocation = parseUrl(location)
        } catch (ex) {
          const error: ErrorResult = {
            ...fullResult,
            type: 'error',
            leaf: true,
            reason: 'error',
            error: new Error(`${fullResult.status}: bad location header '${location}'`),
          }
          this.push(error)
          return
        }

        if (infiniteRedirect(parsedLocation, parent)) {
          const error: ErrorResult = {
            ...fullResult,
            type: 'error',
            leaf: true,
            reason: 'redirect-loop',
            error: new Error(`${parsedLocation}: infinite redirect`),
          }
          this.push(error)
          return
        }

        // push the redirect only if we've passed all the error conditions
        this.push(fullResult)

        // Try again, using the redirect result as the parent
        await this._fetch({
          ...chunk,
          url: parsedLocation,
          parent: fullResult,
        })
      } else {
        const error: ErrorResult = {
          ...fullResult,
          type: 'error',
          leaf: true,
          reason: 'error',
          error: new Error(`${fullResult.status}: missing location header`),
        }
        this.push(error)
      }
    } else if (response.status == 405 && method == 'HEAD') {
      /*
       * Some servers do not respond correctly to a 'head' request method. When true, a link resulting in an HTTP
       * 405 "Method Not Allowed" error will be re-requested using a 'get' method before deciding that it is broken.
       * This is only relevant if the requestMethod option is set to 'head'.
       */
      await this._fetch(chunk, 'GET')
    } else {
      this.push(fullResult)
    }
  }

  private requestInit({parent}: Chunk, {method, url}: { method: string, url: URL }): RequestInit {
    const headers: { [key: string]: string } = {
      Accept: this.options.acceptMimeTypes.join(', '),
    }

    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual',
    }
    if (parent) {
      if (parent.url.protocol == 'https:' && url.protocol == 'http:') {
        /*
         * A Referer header is not sent by browsers if:
         *
         * The referring resource is a local "file" or "data" URI.
         * An unsecured HTTP request is used and the referring page was received
         * with a secure protocol (HTTPS).
         * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referer
         */
      } else {
        headers.Referer = parent.url.toString()
      }
    }

    return init
  }
}

function infiniteRedirect(location: URL, parent: SuccessResult | undefined): boolean {
  const parents: string[] = []
  while (parent) {
    if (![301, 302, 307].includes(parent.status)) {
      // no infinite redirect if parent is not a redirect
      return false
    }
    parents.push(parent.url.toString())
    console.log('check', location.toString(), 'against', parents)

    // does the given location point to one of the parents?
    if (parents.includes(location.toString())) {
      console.log('found infinite redirect')
      return true
    }

    // look up the tree
    parent = parent.parent
  }

  return false
}
