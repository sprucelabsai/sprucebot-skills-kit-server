const glob = require('glob')
const path = require('path')

module.exports = (dir, router) => {
	const matches = glob.sync(path.join(dir, '/**/*.js'), {
		ignore: ['**/cron.js', '**/ignore/**', '**/*test*']
	})
	matches.forEach(function(match) {
		controller = require(match)
		controller(router)
	})
}
