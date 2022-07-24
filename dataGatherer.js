const fetch = require('sync-fetch')
const Destiny2API = require('node-destiny-2');

const { parentPort, workerData }  = require("worker_threads");

const config = require('./config.json');

const destiny = new Destiny2API({
    key: config.APIkey
});

/**                    TODO, UN-HARDCODE THESE, CAN PULL FROM MANIFEST
 * Buckethashes:
 * Subclass:           3284755031
 * Weapons:            [1498876634, 2465295065, 953998645]
 * Armor:              [3448274439, 3551918588, 14239492, 20886954, 1585787867]
 *
 * General Hashes:
 * light:              1935470627
 * mobility:           2996146975
 * resilience:         392767087
 * recovery:           1943323491
 * discipline:         1735777505
 * intellect:          144602215
 * strength:           4244567218
 *
**/

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

function getBungieProfile(membershipID) {
	return new Promise((resolve, reject) => {
		destiny.getBungieNetUserById(membershipID)
		.then(res => {
			resolve({ response: res, error: null });
		})
		.catch(err => {
			reject(err);
		});
	})
}

function getID(name, code) {
	return new Promise((resolve, reject) => {
		destiny.getActualMembershipIDfromName(name, code)
		.then(res => {
			resolve({ response: res, error: null });
		})
		.catch(err => {
			reject(err);
		});
	});
}

function getProfile(membershipID, membershipType) {
	return new Promise((resolve, reject) => {
		destiny.getProfile(membershipType, membershipID, [200, 201, 204, 205, 300, 302, 1000])
		.then(res => {
			resolve({ response: res, error: null });
		})
		.catch(err => {
			reject(err);
		});
	});
}

async function init() {
	console.log("Starting")

	while (true) {
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
			membershipID: '',
			membershipType: '',
			character: ''
		}

		let bungienetID = Math.floor(Math.random() * 21000000) + 1;
		let bungieName = await getBungieProfile(bungienetID);

		if (bungieName.response.ErrorCode != 1)
			continue;

		if (typeof bungieName.response.Response.cachedBungieGlobalDisplayName == 'undefined')
			continue;

		let profileName = await getID(bungieName.response.Response.cachedBungieGlobalDisplayName, bungieName.response.Response.cachedBungieGlobalDisplayNameCode);

		if (profileName.response.ErrorCode != 1 || profileName.response.Response.length == 0)
			continue;

		let membershipID = profileName.response.Response[0].membershipId;
		let membershipType = profileName.response.Response[0].membershipType;

		let profile = await getProfile(membershipID, membershipType);

		if (profile.response.ErrorCode != 1 || profile.response.Response.length == 0)
			continue;

		for (characterHash in profile.response.Response.characterActivities.data) {
			let characterDetail = profile.response.Response.characterActivities.data[characterHash]

			if (!(characterDetail.currentActivityModeType in characterDetail) &&
				characterDetail.currentActivityHash > 0 &&
				characterDetail.currentActivityModeType in modes) {

				currentdata.map = workerData.activityManifest[characterDetail.currentActivityHash].displayProperties.name;

				//They are in an activity right now!, grab what it is and check what they have equipped
				currentdata.mode = modes[characterDetail.currentActivityModeType];

				let equippedStuff = profile.response.Response.characterEquipment.data[characterHash].items

				for (item in equippedStuff) {
					let itemDetails = workerData.itemManifest[equippedStuff[item].itemHash]
					let name = itemDetails.displayProperties.name;
					let bucket = hashes[itemDetails.inventory.bucketTypeHash];

					let exoticstatus = itemDetails.inventory.tierType; //5 is legendary, 6 is exotic

					if (bucket == "Weapon")
						currentdata.weapons.push(name);

					if (bucket == "Armor" && exoticstatus == 6)
						currentdata.exoticarmor = name;

					if (bucket == "Subclass")
						currentdata.subclass = name;

					currentdata.class = classes[profile.response.Response.characters.data[characterHash]["classHash"]];

					currentdata.stats = {
						mobility: profile.response.Response.characters.data[characterHash]["stats"]["2996146975"],
						resilience: profile.response.Response.characters.data[characterHash]["stats"]["392767087"],
						recovery: profile.response.Response.characters.data[characterHash]["stats"]["1943323491"],
						discipline: profile.response.Response.characters.data[characterHash]["stats"]["1735777505"],
						intellect: profile.response.Response.characters.data[characterHash]["stats"]["144602215"],
						strength: profile.response.Response.characters.data[characterHash]["stats"]["4244567218"]
					}

					currentdata.date = Date.now();

					currentdata.membershipID = membershipID;
					currentdata.membershipType = membershipType;
					currentdata.character = characterHash;
				}

                parentPort.postMessage(currentdata);
				continue;
			}
		}
    }
}

init();
