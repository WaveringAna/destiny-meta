const fetch = require('sync-fetch');
const Destiny2API = require('node-destiny-2');
const MongoClient = require('mongodb').MongoClient;

const fs = require('fs');
const config = require('./config.json');
const {Worker} = require("worker_threads");

const dbName = 'DestinyMeta';
const client = new MongoClient(config.MongoDB);
const destiny = new Destiny2API({ key: config.APIkey });

function getManifest() {
	return new Promise((resolve, reject) => {
		destiny.getManifest()
		.then(res => {
			let manifest = {}

			manifest.itemManifest = fetch("https://www.bungie.net" + res.Response.jsonWorldComponentContentPaths.en.DestinyInventoryItemDefinition, {}).json();
			manifest.activityManifest = fetch("https://www.bungie.net" + res.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition,{}).json();

			resolve(manifest);
		})
		.catch(err => {
			console.error(`Error: ${err}`)
		});
	});
}

function createWorker(Manifest, db, collection) {
	const worker = new Worker("./dataGatherer.js", { workerData: Manifest });

	worker.on("error", error => {
		console.log(error);
	});

	worker.on("exit", exitCode => {
		console.log(`It exited with code ${exitCode}`);
		createWorker(Manifest, db);
	});

	worker.on("message", async data => {
		//Hold the data, send to PGCRcollector to get match result
		const pgcrWorker = new Worker("./pgcrWorker.js", { workerData: data });

		pgcrWorker.on("error", error => {
			console.log(error);
		});

		pgcrWorker.on("exit", exitCode => {
			console.log(`pgcrWorker exited with code ${exitCode}`);
		});

		pgcrWorker.once("message", async completedData => {
			console.log(completedData)
			const insertResult = await collection.insertOne(completedData);
			console.log('Inserted documents =>', insertResult);
		});
	});
}

async function init() {
	console.log('lets go')
	await client.connect();
	console.log('Connected successfully to server');

	console.log('Getting Manifest');
	let Manifest = await getManifest();
	console.log('Got Manifest');

	const db = client.db(dbName);
	const collection = db.collection('data');

	for (let i = 0; i < 8; i++) {
		createWorker(Manifest, db, collection);
	}
}

init();
