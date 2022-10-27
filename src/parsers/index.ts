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

export const defaultParsers = (options?: Options<ParserOptions & { only: string[] }>) => {
  const parsers: Parsers = {
    'default': new RegexpParser(options),
    'text/html': new CheerioParser(options),
    'text': new RegexpParser(options),
    'application/json': new JsonParser(options),
    'video': NullParser,
    'audio': NullParser,
    'image': NullParser,
    'font': NullParser,
    'application/pdf': NullParser,
    'json': new JsonParser(options),
  }

  const only = options && options.only
  if (only && only.length > 0) {
    Object.keys(parsers).forEach((key) => {
      if (only.includes(key)) {
        return
      }
      // text/html => html, application/vnd.blah+json => json
      const lastPart = key.split(/[/+]/).filter((p) => p.length > 0).pop()
      if (lastPart && only.includes(lastPart)) {
        return
      }

      // Don't download and scan this key
      parsers[key] = NullParser
    })
  }

  return parsers
}

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

export const extensionToMimeType: Readonly<{ [ext: string]: string }> = {
  '.aac': 'audio/aac',
  '.abw': 'application/x-abiword',
  '.arc': 'application/x-freearc',
  '.avi': 'video/x-msvideo',
  '.azw': 'application/vnd.amazon.ebook',
  '.bin': 'application/octet-stream',
  '.bmp': 'image/bmp',
  '.bz': 'application/x-bzip',
  '.bz2': 'application/x-bzip2',
  '.csh': 'application/x-csh',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.eot': 'application/vnd.ms-fontobject',
  '.epub': 'application/epub+zip',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ico': 'image/vnd.microsoft.icon',
  '.ics': 'text/calendar',
  '.jar': 'application/java-archive',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jsonld': 'application/ld+json',
  '.mid': 'audio/x-midi',
  '.midi': 'audio/x-midi',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.mpeg': 'video/mpeg',
  '.mpkg': 'application/vnd.apple.installer+xml',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.oga': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.ogx': 'application/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rar': 'application/x-rar-compressed',
  '.rtf': 'application/rtf',
  '.sh': 'application/x-sh',
  '.svg': 'image/svg+xml',
  '.swf': 'application/x-shockwave-flash',
  '.tar': 'application/x-tar',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ts': 'video/mp2t',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.vsd': 'application/vnd.visio',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xhtml': 'application/xhtml+xml',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xul': 'application/vnd.mozilla.xul+xml',
  '.zip': 'application/zip',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.7z': 'application/x-7z-compressed',
}
