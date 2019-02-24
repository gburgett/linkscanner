import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import { Response } from 'node-fetch'
import { Transform, Writable } from 'stream'
import { PartialResult, Result } from './model'
import { CheerioParser } from './parsers/cheerio-parser'
import { RegexpParser } from './parsers/regexp-parser'
import { EOF, isEOF } from './reentry'
import { URL } from './url'

interface Parsers {
  [mimeType: string]: {
    parse: (response: Response, push: (result: URL) => void) => Promise<Result>,
  }
}

export interface ParseOptions extends ParallelTransformOptions {
  objectMode?: true

  hostnames: Set<string>
  reentry?: Writable

  parsers?: Parsers
}

export class Parse extends ParallelTransform {
  private parsers: Parsers

  constructor(private readonly options: ParseOptions) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))

    this.parsers = options.parsers || {
      'default': new RegexpParser(),
      'text/html': new CheerioParser(),
    } as Parsers
  }

  public async _transformAsync(chunk: PartialResult | EOF): Promise <void> {
    if (isEOF(chunk)) {
      this.options.reentry!.writeAsync(chunk)
      return
    }

    const contentType = chunk.response.headers.get('content-type')
    const parser = this.parsers[contentType || 'default'] ||
      this.parsers.default ||
      new RegexpParser()

    const result = await parser.parse(chunk.response, (url) => {
      console.log('TODO: reentry on URL', url)
    })

    this.push(result)
  }
}
