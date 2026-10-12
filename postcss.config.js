// postcss.config.js
module.exports = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': 'postcss-nesting',
    tailwindcss: {},
    'postcss-preset-env': {
      features: {
        'nesting-rules': true,
        // No static copy in front of every var() declaration. With no browserslist the
        // defaults include Opera Mini, so the preset wrote one for each of them (27 KB of
        // app.css); a browser without custom properties cannot run the store anyway, and
        // one with them never reads the copy. Counts toward Salla's 1 MB theme limit.
        'custom-properties': false,
      },
    },
  }
}