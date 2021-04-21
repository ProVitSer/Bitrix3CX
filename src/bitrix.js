'use strict';
const axios = require('axios'),
    util = require('util'),
    moment = require('moment'),
    logger = require(`../logger/logger`),
    config = require(`../config/config`);


class Bitrix {
    constructor(recordIp = config.bitrix.recordIp, domain = config.bitrix.domain, hash = config.bitrix.hash, departmentName = config.bitrix.departmentName) {
        this.recordIp = recordIp;
        this.domain = domain;
        this.hash = hash;
        this.departmentName = departmentName;
        this.config = {
            headers: {
                'User-Agent': 'voipnotes/0.0.1',
                'Content-Type': 'application/json',

            }
        }
    }

    async sendAxios(url, json) {
        const res = await axios.post(`https://${this.domain}/rest/2/${this.hash}/${url}`, JSON.stringify(json), this.config)
        const result = await res;

        if (!result) {
            return [];
        }
        return result.data
    }

    async searchUser(...params) {
        let json = {
            "PHONE_NUMBER": params[0]
        };

        try {
            let { result } = await this.sendAxios('telephony.externalCall.searchCrmEntities', json)
            logger.info(`Результат поиска входящего лида ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    };

    async externalCallRegister(...params) {
        let json = {
            "USER_ID": params[0],
            "PHONE_NUMBER": params[1],
            "TYPE": params[2],
            "CALL_START_DATE": params[3],
            "CRM_CREATE": params[4],
            "SHOW": false
        };
        logger.info(json);
        try {
            let { result } = await this.sendAxios('telephony.externalcall.register.json', json)
            logger.info(`Результат регистрации вызова ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    };

    async externalCallFinish(...params) {
        let json = {
            "CALL_ID": params[0],
            "USER_ID": params[1],
            "DURATION": params[2],
            "STATUS_CODE": params[3],
            "TYPE": params[4],
            "RECORD_URL": `http://${this.recordIp}/monitor/${params[5]}`
        };
        logger.info(json);

        try {
            let { result } = await this.sendAxios('telephony.externalcall.finish', json)
            logger.info(`Результат завершения вызова ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    };

    async createTask(...params) {
        let daedline = moment(new Date).add(2, 'minutes').format('YYYY-MM-DD H:mm:ss');
        let json = {
            "fields": {
                "TITLE": "Пропущенный вызов",
                "RESPONSIBLE_ID": params[0],
                "CREATED_BY": "1",
                "DESCRIPTION": `Пропущенный вызов от абонента ${params[1]}`,
                "PRIORITY": "2",
                "DEADLINE": daedline
            }
        }

        try {
            let { result } = await this.sendAxios('tasks.task.add', json)
            logger.info(`Результат создания задачи  ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    };

    async taskStatus(...params) {
        let json = {
            "taskId": params[0]
        }

        try {
            let { result } = await this.sendAxios('tasks.task.get', json)
            if (result.task.status == '2') {
                logger.info(`Задача просрочена ${params[0]}`);
                this.updateTaskResponsibleId(params[0]);
            }
            return;

        } catch (e) {
            return e;
        }
    };

    async updateTaskResponsibleId(...params) {
        let json = {
            "taskId": params[0],
            "fields": {
                "RESPONSIBLE_ID": "2255"
            }
        }

        try {
            let { result } = await this.sendAxios('tasks.task.update', json)
            logger.info(`Изменение ответственного по задаче ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }
    };

    async externalCallShow(...params) {
        let json = {
            "CALL_ID": params[0],
            "USER_ID": ["2255", "2253", "2252", "2257", "2259", "2254", "2256", "2258", "2262"]

        }

        try {
            let { result } = await this.sendAxios('telephony.externalcall.show', json)
            logger.info(`Показ карточки позователям ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }
    };

    async externalCallHide(...params) {
        let json = {
            "CALL_ID": params[0],
            "USER_ID": ["2255", "2253", "2252", "2257", "2259", "2254", "2256", "2258", "2262"]

        }

        try {
            let { result } = await this.sendAxios('telephony.externalcall.hide', json)
            logger.info(`Завершение показа карточки пользователям ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    };

    async getActivity(id) {
        let json = {
            "ID": id
        }
    async getUserIdDepartment(id) {
        let json = {
            "FILTER": {
                "UF_DEPARTMENT": id,
                "WORK_POSITION": this.departmentName
            }
        };
        try {
            let { result } = await this.sendAxios('user.get', json)
            logger.info(`Результат запроса id ответственного по департаменту ${util.inspect(result)}`);
            if (result.length != 0) {
                return result[0].ID;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    };

        try {
            let result = await this.sendAxios('crm.activity.get', json)
            logger.info(`Активность по вызову в таймлайне ${util.inspect(result)}`);
            return result;
        } catch (e) {
            logger.error(e);
        }
    async getlUser(start = 0) {
        let json = {
            "FILTER": {
                "ACTIVE": "true"
            }
        };
        try {
            let result = await this.sendAxios(`user.get?start=${start}`, json)
                //logger.info(`Результат перебора пользователей ${util.inspect(result)}`);
            if (result.length != 0) {
                return result;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    }

    };

    async deleteActivity(id) {
        let json = {
            "ID": id
        }

        try {
            let result = await this.sendAxios('crm.activity.delete', json)
            logger.info(`Результат удаление активности по вызову ${util.inspect(result)}`);
            return result;
        } catch (e) {
            logger.error(e);
        }

    };

    async updateActivity(...params) {
        let json = {
            "ID": params[0],
            "fields": {
                "SUBJECT": params[1],
                "DESCRIPTION": params[2],
            }
        }

        try {
            let result = await this.sendAxios('crm.activity.update', json)
            logger.info(`Результат обновление активности в таймлайне ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    };

};

module.exports = Bitrix;