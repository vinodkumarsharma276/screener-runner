const ngrokLauncher = require('screener-ngrok');
const Promise = require('bluebird');
const url = require('url');
const Saucelabs = require('saucelabs').default;

let sauceConnection;

exports.connect = function({ ngrok, sauce }, tries = 0) {
  if (sauce) {
    const account = new Saucelabs({
      user: sauce.username,
      key: sauce.accessKey,
    });
    const scOptions = {
      tunnelName: sauce.tunnelIdentifier,
      logfile: `${process.cwd()}/sauce-connect.log`,
      scVersion: process.env.SAUCE_CONNECT_VERSION || sauce.scVersion || '4.7.1',
    };
    return account
      .startSauceConnect(scOptions)
      .then((tunnel) => {
        console.log(`Sauce Connect ready (${scOptions.scVersion})`);
        sauceConnection = tunnel;
      })
      .catch((err) => {
        if (tries < 2) {
          // on error wait and retry
          return Promise.delay(1000).then(() => {
            return exports.connect({ sauce }, tries + 1);
          });
        }
        throw err;
      });
  }

  if (ngrok) {
    var { host, token } = ngrok;
    if (!token) {
      return Promise.reject(new Error('No Tunnel Token'));
    }
    var href = /^https?:\/\//.test(host) ? host : 'http://' + host;
    var urlObj = url.parse(href);
    var options = {
      bind_tls: true,
      authtoken: token
    };
    // https:
    if (/^https/.test(urlObj.protocol)) {
      options.addr = 'https://' + urlObj.hostname;
      if (urlObj.port) {
        options.addr += ':' + urlObj.port;
      }
      options.host_header = 'rewrite';
    } else { // http:
      var port = urlObj.port || 80;
      options.addr = urlObj.hostname + ':' + port;
      options.host_header = urlObj.hostname;
      if (port !== 80) {
        // include port in host header when not default port 80
        options.host_header += ':' + port;
      }
    }
    var connect = Promise.promisify(ngrokLauncher.connect);
    return connect(options)
      .then(tunnelUrl => {
        var urlObj = url.parse(tunnelUrl);
        console.log('Connected private encrypted tunnel to ' + host + ' (' + urlObj.host.split('.')[0] + ')');
        return urlObj.host;
      })
      .catch(ex => {
        if (tries < 30) {
          // on error, wait and retry
          return Promise.delay(1000).then(() =>
            exports.connect({ ngrok }, tries + 1)
          );
        }
        throw ex;
      });
  }
};

exports.transformUrl = function(origUrl, host, tunnelHost) {
  var origUrlObj = url.parse(origUrl);
  var hostUrlObj = url.parse(/^https?:\/\//.test(host) ? host : 'http://' + host);
  var newUrl = origUrl;
  if (origUrlObj.host.toLowerCase() === hostUrlObj.host.toLowerCase() && origUrlObj.protocol === hostUrlObj.protocol) {
    origUrlObj.protocol = 'https';
    origUrlObj.host = tunnelHost;
    newUrl = url.format(origUrlObj);
  }
  return newUrl;
};

exports.disconnect = function() {
  if(sauceConnection)
    return sauceConnection.close();
  else{
    ngrokLauncher.disconnect();
    return Promise.resolve();
  }
};
