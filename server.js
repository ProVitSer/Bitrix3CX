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

//Преобразование номер в формат +7
const validateNumber = (number) => {
    switch (number.length) {
        case 10:
            return `+7${number}`;
        case 11:
            return `+7${number.slice(1,11)}`
        default:
            return number;
    }

};

//инициализация вызова через AMI Asterisk { Битрикс ID из webhook, Внутренний номер 3сх, внешний номер}
const sendAmiCall = (bitrixId, localExtension, outgoingNumber) => {
    logger.info(bitrixId, localExtension, outgoingNumber);
    const action = new namiLib.Actions.Originate();
    action.channel = `local/${localExtension}:${outgoingNumber}@${config.context.bridge3CX}`; //Маршрутизация через локальные каналы. Далее идет обрезка внешнего и внутреннего номера
    action.callerid = outgoingNumber;
    action.priority = '1';
    action.timeout = '20000';
    action.context = config.context.crmCall; //Контекст исходящего вызова из CRM
    action.exten = `${outgoingNumber.slice(1)}`;
    action.variable = `var1=${outgoingNumber},var2=${localExtension},var3=${bitrixId}`; //Передача переменных, чтобы отловить их по Evenet
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

//Обработка входящих webhook от Битрикс для оригинации вызова через AMI Asterisk
app.post(`/${config.url.webhookUrl}*`, async(req, res) => {
    try {
        if (req.body.event == 'ONEXTERNALCALLSTART' && req.body.auth.application_token == config.bitrix.token) {
            res.status(200).end();
            const resultSearchExtenByID = await db.getExtenByBitrixId(req.body.data.USER_ID);
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

//Создание задачи для пользователя по пропущенному вызову в делах
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

//Отправка в CRM информации по исходящему по стандартному маршруту
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

//Отправка в CRM информации по исходящему вызову через webhook Битрикс
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
        const bitrixUserId = await db.getBitrixIdByExten(extensionNumber); //Поиск Битрикс ID пользователя по его добавочному номеру
        const resultFinishCallCRM = await bitrix.externalCallFinish(bitrixCallId, bitrixUserId, billsec, config.status[disposition], config.bitrix.outgoing, recording);
        logger.info(`Получен результат завершения вызова через CRM ${util.inspect(resultFinishCallCRM)}`);

        //Удалем существующую задачу в таймлайне(так как она создается от администратора), регистрируем новый вызов и добавляем в таймлайн сохраненную информацию
        if (disposition == 'ANSWERED') {
            await bitrix.getActivity(resultFinishCallCRM.CRM_ACTIVITY_ID);
            const resultUpdateActiviti = await bitrix.updateActivityAuthorResponsibleUser(resultFinishCallCRM.CRM_ACTIVITY_ID, bitrixUserId, bitrixUserId);
            logger.info(`Получен ${util.inspect(resultUpdateActiviti)}`);
        }
        return '';
    } catch (e) {
        logger.error(`Ошибка по исходящему вызову через CRM ${e}`);
    }
}

// Регистрация вызова для входящего вызова с сохранение информации по CALLID Битрикс
async function registerCallIdInBitrixAndShow({ unicueid, incomingNumber, callId }) {
    try {
        const numberMod = await validateNumber(incomingNumber); //Преобразование внешнего номера под нужный стандарт E164
        const bitrixTrunkId = await db.getDepartmentIdByCallId(callId); //Поиск ответственного по внешнему номеру. Возвращает ID пользователя Битрикс
        const usersArray = await db.getShowUser(callId); //Поиск пользователей по внешнему номеру, которым надо поднимать карточку в CRM
        const resultRegisterCall = await bitrix.externalCallRegister(bitrixTrunkId, numberMod, config.bitrix.incoming, moment(new Date()).format('YYYY-MM-DD H:mm:ss'), config.bitrix.createIncomingLead); //Регистрация вызова в Битрикс
        logger.info(`Получен результат регистрации входящего вызова ${util.inspect(resultRegisterCall)}`);
        const resultShow = await bitrix.externalCallShow(resultRegisterCall.CALL_ID, usersArray); //Всплывающая карточка для массива пользователей
        logger.info(`Получен результат поднятия карточки ${util.inspect(resultShow)}`);
        setTimeout(bitrix.externalCallHide.bind(bitrix), config.bitrix.timeoutShow, resultRegisterCall.CALL_ID, usersArray); //Убрать показ карточки у массива пользователей по таймауту
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

//Отправка в CRM информации по входящему вызову
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
        const numberMod = await validateNumber(incomingNumber); //Преобразование внешнего номера под нужный стандарт E164
        const bitrixTrunkId = await db.getDepartmentIdByCallId(trunkNumber); //Поиск ответственного по внешнему номеру. Возвращает ID пользователя Битрикс
        const callType = await db.getTypeCallProcessing(trunkNumber); //Выгрузка логики обработки на стороне 3сх по внешнему номеру (очередь\queue или группа\group)
        const first3CXId = await searchInDB.searchFirstIncomingId(incomingNumber); //Поиск в БД 3сх ID первого вхождения по внешнему номеру
        const callId = await searchInDB.searchIncomingCallId(first3CXId[0].id); //Поиск в БД 3сх ID уникальный CallID вызова по ID первого вхождения
        const end3CXId = await searchInDB.searchEndIncomingId(callId[0].call_id); //Поиск в БД 3сх последнего вхождения (последнего события по вызову)
        const callInfo = await searchInDB.searchCallInfo(callId[0].call_id); //Поиск в БД 3сх статус вызова 
        const isAnswered = callInfo[0].is_answered ? '200' : '603'; //Проверка и преобразваоние статуса вызова из 3сх (true\200 false\603)

        if (callType == 'queue') {
            lastCallUser = await searchInDB.search3cxQueueCall(incomingNumber); //Поиск в БД 3сх таблицы очереди кто последний ответили или нет на вызов
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser); //Поиск Битрикс ID пользователя по его добавочному номеру
        } else {
            lastCallUser = await searchInDB.searchLastUserRing(end3CXId[0].info_id); //Поиск в БД 3сх таблицы группы кто последний ответили или нет на вызов
            bitrixUserId = await db.getBitrixIdByExten(lastCallUser[0].dn); //Поиск Битрикс ID пользователя по его добавочному номеру

        }
        logger.info(`Результат поиска последнего ответившего\не ответившего по входящему вызову ${lastCallUser} ${bitrixUserId}`);
        if (bitrixUserId != undefined) {
            if (isAnswered == '603') {
                const resultFinishCall = await sendInfoFinishCallToBitrix(bitrixTrunkId, numberMod, config.bitrix.incoming, start, billsec, isAnswered, recording, unicueid);
                await bitrix.updateActivityReason(resultFinishCall.CRM_ACTIVITY_ID); //Обновляем статус вызова на 304 в таймлайне, чтобы в таймлайне появилось событие вызова без создание задачи на пропущенный вызов
                const resultGetActivity = await bitrix.getActivity(resultFinishCall.CRM_ACTIVITY_ID); //Получаем информацию по ранее созданному вызову в Битрикс 
                await bitrix.createActivity(resultGetActivity, resultFinishCall); //Создаем задачу пропущенный вызов

            } else {
                await sendInfoFinishCallToBitrix(bitrixUserId, numberMod, config.bitrix.incoming, start, billsec, isAnswered, recording, unicueid); //Если не 603, просто завершаем вызов без изменений в таймлайне
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

//Event завершения исходящего вызова по стандартным маршрутам
nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerOutgoingCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящие вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        sendInfoByOutgoingCall(phoneEvent);
    }
});

//Event завершения входящего вызова по стандартным маршрутам
nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerIncomingCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился входящий вызов на Asterisk ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByIncomingCall, 60000, phoneEvent);
    }
});

//Event по завершению исходящего вызова инициированный через webhook CRM
nami.on('namiEventNewexten', (event) => {
    if (event.context == config.context.handlerCrmCall &&
        event.application == 'NoOp'
    ) {
        logger.info(`Завершился исходящий вызов на Asterisk через CRM ${util.inspect(event)}`);
        const phoneEvent = JSON.parse(event.appdata);
        setTimeout(sendInfoByOutgoingCRMCall, 20000, phoneEvent);
    }
});

// Новый Event с информацие по уникальному ID и номеру, для регистрации вызова и поднятие карточки
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