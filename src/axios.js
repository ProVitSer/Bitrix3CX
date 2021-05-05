'use strict';
const axios = require('axios'),
    util = require('util');


class Bitrix {
    constructor(domain = 'portal5.lazurit.ml', hash = '0t7ph60voejmszuv') {
        this.domain = domain;
        this.hash = hash;
        this.config = {
            headers: {
                'User-Agent': 'voipnotes/0.0.1',
                'Content-Type': 'application/json',

            }
        }
    }

    async sendAxios(url, json) {
        try {
            const res = await axios.post(`https://${this.domain}/rest/2/${this.hash}/${url}`, JSON.stringify(json), this.config)
            const result = await res;

            if (!result) {
                return [];
            }
            return result.data
        } catch (e) {
            return e;
        }
    }

    async getUserIdDepartment(id) {
        let json = {
            "FILTER": {
                "UF_DEPARTMENT": id,
                "WORK_POSITION": "Управляющий салоном"
            }
        };
        try {
            let { result } = await this.sendAxios('user.get', json)
            if (result.length != 0) {
                return result[0].ID;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    };

    async getlUser(start = 0) {
        let json = {
            "FILTER": {
                "ACTIVE": "true"
            }
        };
        try {
            let result = await this.sendAxios(`user.get?start=${start}`, json)
            if (result.result.length != 0) {
                return result;
            } else {
                return '';
            }
        } catch (e) {
            return e;
        }
    }


};

module.exports = Bitrix;