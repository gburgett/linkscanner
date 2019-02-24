import { URL } from 'universal-url'

export { URL } from 'universal-url'

export function parseUrl(url: string) {
  return new URL(url)
}
