"use strict";
const appConfig = require(`../config/config`),
    namiLib = require(`nami`),
    logger = require(`../logger/logger`);

const namiConfig = {
    host: appConfig.ami.host,
    port: appConfig.ami.port,
    username: appConfig.ami.username,
    secret: appConfig.ami.secret
};

let nami = new namiLib.Nami(namiConfig);

nami.on(`namiConnectionClose`, function(data) {
    logger.error(`Переподключение к AMI ...`);
    setTimeout(function() {
        nami.open();
    }, 5000);
});

nami.on(`namiInvalidPeer`, function(data) {
    logger.error(`Invalid AMI Salute. Not an AMI?`);
    process.exit();
});
nami.on(`namiLoginIncorrect`, function() {
    logger.error(`Некорректный логин или пароль от AMI`);
    process.exit();
});
nami.on('namiConnected', function(event) {
    logger.info(`Подключение к AMI успешно установлено`);
})

nami.logLevel = 0;
nami.open();

module.exports = nami;