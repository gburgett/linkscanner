import { throttle } from 'async-toolbox'
import { EventEmitter } from 'events'
import { Writable } from 'stream'

import chalk from 'chalk'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
import { assign, isomorphicPerformance, Options } from './util'

export interface ProgressBarOptions {
  logger: Logger
  /** Width of one line of output terminal.  Undefined to use process.stdout.columns */
  width?: number
}

interface ProgressBarState {
  checked: Set<string>
  all: Set<string>
  latest?: string
  isRendered: boolean
  start?: number
}

export class ProgressBar extends Writable {
  private readonly _options: ProgressBarOptions

  private readonly state: ProgressBarState = {
    checked: new Set<string>(),
    all: new Set<string>(),
    isRendered: false,
  }

  constructor(options?: Options<ProgressBarOptions>) {
    super({
      objectMode: true,
      highWaterMark: 0,
    })
    this._options = assign({
      logger: defaultLogger,
    }, options)

    this.on('pipe', (resultsStream) => {
      resultsStream.on('url', this._onUrl)
      resultsStream.on('fetch', this._onFetch)
      resultsStream.on('response', this._onResponse)
      this.state.start = isomorphicPerformance.now()
    })

    // 60 frames per second
    this.render = throttle(this.render, 16)
  }

  public _write(chunk: Result, encoding: string, cb: () => void) {
    this.state.checked.add(chunk.url.toString())
    this.render()
    cb()
  }

  public async render() {
    const {checked, all, latest, isRendered} = this.state
    const { logger } = this._options
    const width = Math.min(this._options.width || process.stderr.columns || 100, 100)
    const pct = checked.size / all.size
    const elapsed = this.state.start && isomorphicPerformance.now() - this.state.start

    if (!elapsed) {
      // nothing to do
      this.clear()
      return
    }

    const msgParts = [
      `${(elapsed / 1000).toFixed(0).padStart(4)}s `,
      ` ${checked.size.toString().padStart(4)} / ${all.size.toString().padStart(4)}`,
      ` (${Math.floor(pct * 100).toString().padStart(3)}%)`,
    ]

    const barTotalWidth = width - (msgParts.reduce((sum, part) => sum + part.length, 0)) - 1
    const barSize = Math.floor(pct * barTotalWidth)
    msgParts.splice(1, 0,
      `${'\u2588'.repeat(barSize)}${' '.repeat(barTotalWidth - barSize)}|`,
    )

    msgParts[0] = chalk.cyan(msgParts[0])
    msgParts[1] = chalk.green(msgParts[1])
    msgParts[2] = chalk.cyan(msgParts[2])
    msgParts[3] = chalk.cyan(msgParts[3])

    let msg = msgParts.join('')
    // clear the current line
    msg = '\x1b[2K' + msg
    if (isRendered) {
      // go up two lines first
      msg = '\x1b[F\x1b[F' + msg
    }
    logger.error(msg)
    // write the latest hit line
    logger.error(chalk.dim.cyan(latest || ''))

    this.state.isRendered = true
  }

  public clear() {
    if (!this.state.isRendered) {
      return
    }
  }

  private _onUrl = ({ url }: { url: URL }) => {
    this.state.all.add(url.toString())
    this.render()
  }

  private _onFetch = (req: Request) => {
    this.state.latest = `    ${req.url}`
    this.render()
  }

  private _onResponse = (resp: Response, req: Request) => {
    this.state.latest = `${resp.status} ${resp.url || req.url}`
    this.render()
  }

}
