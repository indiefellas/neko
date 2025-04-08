import Package from './package.json' with { type: "json" };
import { Command } from "commander";
import Enquirer from "enquirer";
import { styleText } from 'node:util';
import Conf from 'conf';
import { configure, edit, getApiCreds } from "./commands";
import NekoAPI from './api';

const { Password, Confirm } = Enquirer;
const config = new Conf({projectName: 'neko'});

export const cli = new Command('neko')
    .version(Package.version)
    .option('-s, --site <username>', 'The website to edit');

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
    .aliases(['cfg', 'config'])
    .action(configure)

cli.command('edit')
    .description('Creates an interactive edit session, right in your IDE')
    .action(edit)

await getApiCreds()

cli.parse(process.argv)