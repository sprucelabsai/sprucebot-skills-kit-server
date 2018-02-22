const fs = require('fs')
const path = require('path')
const debug = require('debug')('sprucebot-skills-kit-server')
const Sequelize = require('sequelize')
const Umzug = require('umzug')

const defaultModelsDir = path.resolve(__dirname, '../models')

function filterFile(file) {
	console.log(file.indexOf('.'))
	const didFilter = file.indexOf('.') !== 0 && file !== 'index.js'
	if (!didFilter) {
		console.warn(`Filtered file from sequelize import() model %s`, file)
	}
	return didFilter
}

module.exports = (
	{ runMigrations, modelsDir, migrationsDir, database, options },
	key,
	ctx
) => {
	// read all models and import them into the ctx["key"] object
	const sqlOptions = {
		operatorsAliases: false,
		...{ ...options, dialect: database.dialect }
	}
	const sequelizeCore = new Sequelize(database.core, sqlOptions)
	const sequelize = new Sequelize(database.skill, sqlOptions)
	const coreModels = fs
		.readdirSync(defaultModelsDir)
		.filter(filterFile)
		.map(file => path.resolve(defaultModelsDir, file))
		.reduce((models, file) => {
			var model = sequelizeCore.import(file)
			models[model.name] = model
			debug('Imported core Model: ', model.name)
			return models
		}, {})

	let skillModels = {}
	if (fs.existsSync(modelsDir)) {
		skillModels = fs
			.readdirSync(modelsDir)
			.filter(filterFile)
			.map(file => path.resolve(modelsDir, file))
			.reduce((models, file) => {
				var model = sequelize.import(file)
				models[model.name] = model
				debug('Imported Skill Model: ', model.name)
				return models
			}, {})
	}

	// All models available together <3
	const models = { ...coreModels, skillModels }

	Object.keys(models).forEach(function(modelName) {
		if (models[modelName].hasOwnProperty('associate')) {
			models[modelName].associate(models)
		}
	})

	// We should only run sync() on the skill db.
	// Core handles it's own migrations
	const baseSync = sequelize.sync
	async function sync() {
		// Wait for original sequelize.sync()
		await baseSync.apply(sequelize, arguments)

		// Run migrations if enabled
		if (runMigrations && fs.existsSync(migrationsDir)) {
			debug('Running sequelize migrations')
			const umzug = new Umzug({
				storage: 'sequelize',
				storageOptions: {
					sequelize: sequelize
				},
				migrations: {
					params: [sequelize.getQueryInterface(), sequelize.constructor],
					path: migrationsDir,
					pattern: /\.js$/
				}
			})

			// Run Migrations
			await umzug.up()

			debug('Finished sequelize migrations')
		} else {
			console.warn(
				'Could not find any migrations sequelize migrationsDir %s',
				migrationsDir
			)
		}
	}

	// Ours includes migrations now
	sequelize.sync = sync

	ctx[key] = { models, sequelize }
}
