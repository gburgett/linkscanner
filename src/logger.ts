import chalk from 'chalk'

export interface Logger {
  log: Console['log'],
  debug: Console['debug'],
  error: Console['error']
}

// tslint:disable:no-console
export const defaultLogger = {
  log: console.log,
  // tslint:disable-next-line:no-empty
  debug: () => {},
  error: console.error,
}

export const debugLogger: Logger = {
  log: console.log,
  error: (...args: any[]) => {
    console.error(chalk.red(...args))
  },
  debug: (...args: any[]) => {
    console.error(chalk.dim(...args))
  },
}
