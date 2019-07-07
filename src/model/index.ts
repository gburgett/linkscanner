import { URL } from '../url'

export type Result = SuccessResult | ErrorResult | SkippedResult

interface ResultCommon {
  url: URL
  host: string
  parent?: SuccessResult
}

export interface SuccessResult extends ResultCommon {
  method: string
  status: number
  ms: number
  links: URL[]
  leaf?: boolean
}

export function isSuccessResult(result: Result): result is SuccessResult {
  return 'status' in result && result.status !== undefined && result.status !== null
    && !('error' in result)
}

const errorReasons = ['error', 'timeout', 'unknown'] as const
export type ErrorReason = typeof errorReasons[number]

export interface ErrorResult extends ResultCommon {
  method: string | undefined
  status: number | undefined
  reason: ErrorReason
  error: Error
  leaf: true
}

export function isErrorResult(result: Result): result is ErrorResult {
  return 'error' in result
}

export interface SkippedResult extends ResultCommon {
  skipped: true
  reason: SkipReason
  leaf: true
}

const skipReasons = ['disallowed', 'external'] as const
export type SkipReason = typeof skipReasons[number]

export function isSkippedResult(result: Result): result is SkippedResult {
  return 'skipped' in result
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
