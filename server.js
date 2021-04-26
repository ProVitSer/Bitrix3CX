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
const config = require('./config/config');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const bitrix = new Bitrix();
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
    action.channel = `local/${localExtension}:${outgoingNumber}@${config.context.bridge3CX}`;
    action.callerid = outgoingNumber;
    action.priority = '1';
    action.timeout = '20000';
    action.context = config.context.crmCall;
    action.exten = `${outgoingNumber.slice(1)}`;
    action.variable = `var1=${outgoingNumber},var2=${localExtension},var3=${bitrixId}`;
    action.async = 'yes';
    logger.info(action);
    nami.send(action, (response) => {
        logger.info(` ---- Response: ${util.inspect(response)}`);
    });
};

app.use((req, res, next) => {
    logger.info(`Получили запрос ${util.inspect(req.body)}`);
    next();
});

app.post(`/${config.url.webhookUrl}*`, async(req, res) => {
    try {
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
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixUserId, numberMod, config.bitrix.outgoing, start, config.bitrix.createOutgoingLead);
        logger.info(`Получен результат регистрации исходящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultFinishCall = await bitrix.externalCallFinish(resultRegisterCall.CALL_ID, bitrixUserId, billsec, config.status[disposition], config.bitrix.outgoing, recording);
        logger.info(`Получен результат завершения исходящего вызова ${util.inspect(resultFinishCall)}`);
        return '';
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову ${e}`);
    }
}

async function sendInfoByOutgoingCRMCall({
    exten,
    unicueid,
    extensionNumber,
    bitrixCallId,
    billsec,
    disposition,
    recording,
    start,
    end,
}) {
    try {
        logger.info(`sendInfoByOutgoingCRMCall ${exten}, ${unicueid}, ${extensionNumber}, ${bitrixCallId}, ${billsec}, ${disposition}, ${recording}, ${start},${end}`);
        //Поиск в БД информации сопоставления добавочного номера и ID Битрикс
        const bitrixUserId = await db.getBitrixIdByExten(extensionNumber);
        const resultFinishCallCRM = await bitrix.externalCallFinish(bitrixCallId, bitrixUserId, billsec, config.status[disposition], config.bitrix.outgoing, recording);
        logger.info(`Получен результат завершения вызова через CRM ${util.inspect(resultFinishCallCRM)}`);

        //Удалем существующую задачу в таймлайне(так как она создается от администратора), регистрируем новый вызов и добавляем в таймлайн сохраненную информацию
        if (disposition == 'ANSWERED') {
            const resultGetActivity = await bitrix.getActivity(resultFinishCallCRM.CRM_ACTIVITY_ID);
            const rrrr = await bitrix.updateActivityAuthorResponsibleUser(resultFinishCallCRM.CRM_ACTIVITY_ID, bitrixUserId, bitrixUserId);
            logger.info(`Получен ${util.inspect(rrrr)}`);
        }
        return '';
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову через CRM ${e}`);
    }
}

// Регистрация вызова для входящего вызова с сохранение информации по CALLID Битрикс
async function registerCallIdInBitrixAndShow({ unicueid, incomingNumber, callId }) {
    try {
        const numberMod = await validateNumber(incomingNumber);
        const bitrixTrunkId = await db.getDepartmentIdByCallId(callId);
        const usersArray = await db.getShowUser(callId);
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixTrunkId, numberMod, config.bitrix.incoming, moment(new Date()).format('YYYY-MM-DD H:mm:ss'), config.bitrix.createIncomingLead);
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultShow = await bitrix.externalCallShow(resultRegisterCall.CALL_ID, usersArray);
        logger.info(`Получен результат поднятия карточки ${util.inspect(resultShow)}`);
        setTimeout(bitrix.externalCallHide.bind(bitrix), config.bitrix.timeoutShow, resultRegisterCall.CALL_ID, usersArray);
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
        if (config.bitrix.createTask == 'true') {
            createTaskOnMissedCall(isAnswered, bitrixUserID, numberMod);
        }
        return resultFinishCall;
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
        const isAnswered = callInfo[0].is_answered ? '200' : '603'; // Проверка отвечен вызов или нет

        if (callType == 'queue') {
            lastCallUser = await searchInDB.search3cxQueueCall(incomingNumber);
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser);
        } else {
            lastCallUser = await searchInDB.searchLastUserRing(end3CXId[0].info_id);
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser[0].dn);

        }
        logger.info(`Результат поиска последнего ответившего\не ответившего по входящему вызову ${lastCallUser} ${bitrixUserId}`);
        if (bitrixUserId != undefined) {
            if (isAnswered == '603') {
                const resultFinishCall = await sendInfoFinishCallToBitrix(bitrixTrunkId, numberMod, config.bitrix.incoming, start, billsec, isAnswered, recording, unicueid);
                await bitrix.updateActivityReason(resultFinishCall.CRM_ACTIVITY_ID);
                const resultGetActivity = await bitrix.getActivity(resultFinishCall.CRM_ACTIVITY_ID);
                await bitrix.createActivity(resultGetActivity, resultFinishCall);

            } else {
                await sendInfoFinishCallToBitrix(bitrixUserId, numberMod, config.bitrix.incoming, start, billsec, isAnswered, recording, unicueid);
            }

        } else {
            const resultFinishCall = await sendInfoFinishCallToBitrix(bitrixTrunkId, numberMod, config.bitrix.incoming, start, billsec, isAnswered, recording, unicueid);
            await bitrix.updateActivityReason(resultFinishCall.CRM_ACTIVITY_ID);
            const resultGetActivity = await bitrix.getActivity(resultFinishCall.CRM_ACTIVITY_ID);
            await bitrix.createActivity(resultGetActivity, resultFinishCall);
        }
    } catch (e) {
        logger.error(`Ошибка по входящему вызову ${e}`);
    }
}

nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerOutgoingCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящие вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        sendInfoByOutgoingCall(phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerIncomingCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился входящий вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByIncomingCall, 60000, phoneEvent);
    }
});

nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerCrmCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящий вызов на Asterisk через CRM ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByOutgoingCRMCall, 20000, phoneEvent);
    }
});

// Новый евент с информацие по уникальному ID и номеру, для регистрации вызова и поднятие карточки
nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.incomingCall &&
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