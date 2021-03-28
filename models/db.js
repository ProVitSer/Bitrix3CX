const promise = require('bluebird'),
    util = require('util'),
    initOptions = {
        promiseLib: promise // overriding the default (ES6 Promise);
    },
    config = require(`../config/config`),
    pgp = require('pg-promise')(initOptions);

const cn = {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password
};

const db = pgp(cn);
module.exports = db;