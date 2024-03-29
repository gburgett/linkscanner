import {toReadable} from 'async-toolbox/stream'
import { EOL } from 'os'
import { Transform } from 'stream'
import { Logger } from './logger'

export function loadSource(args: { source: string | string[] }, logger: Logger) {
  // specify '-' to read from stdin
  if (isStdin(args.source) ||
      // or if no URL is given on the command line
      args.source.length == 0 && typeof process != 'undefined') {
    logger.debug('reading URLs from STDIN')
    return process.stdin.pipe(new LineByLineTransform())
  }
  return toReadable(Array.from(args.source))
}

class LineByLineTransform extends Transform {
  private _currentLine: string | null = null

  constructor() {
    super({
      readableObjectMode: true,
      writableObjectMode: false,
    })
  }

  public _transform(chunk: Buffer, encoding: any, cb: (err?: Error) => void) {
    const lines = chunk.toString().split(EOL)
    lines.forEach((line, i) => {
      if (i < lines.length - 1) {
        if (this._currentLine) {
          line = this._currentLine + line
          this._currentLine = null
        }
        this.push(line)
      } else {
        // keep the last line around till the next chunk comes in
        this._currentLine = line
      }
    })
    cb()
  }

  public _flush(cb: (err?: Error) => void) {
    if (this._currentLine) {
      this.push(this._currentLine)
      this._currentLine = null
    }
    cb()
  }
}

function isStdin(source: any) {
  if(source == '-'){
    return true
  }

  if (Array.isArray(source)) {
    return source.length == 1 && source[0] == '-'
  }

  return false
}