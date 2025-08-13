/**
 * WEBPACK PRODUCTION CONFIGURATION
 * Configuração robusta e estável para produção
 */

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    mode: 'production',
    devtool: false,
    
    entry: {
        'app': './src/frontend/js/dashboard.js',
        'analytics': './src/frontend/js/tenant-business-analytics.js',
        'super-admin': './src/frontend/js/super-admin-dashboard.js'
    },
    
    output: {
        path: path.resolve(__dirname, 'src/frontend/dist/js'),
        filename: '[name].min.js',
        clean: true,
        publicPath: '/dist/js/'
    },
    
    resolve: {
        extensions: ['.js']
    },
    
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                        drop_debugger: true,
                        pure_funcs: ['console.log', 'console.info', 'console.debug']
                    },
                    mangle: {
                        safari10: true
                    },
                    format: {
                        comments: false
                    }
                },
                extractComments: false,
                parallel: true
            })
        ],
        
        splitChunks: {
            chunks: 'all',
            minSize: 10000,
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: 10
                },
                common: {
                    name: 'common',
                    minChunks: 2,
                    priority: 5,
                    reuseExistingChunk: true
                }
            }
        }
    },
    
    performance: {
        hints: 'warning',
        maxEntrypointSize: 250000,
        maxAssetSize: 250000
    },
    
    stats: {
        all: false,
        modules: true,
        errors: true,
        warnings: true,
        moduleTrace: true,
        errorDetails: true,
        colors: true,
        assets: true,
        assetsSort: '!size',
        builtAt: true,
        env: true,
        version: true
    }
};