#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var yargs = __importStar(require("yargs"));
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var moment_1 = __importDefault(require("moment"));
if (process.env.OBSIDIAN_ROOT === undefined) {
    console.error('Env OBSIDIAN_ROOT is not set!');
    process.exit(1);
}
var OBSIDIAN_ROOT = process.env.OBSIDIAN_ROOT;
var OBSIDIAN_DIARY = path.join(OBSIDIAN_ROOT, 'Diary');
var OBSIDIAN_DIARY_TEMPLATE = path.join(OBSIDIAN_DIARY, 'Template.md');
var OBSIDIAN_ZK = path.join(OBSIDIAN_ROOT, 'Diary', 'Zettelkasten');
var OBSIDIAN_ATTACHMENT = path.join(OBSIDIAN_ROOT, 'Attachments');
var OBSIDIAN_SPACED = path.join(OBSIDIAN_ROOT, 'Spaced.md');
var DIARY_FORMAT = path.join('YYYY.MM', 'YY.MM.DD');
function findNewFiles(startPath, startTime, endTime, excludes) {
    if (excludes === void 0) { excludes = []; }
    if (!fs.existsSync(startPath)) {
        console.error("Path does not exist: " + startPath);
        return [];
    }
    var result = [];
    var files = fs.readdirSync(startPath);
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        if (file.startsWith('.'))
            continue;
        var filename = path.join(startPath, file);
        if (excludes.includes(filename))
            continue;
        var stat = fs.statSync(filename);
        if (stat.isDirectory()) {
            result.push.apply(result, findNewFiles(filename, startTime, endTime, excludes));
        }
        else if (stat.mtime >= startTime && (endTime === undefined || stat.mtime < endTime)) {
            result.push(filename);
        }
    }
    return result;
}
function findSection(section, contents) {
    var linePos = -1;
    var lineStart = -1;
    var lineEnd = -1;
    var secStart = false;
    var pattern = new RegExp("^" + section.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$");
    for (var i = 0; i < contents.length; i++) {
        if (!secStart && pattern.test(contents[i])) {
            secStart = true;
            lineStart = i + 1;
        }
        else if (secStart && /^#+ /.test(contents[i])) {
            lineEnd = i;
            break;
        }
        if (secStart && !/^\s*$/.test(contents[i]))
            linePos = i + 1;
    }
    if (lineEnd == -1)
        lineEnd = contents.length;
    return { pos: linePos, start: lineStart, end: lineEnd };
}
function addNoteListToSection(contents, section, notes, pattern) {
    var line = findSection(section, contents);
    if (line.pos < 0) {
        console.error("Section '" + section + "' is not found. Skipped.");
    }
    else {
        var newContentList = [];
        for (var _i = 0, notes_1 = notes; _i < notes_1.length; _i++) {
            var nt = notes_1[_i];
            var ntname = path.basename(nt);
            if (!pattern.test(ntname)) {
                console.error("Not a valid note file: " + nt);
                continue;
            }
            var ntid = path.relative(OBSIDIAN_ROOT, nt);
            newContentList.push("[[" + ntid.substr(0, ntid.length - 3) + "]]");
        }
        var contentSet_1 = new Set();
        for (var l = line.start; l < line.end; ++l) {
            contentSet_1.add(contents[l].trim());
        }
        newContentList = newContentList.filter(function (t) { return !contentSet_1.has(t.trim()); });
        contents.splice.apply(contents, __spreadArrays([line.pos, 0], newContentList));
    }
}
function getDate(ref, days) {
    var newDate = new Date(ref);
    newDate.setDate(ref.getDate() + days);
    return newDate;
}
function generateSpaced(today) {
    if (today === undefined)
        today = new Date();
    today.setHours(0, 0, 0, 0);
    var spacedNames = ["Yesterday", "3 Days Ago", "10 Days Ago"];
    var spacedDays = [getDate(today, -1), getDate(today, -3), getDate(today, -10)];
    var result = spacedDays.map(function (d, i) {
        var noteFile = getDateNote(d);
        var noteId = path.relative(OBSIDIAN_ROOT, noteFile).slice(0, -3);
        if (fs.existsSync(noteFile)) {
            return "## " + spacedNames[i] + "\n[[" + noteId + "]]\n";
        }
        else {
            return "## " + spacedNames[i] + "\nNot found: `" + noteId + "`\n";
        }
    }).join('\n');
    return result + ("\n\n> Generated at " + (new Date()).toLocaleString() + "\n");
}
function getDateNote(date) {
    return path.join(OBSIDIAN_DIARY, moment_1.default(date).format(DIARY_FORMAT) + '.md');
}
var args = yargs
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
var today = new Date();
if (args.date) {
    today = moment_1.default(args.date, 'YYYY.MM.DD').toDate();
}
console.log("Using date " + today.toLocaleDateString() + " as today");
if (args.diary) {
    console.log('Generating diary summary...');
    today.setHours(0, 0, 0, 0);
    var nextDay = getDate(today, 1);
    var newNormal = findNewFiles(OBSIDIAN_ROOT, today, nextDay, [OBSIDIAN_DIARY, OBSIDIAN_ZK, OBSIDIAN_SPACED, OBSIDIAN_ATTACHMENT]);
    var newZk = findNewFiles(OBSIDIAN_ZK, today, nextDay);
    var todayNoteFile = getDateNote(today);
    var tnfExist = fs.existsSync(todayNoteFile);
    if (!tnfExist && !args.create) {
        console.error("Today's note does not exist");
    }
    else {
        if (!tnfExist) {
            if (!fs.existsSync(OBSIDIAN_DIARY_TEMPLATE)) {
                console.error("Diary template does not exist");
                process.exit(1);
            }
            else {
                console.log("Today's note does not exist, using template");
                fs.copyFileSync(OBSIDIAN_DIARY_TEMPLATE, todayNoteFile);
            }
        }
        var todayNoteContent = fs.readFileSync(todayNoteFile).toString().split('\n');
        addNoteListToSection(todayNoteContent, '## Zettelkasten', newZk, /^\d{12}\.md$/);
        addNoteListToSection(todayNoteContent, '## Docs', newNormal, /.+\.md$/);
        fs.writeFileSync(todayNoteFile, todayNoteContent.join('\n'));
    }
}
if (args['spaced-tm'] || args['spaced-td']) {
    console.log('Generating spaced summary...');
    fs.writeFileSync(OBSIDIAN_SPACED, generateSpaced(getDate(today, args['spaced-tm'] ? 1 : 0)));
}
