import { expect } from 'chai'
import { Response } from 'cross-fetch'
import {} from 'mocha'
import { URL } from '../url'

import { RegexpParser } from './regexp-parser'

describe('RegexpParser', () => {
  it('finds a URL in the response body', async () => {
    const parser = new RegexpParser()

    const resp = new Response('<a href="https://google.com"></a>')
    const results: URL[] = []
    await parser.parse(resp, undefined as any, (result) => results.push(result))

    expect(results.length).to.eq(1)
    expect(results[0].toString()).to.eq('https://google.com/')
  })
})
