import { Response } from 'cross-fetch'
import { URL } from '../url'

export interface Result {
  url: URL
  host: string
  status: number
  ms: number
}

export interface PartialResult {
  url: URL
  method: string,
  response: Response
}
