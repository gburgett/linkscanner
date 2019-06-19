import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import 'cross-fetch/polyfill'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result } from './model'
import { CheerioParser } from './parsers/cheerio-parser'
import { RegexpParser } from './parsers/regexp-parser'
import { EOF, isEOF } from './reentry'
import { parseUrl, URL } from './url'
import { assign, Options } from './util'

export interface Parser {
  parse(response: Response, request: Request, push: (result: URL) => void): Promise<void>
}

interface Parsers {
  [mimeType: string]: Parser
}

const defaultParsers: Parsers = {
  'default': new RegexpParser(),
  'text/html': new CheerioParser(),
}

export interface FetchInterface {
  fetch: (input: Request) => Promise<Response>,
  Request: new (url: string, requestInit?: RequestInit) => Request,
}

export interface FetchOptions extends ParallelTransformOptions {
  objectMode: true

  acceptMimeTypes: string[]
  followRedirects: boolean

  parsers: Parsers
  logger: Logger
  fetch: FetchInterface
}

const isomorphicPerformance = typeof (performance) != 'undefined' ?
  performance :
  // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
  // the perf_hooks package.
  // tslint:disable-next-line:no-eval
  eval('require')('perf_hooks').performance

export class Fetcher extends ParallelTransform {
  private readonly options: FetchOptions

  constructor(options: Options<FetchOptions>) {
    const opts = assign(
      {
        logger: defaultLogger,
        followRedirects: false,
        parsers: defaultParsers,
        acceptMimeTypes: ['text/html', 'application/json'],
        // default to the global fetch
        fetch: crossFetch,
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

  private async _fetch({ url, parent, leaf }: Chunk, method?: 'GET' | 'HEAD'): Promise<void> {
    const { followRedirects, logger } = {
      logger: defaultLogger,
      ...this.options,
    }
    method = method || leaf ? 'HEAD' : 'GET'

    const { fetch, Request } = this.options.fetch
    const request = new Request(url.toString(), {
      method,
      headers: {
        Accept: this.options.acceptMimeTypes.join(', '),
      },
      redirect: 'manual',
    })

    logger.debug(`${request.method} ${request.url}`)
    const start = isomorphicPerformance.now()

    const response = await fetch(request)

    let contentType = response.headers.get('content-type')
    if (contentType) {
      // text/html; charset=utf-8
      contentType = contentType.split(';')[0]
    }
    const parser = this.options.parsers[contentType || 'default'] ||
      this.options.parsers.default ||
      new RegexpParser()

    const partialResult = {
      parent,
      leaf,
      ...createResult(request, response),
      links: [] as URL[],
    }
    logger.debug(`${request.method} ${request.url} ${response.status}`)

    if (partialResult.status >= 200 && partialResult.status < 300) {
      await parser.parse(response, request, (u) => {
        partialResult.links.push(u)
        this.emit('url', {
          url: u,
          parent: partialResult,
        })
      })
    }
    const end = isomorphicPerformance.now()

    // Assign back to the same object, so that the emitted object tree is maintained.
    const fullResult: Result = Object.assign(partialResult, {
      ms: end - start,
    })
    this.push(fullResult)

    if (followRedirects && [301, 302].includes(response.status)) {
      // single redirect
      const location = response.headers.get('Location')
      if (location) {
        let parsedLocation
        try {
          parsedLocation = parseUrl(location)
        } catch (ex) {
          logger.error(`Error parsing redirect location from ${url.toString()} - ${location}`)
          return
        }

        await this._fetch({ url: parsedLocation, parent })
      }
    } else if (response.status == 405 && method == 'HEAD') {
      /*
       * Some servers do not respond correctly to a 'head' request method. When true, a link resulting in an HTTP
       * 405 "Method Not Allowed" error will be re-requested using a 'get' method before deciding that it is broken.
       * This is only relevant if the requestMethod option is set to 'head'.
       */
      await this._fetch({ url, parent }, 'GET')
    }
  }
}

function createResult(req: Request, resp: Response) {
  const rawUrl = resp.url && resp.url.length > 0 ? resp.url : req.url
  const url = parseUrl(rawUrl)
  return {
    method: req.method,
    url,
    host: url.hostname,
    status: resp.status,
  }
}
