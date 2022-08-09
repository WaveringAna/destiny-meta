const fetch = require('sync-fetch');
const Destiny2API = require('node-destiny-2');
const { threadId, parentPort, workerData }  = require("worker_threads");

const config = require('./config.json');
const destiny = new Destiny2API({ key: config.APIkey });

let itemManifest = require('./itemManifest.json')
let activityManifest = require('./activityManifest.json')

async function run(pgcr) {
    let data = []
    let report = await destiny.getPostGameCarnageReport(pgcr).then(res => {return res}).catch(err => {console.log(err); parentPort.postMessage(data); return;});
    try {
        if (!(report.Response.activityDetails.mode in pvpmodes) && !(report.Response.activityDetails.mode in pvemodes)) {
            parentPort.postMessage(data);
            return;
        }

        if (report.Response.activityDetails.mode in pvpmodes) {
            for (entry in report.Response.entries) {
                // console.log(entry.standing)
                let currentdata = {
                    mode: pvpmodes[report.Response.activityDetails.mode],
                    map: activityManifest[report.Response.activityDetails.referenceId].displayProperties.name,
                    weapons: [],
                    class: report.Response.entries[entry].player.characterClass,
                    date: new Date(report.Response.period).getTime(),
                    matchStatus: report.Response.entries[entry].standing == 1 ? 'Defeat' : 'Victory'
                }

                let weapons = [];
                for (weapon in report.Response.entries[entry].extended.weapons) {
                    currentdata.weapons.push(itemManifest[report.Response.entries[entry].extended.weapons[weapon].referenceId].displayProperties.name)
                }

                data.push(currentdata)
            }
        } else if (report.Response.activityDetails.mode in pvemodes) {
            for (entry in report.Response.entries) {
                let currentdata = {
                    mode: pvemodes[report.Response.activityDetails.mode],
                    //map: activityManifest[report.Response.activityDetails.referenceId].displayProperties.name,
                    weapons: [],
                    class: report.Response.entries[entry].player.characterClass,
                    date: new Date(report.Response.period).getTime(),
                    matchStatus: report.Response.entries[entry].values.completionReason.basic.value == 0 ? 'Success' : 'Failed'
                }

                if (report.Response.activityDetails.mode == 46) {
                    if (activityManifest[report.Response.activityDetails.referenceId].displayProperties.name == "Nightfall: Grandmaster")
                        currentdata.map = activityManifest[report.Response.activityDetails.referenceId].displayProperties.description
                    else {
                        parentPort.postMessage(data);
                        return;
                    }
                } else
                    currentdata.map = activityManifest[report.Response.activityDetails.referenceId].displayProperties.name

                let weapons = [];
                for (weapon in report.Response.entries[entry].extended.weapons) {
                    currentdata.weapons.push(itemManifest[report.Response.entries[entry].extended.weapons[weapon].referenceId].displayProperties.name)
                }

                data.push(currentdata)
            }
        }
    } catch (e) {
        console.log(e)
        console.log(report)
    }

    parentPort.postMessage(data);
    return;
}

let pvpmodes = {
    10: 'control',
    84: 'trials',
    43: 'IronBannerControl',
    90: 'IronBannerRift',
    89: 'ZoneControl',
    88: 'Rift',
    80: 'Elimination',
    48: 'Rumble',
    37: 'Survival',
    73: 'control'
}

let pvemodes = {
    46: 'Nightfall',
    4:  'Raid',
    82: 'Dungeon'
}

run(workerData)
parentPort.on('message', message => run(message));
