/* eslint-disable no-unused-expressions */
"use strict"; // eslint-disable-line

const namiLib = require('nami');
const util = require('util');
const moment = require('moment');
const express = require('express');
const bodyParser = require('body-parser');
const searchInDB = require('./src/db3cx');
const db = require('./src/db');
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


const validateNumber = (number) => {
    switch (number.length) {
        case 10:
            return `+7${number}`;
            break;
        case 11:
            return `+7${number.slice(1,11)}`
            break;
        default:
            return number;
            break;
    }

};


const sendAmiCall = (bitrixId, localExtension, outgoingNumber) => {
    logger.info(bitrixId, localExtension, outgoingNumber);
    const action = new namiLib.Actions.Originate();
    // action.channel = `SIP/3CX/${localExtension}`;
    action.channel = `local/${localExtension}:${outgoingNumber}@to-3cx`;
    action.callerid = outgoingNumber;
    action.priority = '1';
    action.timeout = '20000';
    action.context = 'RouteToLocalWebHookCall';
    action.exten = `${outgoingNumber.slice(1)}`;
    //action.exten = outgoingNumber;
    action.variable = `var1=${outgoingNumber},var2=${localExtension},var3=${bitrixId}`;
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
    try {
        logger.info(req);
        if (req.body.event == 'ONEXTERNALCALLSTART' && req.body.auth.application_token == config.bitrix.token) {
            res.status(200).end();
            const resultSearchExtenByID = await db.getExtenByBitrixId(req.body.data.USER_ID);
            //const bitrixUserID = req.body.data.USER_ID;
            const outgoingNumber = req.body.data.PHONE_NUMBER;
            const bitrixId = req.body.data.CALL_ID;
            logger.info(bitrixId, outgoingNumber, bitrixId);
            sendAmiCall(bitrixId, resultSearchExtenByID, outgoingNumber);
        } else {
            res.status(503).end();
        }
    } catch (e) {
        logger.error(`Ошибка инициализации вызова из CRM  ${util.inspect(e)}`);
    }

});

/*
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
        //const incomingNumberMod = `${incomingNumber}`;
        const incomingNumberMod = await validateNumber(incomingNumber);
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixUserID, incomingNumberMod, bitrixIDTypeCall, timeStartCall);
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultFinishCall = await bitrix.externalCallFinish(resultRegisterCall, bitrixUserID, billsec, isAnswered, bitrixIDTypeCall, recordingUrl);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        //createTaskOnMissedCall(isAnswered, bitrixUserID, incomingNumber);
    } catch (e) {
        logger.error(`Ошибка регистрации в Битрикс локального вызова  ${e}`);
    }
}
*/

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
        //Поиск в БД информации сопоставления добавочного номера и ID Битрикс
        const bitrixUserId = await db.getBitrixIdByExten(extensionNumber);
        const numberMod = await validateNumber(exten);
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixUserId, numberMod, OUTGOINGID, start);
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultFinishCall = await bitrix.externalCallFinish(resultRegisterCall, bitrixUserId, billsec, status[disposition], OUTGOINGID, recording);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        //sendInfoToBitrix(bitrixUserId, exten, OUTGOINGID, start, billsec, status[disposition], recording);
        return '';
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову ${e}`);
    }
}

async function sendInfoByOutgoingCRMCall({
    exten,
    unicueid,
    extensionNumber,
    bitrixICallId,
    billsec,
    disposition,
    recording,
    start,
    end,
}) {
    try {
        logger.info(`sendInfoByOutgoingCRMCall ${exten}, ${unicueid}, ${extensionNumber}, ${bitrixICallId}, ${billsec}, ${disposition}, ${recording}, ${start},${end}`);
        //Поиск в БД информации сопоставления добавочного номера и ID Битрикс
        const bitrixUserId = await db.getBitrixIdByExten(extensionNumber);
        const resultFinishCall = await bitrix.externalCallFinish(bitrixICallId, bitrixUserId, billsec, status[disposition], OUTGOINGID, recording);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        return '';
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову через CRM ${e}`);
    }
}

