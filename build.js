const rewire = require('rewire');
const defaults = rewire('react-scripts/scripts/build.js');
const config = defaults.__get__('config');

config.resolve.fallback = {
    stream: require.resolve('stream-browserify'),
};
