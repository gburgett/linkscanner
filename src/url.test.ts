import {parseUrl} from './url'

describe('url', () => {
  describe('parseUrl', () => {
    [
      ['https://google.com', 'https://google.com/'],
    ].forEach(([url, hostname]) => {
      it(`${url} => ${hostname}`, () => {
        expect(parseUrl(url).toString()).toBe(hostname)
      })
    })
  })

})
