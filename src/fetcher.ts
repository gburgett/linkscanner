import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import 'cross-fetch/polyfill'

import { defaultFetchInterface, FetchInterface } from './fetch_interface'
import { defaultLogger, Logger } from './logger'
import { Chunk, ErrorResult, Result } from './model'
import { defaultParsers, findParser, ParserOptions, Parsers } from './parsers'
import { EOF, isEOF } from './reentry'
import { parseUrl, URL } from './url'
import { assign, isomorphicPerformance, Options } from './util'

export interface FetchOptions extends ParallelTransformOptions {
  objectMode: true

  acceptMimeTypes: string[]
  followRedirects: boolean

  parsers: Parsers
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
        timeout: 30000,
        parsers: defaultParsers(options),
        acceptMimeTypes: ['text/html', 'application/json'],
        // default to the global fetch
        fetch: defaultFetchInterface,
      },
      options,
      {
        objectMode: true,
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
    method = method || (leaf ? 'HEAD' : 'GET')

    const { fetch, Request } = this.options.fetch
    const request = new Request(url.toString(), {
      method,
      headers: {
        Accept: this.options.acceptMimeTypes.join(', '),
      },
      redirect: 'manual',
    })

    const partialResult = {
      parent,
      leaf,
      links: [] as URL[],
      method: request.method,
      url,
      host: url.hostname,
    }

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
    const fullResult: Result = Object.assign(partialResult, {
      type: 'success' as const,
      status: response.status,
      ms: end - start,
    })

    if (followRedirects && [301, 302, 307].includes(response.status)) {
      // single redirect
      const location = response.headers.get('Location')
      if (location) {
        let parsedLocation
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

        await this._fetch({ ...chunk, url: parsedLocation })
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
}
