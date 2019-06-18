import { expect } from 'chai'
import {} from 'mocha'

import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { Result } from '../model'
import { parseUrl } from '../url'
import { TableFormatter } from './table'

describe('TableFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
      logger: logger as unknown as Logger,
    })

    // act
    instance.write({
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      host: 'test.com',
      ms: 123,
    } as Result)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(1)
    expect(messages[0]).to.deep.eq('200 GET  http://test.com/#')
  })
})
