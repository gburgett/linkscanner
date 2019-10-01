import { URL } from '../url'

export type Result = SuccessResult | ErrorResult | SkippedResult

interface ResultCommon {
  url: URL
  host: string
  parent?: SuccessResult
}

export interface SuccessResult extends ResultCommon {
  type: 'success'
  method: string
  status: number
  contentType: string | null
  ms: number
  links: URL[]
  leaf?: boolean
  headers: { [key: string]: string }
}

export function isSuccessResult(result: Result): result is SuccessResult {
  return result.type == 'success'
}

const errorReasons = ['error', 'timeout', 'redirect-loop', 'unknown'] as const
export type ErrorReason = typeof errorReasons[number]

export interface ErrorResult extends ResultCommon {
  type: 'error'
  method: string | undefined
  status: number | undefined
  reason: ErrorReason
  error: Error
  headers?: { [key: string]: string }
  leaf: true
}

export function isErrorResult(result: Result): result is ErrorResult {
  return result.type == 'error'
}

export interface SkippedResult extends ResultCommon {
  type: 'skip'
  reason: SkipReason
  leaf: true
}

const skipReasons = ['disallowed', 'external', 'unknown'] as const
export type SkipReason = typeof skipReasons[number]

export function isSkippedResult(result: Result): result is SkippedResult {
  return result.type == 'skip'
}

export interface RedirectResult extends SuccessResult {
  status: 301 | 302 | 307 | 308
  headers: {
    Location: string
    [key: string]: string,
  }
}

export function isRedirectResult(result: Result): result is RedirectResult {
  if (!isSuccessResult(result)) {
    return false
  }

  return [301, 302, 307, 308].includes(result.status)
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

