/* eslint-disable no-unused-expressions */
"use strict"; // eslint-disable-line
const low = require('lowdb'),
    FileSync = require('lowdb/adapters/FileSync'),
    adapter = new FileSync('./db.json'),
    db = low(adapter),
    util = require('util');

db.defaults({ department: [], users: [] })
    .write();


const insertInfoToDB = (type = 'department', data) => new Promise((resolve, reject) => {
    try {
        console.log(`Добавляем в базу ${type}, ${util.inspect(data)}`);
        const insertInDB = db.get(type)
            .push(data)
            .write();
        if (!insertInDB) {
            console.log('[DB] Insert Error!', insertInDB);
            reject('[DB] Error!', insertInDB);
        } else {
            console.log('[DB] Insert: ', insertInDB);
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
        console.log('[DB] Delete Error!', deleteRecords);
        reject('[DB] Delete Error!', deleteRecords);
    } else {
        console.log('[DB] Удаление: ', departmentId);
        resolve(deleteRecords)
    }
})

const removeProp = (type = 'user') => new Promise((resolve, reject) => {
    const resultRemoveProp = db.unset(type)
        .write()
    if (!resultRemoveProp) {
        console.log('[DB] Delete Error!', resultRemoveProp);
        reject('[DB] Delete Error!', resultRemoveProp);
    } else {
        console.log('[DB] Удаление: ', resultRemoveProp);
        resolve(resultRemoveProp)
    }
})

const getAllInfoByType = (type = 'department') => new Promise((resolve, reject) => {
    const getInfo = db.get(type)
        .remove({})
        .write()
    if (!getInfo) {
        console.log('[DB] GetAllInfo Error!', getInfo);
        reject('[DB] GetAllInfo Error!', getInfo)
    } else {
        resolve(getInfo)
    }
})

const setEmptyProp = (type = 'users') => new Promise((resolve, reject) => {
    const resultSetProp = db.set(type, [])
        .write()
    if (!resultSetProp) {
        console.log('[DB] setEmptyProp Error!', resultSetProp);
        reject('[DB] setEmptyProp Error!', resultSetProp)
    } else {
        resolve(resultSetProp)
    }
})

const testAAA = (type = 'users', exten) => new Promise((resolve, reject) => {
    const resultSetProp = db.get(type)
        .find({ exten: exten })
        .value()
    if (!resultSetProp) {
        console.log('[DB] setEmptyProp Error!', resultSetProp);
        reject('[DB] setEmptyProp Error!', resultSetProp)
    } else {
        resolve(resultSetProp)
    }
})

module.exports = {
    insertInfoToDB,
    getAllInfoByType,
    deleteRule,
    removeProp,
    setEmptyProp,
    testAAA
}