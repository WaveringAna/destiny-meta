
const fetch = require('sync-fetch')
const Destiny2API = require('node-destiny-2');

const { Worker, parentPort, workerData }  = require("worker_threads");

const config = require('./config.json');

const destiny = new Destiny2API({
    key: config.APIkey
});

const delay = ms => new Promise(res => setTimeout(res, ms));

const customFilter = (object, key, value) => {
    if (Array.isArray(object)) {
        for (const obj of object) {
            const result = customFilter(obj, key, value);
            if (result)
                return obj;
        }
    } else {
        if (object.hasOwnProperty(key) && object[key] === value)
            return object;

        for (const k of Object.keys(object)) {
            if (typeof object[k] === "object") {
                const o = customFilter(object[k], key, value);
                if (o !== null && typeof o !== 'undefined')
                    return o;
            }
        }

        return null;
    }
}

function requestPGCR(pgcrID) {
	return new Promise((resolve, reject) => {
		destiny.getPostGameCarnageReport(pgcrID)
		.then(res => {
			resolve({ response: res, error: null });
		})
		.catch(err => {
			reject(err);
		});
	});
}

function requestActivityHistory(membershipType, destinyMembershipId, characterId) {
    return new Promise((resolve, reject) => {
        destiny.getActivityHistory(membershipType, destinyMembershipId, characterId)
        .then(res => {
            resolve({ response: res, error: null });
        })
        .catch(err => {
            reject(err);
        });
    })
}

async function init() {
    //sometimes a PGCR isnt ever made, terminate after 15 minutes and let the data go
    let t = setTimeout(function() {
        Worker.close();
    }, 1800000);

    let matchStatus = false;

    let activityhistory = await requestActivityHistory(workerData.membershipType, workerData.membershipId, workerData.character, {count:[1], mode: [5]})
    let previousPGCR = activityhistory.response.Response.activities[0].activityDetails.instanceId;
    console.log(previousPGCR)

    while (matchStatus == false) {
        let refresh = await requestActivityHistory(workerData.membershipType, workerData.membershipId, workerData.character, {count:[1], mode: [5]})
        //console.log(refresh.response.Response.activities)
        let newmatch = refresh.response.Response.activities[0].activityDetails.instanceId;

        if (newmatch != previousPGCR) {
            let pgcr = await requestPGCR(newmatch);
            let data = customFilter(pgcr, "characterId", workerData.character);
            let status = data.values.standing.basic.displayValue;

            //workerData.matchStatus = status;
            //Count top 3 rumble and ties as wins

            if (status == "Victory" ||
                status == "1" ||
                status == "2" ||
                status == "3" ||
                status == "Tie")
                workerData.matchStatus = "Victory";
            else if (status == "Defeat" ||
                status == "4" ||
                status == "5" ||
                status == "6"
            )
                workerData.matchStatus = "Defeat";

            matchStatus = true;

            //Anonymise data
            delete workerData["membershipId"];
            delete workerData["membershipType"];
            delete workerData["character"]

            parentPort.postMessage(workerData);
            break;
        }

        await delay(90000)
    }
}

init();

