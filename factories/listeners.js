const glob = require('glob')
const path = require('path')
const { camelCase } = require('lodash')

module.exports = (dir, router) => {
	const matches = glob.sync(path.join(dir, '/**/*.js'), {
		ignore: ['**/ignore/**', '**/*test*']
	})

	return matches.reduce((ctx, match) => {
		const m = require(match)
		let shortName = match.replace(dir, '').replace(path.extname(match), '')
		if (shortName[0] === path.sep) {
			shortName = shortName.substr(1)
		}
		let eventName
		// swap path separators for colons
		if (shortName.search(path.sep) > -1) {
			// custom event
			eventName = shortName.replace(/[\/\\]/gi, ':')
			ctx[eventName] = require(match)
		} else {
			// coe events are camel case because I DON'T KNOW
			eventName = camelCase(shortName)
			ctx[eventName] = ctx[shortName] = require(match)
		}

		return ctx
	}, {})
}
