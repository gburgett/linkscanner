import { URL } from 'universal-url'

export { URL } from 'universal-url'

export function parseUrl(url: string): URL {
  return new URL(url)
}
