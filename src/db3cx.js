"use strict";
const db = require('../models/db'),
    logger = require('../logger/logger'),
    util = require('util');


//Поиск ID первого вхождения вызова по внешнему номеру 
async function searchFirstIncomingId(incomingNumber) {
    try {
        const first3CXId = await db.any(`SELECT id FROM cl_party_info WHERE caller_number like '${incomingNumber}' ORDER BY id DESC LIMIT 1`);
        logger.info(`searchFirstIncomingId ${util.inspect(first3CXId)}`);
        return first3CXId;
    } catch (e) {
        return e;
    }
}

//Поиск уникального CallID вызова по ID первому вхождению
async function searchIncomingCallId(first3CXId) {
    try {
        const callInfo = await db.any(`SELECT call_id,recording_url FROM cl_participants WHERE info_id = ${first3CXId}`);
        logger.info(`searchIncomingCallId ${util.inspect(callInfo)}`);
        return callInfo;
    } catch (e) {
        return e;
    }
}

//Поиск итоговой информации по вызову 
async function searchIncomingInfoByLocalCall(end3CXId) {
    try {
        const incomingInfo = await db.any(`SELECT call_id,recording_url FROM cl_participants WHERE info_id = ${end3CXId}`);
        logger.info(`searchIncomingInfoByLocalCall ${util.inspect(incomingInfo)}`);
        return incomingInfo;
    } catch (e) {
        return e;
    }
}

//Поиск промежуточного ID по вызову
async function searchEndIncomingId(callId) {
    try {
        const end3CXId = await db.any(`SELECT info_id FROM cl_participants WHERE call_id = ${callId} ORDER BY info_id DESC LIMIT 1`);
        logger.info(`searchEndIncomingId ${util.inspect(end3CXId)}`);
        return end3CXId;
    } catch (e) {
        return e;
    }
}

//Поиск итоговой информации по вызову 
async function searchCallInfo(callId) {
    try {
        const callInfo = await db.any(`SELECT start_time, talking_dur, is_answered FROM public.cl_calls where id = ${callId}`);
        logger.info(`searchCallInfo ${util.inspect(callInfo)}`);
        return callInfo;
    } catch (e) {
        return e;
    }
}

//Поиск последнего ответившего\не по вызову при групповом вызове
async function searchLastUserRing(end3CXId) {
    try {
        const lastCallUser = await db.any(`SELECT dn FROM cl_party_info WHERE id = ${end3CXId}`);
        logger.info(`searchLastUserRing ${util.inspect(lastCallUser)}`);
        return lastCallUser;
    } catch (e) {
        return e;
    }
}

//Поиск последнего ответившего\не по вызову при вызове через очередь
async function search3cxQueueCall(incomingNumber) {
    try {
        incomingNumber = incomingNumber.trim();
        const callInfo = await db.any(`SELECT to_dialednum FROM public.callcent_queuecalls where from_userpart like '%${incomingNumber}'  ORDER BY idcallcent_queuecalls DESC LIMIT 1;`);
        logger.info(`search3cxQueueCall ${util.inspect(callInfo)}`);
        return callInfo[0].to_dialednum;
    } catch (e) {
        return e;
    }
}


module.exports = { searchFirstIncomingId, searchIncomingCallId, searchEndIncomingId, searchCallInfo, searchLastUserRing, searchIncomingInfoByLocalCall, search3cxQueueCall };