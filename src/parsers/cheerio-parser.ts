import cheerio, {AnyNode, Element as CheerioElement} from 'cheerio'
import { Request, Response } from 'cross-fetch'

import { ParserOptions } from '.'
import { defaultLogger } from '../logger'
import { Result } from '../model'
import { parseUrl, URL } from '../url'
import { assign, Options } from '../util'

const allSelectors = [
  'a[href]',
  'link[rel="canonical"]',
  'link[rel="stylesheet"]',
  'img',
  'script[src]',
  'iframe',
  'form',
]

const defaultSelectors = [
  'a[href]',
  'link[rel="canonical"]',
]

export class CheerioParser {
  private readonly _options: ParserOptions

  constructor(options?: Options<ParserOptions>) {
    this._options = assign(
      {
        logger: defaultLogger,
        include: [],
      },
      options,
    )

    if (this._options.include.includes('all')) {
      this._options.include = allSelectors
    } else {
      this._options.include =
        this._options.include.concat(...defaultSelectors)
    }
  }

  public async parse(response: Response, request: Request, push: (urls: URL) => void): Promise<void> {
    const { logger } = this._options

    const text = await response.text()
    const $ = cheerio.load(text)

    let baseUrl = response.url || request.url
    const baseElement = $('base').first()
    if (baseElement && baseElement.attr('href')) {
      baseUrl = parseUrl(baseElement.attr('href')!, response.url || request.url).toString()
    }

    const unique = new Set<string>()
    this._options.include.forEach((selector) => {
      $(selector).each((index, anchorTag) => {
        parseAttr(anchorTag, 'href', 'src', 'action')

        const attrSelector = selector.match(/\[(.+)\]/)
        if (attrSelector) {
          parseAttr(anchorTag, attrSelector[1])
        }
      })
    })

    function parseAttr(element: AnyNode, ...attrs: string[]): void {
      if (attrs.length == 0) {
        throw new Error(`no attrs given to select`)
      }

      const $elem = $(element)
      attrs.forEach((attr) => {
        const href = attr.startsWith('data-') ?
          $elem.data(attr.substr(5)) as string :
          $elem.attr(attr)
        if (href) {
          let url: URL | undefined
          try {
            url = parseUrl(href, baseUrl)
          } catch (ex) {
            // ignore
            logger.debug(`bad href: '${href}' (${$elem.toString()})`)
          }
          if (!url) {
            return
          }

          const urlString = url.toString()
          if (['http:', 'https:'].includes(url.protocol) && !unique.has(urlString)) {
            unique.add(urlString)
            push(url)
          }
        }
      })
    }
  }
}
