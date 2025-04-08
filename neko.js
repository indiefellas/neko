import NekowebAPI from "@indiefellas/nekoweb-api";
import Package from './package.json' with { type: "json" };
import { Command } from "commander";
import Enquirer from "enquirer";
import { styleText } from 'node:util';
import Conf from 'conf';
import yauzl from 'yauzl';
import launchEditor from 'launch-editor';
import isBinaryPath from 'is-binary-path';
import Watcher from 'watcher';
import fs, { readFileSync, watch } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const { Password, Confirm } = Enquirer;
const config = new Conf({projectName: 'neko'});

const cli = new Command('neko')
    .version(Package.version);

let neko;
let apiKey;

if (apiKey = config.get('nekocfg.apiKey')) {
    neko = new NekowebAPI({
        apiKey: apiKey,
        appName: `neko@${Package.version}`
    })
}

cli.showHelpAfterError(true);

cli.configureHelp({
    styleCommandText: (str) => styleText(['cyan', 'bold'], str),
    styleCommandDescription: (str) => styleText('blue', str),
    styleOptionText: (str) => styleText('gray', str),
    styleArgumentText: (str) => styleText('blue', str),
    styleSubcommandText: (str) => styleText(['blue', 'bold'], str),
});

cli.addHelpText(
    'before',
    `${Package.description} ${styleText('gray', `(${Package.version})`)}\n`
)

cli.addHelpText(
    'after',
    '\nMade with love by the indiefellas team:\n  ' + styleText(['green', 'underline'], 'https://team.indieseas.net'),
);

cli.command('configure')
    .description('Configure nekocli with your Nekoweb credentials')
    .action(async (opts) => {
        try {
            const apiKeyPrompt = new Password({
                name: 'apiKey',
                message: 'Your Nekoweb API key?'
            })
            const apiKey = await apiKeyPrompt.run();
            console.log(styleText(['blue', 'bold'], '  Contacting Nekoweb API, please wait...'))
            const neko = new NekowebAPI({
                apiKey: apiKey,
                appName: `neko@${Package.version}`
            })
            try {
                const siteInfo = await neko.getSiteInfo();
                console.log(styleText('green', '✔'), styleText(['green', 'bold'], `Welcome, ${siteInfo.username}!`))
            } catch {
                console.log(styleText('red', '✖'), styleText(['red', 'bold'], `Nekoweb API returned an error. Please run neko configure again.`))
                process.exit(1)
            }
            const cookieAllowPrompt = new Confirm({
                name: 'cookieAllow',
                message: 'Let neko use your Nekoweb account cookie? It will allow it to use that cookie for updating your last updated count.'
            })
            const cookieAllow = await cookieAllowPrompt.run();
            let cookie = "";
            let csrf = ""
            if (cookieAllow) {
                console.log(styleText('yellow', 'i'), styleText(['yellow', 'bold'], `Follow the instructions on https://deploy.nekoweb.org/#getting-your-cookie for getting your cookie!`))
                const cookiePrompt = new Password({
                    name: 'cookie',
                    message: 'Your Nekoweb Cookie?'
                })
                cookie = await cookiePrompt.run();
                console.log(styleText(['blue', 'bold'], '  Contacting Nekoweb API, please wait...'))
                try {
                    const csrfBuffer = await neko.generic('/csrf', {
                        method: 'GET'
                    }, {
                        Authorization: '',
                        Cookie: `token=${cookie}`,
                        Referer: 'https://nekoweb.org/?' + encodeURIComponent(`neko@${Package.version} cli (pls don't ban us)`),
                        Origin: 'https://nekoweb.org',
                        Host: 'nekoweb.org',
                        'Content-Type': 'multipart/form-data'
                    })
                    csrf = Buffer.from(csrfBuffer).toString();
                    console.log(styleText('green', '✔'), styleText(['green', 'bold'], `Cookie request success!`))
                } catch (e) {
                    console.log(styleText('red', '✖'), styleText(['red', 'bold'], `Cookie request failed. Will not use Cookie.`))
                    cookie = "";
                    csrf = "";
                }
                console.log();
            }
            config.set('nekocfg.apiKey', apiKey);
            config.set('nekocfg.cookie', cookie);
            config.set('nekocfg.csrf', csrf);
            console.log(styleText('green', '✔'), styleText('green', `  Configuration success!`))
            if (cookie && csrf) console.log(styleText('green', '✔'), styleText('green', `  Having issues about Security error? Run`), styleText(['underline', 'blue'], 'neko refresh-cookie'));
            console.log(styleText('green', '✔'))
            console.log(styleText('green', '✔'), styleText('green', `  Having issues? Visit the repository at:`))
            console.log(styleText('green', '✔    '), styleText(['blue', 'underline'], `https://github.com/indiefellas/neko`))
            console.log(styleText('green', '✔'))
            console.log(styleText('green', '✔'), '  Made with love by the indiefellas team:\n' + styleText('green', '✔    '), styleText(['green', 'underline'], 'https://team.indieseas.net'))
        } catch {
            process.exit(1)
        }
    })

