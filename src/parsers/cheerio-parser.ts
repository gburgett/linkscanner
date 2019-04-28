import { Request, Response } from 'cross-fetch'
import { Result } from '../model'
import { URL } from '../url'

export class CheerioParser {
  public async parse(response: Response, request: Request, push: (urls: URL) => void): Promise<Result> {
    return null as unknown as Result
  }
}
