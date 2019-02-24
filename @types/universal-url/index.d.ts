declare module 'universal-url' {
  export {URL, URLSearchParams} from 'whatwg-url' 

  export function shim(): void
}