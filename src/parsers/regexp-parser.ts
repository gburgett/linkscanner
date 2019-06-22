import { Request, Response } from 'cross-fetch'

import { ParserOptions } from '.'
import { defaultLogger } from '../logger'
import { Result } from '../model'
import { URL } from '../url'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

export class RegexpParser {
  public static readonly regexp = /(ftp|http|https):\/\/[^ "]+/g

  private readonly _options: ParserOptions

  constructor(options?: Options<ParserOptions>) {
    this._options = assign(
      {
        logger: defaultLogger,
      },
      options,
    )
  }

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const { logger } = this._options

    const text = await response.text()
    const matches = text.match(RegexpParser.regexp)
    if (matches) {
      for (const match of matches) {
        try {
          const url = parseUrl(match)
          push(url)
        } catch (err) {
          // false positive - ignore
          logger.debug(`bad href: '${match}'`)
        }
      }
    }
  }
}
