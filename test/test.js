const { expect, assert } = require('chai');
const request = require('supertest');
const moment = require('moment');
const namiLib = require('nami');
const db3cx = require('./models/db');
const nami = require('./models/ami');
const config = require('./config/config');
const Bitrix = require('./src/bitrix');



describe("Подключение к основным сервисам", function() {
    let bitrix = null;

    before(() => {
        console.log(`Подключаемся к порталу Битрикс ${config.bitrix.domain} hash ${config.bitrix.hash}`);
        console.log(`Подключаемся к Postgres ${config.db.host} пользователь ${config.db.user} пароль ${config.db.password}`);
        bitrix = new Bitrix();
    })


    it(`Проверка корректности подключения к порталу Битрикса ${config.bitrix.domain}`, async function() {
        const res = await bitrix.getlUser();
        assert.exists(res.result);

    });

    it('Проверка корректности доступности DB 3СХ', (done) => {
        db3cx.any('SELECT current_database()')
            .then((result) => {
                assert.equal(result[0]['current_database'], 'database_single')
                done()
            })
            .catch((err) => done(err));
    });

    it('Проверка корректности подключения к AMI', (done) => {
        const action = new namiLib.Actions.Ping();
        nami.send(action, (event) => {
            if (event.response == 'Success') {
                done();
            }
        });
    });

    after(() => {});

});


describe("Тестирование интеграции Битрикс", function() {
    let bitrix = null;

    before(() => {
        bitrix = new Bitrix();
    })

    it('Регистрация вызова и инициализация вызова через webhook', async function() {
        const resRegister = await bitrix.externalCallRegister('1', '+79104061420', '1123', moment().format('YYYY-MM-DD H:mm:ss'), false);
        assert.exists(resRegister.CALL_ID);
        console.log(`CallID вызова из Битрикса ${resRegister.CALL_ID}`);
        bitrixCallId = resRegister.CALL_ID;

        const resOriginat = await request('http://localhost:3000')
            .post(`/${config.url.webhookUrl}`)
            .set('Accept', 'application/json')
            .send({
                event: 'ONEXTERNALCALLSTART',
                auth: { application_token: `${config.bitrix.token}` },
                data: { USER_ID: '42', PHONE_NUMBER: '+79104061420', CALL_ID: bitrixCallId }
            })
        expect(resOriginat.statusCode).to.equal(200);
    });

    after(() => {});

});