import { Response } from 'cross-fetch'
import { URL } from 'whatwg-url'
import { Result } from '../model'

export class RegexpParser {
  public async parse(response: Response, push: (result: URL) => void): Promise<Result> {
    return null as unknown as Result
  }
}
