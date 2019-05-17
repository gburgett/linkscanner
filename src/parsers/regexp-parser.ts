import { Request, Response } from 'cross-fetch'
import { Result } from '../model'
import { URL } from '../url'
import { parseUrl } from '../url'

export class RegexpParser {
  public static readonly regexp = /(ftp|http|https):\/\/[^ "]+/g

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const text = await response.text()
    const matches = text.match(RegexpParser.regexp)
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
