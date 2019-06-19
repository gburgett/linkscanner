import { Response } from 'cross-fetch'
import { URL } from '../url'

export interface Result {
  method: string
  url: URL
  host: string
  status: number
  ms: number
  parent?: Result
  leaf?: boolean
  links: URL[]
}

export interface PartialResult {
  url: URL
  method: string,
  response: Response
}

export interface Chunk {
  url: URL,
  /**
   * Indicates the URL whose body contained this URL as a link.
   * If nil, this is a root node.
   */
  parent?: Result,
  /**
   * Indicates whether this URL should not be recursed into.
   * Leaf nodes should not have their body read for links.
   */
  leaf?: boolean
}
