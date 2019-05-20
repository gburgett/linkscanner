import { Response } from 'cross-fetch'
import { URL } from '../url'

export interface Result {
  method: string
  url: URL
  host: string
  status: number
  ms: number
  parent: URL
}

export interface PartialResult {
  url: URL
  method: string,
  response: Response
}
