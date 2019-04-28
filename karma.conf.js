const webpackConfig = require("./webpack.test");

module.exports = function(config) {
  config.set({
    basePath: "",
    frameworks: ["mocha", "chai"],
    failOnEmptyTestSuite: false,
    plugins: [
      "karma-chai",
      "karma-chrome-launcher",
      "karma-mocha",
      "karma-mocha-reporter",
      "karma-sourcemap-loader",
      "karma-webpack"
    ],
    files: [
      "node_modules/cross-fetch/dist/cross-fetch.js",
      "node_modules/fetch-mock/dist/es5/client-bundle.js",
      "src/**/*.test.ts"
    ],
    exclude: [],
    webpack: webpackConfig,
    preprocessors: {
      "**/*.ts": ["webpack", "sourcemap"]
    },
    mime: { "text/x-typescript": ["ts", "tsx"] },
    reporters: ["mocha"],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ["ChromeDebugging"],
    singleRun: true,
    customLaunchers: {
      ChromeDebugging: {
        base: "ChromeHeadless",
        flags: ["--remote-debugging-port=9333", "--no-sandbox"]
      }
    }
  });
};
