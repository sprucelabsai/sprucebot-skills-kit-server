const fs = require('fs')
const path = require('path')
const debug = require('debug')('sprucebot-skills-kit-server')
const Sequelize = require('sequelize')
const Umzug = require('umzug')

const defaultModelsDir = path.resolve(__dirname, '../models')

function filterFile(file) {
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
	const sequelize = new Sequelize(database.url, sqlOptions)
	const coreModels = fs
		.readdirSync(defaultModelsDir)
		.filter(filterFile)
		.map(file => path.resolve(defaultModelsDir, file))

	let skillModels = []
	if (fs.existsSync(modelsDir)) {
		skillModels = fs
			.readdirSync(modelsDir)
			.filter(filterFile)
			.map(file => path.resolve(modelsDir, file))
	}

	// All models available together <3
	const models = coreModels.concat(skillModels).reduce((models, file) => {
		var model = sequelize.import(file)
		models[model.name] = model
		debug('Imported Skill Model: ', model.name)
		return models
	}, {})

	Object.keys(models).forEach(function(modelName) {
		if (models[modelName].hasOwnProperty('associate')) {
			models[modelName].associate(models)
		}
	})

	// We should only run sync() on the skill db.
	// Core handles it's own migrations
	// So don't run migrations on any model relies on core db
	async function sync() {
		const coreModelNames = coreModels.map(file => path.basename(file, '.js')) // ['User', 'Location', 'UserLocation']
		const filteredModels = []
		Object.keys(models).forEach(key => {
			const model = models[key]
			if (!model.options.doNotSync) {
				debug('Allowing this model to sync()', model.name)
				filteredModels.push(model)
			}
		})

		await sequelize.sync()

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

	ctx[key] = { models, sequelize, sync }
}
