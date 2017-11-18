const jwt = require('jsonwebtoken')
var debug = require('debug')('sprucebot-skills-kit-server')
const config = require('config')

module.exports = router => {
	// jwt validation
	const auth = async (id, ctx, next) => {
		if (!next) {
			next = ctx
			ctx = id
			id = null
		}

		let token =
			id || ctx.cookies.get('jwt') || ctx.request.headers['x-skill-jwt']
		if (token) {
			debug(`middleware/auth found token at ${ctx.path}, checking`)
			try {
				var decoded = jwt.verify(token, config.API_KEY.toString().toLowerCase())
				ctx.auth = await ctx.sb.user(decoded.locationId, decoded.userId)
				ctx.auth.jwt = token
				debug(`middleware/auth token valid at ${ctx.path}`)
			} catch (err) {
				debug(`middleware/auth token invalid at ${ctx.path}`)
				ctx.throw('INVALID_AUTHENTICATION')
			}
		} else {
			debug('middleware/auth no token found')
		}

		await next()
	}

	router.use('*.json', auth)
	router.param('jwt', auth)

	// authorize paths for team, owner, and guest
	router.use('/api/*/teammate/*', async (ctx, next) => {
		let role = ctx.auth && ctx.auth.role
		if (role !== 'teammate' && role !== 'owner') {
			debug(`middleware/auth denied access to ${ctx.path} for role: '${role}' `)
			ctx.throw('NOT_AUTHORIZED')
		}
		await next()
	})

	router.use('/api/*/owner/*', async (ctx, next) => {
		let role = ctx.auth && ctx.auth.role
		if (role !== 'owner') {
			debug(`middleware/auth denied access to ${ctx.path} for role: '${role}' `)
			ctx.throw('NOT_AUTHORIZED')
		}
		await next()
	})

	router.use('/api/*/guest/*', async (ctx, next) => {
		let role = ctx.auth && ctx.auth.role
		if (!role) {
			debug(`middleware/auth denied access to ${ctx.path} for role: '${role}' `)
			ctx.throw('NOT_AUTHORIZED')
		}
		await next()
	})
}
