const fetch = require('sync-fetch');
const Destiny2API = require('node-destiny-2');
const { threadId, parentPort, workerData }  = require("worker_threads");

const config = require('./config.json');
const destiny = new Destiny2API({ key: config.APIkey });

let itemManifest = require('./itemManifest.json')
let activityManifest = require('./activityManifest.json')

async function run(pgcr) {
    let report = await destiny.getPostGameCarnageReport(pgcr).then(res => {return res}).catch(err => {throw err});
    let data = []
    let skip = true;

    if (!(report.Response.activityDetails.mode in modes)) {
        parentPort.postMessage(data);
        return;
    }

    for (entry in report.Response.entries) {
       // console.log(entry.standing)
        let currentdata = {
            mode: modes[report.Response.activityDetails.mode],
            map: activityManifest[report.Response.activityDetails.referenceId].displayProperties.name,
            weapons: [],
            class: report.Response.entries[entry].player.characterClass,
            date: new Date(report.Response.period).getTime(),
            matchStatus: report.Response.entries[entry].standing == 1 ? 'Defeat' : 'Victory',
            skip: false
        }

        let weapons = [];
        for (weapon in report.Response.entries[entry].extended.weapons) {
            currentdata.weapons.push(itemManifest[report.Response.entries[entry].extended.weapons[weapon].referenceId].displayProperties.name)
        }

        data.push(currentdata)
    }

    parentPort.postMessage(data);
    return;
}

let modes = {
    10: 'control',
    84: 'trials',
    43: 'IronBannerControl',
    90: 'IronBannerRift',
    89: 'ZoneControl',
    88: 'Rift',
    80: 'Elimination',
    48: 'Rumble',
    37: 'Survival'
}

run(workerData)
parentPort.on('message', message => run(message));