// Регистрация вызова для входящего вызова с сохранение информации по CALLID Битрикс
/* Нужно сделать проверку с какого номера пришел вызов, чтобы подставить администратора по транку в BITRIXADMIN*/
async function registerCallIdInBitrixAndShow({ unicueid, incomingNumber, callId }) {
    try {
        const numberMod = await validateNumber(incomingNumber);
        let bitrixTrunkId = await db.getDepartmentIdByCallId(callId);
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixTrunkId, numberMod, INCOMINGID, moment(new Date()).format('YYYY-MM-DD H:mm:ss'));
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultShow = await bitrix.externalCallShow(resultRegisterCall.CALL_ID);
        logger.info(`Получен результат поднятия карточки ${util.inspect(resultShow)}`);
        setTimeout(bitrix.externalCallHide.bind(bitrix), config.bitrix.timeoutShow, resultRegisterCall.CALL_ID);
        registerCallID[unicueid] = { registerBitrixCallID: resultRegisterCall.CALL_ID };
        logger.info(`Сопоставление вызовов ${registerCallID}`);
    } catch (e) {
        logger.error(`Ошибка регистрации входящего вызова в Битрикс  ${e}`);
    }
}

// Переделанная фукнция для входящего вызова. Отправка завершающей информации в Битрикс с ранее зарегистрированным вызовом
async function sendInfoFinishCallToBitrix(bitrixUserID, incomingNumber, bitrixIDTypeCall, timeStartCall, billsec, isAnswered, recordingUrl, unicueid) {
    try {
        const numberMod = await validateNumber(incomingNumber);
        const resultFinishCall = await bitrix.externalCallFinish(registerCallID[unicueid].registerBitrixCallID, bitrixUserID, billsec, isAnswered, bitrixIDTypeCall, recordingUrl);
        logger.info(`Получен результат завершения входящего вызова ${util.inspect(resultFinishCall)}`);
        //createTaskOnMissedCall(isAnswered, bitrixUserID, numberMod);
    } catch (e) {
        logger.error(`Ошибка регистрации в Битрикс локального вызова  ${e}`);
    }
}

// Изменение в передачи данных
async function sendInfoByIncomingCall({
    trunkNumber,
    unicueid,
    incomingNumber,
    billsec,
    disposition,
    recording,
    start,
    end,
}) {
    try {
        logger.info(trunkNumber, unicueid, incomingNumber, billsec, disposition, recording, start, end);
        let lastCallUser = '';
        let bitrixUserId = '';
        const numberMod = await validateNumber(incomingNumber);
        const bitrixTrunkId = await db.getDepartmentIdByCallId(trunkNumber);
        const callType = await db.getTypeCallProcessing(trunkNumber);
        const first3CXId = await searchInDB.searchFirstIncomingId(incomingNumber);
        const callId = await searchInDB.searchIncomingCallId(first3CXId[0].id);
        const end3CXId = await searchInDB.searchEndIncomingId(callId[0].call_id);
        const callInfo = await searchInDB.searchCallInfo(callId[0].call_id);
        const isAnswered = callInfo[0].is_answered ? '200' : '304'; // Проверка отвечен вызов или нет

        if (callType == 'queue') {
            lastCallUser = await searchInDB.search3cxQueueCall(incomingNumber);
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser);
        } else {
            lastCallUser = await searchInDB.searchLastUserRing(end3CXId[0].info_id);
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser[0].dn);

        }
        logger.info(`Результат поиска последнего ответившего\не ответившего по входящему вызову ${lastCallUser} ${bitrixUserId}`);
        if (bitrixUserId != undefined) {
            if (isAnswered == '304') {
                sendInfoFinishCallToBitrix(bitrixTrunkId, numberMod, INCOMINGID, start, billsec, isAnswered, recording, unicueid);
            } else {
                sendInfoFinishCallToBitrix(bitrixUserId, numberMod, INCOMINGID, start, billsec, isAnswered, recording, unicueid);
            }

        } else {
            sendInfoFinishCallToBitrix(bitrixTrunkId, numberMod, INCOMINGID, start, billsec, isAnswered, recording, unicueid);
        }
    } catch (e) {
        logger.error(`Ошибка по входящему вызову ${e}`);
    }
}

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'outbound-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящие вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        sendInfoByOutgoingCall(phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'incoming-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился входящий вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByIncomingCall, 60000, phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == 'outbound-call-hangup-handler' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящий вызов на Asterisk через CRM ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByOutgoingCRMCall, 20000, phoneEvent);
    }
});

// Новый евент с информацие по уникальному ID и номеру, для регистрации вызова и поднятие карточки
nami.on('namiEventNewexten', (event) => {
    if (event.context == 'operator-in' &&
        event.application == 'NoOp'
    ) {
        logger.info(`Входящий звонок на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        registerCallIdInBitrixAndShow(phoneEvent);
    }
});

app.listen(process.env.PORT || 3000, () => {
    logger.info('Сервер готов');
});