/* eslint-disable no-unused-expressions */
"use strict"; // eslint-disable-line
const low = require('lowdb'),
    FileSync = require('lowdb/adapters/FileSync'),
    adapter = new FileSync('./db.json'),
    db = low(adapter),
    util = require('util'),
    logger = require('../logger/logger');


db.defaults({ department: [], users: [] })
    .write();


const insertInfoToDB = (type = 'department', data) => new Promise((resolve, reject) => {
    try {
        console.log(`Добавляем в базу ${type}, ${util.inspect(data)}`);
        const insertInDB = db.get(type)
            .push(data)
            .write();
        if (!insertInDB) {
            logger.error(`[DB] Insert Error!${util.inspect(insertInDB)}`);
            reject('[DB] Error!', insertInDB);
        } else {
            logger.info(`[DB] Insert:  ${util.inspect(insertInDB)}`);
            resolve(insertInDB)
        }
    } catch (e) {
        console.log(e)
    }

})

const deleteRule = (type = 'department', departmentId) => new Promise((resolve, reject) => {
    const deleteRecords = db
        .get(type)
        .remove({ departmentId })
        .write();
    if (!deleteRecords) {
        logger.error(`[DB] Delete Error! ${util.inspect(deleteRecords)}`);
        reject('[DB] Delete Error!', deleteRecords);
    } else {
        logger.info(`[DB] Удаление:  ${util.inspect(departmentId)}`);
        resolve(deleteRecords)
    }
})

const removeProp = (type = 'user') => new Promise((resolve, reject) => {
    const resultRemoveProp = db.unset(type)
        .write()
    if (!resultRemoveProp) {
        logger.error(`[DB] Delete Error! ${util.inspect(resultRemoveProp)}`);
        reject('[DB] Delete Error!', resultRemoveProp);
    } else {
        logger.info(`[DB] Удаление:  ${util.inspect(resultRemoveProp)}`);
        resolve(resultRemoveProp)
    }
})

const getAllInfoByType = (type = 'department') => new Promise((resolve, reject) => {
    const getInfo = db.get(type)
        .remove({})
        .write()
    if (!getInfo) {
        logger.error(`[DB] GetAllInfo Error! ${util.inspect(getInfo)}`);
        reject('[DB] GetAllInfo Error!', getInfo)
    } else {
        resolve(getInfo)
    }
})

const setEmptyProp = (type = 'users') => new Promise((resolve, reject) => {
    const resultSetProp = db.set(type, [])
        .write()
    if (!resultSetProp) {
        logger.error(`[DB] setEmptyProp Error! ${util.inspect(resultSetProp)}`);
        reject('[DB] setEmptyProp Error!', resultSetProp)
    } else {
        resolve(resultSetProp)
    }
})

const getBitrixIdByExten = (exten, type = 'users') => new Promise((resolve, reject) => {
    const resultSearch = db.get(type)
        .find({ exten: exten })
        .value()
    if (!resultSearch) {
        logger.error(`[DB] Error поиска ID Битрикс для добавочного ${exten} ${util.inspect(resultSearch)}`);
        resolve(undefined)
    } else {
        resolve(resultSearch.id)
    }
})

const getExtenByBitrixId = (id, type = 'users') => new Promise((resolve, reject) => {
    const resultSearch = db.get(type)
        .find({ id: id })
        .value()
    if (!resultSearch) {
        logger.error(`[DB] Error поиска внутреннего номера для Bitrix ID  ${id} ${util.inspect(resultSearch)}`);
        reject('[DB] getExtenByBitrixId Error!', resultSearch)
    } else {
        resolve(resultSearch.exten)
    }
})

const getDepartmentIdByCallId = (callId, type = 'department') => new Promise((resolve, reject) => {
    const resultSearch = db.get(type)
        .find({ trunkNumber: callId })
        .value()
    if (!resultSearch) {
        logger.error(`[DB] Error поиска  ответственного ID департамента по номеру транка ${util.inspect(resultSearch)}`);
        reject('[DB] getDepartmentIdByCallId Error!', resultSearch)
    } else {
        resolve(resultSearch.id)
    }
})

const getTypeCallProcessing = (callId, type = 'department') => new Promise((resolve, reject) => {
    const resultSearch = db.get(type)
        .find({ trunkNumber: callId })
        .value()
    if (!resultSearch) {
        logger.error(`[DB] Error поиска  ответственного ID департамента по номеру транка  ${util.inspect(resultSearch)}`);
        reject('[DB] getDepartmentIdByCallId Error!', resultSearch)
    } else {
        resolve(resultSearch.callProcessing)
    }
})

const getShowUser = (callId, type = 'department') => new Promise((resolve, reject) => {
    const resultSearch = db.get(type)
        .find({ trunkNumber: callId })
        .value()
    if (!resultSearch) {
        logger.error(`[DB] Error поиска пользователей которым надо показать карточку клиента  ${util.inspect(resultSearch)}`);
        reject('[DB] getShowUser Error!', resultSearch)
    } else {
        resolve(resultSearch.showUsers)
    }
})

module.exports = {
    insertInfoToDB,
    getAllInfoByType,
    deleteRule,
    removeProp,
    setEmptyProp,
    getBitrixIdByExten,
    getExtenByBitrixId,
    getDepartmentIdByCallId,
    getTypeCallProcessing,
    getShowUser
}