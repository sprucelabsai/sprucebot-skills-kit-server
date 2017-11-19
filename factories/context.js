const glob = require('glob')
const path = require('path')
const config = require('config')

module.exports = (dir, key, ctx) => {
	if (!ctx[key]) {
		ctx[key] = {}
	}
	const matches = glob.sync(path.join(dir, '/*.js'), {
		ignore: ['**/ignore/**', '**/*test*']
	})
	matches.forEach(match => {
		const m = require(match)
		const filename = path.basename(match, path.extname(match))
		if (m.init) {
			m.init(config[key] && config[key][filename])
		}
		ctx[key][filename] = m
	})
}
