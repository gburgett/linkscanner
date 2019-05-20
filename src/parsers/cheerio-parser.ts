import cheerio from 'cheerio'
import { Request, Response } from 'cross-fetch'

import { Result } from '../model'
import { parseUrl, URL } from '../url'

export class CheerioParser {
  public async parse(response: Response, request: Request, push: (urls: URL) => void): Promise<void> {
    const $ = cheerio.load(await response.text())

    $('a[href]').each((index, anchorTag) => {
      const href = $(anchorTag).attr('href')
      if (href) {
        try {
          const url = parseUrl(href, response.url)
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
