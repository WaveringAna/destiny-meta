require('draftlog').into(console)
const fetch = require('sync-fetch');
const Destiny2API = require('node-destiny-2');
const MongoClient = require('mongodb').MongoClient;

const fs = require('fs');
const config = require('./config.json');

const dbName = 'DestinyMeta';
const client = new MongoClient(config.MongoDB);
const destiny = new Destiny2API({ key: config.APIkey });

let dataCalls = 0;
let startTime = Date.now();
let callsPS = 0;

let processingPGCRs = 0;
let processedPGCRs = 0;
let rejectedPGCRs = 0;
let Manifest;
let db;
let collection;
let initLog = console.draft('lets go');
let callLog = console.draft(`Processed 0 calls per second`)

async function init() {
	initLog('Connecting to server');
	await client.connect();
	initLog('Connected successfully to server');
	initLog('Getting Manifest');
	Manifest = await destiny.getManifest().then(res => {
		let manifest = {}

		manifest.itemManifest = fetch("https://www.bungie.net" + res.Response.jsonWorldComponentContentPaths.en.DestinyInventoryItemDefinition, {}).json();
		manifest.activityManifest = fetch("https://www.bungie.net" + res.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition,{}).json();

        return manifest;
    });
	initLog('Got Manifest');
	db = client.db(dbName);
	collection = db.collection('data');
	for (let i = 0; i < 7; i++) {
		dataGatherer(i);
	}
	initLog(`Processing ${processingPGCRs} PGCRs Processed ${processedPGCRs} PGCRs Rejected ${rejectedPGCRs} PGCRs`)

	setInterval(() =>  {
		callLog(`Processed ${Math.floor((dataCalls)/ (Date.now()-startTime)*1000)} calls per second on average over ${ Math.floor((Date.now()-startTime)/1000) } seconds`)
	} , 1000)

	//setInterval(() => { dataCalls = 0; startTime = Date.now(); }, 5000);
} init();

async function dataGatherer(workerId) {
	//const log = new Signale({interactive: true, scope: `dataGatherer ${workerId}`});
	let log = console.draft(`Thread ${workerId} starting`)
	log("Starting Data Gatherer Thread", workerId)

	while (true) {
		let skip = false;

		let bungienetID = Math.floor(Math.random() * 21000000) + 1;
		log(`Thread ${workerId} Looking up bungie profile ${bungienetID}`);
		let bungieName;
		try {
			bungieName = await destiny.getBungieNetUserById(bungienetID); dataCalls++;
			if (bungieName.ErrorCode != 1 || typeof bungieName.Response.cachedBungieGlobalDisplayName == 'undefined')
				continue;
		} catch (err) {
			console.log(err)
			continue;
		}

		log(`Thread ${workerId} Looking up destiny membershipId ${bungieName.Response.cachedBungieGlobalDisplayName}`)
		let profileName
		try {
			profileName = await destiny.SearchDestinyPlayerByBungieName(bungieName.Response.cachedBungieGlobalDisplayName, bungieName.Response.cachedBungieGlobalDisplayNameCode); dataCalls++;
			if (profileName.ErrorCode != 1 || profileName.Response.length == 0)
				continue;
		} catch (err) {
				console.log(err)
				continue;
		}

		let membershipId = profileName.Response[0].membershipId;
		let membershipType = profileName.Response[0].membershipType;

		log(`Thread ${workerId} Looking up destiny profile ${bungieName.Response.cachedBungieGlobalDisplayName}`)
		let profile;
		try {
			profile = await destiny.getProfile(membershipType, membershipId, [200, 201, 204, 205, 300, 302, 1000]); dataCalls++;
			if (profile.ErrorCode != 1 || profile.Response.length == 0)
				continue;
		} catch (err) {
			console.log(err)
			continue;
		};

		for (characterHash in profile.Response.characterActivities.data) {
			let characterDetail = profile.Response.characterActivities.data[characterHash]

			if (!(characterDetail.currentActivityModeType in characterDetail) &&
				characterDetail.currentActivityHash > 0 &&
				characterDetail.currentActivityModeType in modes) {

				if (typeof profile.Response.profileTransitoryData != "undefined") {
					try {
						for (player in profile.Response.profileTransitoryData.data.partyMembers) {
							if (profile.Response.profileTransitoryData.data.partyMembers[player].membershipId == membershipId) {
								processData(membershipId, membershipType, profile, characterHash, false);
							}
							else {
								processData(profile.Response.profileTransitoryData.data.partyMembers[player].membershipId, null, null, null, true);
							}
						}
					} catch {
						processData(membershipId, membershipType, profile, characterHash, false);
						break;
					}
				} else {
					processData(membershipId, membershipType, profile, characterHash, false);
					break;
				}
			}
		}
    }
}

