import { expect } from 'chai'
import { Response } from 'cross-fetch'
import fetchMock from 'fetch-mock'
import {} from 'mocha'

import { collect, toReadable } from 'async-toolbox/stream'
import {BuildStream} from './build_stream'
import { Result } from './model'

describe('BuildStream', () => {
  beforeEach(() => {
    fetchMock.reset()
  })

  it('fetches a single URL', async () => {
    fetchMock.getOnce('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body></body></html>`,
      })

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildStream(source)

    // act
    const result: Result[] = await collect(uut)

    expect(result[0].status).to.eq(200)
    expect(result[0].host).to.eq('test.com')
    expect(result[0].url.toString()).to.eq('http://test.com/testpage')
  })

  it('recurses into other URLs found on page', async () => {
    fetchMock.getOnce('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMock.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildStream(source)

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).to.equal(2)
    expect(result[1].status).to.eq(200)
    expect(result[1].host).to.eq('other.com')
    expect(result[1].url.toString()).to.eq('http://other.com/')
    expect(result[1].parent!.toString()).to.eq('http://test.com/testpage')
  })

  it('deep recurses for same host', async () => {
    fetchMock.getOnce('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="./relative/link">Relative Page</a></body></html>`,
      })
    fetchMock.getOnce('http://test.com/testpage/relative/link',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMock.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildStream(source, {
      recursive: true,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).to.equal(3)
    expect(result[1].status).to.eq(200)
    expect(result[1].host).to.eq('test.com')
    expect(result[1].url.toString()).to.eq('http://test.com/testpage/relative/link')
    expect(result[1].parent!.toString()).to.eq('http://test.com/testpage/')

    expect(result[2].status).to.eq(200)
    expect(result[2].host).to.eq('other.com')
    expect(result[2].url.toString()).to.eq('http://other.com/')
    expect(result[2].parent!.toString()).to.eq('http://test.com/testpage/relative/link')
  })

  it('does not deep recurse when recursive: false', async () => {
    fetchMock.getOnce('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="./relative/link">Relative Page</a></body></html>`,
      })
    fetchMock.getOnce('http://test.com/testpage/relative/link',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMock.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildStream(source, {
      recursive: false,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).to.equal(2)
    expect(result[0].url.toString()).to.eq('http://test.com/testpage/')
    expect(result[1].url.toString()).to.eq('http://test.com/testpage/relative/link')
  })
})
