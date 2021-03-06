'use strict';
const axios = require('axios'),
    util = require('util'),
    moment = require('moment'),
    momentTz = require('moment-timezone'),
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
        const json = {
            "PHONE_NUMBER": params[0]
        };

        try {
            const { result } = await this.sendAxios('telephony.externalCall.searchCrmEntities', json)
            logger.info(`Результат поиска входящего лида ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    }

    async externalCallRegister(...params) {
        const timeZoneTime = momentTz.tz(params[3], params[5]);
        const time = timeZoneTime.format();
        const json = {
            "USER_ID": params[0],
            "PHONE_NUMBER": params[1],
            "TYPE": params[2],
            "CALL_START_DATE": time,
            "CRM_CREATE": params[4],
            "SHOW": false
        };
        logger.info(json);
        try {
            const { result } = await this.sendAxios('telephony.externalcall.register.json', json)
            logger.info(`Результат регистрации вызова ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    }

    async externalCallFinish(...params) {
        const json = {
            "CALL_ID": params[0],
            "USER_ID": params[1],
            "DURATION": params[2],
            "STATUS_CODE": params[3],
            "TYPE": params[4],
            "RECORD_URL": `http://${this.recordIp}/monitor/${params[5]}`
        };
        logger.info(json);

        try {
            const { result } = await this.sendAxios('telephony.externalcall.finish', json)
            logger.info(`Результат завершения вызова ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    }

    async createTask(...params) {
        const daedline = moment(new Date).add(2, 'minutes').format('YYYY-MM-DD H:mm:ss');
        const json = {
            "fields": {
                "TITLE": "Пропущенный вызов",
                "RESPONSIBLE_ID": params[0],
                "CREATED_BY": "1",
                "DESCRIPTION": `Пропущенный вызов от абонента ${params[1]}`,
                "PRIORITY": "2",
                "DEADLINE": daedline
            }
        };

        try {
            const { result } = await this.sendAxios('tasks.task.add', json)
            logger.info(`Результат создания задачи  ${util.inspect(result)}`);
            return result;
        } catch (e) {
            return e;
        }
    }

    async taskStatus(...params) {
        const json = {
            "taskId": params[0]
        }

        try {
            const { result } = await this.sendAxios('tasks.task.get', json)
            if (result.task.status == '2') {
                logger.info(`Задача просрочена ${params[0]}`);
                this.updateTaskResponsibleId(params[0]);
            }
            return;

        } catch (e) {
            return e;
        }
    }

    async updateTaskResponsibleId(...params) {
        const json = {
            "taskId": params[0],
            "fields": {
                "RESPONSIBLE_ID": "2255"
            }
        };

        try {
            const { result } = await this.sendAxios('tasks.task.update', json)
            logger.info(`Изменение ответственного по задаче ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }
    }

    async externalCallShow(...params) {
        const json = {
            "CALL_ID": params[0],
            "USER_ID": params[1]

        };

        try {
            const { result } = await this.sendAxios('telephony.externalcall.show', json)
            logger.info(`Показ карточки позователям ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }
    }

    async externalCallHide(...params) {
        const json = {
            "CALL_ID": params[0],
            "USER_ID": params[1]
        };

        try {
            const { result } = await this.sendAxios('telephony.externalcall.hide', json)
            logger.info(`Завершение показа карточки пользователям ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    }

    async getUserIdDepartment(id) {
        const json = {
            "FILTER": {
                "UF_DEPARTMENT": id,
                "WORK_POSITION": this.departmentName
            }
        };

        try {
            const { result } = await this.sendAxios('user.get', json)
            logger.info(`Результат запроса id ответственного по департаменту ${util.inspect(result)}`);
            if (result.length != 0) {
                return result[0].ID;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    }

    async getlUser(start = 0) {
        const json = {
            "FILTER": {
                "ACTIVE": "true"
            }
        };

        try {
            const result = await this.sendAxios(`user.get?start=${start}`, json)
            if (result.length != 0) {
                return result;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    }

    async getActivity(id) {
        const json = {
            "ID": id
        };

        try {
            const { result } = await this.sendAxios('crm.activity.get', json)
            logger.info(`Активность по вызову в таймлайне ${util.inspect(result)}`);
            return result;
        } catch (e) {
            logger.error(e);
        }
    }

    async deleteActivity(id) {
        const json = {
            "ID": id
        };

        try {
            const result = await this.sendAxios('crm.activity.delete', json)
            logger.info(`Результат удаление активности по вызову ${util.inspect(result)}`);
            return result;
        } catch (e) {
            logger.error(e);
        }

    }

    async updateActivityCommentDescription(...params) {
        const json = {
            "ID": params[0],
            "fields": {
                "SUBJECT": params[1],
                "DESCRIPTION": params[2],
            }
        };

        try {
            const result = await this.sendAxios('crm.activity.update', json)
            logger.info(`Результат обновление активности в таймлайне ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    }

    async updateActivityAuthorResponsibleUser(...params) {
        const json = {
            "ID": params[0],
            "fields": {
                "AUTHOR_ID": params[1],
                "RESPONSIBLE_ID": params[2]
            }
        };

        try {
            const result = await this.sendAxios('crm.activity.update', json)
            logger.info(`Результат AUTHOR_ID RESPONSIBLE_ID по вызову из CRM  ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    }

    async updateActivityReason(id) {
        const json = {
            "ID": id,
            "fields": {
                "CALL_FAILED_CODE": "304"
            }
        };

        try {
            let result = await this.sendAxios('crm.activity.update', json)
            logger.info(`Результат обновление статуса вызова в таймлайне ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    }

    async createActivity(resultGetActivity, resultFinishCall) {
        const json = {
            "fields": {
                "OWNER_TYPE_ID": resultGetActivity.OWNER_TYPE_ID,
                "OWNER_ID": resultGetActivity.OWNER_ID,
                "TYPE_ID": resultGetActivity.TYPE_ID,
                "STATUS": "1",
                "RESPONSIBLE_ID": resultFinishCall.PORTAL_USER_ID,
                "AUTHOR_ID": resultFinishCall.PORTAL_USER_ID,
                "EDITOR_ID": resultFinishCall.PORTAL_USER_ID,
                "DIRECTION": resultGetActivity.DIRECTION,
                "TYPE": resultGetActivity.PROVIDER_TYPE_ID,
                "COMMUNICATIONS": [{
                    "VALUE": resultFinishCall.PHONE_NUMBER,
                    "ENTITY_ID": resultFinishCall.CRM_ENTITY_ID,
                    "ENTITY_TYPE_ID": resultFinishCall.CRM_ENTITY_TYPE
                }],
                "SUBJECT": `Входящий от ${resultFinishCall.PHONE_NUMBER}`,
                "COMPLETED": "N",
                "PRIORITY": resultGetActivity.PRIORITY,
                "DESCRIPTION": "Пропущенный звонок",
                "DESCRIPTION_TYPE": resultGetActivity.DESCRIPTION_TYPE,
                "START_TIME": resultGetActivity.START_TIME,
                "END_TIME": resultGetActivity.END_TIME,
                "DEADLINE": resultGetActivity.DEADLINE
            }
        };

        try {
            const result = await this.sendAxios('crm.activity.add', json)
            logger.info(`Результат создание задачи на перезвон в таймлайне ${util.inspect(result)}`);

        } catch (e) {
            logger.error(e);
        }

    }

}

module.exports = Bitrix;