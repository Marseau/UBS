/**
 * WEBPACK SIMPLE CONFIGURATION
 * Configuração simplificada para debugging
 */

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'eval-source-map',
    
    // Entry points simplificados
    entry: {
        'app': './src/frontend/js/dashboard.js',
        'analytics': './src/frontend/js/tenant-business-analytics.js',
        'super-admin': './src/frontend/js/super-admin-dashboard.js'
    },
    
    output: {
        path: path.resolve(__dirname, 'src/frontend/dist'),
        filename: isProduction ? '[name].[contenthash:8].js' : '[name].js',
        clean: true,
        publicPath: '/dist/'
    },
    
    module: {
        rules: [
            // JavaScript with Babel
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        configFile: path.resolve(__dirname, '.babelrc'),
                        cacheDirectory: true,
                        cacheCompression: false
                    }
                }
            },
            
            // CSS processing
            {
                test: /\.css$/,
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
                    'css-loader',
                    ...(isProduction ? ['postcss-loader'] : [])
                ]
            }
        ]
    },
    
    optimization: {
        minimize: isProduction,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: isProduction,
                        drop_debugger: true
                    },
                    mangle: true,
                    format: {
                        comments: false
                    }
                },
                extractComments: false
            }),
            
            ...(isProduction ? [
                new CssMinimizerPlugin()
            ] : [])
        ]
    },
    
    plugins: [
        ...(isProduction ? [
            new MiniCssExtractPlugin({
                filename: '[name].[contenthash:8].css'
            })
        ] : [])
    ],
    
    resolve: {
        extensions: ['.js', '.css']
    }
};