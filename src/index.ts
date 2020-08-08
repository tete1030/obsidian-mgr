#!/usr/bin/env node
import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';

if (process.env.OBSIDIAN_ROOT === undefined) {
    console.error('Env OBSIDIAN_ROOT is not set!');
    process.exit(1);
}
const OBSIDIAN_ROOT: string = process.env.OBSIDIAN_ROOT;
const OBSIDIAN_DIARY = path.join(OBSIDIAN_ROOT, 'Diary');
const OBSIDIAN_DIARY_TEMPLATE = path.join(OBSIDIAN_DIARY, 'Template.md');
const OBSIDIAN_ZK = path.join(OBSIDIAN_ROOT, 'Diary', 'Zettelkasten');
const OBSIDIAN_ATTACHMENT = path.join(OBSIDIAN_ROOT, 'Attachments');
const OBSIDIAN_SPACED = path.join(OBSIDIAN_ROOT, 'Spaced.md');
const DIARY_FORMAT = path.join('YYYY.MM', 'YY.MM.DD');

function findNewFiles(startPath: string, startTime: Date, endTime?: Date, excludes: string[] = []): string[] {
    if (!fs.existsSync(startPath)) {
        console.error(`Path does not exist: ${startPath}`);
        return [];
    }
    let result: Array<string> = [];
    let files = fs.readdirSync(startPath);
    for (let file of files) {
        if (file.startsWith('.')) continue;
        let filename = path.join(startPath, file);
        if (excludes.includes(filename)) continue;
        let stat = fs.statSync(filename);
        if (stat.isDirectory()) {
            result.push(...findNewFiles(filename, startTime, endTime, excludes));
        } else if (stat.mtime >= startTime && (endTime === undefined || stat.mtime < endTime)) {
            result.push(filename);
        }
    }
    return result;
}

function findSection(section: string, contents: string[]) {
    let linePos = -1;
    let lineStart = -1;
    let lineEnd = -1;
    let secStart = false;
    let pattern = new RegExp(`^${section.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`);
    for (let i = 0; i < contents.length; i++) {
        if (!secStart && pattern.test(contents[i])) {
            secStart = true;
            lineStart = i + 1;
        } else if (secStart && /^#+ /.test(contents[i])) {
            lineEnd = i;
            break;
        }
        if (secStart && !/^\s*$/.test(contents[i])) linePos = i + 1;
    }
    if (lineEnd == -1) lineEnd = contents.length;
    return {pos: linePos, start: lineStart, end: lineEnd};
}

function addNoteListToSection(contents: string[], section: string, notes: string[], pattern: RegExp) {
    let line = findSection(section, contents);
    if (line.pos < 0) {
        console.error(`Section '${section}' is not found. Skipped.`);
    } else {
        let newContentList: string[] = [];
        for (let nt of notes) {
            let ntname = path.basename(nt);
            if (!pattern.test(ntname)) {
                console.error(`Not a valid note file: ${nt}`);
                continue;
            }
            let ntid = path.relative(OBSIDIAN_ROOT, nt);
            newContentList.push(`[[${ntid.substr(0, ntid.length-3)}]]`);
        }
        let contentSet = new Set();
        for (let l = line.start; l < line.end; ++l) {
            contentSet.add(contents[l].trim());
        }
        newContentList = newContentList.filter(t => !contentSet.has(t.trim()));

        contents.splice(line.pos, 0, ...newContentList);
    }
}

function getDate(ref: Date, days: number): Date {
    let newDate = new Date(ref);
    newDate.setDate(ref.getDate() + days);
    return newDate;
}

function generateSpaced(today?: Date): string {
    if (today === undefined) today = new Date();
    today.setHours(0, 0, 0, 0);
    let spacedNames = ["Yesterday", "3 Days Ago", "10 Days Ago"];
    let spacedDays = [getDate(today, -1), getDate(today, -3), getDate(today, -10)];
    let result = spacedDays.map((d, i) => {
        let noteFile = getDateNote(d);
        let noteId = path.relative(OBSIDIAN_ROOT, noteFile).slice(0, -3);
        if (fs.existsSync(noteFile)) {
            return `## ${spacedNames[i]}\n[[${noteId}]]\n`;
        } else {
            return `## ${spacedNames[i]}\nNot found: \`${noteId}\`\n`;
        }
    }).join('\n');
    return result + `\n\n> Generated at ${(new Date()).toLocaleString()}\n`;
}

function getDateNote(date: Date): string {
    return path.join(OBSIDIAN_DIARY, moment(date).format(DIARY_FORMAT) + '.md');
}

let args = yargs
    .boolean(['spaced-tm', 'spaced-td', 'diary'])
    .describe('spaced-tm', 'Update spaced repetition note for tomorrow')
    .describe('spaced-td', 'Update spaced repetition note for today')
    .describe('diary', 'Update diary today')
    .boolean('create')
    .alias('c', 'create')
    .describe('c', 'Create diary when one does not exist')
    .string('date')
    .help('help')
    .alias('h', 'help')
    .argv;

let today = new Date();
if (args.date) {
    today = moment(args.date as string, 'YYYY.MM.DD').toDate();
}
console.log(`Using date ${today.toLocaleDateString()} as today`);

if (args.diary) {
    console.log('Generating diary summary...');
    today.setHours(0, 0, 0, 0);
    let nextDay = getDate(today, 1);
    let newNormal = findNewFiles(OBSIDIAN_ROOT, today, nextDay, [OBSIDIAN_DIARY, OBSIDIAN_ZK, OBSIDIAN_SPACED, OBSIDIAN_ATTACHMENT]);
    let newZk = findNewFiles(OBSIDIAN_ZK, today, nextDay);
    let todayNoteFile: string = getDateNote(today);
    let tnfExist = fs.existsSync(todayNoteFile);
    if (!tnfExist && !args.create) {
        console.error("Today's note does not exist");
    } else {
        if (!tnfExist) {
            if (!fs.existsSync(OBSIDIAN_DIARY_TEMPLATE)) {
                console.error("Diary template does not exist");
                process.exit(1);
            } else {
                console.log("Today's note does not exist, using template");
                fs.copyFileSync(OBSIDIAN_DIARY_TEMPLATE, todayNoteFile);
            }
        }
        let todayNoteContent = fs.readFileSync(todayNoteFile).toString().split('\n');

        addNoteListToSection(todayNoteContent, '## Zettelkasten', newZk, /^\d{12}\.md$/);
        addNoteListToSection(todayNoteContent, '## Docs', newNormal, /.+\.md$/);

        fs.writeFileSync(todayNoteFile, todayNoteContent.join('\n'));
    }
}

if (args['spaced-tm'] || args['spaced-td']) {
    console.log('Generating spaced summary...');
    fs.writeFileSync(OBSIDIAN_SPACED, generateSpaced(getDate(today, args['spaced-tm'] ? 1 : 0)));
}
