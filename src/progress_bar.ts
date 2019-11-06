import { throttle } from 'async-toolbox'
import { Writable } from 'stream'

import chalk, { Chalk } from 'chalk'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
import { assign, isomorphicPerformance, Options } from './util'

export interface ProgressBarOptions {
  logger: Logger
  /** Set this if debug logging is enabled. */
  debug?: boolean
  /** Width of one line of output terminal.  Undefined to use process.stdout.columns */
  width?: number

  /** The expected total amount of URLs.  Set this if using -r0 with a fixed URL list. */
  total?: number

  color: boolean | number,
}

interface ProgressBarState {
  currentPause: number | undefined
  pauses: Array<{ start: number, end: number }>
  checked: Set<string>
  all: Set<string>
  inProgress: Array<{ url: string, start: number }>
  latest?: { url: string, start: number, end?: number, status?: number | string }
  isRendered: boolean
  start?: number
  sourceClosed: boolean
}

export class ProgressBar extends Writable implements Logger {
  private readonly _options: ProgressBarOptions
  private readonly _chalk: Chalk

  private readonly state: ProgressBarState = {
    checked: new Set<string>(),
    all: new Set<string>(),
    inProgress: [],
    isRendered: false,
    currentPause: undefined,
    sourceClosed: false,
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
      resultsStream.on('fetchError', this._onFetchError)
      resultsStream.on('response', this._onResponse)
      resultsStream.on('suspend', this._onPause)
      resultsStream.on('unsuspend', this._onResume)
      resultsStream.on('EOS', this._onEOS)
      this.state.start = isomorphicPerformance.now()
    })

    this.render = throttle(this.render.bind(this), 100)
  }

  public _write = (chunk: Result, encoding: string, cb: () => void) => {
    if (chunk.type != 'skip') {
      this._onResult(chunk)
    }
    cb()
  }

  public _final(cb: () => void) {
    this.clear()
    cb()
  }

  public async render() {
    this._render()
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
    this._render()
  }

  public debug(message?: any, ...optionalParams: any[]): void {
    if (this._options.debug) {
      this.clear()
    }

    this._options.logger.debug(message, ...optionalParams)

    if (this._options.debug) {
      this._render()
    }
  }

  public error(message?: any, ...optionalParams: any[]): void {
    this.clear()
    this._options.logger.error('\x1b[2K' + message, ...optionalParams)
    this._render()
  }

  private _render = async () => {
    const {checked, latest, currentPause, all} = this.state
    const { logger } = this._options
    const width = Math.min(this._options.width || process.stderr.columns || 100, 100)
    const total = this.calculateTotal()
    const pct = total && Math.min(1.0, checked.size / total)

    // tslint:disable-next-line: no-shadowed-variable
    const chalk = this._chalk

    const elapsed = this.elapsed()
    if (!elapsed) {
      // nothing to do
      this.clear()
      return
    }

    let elapsedStr = formatElapsed(elapsed) + ' '
    let numChecked = ` ${checked.size.toString().padStart(4)} / ` +
      (total ? total : `${all.size}+`).toString().padStart(4)
    let percentage = ` (${(pct ? Math.floor(pct * 100).toString() : '?').padStart(3)}%)`

    const topLineParts = [
      elapsedStr,
      numChecked,
      percentage,
    ]

    const barTotalWidth = width - (topLineParts.reduce((sum, part) => sum + part.length, 0)) - 2
    const barSize = pct ? Math.floor(pct * barTotalWidth) : Math.floor(0.1 * barTotalWidth)
    let bar = `${'\u2588'.repeat(barSize)}${' '.repeat(barTotalWidth - barSize)}|`

    elapsedStr = chalk.cyan(elapsedStr)
    bar =
      this.state.currentPause ? chalk.gray(bar) :
        pct ? chalk.green(bar) :
          chalk.dim.green(bar)
    numChecked = chalk.cyan(numChecked)
    percentage = chalk.cyan(percentage)

    topLineParts.splice(1, 0, bar)

    let latestLine = currentPause != undefined &&
      `paused ${((isomorphicPerformance.now() - currentPause) / 1000).toFixed(0).padStart(4)}s`
    if (!latestLine) {
      if (latest) {
        const end = latest.end || isomorphicPerformance.now()
        latestLine = `${((end - latest.start) / 1000).toFixed(1).padStart(3)}s` +
          ` ${(latest.status || '   ')} ${latest.url}`

        if (this.state.inProgress.length > 0) {
          // next render show the in-progress
          this.state.latest = undefined
        }
      } else if (this.state.inProgress.length > 0) {
        const ip = this.state.inProgress[0]
        latestLine = `${((isomorphicPerformance.now() - ip.start) / 1000).toFixed(1).padStart(3)}s` +
          `     ${ip.url}`
      }
    }

    const msg = topLineParts.join('')
    // log a cleared blank line
    logger.error('\x1b[2k')
    // clear the current line before writing the msg
    logger.error('\x1b[2K' + msg)
    // write the latest hit line
    logger.error('\x1b[2K' + chalk.dim.cyan((latestLine || '').substr(0, width)) +
      // go up three lines after
      '\x1b[F\x1b[F\x1b[F')

    this.state.isRendered = true
  }

  private _onUrl = ({ url }: { url: URL }) => {
    this.state.all.add(url.toString())
    this.render()
  }

  private _onFetch = (req: Request) => {
    this.state.inProgress.push({
      url: req.url,
      start: isomorphicPerformance.now(),
    })
    this.render()
  }

  private _onFetchError = (req: { url: string }) => {
    const idx = this.state.inProgress.findIndex((ip) => req.url == ip.url)
    if (idx < 0) {
      return
    }
    const [inProgress] = this.state.inProgress.splice(idx, 1)

    this.state.latest = {
      ...inProgress,
      url: req.url,
      status: 'err',
      end: isomorphicPerformance.now(),
    }
    this.render()
  }

  private _onResponse = (resp: Response, req: Request) => {
    const idx = this.state.inProgress.findIndex((ip) => req.url == ip.url)
    if (idx < 0) {
      return
    }
    const [inProgress] = this.state.inProgress.splice(idx, 1)

    this.state.latest = {
      ...inProgress,
      url: resp.url || req.url,
      status: resp.status,
      end: isomorphicPerformance.now(),
    }
    this.render()
  }

  private _onResult = (chunk: Result) => {
    if (chunk.type == 'error') {
      this._onFetchError({ url: chunk.url.toString() })
    }

    if (chunk.parent && [301, 302, 307].includes(chunk.parent.status)) {
      // redirects only count as one. Since the parent already came through we
      // don't need to check this.
      return
    }

    this.state.all.add(chunk.url.toString())
    this.state.checked.add(chunk.url.toString())
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

  private _onEOS = () => {
    this.state.sourceClosed = true
  }

  private calculateTotal(): number | undefined {
    const {total} = this._options
    const {all, sourceClosed} = this.state
    if (total) {
      return Math.max(total, all.size)
    }
    if (!sourceClosed) {
      // we don't know yet
      return
    }
    // TODO: determine when all.size stabilizes
    return all.size
  }

  private elapsed(): number | undefined {
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

    return elapsed
  }

}

// tslint:disable: variable-name
const Second = 1000
const Minute = 60 * Second
const Hour = 60 * Minute
// tslint:enable: variable-name

function formatElapsed(elapsed: number) {
  const ms = elapsed % 1000
  elapsed = (elapsed - ms) / 1000
  const secs = elapsed % 60
  elapsed = (elapsed - secs) / 60
  const mins = elapsed % 60
  const hrs = (elapsed - mins) / 60

  if (mins <= 0) {
    return `${(secs).toFixed(0).padStart(4)}s`
  }
  if (hrs <= 0) {
    return `${(mins).toFixed(0).padStart(4)}m${secs.toFixed(0).padStart(2, '0')}s`
  }
  return `${(hrs).toFixed(0).padStart(4)}h${mins.toFixed(0).padStart(2, '0')}m${secs.toFixed(0).padStart(2, '0')}s`
}
