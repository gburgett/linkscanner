import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
require('es6-promise/auto')
import { ReadLock } from 'async-toolbox'
import { Response } from 'node-fetch'
import { Writable } from 'stream'
import fetch from 'universal-fetch'
import { Result } from './model'
import { CheerioParser } from './parsers/cheerio-parser'
import { RegexpParser } from './parsers/regexp-parser'
import { EOF, isEOF } from './reentry'
import { URL } from './url'

interface Parsers {
  [mimeType: string]: {
    parse: (response: Response, push: (result: URL) => void) => Promise<Result>,
  }
}

export interface FetchOptions extends ParallelTransformOptions {
  objectMode?: true

  hostnames: Set<string>

  acceptMimeTypes?: string[]

  reentry?: Writable
  parsers?: Parsers
}

export class Fetch extends ParallelTransform {
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

    const chunk = {
      url,
      method,
      response,
    }

    const contentType = chunk.response.headers.get('content-type')
    const parser = this._parsers[contentType || 'default'] ||
      this._parsers.default ||
      new RegexpParser()

    const result = await parser.parse(chunk.response, (u) => {
      console.log('TODO: reentry on URL', u)
    })

    this.push(result)
  }
}
