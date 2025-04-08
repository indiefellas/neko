import NekowebAPI from "@indiefellas/nekoweb-api"
import { Site } from "@indiefellas/nekoweb-api/classes";
import Package from './package.json' with { type: "json" };

/**
 * Custom definitions for NekoAPI to support CSRF
 */
export default class NekoAPI {
    /** @typedef { NekowebAPI } */
    api;

    /** @param { import("@indiefellas/nekoweb-api/types").Config } apiConfig */
    constructor(apiConfig, csrf, site, cookie) {
        this.api = new NekowebAPI(apiConfig)
        this.api.getSiteInfo(site).then((info) => {
            this.site = info.username
            this.cookie = cookie
        })
        this.api.generic('/csrf', {
            method: 'GET'
        }, {
            Authorization: '',
            Cookie: `token=${cookie}`,
            Referer: 'https://nekoweb.org/?' + encodeURIComponent(`neko@${Package.version} cli (pls don't ban us)`),
            Origin: 'https://nekoweb.org',
            Host: 'nekoweb.org',
            'Content-Type': 'multipart/form-data'
        }).then((buf) => {
            csrf = Buffer.from(buf).toString();
            this.isCsrf = !(!csrf)
            this.csrf = this.isCsrf ? `&csrf=${csrf}&site=${this.site}` : ''
            this.csrfString = csrf
        })
    }

    async getCsrf(data) {
        if (this.isCsrf) {
            data.append("csrf", this.csrfString);
            data.append("site", this.site);
        }
        return data;
    }

    async create(path, isFolder) {
        let csrf = this.isCsrf ? {
            Authorization: '',
            Cookie: `token=${cookie}`,
            Referer: 'https://nekoweb.org/?' + encodeURIComponent(`neko@${Package.version} cli (pls don't ban us)`),
            Origin: 'https://nekoweb.org',
            Host: 'nekoweb.org',
        } : {}
        return this.api.generic('/files/create', {
			method: 'POST',
			body: `pathname=${encodeURIComponent(path)}${isFolder? `&isFolder=${encodeURIComponent(isFolder)}` : ''}${this.csrf}`
		}, {
			"Content-Type": 'application/x-www-form-urlencoded',
            ...csrf
		})
    }

    async upload(path, file) {
		let data = new FormData();
		const parts = path.split('/').filter(Boolean);
		const filename = parts.pop() ?? 'file.bin';
		const dirname = '/' + parts.join('/');

		if (file.byteLength >= (100 * 1024 * 1024)) {
			let bigFile = await this.createBigFile();
			bigFile.append(file);
			return bigFile.move(path);
		}

		data.append("pathname", dirname);
        this.getCsrf(data);
		data.append("files", new File([file], filename));

		return this.api.generic('/files/upload', {
			method: 'POST',
			body: data,
		})
	}

    async delete(path) {
		return this.api.generic('/files/delete', {
			method: 'POST',
			body: `pathname=${encodeURIComponent(path)}${this.csrf}`
		}, {
			"Content-Type": 'application/x-www-form-urlencoded'
		})
	}
    
    async rename(oldPath, newPath) {
		return this.api.generic('/files/rename', {
			method: 'POST',
			body: `pathname=${oldPath}&newpathname=${newPath}${this.csrf}`
		}, {
			"Content-Type": 'application/x-www-form-urlencoded'
		})
	}

    async edit(path, content) {
		let data = new FormData()
		data.append("pathname", path);
        this.getCsrf(data);
		data.append("content", content);

        console.log(data);

		return this.api.generic('/files/edit', {
			method: 'POST',
			body: data,
		})
	}
}