let hasEvent = false;
function watchDir(dest, extWatcher) {
    if (extWatcher) extWatcher.close();
    let watcher = new Watcher(dest, { ignoreInitial: true, recursive: true, renameDetection: true });
    watcher.on('error', (err) => {})
    watcher.on('all', async (ev, n, nN) => {
        if (hasEvent) {
            console.log(styleText('yellow', '[WRN]'), `Recieved a event while still processing a existing event. Ignoring...`)
            return;
        };
        hasEvent = true;
        let name = n.replace(dest, '')
        let nameNext = nN?.replace(dest, '')
        let headers = {}
        try {
            switch (ev) {
                case 'add':
                case 'addDir':
                    let dir = ev === 'addDir';
                    console.log(styleText('blue', '[INF]'), `Detected ${!dir ? 'File' : 'Folder'}AddEvent on ${name}`)
                    var r = await neko.create(name, dir);
                    var b = Buffer.from(r);
                    console.log(styleText('blue', '[INF]'), b.toString())
                    watchDir(dest, watcher);
                    break;
                case 'change':
                    console.log(styleText('blue', '[INF]'), `Detected WriteEvent on ${name}`);
                    let f = readFileSync(path.join(dest, name));
                    if (isBinaryPath(path.join(dest, name))) {
                        let r = await neko.upload('/' + name, f);
                        let b = Buffer.from(r);
                        console.log(styleText('blue', '[INF]'), b.toString())
                    } else {
                        let r = await neko.edit('/' + name, f.toString());
                        let b = Buffer.from(r);
                        console.log(styleText('blue', '[INF]'), b.toString())
                    }
                    break;
                case 'rename':
                case 'renameDir':
                    if (!nameNext) break;
                    console.log(styleText('blue', '[INF]'), `Detected RenameEvent on ${name}`)
                    var r = await neko.rename(name, nameNext);
                    var b = Buffer.from(r);
                    console.log(styleText('blue', '[INF]'), b.toString())
                    break;
                case 'unlink':
                case 'unlinkDir':
                    console.log(styleText('blue', '[INF]'), `Detected DeleteEvent on ${name}`)
                    var r = await neko.delete(name);
                    var b = Buffer.from(r);
                    console.log(styleText('blue', '[INF]'), b.toString())
                    break;
            }
        } catch (err) {
            console.error(styleText('red', '[ERR]'), err.message)
        }
        hasEvent = false;
    })
}

cli.command('edit')
    .description('Creates an interactive edit session, right in your IDE')
    .action(async (command) => {
        console.log(styleText('blue', '[INF]'), 'Downloading your site...');
        var user = await neko.getSiteInfo();
        var file = await neko.generic('/files/export');
        fs.mkdtemp(path.join(tmpdir(), `.nekocli-${user.username}-`), (e, dest) => {
            console.log(styleText('blue', '[INF]'), `Downloaded. Extracting it on ${dest}...`);
            yauzl.fromBuffer(Buffer.from(file), { lazyEntries: true }, (err, zipfile) => {
                if (err) throw err;
                zipfile.readEntry();
                zipfile.on("entry", (entry) => {
                    if (/\/$/.test(entry.fileName)) {
                        fs.mkdirSync(path.join(dest, entry.fileName), { recursive: true });
                        zipfile.readEntry();
                    } else {
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) throw err;
                            fs.mkdirSync(path.dirname(path.join(dest, entry.fileName)), { recursive: true });
                            readStream.on("end", () => {
                                zipfile.readEntry();
                            });
                            const writeStream = fs.createWriteStream(path.join(dest, entry.fileName));
                            readStream.pipe(writeStream);
                        });
                    }
                });
                zipfile.on("end", () => {
                    launchEditor(dest);
                    console.log(styleText('blue', '[INF]'), "Finished extracting.");
                    console.log();
                    console.log(styleText('green', '[NKO]'), `   NekoCLI ${Package.version}:`, styleText('green', `editing site ${user.username}.nekoweb.org`));
                    console.log(styleText('green', '[NKO]'), `   watching ${dest}`);
                    console.log();
                    watchDir(dest);
                });
                zipfile.on("close", () => {
                    console.log(styleText('yellow', '[WRN]'), "Zip file closed.");
                });
                zipfile.on("error", (err) => {
                    console.error(styleText('red', '[ERR]'), "Error unzipping:", err);
                });
            });
        })
    })

cli.parse(process.argv)