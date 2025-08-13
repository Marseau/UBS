/**
 * WEBPACK BUILD OPTIMIZATION CONFIGURATION
 * Target: 965KB → <300KB (70% reduction)
 * 
 * Features:
 * - JavaScript/CSS minification
 * - Bundle splitting and tree-shaking
 * - Gzip/Brotli compression
 * - Cache busting
 * - Asset optimization
 */

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';
const enableAnalyzer = process.env.ANALYZE === 'true';

module.exports = {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    
    // Multiple entry points for different bundles
    entry: {
        // Core application bundle
        'app': './src/frontend/js/dashboard.js',
        
        // Widget system bundle
        'widgets': [
            './src/frontend/js/widgets/dashboard-widget-system.js',
            './src/frontend/js/widgets/doughnut-chart-widget.js',
            './src/frontend/js/widgets/stat-card-widget.js',
            './src/frontend/js/widgets/heatmap-widget.js',
            './src/frontend/js/widgets/conversations-panel-widget.js'
        ],
        
        // Business analytics bundle
        'analytics': './src/frontend/js/tenant-business-analytics.js',
        
        // Super admin bundle
        'super-admin': './src/frontend/js/super-admin-dashboard.js',
        
        // Common utilities bundle
        'utils': [
            './src/frontend/js/utils/common-utils.js',
            './src/frontend/js/utils/component-versioning.js',
            './src/frontend/js/utils/keyboard-navigation.js',
            './src/frontend/js/utils/secure-auth.js'
        ],
        
        // Vendor bundle (third-party libraries)
        'vendor': [
            // Chart.js and Bootstrap are loaded via CDN
            './src/frontend/js/error-handler.js',
            './src/frontend/js/auth-guard.js'
        ]
    },
    
    output: {
        path: path.resolve(__dirname, 'src/frontend/dist'),
        filename: isProduction ? '[name].[contenthash:8].js' : '[name].js',
        chunkFilename: isProduction ? '[name].[contenthash:8].chunk.js' : '[name].chunk.js',
        clean: true, // Clean dist folder before each build
        publicPath: '/dist/'
    },
    
    module: {
        rules: [
            // JavaScript processing
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['> 1%', 'last 2 versions', 'not ie <= 11']
                                },
                                modules: false, // Keep ES6 modules for tree-shaking
                                useBuiltIns: 'usage',
                                corejs: 3
                            }]
                        ],
                        plugins: [
                            '@babel/plugin-syntax-dynamic-import'
                        ]
                    }
                }
            },
            
            // CSS processing
            {
                test: /\.css$/,
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            importLoaders: 1,
                            sourceMap: !isProduction
                        }
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: [
                                    ['autoprefixer'],
                                    ...(isProduction ? [['cssnano', { preset: 'default' }]] : [])
                                ]
                            }
                        }
                    }
                ]
            },
            
            // Image optimization
            {
                test: /\.(png|jpe?g|gif|svg|webp)$/i,
                type: 'asset',
                parser: {
                    dataUrlCondition: {
                        maxSize: 8 * 1024 // 8kb - inline small images
                    }
                },
                generator: {
                    filename: 'images/[name].[contenthash:8][ext]'
                },
                use: isProduction ? [{
                    loader: 'image-webpack-loader',
                    options: {
                        mozjpeg: { progressive: true, quality: 80 },
                        optipng: { enabled: true },
                        pngquant: { quality: [0.6, 0.8] },
                        gifsicle: { interlaced: false },
                        webp: { quality: 80 }
                    }
                }] : []
            },
            
            // Font handling
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'fonts/[name].[contenthash:8][ext]'
                }
            }
        ]
    },
    
    optimization: {
        minimize: isProduction,
        minimizer: [
            // JavaScript minification
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: isProduction, // Remove console.log in production
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
                extractComments: false
            }),
            
            // CSS minification
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: ['default', {
                        discardComments: { removeAll: true }
                    }]
                }
            })
        ],
        
        // Bundle splitting strategy
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                // Vendor libraries
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: 20
                },
                
                // Common utilities used across multiple entries
                common: {
                    name: 'common',
                    minChunks: 2,
                    chunks: 'all',
                    priority: 10,
                    reuseExistingChunk: true
                },
                
                // Widget system (large and reusable)
                widgets: {
                    test: /[\\/]widgets[\\/]/,
                    name: 'widgets-chunk',
                    chunks: 'all',
                    priority: 15
                }
            }
        },
        
        // Runtime chunk for better caching
        runtimeChunk: 'single'
    },
    
    plugins: [
        // Extract CSS into separate files
        new MiniCssExtractPlugin({
            filename: isProduction ? '[name].[contenthash:8].css' : '[name].css',
            chunkFilename: isProduction ? '[name].[contenthash:8].css' : '[name].css'
        }),
        
        // Gzip compression
        ...(isProduction ? [
            new CompressionPlugin({
                algorithm: 'gzip',
                test: /\.(js|css|html|svg)$/,
                threshold: 8192, // Only compress files larger than 8kb
                minRatio: 0.8
            }),
            
            // Brotli compression (better than gzip)
            new CompressionPlugin({
                filename: '[path][base].br',
                algorithm: 'brotliCompress',
                test: /\.(js|css|html|svg)$/,
                compressionOptions: {
                    level: 11
                },
                threshold: 8192,
                minRatio: 0.8
            })
        ] : []),
        
        // Copy static assets that don't need processing
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src/frontend/**/*.html',
                    to: '[name][ext]',
                    filter: (resourcePath) => {
                        // Don't copy HTML files that will be processed by HtmlWebpackPlugin
                        const processedFiles = [
                            'dashboard-standardized.html',
                            'tenant-business-analytics.html',
                            'super-admin-dashboard.html'
                        ];
                        return !processedFiles.some(file => resourcePath.includes(file));
                    }
                }
            ]
        }),
        
        // Process main HTML files and inject optimized bundles
        new HtmlWebpackPlugin({
            template: 'src/frontend/dashboard-standardized.html',
            filename: 'dashboard-standardized.html',
            chunks: ['runtime', 'vendors', 'common', 'widgets-chunk', 'app'],
            minify: isProduction ? {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true
            } : false
        }),
        
        new HtmlWebpackPlugin({
            template: 'src/frontend/tenant-business-analytics.html',
            filename: 'tenant-business-analytics.html',
            chunks: ['runtime', 'vendors', 'common', 'widgets-chunk', 'analytics'],
            minify: isProduction
        }),
        
        // Bundle analyzer (only when ANALYZE=true)
        ...(enableAnalyzer ? [
            new BundleAnalyzerPlugin({
                analyzerMode: 'static',
                openAnalyzer: false,
                reportFilename: 'bundle-analysis.html'
            })
        ] : [])
    ],
    
    // Development server configuration
    devServer: {
        static: {
            directory: path.join(__dirname, 'src/frontend')
        },
        compress: true,
        port: 3001,
        hot: true,
        open: false
    },
    
    // Resolve configuration
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src/frontend/js'),
            '@widgets': path.resolve(__dirname, 'src/frontend/js/widgets'),
            '@utils': path.resolve(__dirname, 'src/frontend/js/utils'),
            '@css': path.resolve(__dirname, 'src/frontend/css')
        },
        extensions: ['.js', '.css']
    },
    
    // Performance budgets
    performance: {
        maxAssetSize: 250000, // 250KB per asset
        maxEntrypointSize: 300000, // 300KB per entry point
        hints: isProduction ? 'error' : 'warning'
    }
};