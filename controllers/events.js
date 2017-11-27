const debug = require('debug')('sprucebot-skills-kit-server')

module.exports = (router, options) => {
	const listenersByEventName = options.listenersByEventName

	router.post('/hook.json', async (ctx, next) => {
		const body = ctx.request.body

		debug('Event trigger', body.eventType)

		// only fire if we are listening to this event
		if (listenersByEventName[body.eventType] && ctx.event) {
			ctx.event.name = body.eventType // pass through event name
			debug('Event listener firing', ctx.event)
			await listenersByEventName[body.eventType](ctx, next)

			// core will ignore this
			if (!ctx.body) {
				ctx.body = { ignore: true }
			}
		} else {
			debug('No listeners found, ignoring')
			// no listener, ignore here
			ctx.body = { ignore: true }
			next()
		}
	})
}
