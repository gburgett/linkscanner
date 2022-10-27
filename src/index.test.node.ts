import { collect } from 'async-toolbox/stream'

import express, { Express } from 'express'
import { Server } from 'http'

import Linkscanner, { Args } from './index'
import { Result, SuccessResult } from './model'
import { URL } from './url'
import { Options } from './util'

describe('Linkscanner', () => {
  const options: Options<Args> = {}
  let app: Express
  let server: Server
  let baseUrl: string
  beforeEach(() => {
    app = express()

    app.get('/robots.txt', (req, res) => {
      res.send(`
User-agent: *
Crawl-delay: 1
Disallow: /disallowed/*.php
Allow: *`)
    })

    server = app.listen(9876)
    baseUrl = `http://localhost:9876`
  })

  afterEach(() => {
    server.close()
  })

  it('fetches a single URL', async () => {
    app.get('/testpage', (req, res) => {
      res.type('html')
      res.send(`<html><body></body></html>`)
    })

    const uut = new Linkscanner(options)
    uut.write(new URL('/testpage', baseUrl).toString())
    uut.end()

    // act
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('localhost')
    expect(result[0].url.toString()).toEqual('http://localhost:9876/testpage')
  })

  it('recurses into other URLs found on page', async () => {
    app.get('/testpage', (req, res) => {
      res.type('html')
      res.send(`<html><body><a href="/otherpage">Other Page</a></body></html>`)
    })
    app.get('/otherpage', (req, res) => {
      res.type('html')
      res.send(`<html><body></body></html>`)
    })

    const uut = new Linkscanner(options)
    uut.write(new URL('/testpage', baseUrl).toString())
    uut.end()

    // act
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('localhost')
    expect(result[0].url.toString()).toEqual('http://localhost:9876/testpage')

    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('localhost')
    expect(result[1].url.toString()).toEqual('http://localhost:9876/otherpage')
  })
})
