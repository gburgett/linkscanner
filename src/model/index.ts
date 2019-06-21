import { URL } from '../url'

export type Result = SuccessResult | ErrorResult

interface ResultCommon {
  method: string
  url: URL
  host: string
  parent?: SuccessResult
}

export interface SuccessResult extends ResultCommon {
  status: number
  ms: number
  links: URL[]
  leaf?: boolean
}

export function isSuccessResult(result: Result): result is SuccessResult {
  return 'status' in result && result.status !== undefined && result.status !== null
}

export type ErrorReason =
  'error'
  | 'timeout'

export interface ErrorResult extends ResultCommon {
  status: undefined
  reason: ErrorReason
  error: string
  leaf: true
}

export function isErrorResult(result: Result): result is ErrorResult {
  return 'error' in result && !!result.reason
}

export interface Chunk {
  url: URL,
  /**
   * Indicates the URL whose body contained this URL as a link.
   * If nil, this is a root node.
   */
  parent?: SuccessResult,
  /**
   * Indicates whether this URL should not be recursed into.
   * Leaf nodes should not have their body read for links.
   */
  leaf?: boolean
}
