import { Writable } from 'stream'

import chalk, { Chalk } from 'chalk'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
import { assign, isomorphicPerformance, Options } from './util'

export interface ProgressBarOptions {
  logger: Logger
  /** Width of one line of output terminal.  Undefined to use process.stdout.columns */
  width?: number

  color: boolean | number,
}

interface ProgressBarState {
  currentPause: number | undefined
  pauses: Array<{ start: number, end: number }>
  checked: Set<string>
  all: Set<string>
  latest?: string
  isRendered: boolean
  start?: number
}

export class ProgressBar extends Writable implements Logger {
  private readonly _options: ProgressBarOptions
  private readonly _chalk: Chalk

  private readonly state: ProgressBarState = {
    checked: new Set<string>(),
    all: new Set<string>(),
    isRendered: false,
    currentPause: undefined,
    pauses: [],
  }

  constructor(options?: Options<ProgressBarOptions>) {
    super({
      objectMode: true,
      highWaterMark: 0,
    })
    this._options = assign({
      logger: defaultLogger,
      color: (typeof process != 'undefined' && require('supports-color').stderr.level) || false,
    }, options)

    this._chalk = new chalk.constructor({
      enabled: !!this._options.color,
      level: typeof(this._options.color) == 'boolean' ? 1 : this._options.color,
    })

    this.on('pipe', (resultsStream) => {
      resultsStream.on('url', this._onUrl)
      resultsStream.on('fetch', this._onFetch)
      resultsStream.on('response', this._onResponse)
      resultsStream.on('suspend', this._onPause)
      resultsStream.on('unsuspend', this._onResume)
      this.state.start = isomorphicPerformance.now()
    })
  }

  public _write = (chunk: Result, encoding: string, cb: () => void) => {
    this.state.all.add(chunk.url.toString())
    this.state.checked.add(chunk.url.toString())
    this.render()
    cb()
  }

  public _final(cb: () => void) {
    this.clear()
    cb()
  }

  public render = async () => {
    const {checked, all, latest, currentPause} = this.state
    const { logger } = this._options
    const width = Math.min(this._options.width || process.stderr.columns || 100, 100)
    const pct = Math.min(1.0, checked.size / all.size)

    // tslint:disable-next-line: no-shadowed-variable
    const chalk = this._chalk

    let elapsed = this.elapsed()
    if (!elapsed) {
      // nothing to do
      this.clear()
      return
    }

    let numChecked = ` ${checked.size.toString().padStart(4)} / ${all.size.toString().padStart(4)}`
    let percentage = ` (${Math.floor(pct * 100).toString().padStart(3)}%)`

    const topLineParts = [
      elapsed,
      numChecked,
      percentage,
    ]

    const barTotalWidth = width - (topLineParts.reduce((sum, part) => sum + part.length, 0)) - 2
    const barSize = Math.floor(pct * barTotalWidth)
    let bar = `${'\u2588'.repeat(barSize)}${' '.repeat(barTotalWidth - barSize)}|`

    elapsed = chalk.cyan(elapsed)
    bar = this.state.currentPause ? chalk.gray(bar) : chalk.green(bar)
    numChecked = chalk.cyan(numChecked)
    percentage = chalk.cyan(percentage)

    topLineParts.splice(1, 0, bar)

    const latestLine = currentPause === undefined ?
      (latest || '') :
      `paused ${((isomorphicPerformance.now() - currentPause) / 1000).toFixed(0).padStart(4)}s`

    const msg = topLineParts.join('')
    // log a cleared blank line
    logger.error('\x1b[2k')
    // clear the current line before writing the msg
    logger.error('\x1b[2K' + msg)
    // write the latest hit line
    logger.error('\x1b[2K' + chalk.dim.cyan((latestLine).substr(0, width)) +
      // go up three lines after
      '\x1b[F\x1b[F\x1b[F')

    this.state.isRendered = true
  }

  public clear() {
    if (!this.state.isRendered) {
      return
    }

    const { logger } = this._options
    logger.error('\x1b[2K\n\x1b[2K\n\x1b[2K\x1b[F\x1b[F\x1b[F')
  }

  public log(message?: any, ...optionalParams: any[]): void {
    this.clear()
    this._options.logger.log(message, ...optionalParams)
    this.render()
  }

  public debug(message?: any, ...optionalParams: any[]): void {
    this.clear()
    this._options.logger.debug(message, ...optionalParams)
    this.render()
  }

  public error(message?: any, ...optionalParams: any[]): void {
    this._options.logger.error('\x1b[2K' + message, ...optionalParams)
    this.render()
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

  private _onPause = () => {
    if (this.state.currentPause) {
      return
    }

    this.state.currentPause = isomorphicPerformance.now()
    this.render()
  }

  private _onResume = () => {
    if (!this.state.currentPause) {
      return
    }

    this.state.pauses.push({
      start: this.state.currentPause,
      end: isomorphicPerformance.now(),
    })
    this.state.currentPause = undefined
    this.render()
  }

  private elapsed(): string | undefined {
    if (!this.state.start) {
      return
    }
    // if paused, don't advance the elapsed clock
    const now = this.state.currentPause === undefined ?
      isomorphicPerformance.now() :
      this.state.currentPause

    let elapsed = now - this.state.start

    // remove all the pauses from the elapsed clock
    this.state.pauses.forEach(({start, end}) => {
      const pauseLength = end - start
      elapsed -= pauseLength
    })

    return `${(elapsed / 1000).toFixed(0).padStart(4)}s `
  }

}
