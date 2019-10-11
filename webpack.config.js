var webpack = require('webpack')
var config = {
  entry: './src/index',
	mode: 'production',
  module: {
    rules: [
      { test: /\.js$/, use: [ 'babel-loader' ], exclude: /node_modules/ }
    ]
  },
  output: {
    library: 'GooseModule',
    libraryTarget: 'umd'
  },
	externals:['react','redux','react-redux','redux-saga','fn-update']
}

 //if (process.env.NODE_ENV === 'production') {
	 //config.optimization = {
		 //minimize: true
	 //}
 //}

module.exports = config

