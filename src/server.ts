import express = require('express');
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import webpackDevMiddleware = require("webpack-dev-middleware");
import webpack = require('webpack');

const {PORT, NODE_ENV, HTTPS} = process.env;

const port = PORT || 5555;
const isHttps = HTTPS || false;

class WebServer {
  _httpServer?: http.Server;
  _httpsServer?: https.Server;

  async start() {

    const app = express();
    this._httpServer = new http.Server(app);
    console.log("https: " + isHttps);
    if (isHttps){
      this._httpsServer = https.createServer({
        key: fs.readFileSync('/home/swap/swap.key'),
        cert: fs.readFileSync('/home/swap/swap.cert')
      }, app);
    }

    app.set('case sensitive routing', true);
    app.set('strict routing', true);
    app.set('x-powered-by', false);
    app.set('view engine', 'html');

    if (NODE_ENV === "development") {
      let webpackConfig = require(`../webpack/webpack.development.config.js`);
      app.use(webpackDevMiddleware(webpack(webpackConfig), {publicPath: webpackConfig.output.publicPath}));
    } else {
      app.use(express.static('dist'));
    }

    this._httpServer.listen(1234, () => {
      console.log(`Server listening on http://localhost:${1234}`);
    });

    if (this._httpsServer) {
      this._httpsServer.listen(port, () => {
        console.log(`Server listening on https://localhost:${port}`);
      });
    }
  }
}

new WebServer().start();
