const path = require('path');

module.exports = {
    devtool: 'source-map',
    entry: {
        app: path.resolve(__dirname, 'app.tsx'),
        activities: path.resolve(__dirname, 'activities/activities.tsx'),
        camping: path.resolve(__dirname, 'camping/camping.tsx')
    },
    mode: "development",
    output: {
        filename: "[name]-bundle.js",
        path: path.resolve(__dirname, 'dist')
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'ts-loader'
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|gif|mp4)$/i,
                type: 'asset/inline'
            }
        ]
    }
}