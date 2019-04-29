import { Request, Response } from 'cross-fetch'
import { URL } from 'whatwg-url'
import { Result } from '../model'
import { parseUrl } from '../url'

export class RegexpParser {
  public static readonly regexp = /^(ftp|http|https):\/\/[^ "]+$/

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const text = await response.text()
    const matches = RegexpParser.regexp.exec(text)
    if (matches) {
      for (const match of matches) {
        try {
          const url = parseUrl(match)
          push(url)
        } catch (err) {
          // false positive - ignore
        }
      }
    }
  }
}
