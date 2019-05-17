import yargs from 'yargs'
import Run from '.'

const argv = yargs
  .option('followRedirects', {
    boolean: true,
  }).argv

const defaults = {}

Run({
  ...defaults,
  source: argv._,
  ...argv,
})
  .then(
    () => {
      process.exit(0)
    },
    (ex: any) => {
      // tslint:disable-next-line:no-console
      console.error(ex)
      process.exit(1)
    },
  )
