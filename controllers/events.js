const debug = require('debug')('sprucebot-skills-kit-server')

module.exports = (router, options) => {
	const listenersByEventName = options.listenersByEventName

	router.post('/hook.json', async (ctx, next) => {
		// only fire if we are listening to this event
		if (ctx.event) {
			debug('Event listener firing', ctx.event.name)
			await listenersByEventName[ctx.event.name](ctx, next)

			// core will ignore this
			if (!ctx.body) {
				ctx.body = { status: 'success', ignore: true }
			}
		} else {
			debug('No listeners found, ignoring')
			// no listener, ignore here
			ctx.body = { status: 'success', ignore: true }
			next()
		}
	})
}
