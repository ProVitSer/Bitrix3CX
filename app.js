'use strict';
const { default: axios } = require('axios');
const Bitrix = require('./axios'),
    db = require('./db');

const bitrix = new Bitrix();
let startPage = 0;

async function updateTrynkInform() {
    try {
        let resultSearchInDB = await db.getAllInfoByType('department');
        for (const key of resultSearchInDB) {
            let id = await bitrix.getUserIdDepartment(key.departmentId);
            let resultDelete = await db.deleteRule('department', key.departmentId);
            let resultInsertInDb = await db.insertInfoToDB('department', { "trunkNumber": key.trunkNumber, "departmentId": key.departmentId, "id": id });
            console.log(id, resultDelete, resultInsertInDb);
        }
        return true;
    } catch (e) {
        console.log(e);
    }

}

async function insertNewUserInDB(startPage) {
    try {
        if (startPage == 0) {
            await db.removeProp();
            await db.setEmptyProp();
        }

        let resultSearchInDB = await bitrix.getlUser(startPage);
        for (const user of resultSearchInDB.result) {
            if (user.UF_PHONE_INNER != null) {
                let data = {};
                data.exten = user.UF_PHONE_INNER;
                data.id = user.ID;
                await db.insertInfoToDB('users', data);
            }
        }
        resultSearchInDB.next ? insertNewUserInDB(startPage + 50) : console.log('Больше нет пользователей');
        return true;
    } catch (e) {
        console.log(e);
    }
};

(async function() {
    //await updateTrynkInform();
    //await insertNewUserInDB(startPage);
    let a = await db.testAAA('users', '304');
    console.log(a.id)
})();