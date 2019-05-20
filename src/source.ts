import {toReadable} from 'async-toolbox/stream'
import { Args } from '.'

export function loadSource(args: Args) {
  return toReadable(Array.from(args.source))
}
