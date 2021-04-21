'use strict';
const Bitrix = require('./src/bitrix'),
    db = require('./src/db'),
    logger = require('./logger/logger');

const bitrix = new Bitrix();
//Страница с которой начинается выгрузка пользователей из Битрикс. Ограничение Битрикса выгрузка по 50 пользователей за раз
let startPage = 0;

//В БД заполняет параметры ID департамента и привязанный к нему транк. Производиться перебор всех id, запрос в Битрикс на ответственного по нему и заново формируется БД с привязкой
async function updateTrynkInform() {
    try {
        let resultSearchInDB = await db.getAllInfoByType('department');
        for (const key of resultSearchInDB) {
            let id = await bitrix.getUserIdDepartment(key.departmentId);
            let resultDelete = await db.deleteRule('department', key.departmentId);
            let resultInsertInDb = await db.insertInfoToDB('department', { "trunkNumber": key.trunkNumber, "departmentId": key.departmentId, "id": id, "callProcessing": key.callProcessing, "showUsers": key.showUsers });
            logger.info(`Обновлям новые данные по привязки транка к ответственному по департаменту ${id}, ${resultDelete}, ${resultInsertInDb}`);
        }
        return true;
    } catch (e) {
        logger.error(`Проблемы с обновлением данных привязки транка к ответственному по департаменту ${e}`);
    }

}

//Выгрузка всех пользователей из Битрикс с занесением в БД привязки id пользователя с добавочным
async function insertNewUserInDB(startPage) {
    try {
        if (startPage == 0) {
            await db.removeProp();
            await db.setEmptyProp();
        }

        let resultSearchInDB = await bitrix.getlUser(startPage);
        logger.info(resultSearchInDB);
        for (const user of resultSearchInDB.result) {
            if (user.UF_PHONE_INNER != null) {
                let data = {};
                data.exten = user.UF_PHONE_INNER;
                data.id = user.ID;
                await db.insertInfoToDB('users', data);
            }
        }
        resultSearchInDB.next ? insertNewUserInDB(startPage + 50) : console.log(`Выгрузка пользователей завершилась на странице ${startPage}. Больше пользователей нет`);
        return true;
    } catch (e) {
        logger.error(`Проблемы с выгрузкой пользователей из Битрикс ${e}`);
    }
};

(async function() {
    try {
        await updateTrynkInform();
        await insertNewUserInDB(startPage);
    } catch (e) {
        logger.error(`Проблемы с запуском функции выгрузки ${e}`);
    }

})();