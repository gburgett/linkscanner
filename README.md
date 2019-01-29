# Async Toolbox

[![npm version](https://badge.fury.io/js/async-toolbox.svg)](https://badge.fury.io/js/async-toolbox)
[![Build Status](https://travis-ci.org/gburgett/async-toolbox.svg?branch=master)](https://travis-ci.org/gburgett/async-toolbox)
[![Coverage Status](https://coveralls.io/repos/github/gburgett/async-toolbox/badge.svg?branch=master)](https://coveralls.io/github/gburgett/async-toolbox?branch=master)

This package contains a number of utilities that have been useful for me in developing
with async code in nodejs and the browser.  It contains a number of tools which
you can require as you desire.

## Utilities

`import { wait, Semaphore } from 'async-toolbox'`

* `function wait(ms: number): Promise<void>`  
  Returns a promise which resolves after a given number of milliseconds, using setTimeout.

* `class Semaphore extends EventEmitter`  
    A Semaphore which queues up tasks to be executed once prior tasks are complete.
    Number of concurrent inflight tasks is configurable at initialization.

## Streams

`import * as Stream from 'async-toolbox/stream'`

Augments the base Readable, Writable, and Duplex streams with new capabilities, and provides a couple extra

* `function Stream.toReadable(entries: any[]): Readable`  
  Converts an array of chunks into a readable object stream which can be piped to transforms or writable streams.
* `function Stream.collect(stream: Readable): Promise<any[]>`
  Reads all the chunks of a readable stream and collects them in an array.
* `Writable.writeAsync(chunk: any, encoding?: string): Promise<void>`  
  Writes a chunk to the current write stream, returning a promise that completes when the chunk has actually been written.
* `Readable.readAsync(size?: number): Promise<any>`  
  Reads a chunk from the current write stream, returning a promise that completes when the chunk has actually been read.
* `class Stream.ParallelWritable extends Writable`  
  An extension of a Writable stream which can process chunks in parallel.
* `class Stream.ParallelTransform extends Transform`  
  An extension of a Transform stream which can process chunks in parallel.  Ordering is not preserved, because the individual transformations may complete in any order.

## Events

`import 'async-toolbox/events'`

Augments the EventEmitter class with new capabilities

* `EventEmitter.onceAsync(event: string | symbol): Promise<any[]>`  
  Returns a promise that resolves the next time the emitter emits the given event.  The promise is rejected if the emitter emits 'error'.

## Request

`import {AsyncRequest} 'async-toolbox/request`

Augments the [Request](https://www.npmjs.com/package/request) NPM library
to make the HTTP methods like `get` and `post` use promises.

```ts
const request = AsyncRequest() // to use standard request lib
const request = AsyncRequest(require('request-debug')(require('request'))) // alternate constructor

const resp = await request.get('http://www.google.com')
```
