import cheerio from 'cheerio'
import { Request, Response } from 'cross-fetch'

import { Result } from '../model'
import { parseUrl, URL } from '../url'

export class CheerioParser {
  public async parse(response: Response, request: Request, push: (urls: URL) => void): Promise<void> {
    const text = await response.text()
    const $ = cheerio.load(text)

    $('a[href]').each((index, anchorTag) => {
      const href = $(anchorTag).attr('href')
      if (href) {
        try {
          const url = parseUrl(href, response.url || request.url)
          if (['http:', 'https:'].includes(url.protocol)) {
            push(url)
          }
        } catch (ex) {
          // ignore
        }
      }
    })
  }
}
