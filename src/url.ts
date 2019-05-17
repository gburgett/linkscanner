import { URL } from 'universal-url'

export { URL } from 'universal-url'

export function parseUrl(url: string): URL {
  return new URL(url)
}

export function isURL(object: any): object is URL {
  return object instanceof URL
}
