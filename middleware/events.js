const debug = require('debug')('sprucebot-skills-kit-server')
const jwt = require('jsonwebtoken')
const config = require('config')

module.exports = (router, options) => {
	const listenersByEventName = options.listenersByEventName

	router.use(async (ctx, next) => {
		let body = ctx.request.body
		const eventName = body && body.event

		// setup if we are listening to this event
		if (
			ctx.path === '/hook.json' &&
			body &&
			eventName &&
			listenersByEventName[eventName]
		) {
			// lets make sure the data is signed pro
			try {
				body = jwt.verify(body.data, config.API_KEY.toString().toLowerCase())
			} catch (err) {
				debug('IMPROPERLY SIGNED PAYLOAD FOR EVENT. IGNORING')
				next()
				return
			}

			debug('router.use for event', eventName)
			debug('Listener found, adding event to ctx')

			const userId = body.userId || (body.payload && body.payload.userId)

			// is a user and location part of this event?
			if (userId && body.locationId) {
				ctx.event = await ctx.sb.user(body.locationId, userId)
			} else if (body.locationId) {
				// just a location
				const location = await ctx.sb.location(body.locationId)
				ctx.event = {
					LocationId: location.id,
					Location: location
				}
			} else if (userId && config.get('GLOBAL')) {
				// just user id if global
				debug('Global skill handling event')
				const user = await ctx.sb.globalUser(userId)
				ctx.event = {
					User: user,
					UserId: user.id
				}
			}

			if (ctx.event && body && body.payload) {
				ctx.event.payload = body.payload
			}

			if (ctx.event) {
				ctx.event.name = eventName // pass through event name
			}
		} else if (ctx.path === '/hook.json' && eventName) {
			debug('No listener found for', eventName)
		}

		await next()
	})
}
