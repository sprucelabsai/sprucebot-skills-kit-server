const debug = require('debug')('sprucebot-skills-kit-server')

module.exports = (router, options) => {
	const listenersByEventName = options.listenersByEventName

	router.use(async (ctx, next) => {
		const body = ctx.request.body

		// setup if we are listening to this event
		if (
			ctx.path === '/hook.json' &&
			body &&
			body.eventType &&
			listenersByEventName[body.eventType]
		) {
			debug('router.use for event', body.eventType)
			debug('Listener found, adding event to ctx')

			const userId = body.userId || (body.payload && body.payload.userId)

			// is a user and location part of this event?
			if (userId && body.locationId) {
				ctx.event = await ctx.sb.user(body.locationId, userId)
			} else if (body.locationId) {
				// just a location
				const location = await ctx.sb.location(body.locationId)
				ctx.event = {
					Location: location
				}
			}

			if (ctx.event && body && body.payload) {
				ctx.event.payload = body.payload
			}

			if (ctx.event) {
				ctx.event.name = body.eventType // pass through event name
			}
		}

		await next()
	})
}
