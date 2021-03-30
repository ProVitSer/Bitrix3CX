/* eslint-disable no-unused-expressions */
"use strict"; // eslint-disable-line

const namiLib = require('nami');
const util = require('util');
const moment = require('moment');
const express = require('express');
const bodyParser = require('body-parser');
const searchInDB = require('./src/db3cx');
const Bitrix = require('./src/bitrix');

const app = express();
const nami = require('./models/ami');
const logger = require('./logger/logger');
const status = require('./config/status');
const config = require('./config/config');
const user = require('./config/user');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const bitrix = new Bitrix();
const BITRIXADMIN = '2255';
const INCOMINGID = '2';
const OUTGOINGID = '1';

const registerCallID = [];

const sendAmiCall = (bitrixId, localExtension, outgoingNumber) => {
    logger.info(bitrixId, localExtension, outgoingNumber);
    const action = new namiLib.Actions.Originate();
    // action.channel = `SIP/3CX/${localExtension}`;
    action.channel = `local/${localExtension}:${outgoingNumber}@to-3cx`;
    action.callerid = outgoingNumber;
    action.priority = '1';
    action.timeout = '20000';
    action.context = 'RouteToLocalWebHookCall';
    // action.exten = `${outgoingNumber.slice(1)}`;
    action.exten = outgoingNumber;
    action.variable = `var1=${outgoingNumber},var2=${localExtension}`;
    action.async = 'yes';
    logger.info(action);
    nami.send(action, (response) => {
        logger.info(` ---- Response: ${util.inspect(response)}`);
    });
};

app.use((req, res, next) => {
    logger.info(`Получили запрос ${req.body}`);
    next();
});

app.post('/originate*', async(req, res) => {
    logger.info(req);
    if (req.body.event == 'ONEXTERNALCALLSTART' && req.body.auth.application_token == config.bitrix.token) {
        res.status(200).end();
        const bitrixUserID = req.body.data.USER_ID;
        const outgoingNumber = req.body.data.PHONE_NUMBER;
        const bitrixId = req.body.data.CALL_ID;
        logger.info(bitrixUserID, outgoingNumber, bitrixId);
        sendAmiCall(bitrixId, user[bitrixUserID], outgoingNumber);
    } else {
        res.status(503).end();
    }
});

async function createTaskOnMissedCall(isAnswered, bitrixUserId, incomingNumber) {
    try {
        if (isAnswered == '304') {
            const resultCreateTask = await bitrix.createTask(bitrixUserId, incomingNumber);
            logger.info(`Создана задача  ${util.inspect(resultCreateTask)}`);
            setTimeout(bitrix.taskStatus.bind(bitrix), 180000, resultCreateTask.task.id);
            return;
        }
        return;
    } catch (e) {
        logger.error(`Ошибка создание задачи по пропущенному вызову ${util.inspect(e)}`);
    }
}

async function sendInfoToBitrix(bitrixUserID, incomingNumber, bitrixIDTypeCall, timeStartCall, billsec, isAnswered, recordingUrl) {
    try {
        // let incomingNumberMod = `+${incomingNumber}`;
        const incomingNumberMod = `${incomingNumber}`;
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixUserID, incomingNumberMod, bitrixIDTypeCall, timeStartCall);
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultFinishCall = await bitrix.externalCallFinish(resultRegisterCall, bitrixUserID, billsec, isAnswered, bitrixIDTypeCall, recordingUrl);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        // createTaskOnMissedCall(isAnswered, bitrixUserID, incomingNumber);
    } catch (e) {
        logger.error(`Ошибка регистрации в Битрикс локального вызова  ${e}`);
    }
}

