import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import {Response} from 'cross-fetch'
import 'cross-fetch/polyfill'
import { Result } from './model'
import { CheerioParser } from './parsers/cheerio-parser'
import { RegexpParser } from './parsers/regexp-parser'
import { EOF, isEOF } from './reentry'
import { parseUrl, URL } from './url'

export interface Parser {
  parse(response: Response, request: Request, push: (result: URL) => void): Promise<void>
}

interface Parsers {
  [mimeType: string]: Parser
}

export interface FetchOptions extends ParallelTransformOptions {
  objectMode?: true

  hostnames: Set<string>

  acceptMimeTypes?: string[]

  parsers?: Parsers
}

const isomorphicPerformance = typeof(performance) != 'undefined' ?
  performance :
  // we only get here in nodejs.  Use eval to confuse webpack so it doesn't import
  // the perf_hooks package.
  // tslint:disable-next-line:no-eval
  eval('require')('perf_hooks').performance

export class Fetcher extends ParallelTransform {
  private _acceptMimeType: string
  private _parsers: Parsers

  constructor(private readonly options: FetchOptions) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))

    this._acceptMimeType = options.acceptMimeTypes ?
      options.acceptMimeTypes.join(', ') :
      'text/html, application/json'

    this._parsers = options.parsers || {
        'default': new RegexpParser(),
        'text/html': new CheerioParser(),
      } as Parsers
  }

  public async _transformAsync(url: URL | EOF, lock: ReadLock): Promise<void> {
    if (isEOF(url)) {
      await lock.upgrade()
      this.push(url)
      return
    }

    const method = this.options.hostnames.has(url.hostname) ?
      'GET' :
      'HEAD'

    const request = new Request(url.toString(), {
      method,
      headers: {
        Accept: this._acceptMimeType,
      },
      redirect: 'follow',
    })

    const start = isomorphicPerformance.now()
    const response = await fetch(request)

    const contentType = response.headers.get('content-type')
    const parser = this._parsers[contentType || 'default'] ||
      this._parsers.default ||
      new RegexpParser()

    const partialResult = createResult(request, response)

    await parser.parse(response, request, (u) => {
      this.emit('url', u)
    })
    const end = isomorphicPerformance.now()

    const fullResult: Result = {
      ...partialResult,
      ms: end - start,
    }

    this.push(fullResult)
  }
}

function createResult(req: Request, resp: Response) {
  const rawUrl = resp.url && resp.url.length > 0 ? resp.url : req.url
  const url = parseUrl(rawUrl)
  return {
    url,
    host: url.hostname,
    status: resp.status,
  }
}
