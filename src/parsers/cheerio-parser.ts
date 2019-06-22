import cheerio from 'cheerio'
import { Request, Response } from 'cross-fetch'

import { Result } from '../model'
import { parseUrl, URL } from '../url'

export class CheerioParser {
  public async parse(response: Response, request: Request, push: (urls: URL) => void): Promise<void> {
    const text = await response.text()
    const $ = cheerio.load(text)

    let baseUrl = response.url || request.url
    const baseElement = $('base').first()
    if (baseElement && baseElement.attr('href')) {
      baseUrl = parseUrl(baseElement.attr('href'), response.url || request.url).toString()
    }

    $('a[href]').each((index, anchorTag) => {
      parseAttr(anchorTag)
    })

    $('link[rel="canonical"]').each((index, link) => {
      parseAttr(link)
    })

    function parseAttr(element: CheerioElement, attr = 'href'): void {
      const href = $(element).attr(attr)
      if (href) {
        try {
          const url = parseUrl(href, baseUrl)
          if (['http:', 'https:'].includes(url.protocol)) {
            push(url)
          }
        } catch (ex) {
          // ignore
        }
      }
    }
  }
}
