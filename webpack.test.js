const webpack = require('webpack');
const path = require('path');
const globby = require('globby');

/*
 * SplitChunksPlugin is enabled by default and replaced
 * deprecated CommonsChunkPlugin. It automatically identifies modules which
 * should be splitted of chunk by heuristics using module duplication count and
 * module category (i. e. node_modules). And splits the chunks…
 *
 * It is safe to remove "splitChunks" from the generated configuration
 * and was added as an educational example.
 *
 * https://webpack.js.org/plugins/split-chunks-plugin/
 *
 */

/*
 * We've enabled UglifyJSPlugin for you! This minifies your app
 * in order to load faster and run less javascript.
 *
 * https://github.com/webpack-contrib/uglifyjs-webpack-plugin
 *
 */

module.exports = {
	entry: globby.sync('src/**/*.test.ts').map((path) => './' + path),
	module: {
		rules: [{
			test: /\.tsx?$/,
			exclude: /node_modules/,
			include: path.resolve(__dirname, 'src'),
			use: [
				{
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env', '@babel/preset-typescript']
					}
				}
			]
		},
		{
			test: /\.js$/,
			exclude: /node_modules/,
			include: path.resolve(__dirname, 'src'),
			use: 'babel-loader',
		}]
	},
	resolve: {
		extensions: ['.ts', '.js', '.json']
	},

	output: {
		chunkFilename: '[name].[chunkhash].js',
		filename: '[name].[chunkhash].js',
		path: path.resolve(__dirname, 'tmp')
	},

	mode: 'development',

	plugins: [
    new webpack.SourceMapDevToolPlugin({
      test: /\.(ts|js|tsx|jsx)($|\?)/i // process .js and .ts files only
    })
  ],

	optimization: {
		splitChunks: {
			cacheGroups: {
				vendors: {
					priority: -10,
					test: /[\\/]node_modules[\\/]/
				}
			},

			chunks: 'async',
			minChunks: 1,
			minSize: 30000,
			name: true
		}
	},

	node: {
		fs: 'empty'
	}
};
