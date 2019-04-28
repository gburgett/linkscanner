import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import {Response} from 'cross-fetch'
import 'cross-fetch/polyfill'
import { Result } from './model'
import { CheerioParser } from './parsers/cheerio-parser'
import { RegexpParser } from './parsers/regexp-parser'
import { EOF, isEOF } from './reentry'
import { URL } from './url'

declare var fetch: any

export interface Parser {
  parse(response: Response, push: (result: URL) => void): Promise<Result>
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

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: this._acceptMimeType,
      },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type')
    const parser = this._parsers[contentType || 'default'] ||
      this._parsers.default ||
      new RegexpParser()

    const result = await parser.parse(response, (u) => {
      this.emit('url', u)
    })

    this.push(result)
  }
}
