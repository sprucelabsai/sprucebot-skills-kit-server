const glob = require('glob')
const path = require('path')

module.exports = (dir, router, options) => {
	const matches = glob.sync(path.join(dir, '/**/*.js'), {
		ignore: ['**/ignore/**', '**/*test*']
	})
	matches.forEach(match => {
		const ware = require(match)
		ware(router, options)
	})
}
