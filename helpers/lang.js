module.exports = {
	lang: {},
	overrides: {},
	async configure(langDir) {
		this.lang = require(`${langDir}/default.js`)
		try {
			this.overrides = require(`${langDir}/overrides.js`)
		} catch (err) {
			console.info('No lang override specified.')
		}
	},
	getText(key, context = {}) {
		const translations = {
			...this.lang,
			...this.overrides,
			...context
		}
		if (translations[key]) {
			return typeof translations[key] === 'function'
				? translations[key](translations)
				: translations[key]
		}

		throw Error(`Translation missing key ${key}`)
	}
}