async function sendInfoByOutgoingCall({
    exten,
    unicueid,
    extensionNumber,
    billsec,
    disposition,
    recording,
    start,
    end,
}) {
    try {
        logger.info(`sendInfoByOutgoingCall ${exten}, ${unicueid}, ${extensionNumber}, ${billsec}, ${disposition}, ${recording}, ${start},${end}`);
        sendInfoToBitrix(user[extensionNumber], exten, OUTGOINGID, start, billsec, status[disposition], recording);
        return;
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову ${e}`);
    }
}

// Регистрация вызова для входящего вызова с сохранение информации по CALLID Битрикс
async function registerCallIdInBitrixAndShow({ unicueid, incomingNumber }) {
    try {
        // let incomingNumberMod = `+${incomingNumber}`;
        const incomingNumberMod = `${incomingNumber}`;
        const resultRegisterCall = await bitrix.externalCallRegister(BITRIXADMIN, incomingNumberMod, INCOMINGID, moment(new Date()).format('YYYY-MM-DD H:mm:ss'));
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultShow = await bitrix.externalCallShow(resultRegisterCall.CALL_ID);
        logger.info(`Получен результат поднятия карточки ${util.inspect(resultShow)}`);
        setTimeout(bitrix.externalCallHide.bind(bitrix), 20000, resultRegisterCall.CALL_ID);
        registerCallID[unicueid] = { registerBitrixCallID: resultRegisterCall.CALL_ID };
        logger.info(`Сопоставление вызовов ${registerCallID}`);
    } catch (e) {
        logger.error(`Ошибка регистрации входящего вызова в Битрикс  ${e}`);
    }
}

// Переделанная фукнция для входящего вызова. Отправка завершающей информации в Битрикс с ранее зарегистрированным вызовом
async function sendInfoFinishCallToBitrix(bitrixUserID, incomingNumber, bitrixIDTypeCall, timeStartCall, billsec, isAnswered, recordingUrl, unicueid) {
    try {
        // let incomingNumberMod = `+${incomingNumber}`;
        const incomingNumberMod = `${incomingNumber}`;
        const resultFinishCall = await bitrix.externalCallFinish(registerCallID[unicueid].registerBitrixCallID, bitrixUserID, billsec, isAnswered, bitrixIDTypeCall, recordingUrl);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        createTaskOnMissedCall(isAnswered, bitrixUserID, incomingNumberMod);
    } catch (e) {
        logger.error(`Ошибка регистрации в Битрикс локального вызова  ${e}`);
    }
}

// Изменение в передачи данных
async function sendInfoByIncomingCall({
    unicueid,
    incomingNumber,
    billsec,
    disposition,
    recording,
    start,
    end,
}) {
    try {
        // let incomingNumberMod = `+${incomingNumber}`;
        const incomingNumberMod = `${incomingNumber}`;
        logger.info(unicueid, incomingNumberMod, billsec, disposition, recording, start, end);
        const first3CXId = await searchInDB.searchFirstIncomingId(incomingNumber);
        const callId = await searchInDB.searchIncomingCallId(first3CXId[0].id);
        const end3CXId = await searchInDB.searchEndIncomingId(callId[0].call_id);
        const callInfo = await searchInDB.searchCallInfo(callId[0].call_id);
        const lastCallUser = await searchInDB.searchLastUserRing(end3CXId[0].info_id);
        const isAnswered = callInfo[0].is_answered ? '200' : '304'; // Проверка отвечен вызов или нет

        if (user[lastCallUser[0].dn] != undefined) {
            sendInfoFinishCallToBitrix(user[lastCallUser[0].dn], incomingNumberMod, INCOMINGID, start, billsec, isAnswered, recording, unicueid);
        } else {
            sendInfoFinishCallToBitrix(BITRIXADMIN, incomingNumberMod, INCOMINGID, start, billsec, isAnswered, recording, unicueid);
        }
    } catch (e) {
        logger.error(`Ошибка по входящему вызову ${e}`);
    }
}

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'outbound-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящие вызов на Asterisk ${event.appdata}`);
        const phoneEvent = JSON.parse(event.appdata);
        sendInfoByOutgoingCall(phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'incoming-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился входящий вызов на Asterisk ${event.appdata}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByIncomingCall, 60000, phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'outbound-call-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился входящий вызов на Asterisk ${event.appdata}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByOutgoingCall, 20000, phoneEvent);
    }
});

// Новый евент с информацие по уникальному ID и номеру, для регистрации вызова и поднятие карточки
nami.on('namiEventNewexten', (event) => {
    if (event.context == 'operator-in' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Входящий звнок на Asterisk ${event.appdata}`);
        const phoneEvent = JSON.parse(event.appdata);
        registerCallIdInBitrixAndShow(phoneEvent);
    }
});

app.listen(process.env.PORT || 3000, () => {
    logger.info('Сервер готов');
});