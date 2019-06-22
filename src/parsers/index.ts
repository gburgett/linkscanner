import { Logger } from '../logger'
import {URL} from '../url'
import { Options } from '../util'
import { CheerioParser } from './cheerio-parser'
import { RegexpParser } from './regexp-parser'

export interface Parser {
  parse(response: Response, request: Request, push: (result: URL) => void): Promise<void>
}

export interface Parsers {
  [mimeType: string]: Parser
}

export interface ParserOptions {
  logger: Logger
}

export const defaultParsers = (options?: Options<ParserOptions>) => ({
    'default': new RegexpParser(options),
    'text/html': new CheerioParser(options),
  })

export {
  CheerioParser,
  RegexpParser,
}
