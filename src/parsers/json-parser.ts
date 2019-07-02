import { Request, Response } from 'cross-fetch'
import oboe from 'oboe'

import { ParserOptions, RegexpParser } from '.'
import { defaultLogger } from '../logger'
import { Result } from '../model'
import { URL } from '../url'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

export class JsonParser {
  public static readonly regexp = /^\s*((((ftp|http|https):)?\/\/)|\/)[^ "<\{\}]+\s*$/igm

  private readonly _options: ParserOptions

  constructor(options?: Options<ParserOptions>) {
    this._options = assign(
      {
        logger: defaultLogger,
        include: [],
      },
      options,
    )
  }

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const { logger } = this._options
    const baseUrl = response.url || request.url

    return new Promise((resolve, reject) => {
      oboe(response.body! as unknown as NodeJS.ReadableStream)
        .node('*', (node, path, ancestors) => {
          if (typeof node == 'string') {
            if (node.match(JsonParser.regexp)) {
              this._tryEmit(node, baseUrl, push)
            } else {
              console.log(`no match '${node}'`, JsonParser.regexp)
            }
          }
        })
        .done((result) => {
          console.log('parsed json:', result)
          resolve(result)
        })
        .fail((err) => {
          reject(err)
        })

    })
  }

  private _tryEmit(match: string, base: string, push: (result: URL) => void) {
    let url: URL
    try {
      url = parseUrl(match, base)
    } catch (err) {
      this._options.logger.debug(`bad href: '${match}'`)
      return
    }
    push(url)
  }
}