async function processData(membershipId, membershipType, profile, characterHash, processProfile) {
	let characterDetail;

	if (processProfile == true) {
		let func;
		try {
			await destiny.getMembershipDataById(-1, membershipId); dataCalls++;
		} catch (err) {
			console.error(err)
		}

		membershipType = func.Response.destinyMemberships[0].membershipType

		try {
			profile = await destiny.getProfile(membershipType, membershipId, [200, 201, 204, 205, 300, 302, 1000]); dataCalls++;
			if (profile.ErrorCode != 1 || profile.Response.length == 0) {
				return;
			}
		} catch (err) {
			console.error(err)
		}

		for (hash in profile.Response.characterActivities.data) {
			let detail = profile.Response.characterActivities.data[hash]

			if (!(detail.currentActivityModeType in detail) &&
				detail.currentActivityHash > 0 &&
				detail.currentActivityModeType in modes) {

				characterDetail = profile.Response.characterActivities.data[hash];
				characterHash = hash;

				break;
			}
		}
	} else {
		characterDetail = profile.Response.characterActivities.data[characterHash];
	}


	let currentdata = {
		mode: '',
		map: '',
		weapons: [],
		exoticarmor: '',
		class: '',
		subclass: '',
		date: '',
		stats: {},
		date: '',
		membershipId: '',
		membershipType: '',
		character: ''
	}

	try {
		if (typeof characterDetail.currentActivityHash == "undefined")
			return;
		currentdata.map = Manifest.activityManifest[characterDetail.currentActivityHash].displayProperties.name;
		currentdata.mode = modes[characterDetail.currentActivityModeType];

		let equippedStuff = profile.Response.characterEquipment.data[characterHash].items

		for (item in equippedStuff) {
			let itemDetails = Manifest.itemManifest[equippedStuff[item].itemHash]
			let name = itemDetails.displayProperties.name;
			let bucket = hashes[itemDetails.inventory.bucketTypeHash];

			let exoticstatus = itemDetails.inventory.tierType; //5 is legendary, 6 is exotic

			if (bucket == "Weapon")
				currentdata.weapons.push(name);

			if (bucket == "Armor" && exoticstatus == 6)
				currentdata.exoticarmor = name;

			if (bucket == "Subclass")
				currentdata.subclass = name;

			currentdata.class = classes[profile.Response.characters.data[characterHash]["classHash"]];

			currentdata.stats = {
				mobility: profile.Response.characters.data[characterHash]["stats"]["2996146975"],
				resilience: profile.Response.characters.data[characterHash]["stats"]["392767087"],
				recovery: profile.Response.characters.data[characterHash]["stats"]["1943323491"],
				discipline: profile.Response.characters.data[characterHash]["stats"]["1735777505"],
				intellect: profile.Response.characters.data[characterHash]["stats"]["144602215"],
				strength: profile.Response.characters.data[characterHash]["stats"]["4244567218"]
			}

			currentdata.date = Date.now();

			currentdata.membershipId = membershipId;
			currentdata.membershipType = membershipType;
			currentdata.character = characterHash;
		}

		pgcrWorker(currentdata);
	} catch (e){
		console.log(e)
	}
}

async function pgcrWorker(currentdata) {
    //sometimes a PGCR isnt ever made, terminate after 15 minutes and let the data go
    /**let t = setTimeout(function() {
        processingPGCRs--; rejectedPGCRs++;
		return;
    }, 3600000);**/

    let matchStatus = false;

    let activityhistory;
	try {
		activityhistory = await destiny.getActivityHistory(currentdata.membershipType, currentdata.membershipId, currentdata.character, {count:[1], mode: [5]}); dataCalls++;
		if (activityhistory.ErrorCode != 1 || activityhistory.Response.length == 0 && typeof activityhistory.Response.activities != "undefined") {
			processingPGCRs--; rejectedPGCRs++;
			return;
		}
	} catch (err) {
		console.log(err)
		return;
	}

    let previousPGCR = activityhistory.Response.activities[0].activityDetails.instanceId;

	initLog(`Processing ${processingPGCRs++} PGCRs Processed ${processedPGCRs} PGCRs Rejected ${rejectedPGCRs} PGCRs`)

    while (matchStatus == false) {
		let refresh;
		try {
			refresh = await destiny.getActivityHistory(currentdata.membershipType, currentdata.membershipId, currentdata.character, {count:[1], mode: [5]}); dataCalls++;
			if (refresh.ErrorCode != 1 || refresh.Response.length == 0 && typeof refresh.Response.activities != "undefined") {
				processingPGCRs--; rejectedPGCRs++;
				return;
			}
		} catch (err) {
			console.log(err)
			return;
		}
        //console.log(refresh.response.Response.activities)
        let newmatch = refresh.Response.activities[0].activityDetails.instanceId;

        if (newmatch != previousPGCR) {
			let pgcr;
			try {
				pgcr = await destiny.getPostGameCarnageReport(newmatch); dataCalls++;
			} catch (err) {
				console.error(err)
				return;
			}

            let data = customFilter(pgcr, "characterId", currentdata.character);
			let status;

			try {
				status = data.values.standing.basic.displayValue;
			} catch (e) {
				console.log(e)
				console.log(data)
				processingPGCRs--; rejectedPGCRs++;
				return;
			}

            //currentdata.matchStatus = status;
            //Count top 3 rumble and ties as wins

            if (status == "Victory" ||
                status == "1" ||
                status == "2" ||
                status == "3" ||
                status == "Tie")
                currentdata.matchStatus = "Victory";
            else if (status == "Defeat" ||
                status == "4" ||
                status == "5" ||
                status == "6"
            )
                currentdata.matchStatus = "Defeat";

            //Anonymise data
            delete currentdata["membershipId"];
            delete currentdata["membershipType"];
            delete currentdata["character"]

            try {
				const insertResult = await collection.insertOne(currentdata);
				initLog(`Processing ${processingPGCRs--} PGCRs Processed ${processedPGCRs++} PGCRs Rejected ${rejectedPGCRs} PGCRs`)
			} catch (e) {
				console.log(e)
			}
			matchStatus = true;
            return;
        }
        await delay(90000)
    }
}

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

let hashes = {
	3284755031: 'Subclass',
	1498876634: 'Weapon',
	2465295065: 'Weapon',
	953998645: 'Weapon',
	3448274439: 'Armor',
	3551918588: 'Armor',
	14239492: 'Armor',
	20886954: 'Armor',
	1585787867: 'Armor'
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

let classes = {
	3655393761: 'Titan',
	671679327: 'Hunter',
	2271682572: 'Warlock'
}
