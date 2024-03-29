import { URL } from '../url'
import { Result, SuccessResult } from '.'

/**
 * Finds the parent that is not a redirect
 */
export function findNonRedirectParent(parent: SuccessResult | undefined): SuccessResult | undefined {
  while (parent) {
    if (![301, 302, 307].includes(parent.status)) {
      return parent
    }

    // look up the tree
    parent = parent.parent
  }
}

export function *allParents(result: Result) {
  let parent = result.parent
  while (parent) {
    yield parent

    // look up the tree
    parent = parent.parent
  }
}

interface EnhancedResult {
  numRedirects: number
  parentStatus?: number
}

/**
 * Merges several redirect objects into one result representing all the redirects
 * that it took to get to the final result.
 */
export function mergeRedirectParents<T extends Result>(child: T): T & EnhancedResult {
  let parent = child.parent
  const enhancedChild: T & EnhancedResult = {
    ...child,
    numRedirects: 0,
  }
  while (parent) {
    if (![301, 302, 307].includes(parent.status)) {
      return enhancedChild
    }

    // "merge" redirect results into the child result
    Object.assign(enhancedChild, {
      // sum the total ms
      ms: ('ms' in enhancedChild && (enhancedChild as any).ms || 0) + parent.ms,
      // use the redirect's URL, cause that's the one found on page
      url: parent.url,
      parentStatus: parent.status,
      parent: parent.parent,
      numRedirects: enhancedChild.numRedirects + 1,
    })
    parent = parent.parent
  }
  return enhancedChild
}
