/**
 * POSTCSS CONFIGURATION
 * CSS optimization and processing
 */

module.exports = {
    plugins: [
        // Autoprefixer for browser compatibility
        require('autoprefixer')({
            overrideBrowserslist: [
                '> 1%',
                'last 2 versions',
                'not ie <= 11'
            ]
        }),
        
        // CSS optimization for production
        ...(process.env.NODE_ENV === 'production' ? [
            require('cssnano')({
                preset: ['default', {
                    discardComments: {
                        removeAll: true
                    },
                    normalizeWhitespace: true,
                    mergeLonghand: true,
                    mergeRules: true,
                    minifySelectors: true,
                    minifyParams: true,
                    minifyFontValues: true,
                    convertValues: {
                        length: false // Don't convert px to shorter units
                    }
                }]
            })
        ] : [])
    ]
};