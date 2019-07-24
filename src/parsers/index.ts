import { Logger } from '../logger'
import {URL} from '../url'
import { Options } from '../util'
import { CheerioParser } from './cheerio-parser'
import { JsonParser } from './json-parser'
import { RegexpParser } from './regexp-parser'

export interface Parser {
  parse(response: Response, request: Request, push: (result: URL) => void): Promise<void>
}

export interface Parsers {
  [mimeType: string]: Parser
}

export interface ParserOptions {
  logger: Logger

  /**
   * What kinds of elements to include in the search.  For example,
   * for HTML this can be `a,link[rel="stylesheet"],img,script,form,iframe`
   * for JSON this could be a json path selector
   * for CSS files the `img` value will cause background images to be checked
   *
   * `all` includes everything.
   */
  include: string[]
}

// tslint:disable-next-line: variable-name
const NullParser: Parser = {
  async parse() {
    return
  },
}

export const defaultParsers = (options?: Options<ParserOptions>) => ({
    'default': new RegexpParser(options),
    'text/html': new CheerioParser(options),
    'text': new RegexpParser(options),
    'application/json': new JsonParser(options),
    'video': NullParser,
    'audio': NullParser,
    'image': NullParser,
    'application/pdf': NullParser,
    'json': new JsonParser(options),
  })

export function findParser(parsers: Parsers, mimeType: string | null): Parser {
  mimeType = mimeType || 'default'
  if (parsers[mimeType]) {
    return parsers[mimeType]
  }

  if (mimeType.includes('+')) {
    // application/vnd.foobar+json
    const extParts = mimeType.split('+')
    const suffix = extParts.pop()!
    if (parsers[suffix]) {
      return parsers[suffix]
    }
    mimeType = extParts.join('+')
  }

  const parts = mimeType.split('/')
  while (parts.length > 0) {
    parts.pop()
    mimeType = parts.join('/')
    if (parsers[mimeType]) {
      return parsers[mimeType]
    }
  }
  return parsers.default
}

export {
  CheerioParser,
  RegexpParser,
  NullParser,
}
