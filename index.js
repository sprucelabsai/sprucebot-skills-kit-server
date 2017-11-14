var debug = require('debug')('sprucebot-skills-kit-server')
const Koa = require('koa')
const next = require('next')
const Router = require('koa-router')
const cron = require('node-cron')
const _ = require('lodash')
const bodyParser = require('koa-bodyparser')
const { version } = require('./package.json')
const defaultErrors = require('./support/errors')
const glob = require('glob')
const path = require('path')
const cors = require('@koa/cors')
const staticServe = require('koa-static')

const required = key => {
	throw new Error(`SkillKit server needs ${key}`)
}

module.exports = ({
	sprucebot = required('sprucebot'),
	port = required('port'),
	serverHost = required('serverHost'),
	interfaceHost = required('interfaceHost'),
	nextConfig = required('nextConfig'),
	errors = {},
	servicesDir = required('servicesDir'),
	utilitiesDir = required('utilitiesDir'),
	controllersDir = required('controllersDir'),
	middlewareDir = required('middlewareDir'),
	listenersDir = required('listenersDir'),
	langDir = required('langDir'),
	staticDir = false
}) => {
	debug('Starting server boot sequence with port', port)
	// you can override error messages
	const allErrors = { ...defaultErrors, ...errors }

	// Setup NextJS App
	debug('Setting up Nextjs with', nextConfig)
	const app = next(nextConfig)
	const handle = app.getRequestHandler()

	// Kick off sync with platform
	sprucebot.sync().catch(err => {
		console.error(
			`Failed to sync your skill's settings with ${sprucebot.https.host}`
		)
		console.error(err)
	})

	app.prepare().then(async () => {
		const koa = new Koa()

		/*=======================================
        =             	BASICS   	            =
        =======================================*/
		koa.use(cors())
		koa.use(bodyParser())
		staticDir && koa.use(staticServe(staticDir))

		const router = new Router()

		/*=======================================
        =        Utilities/Services/Lang        =
        =======================================*/
		try {
			// make lang available via utilities
			if (langDir) {
				debug('langDir detected at', langDir)
				sprucebot.skillskit.lang.configure(langDir)
				koa.context.utilities = { lang: sprucebot.skillskit.lang }
			} else {
				debug(
					'No landDir detected. ctx.utilities.lang.getText() will fail sever side'
				)
			}

			// services for skills-kit
			sprucebot.skillskit.factories.context(
				servicesDir,
				'services',
				koa.context
			)

			debug('Kit services loaded')

			// utilities for core
			sprucebot.skillskit.factories.context(
				path.join(__dirname, 'utilities'),
				'utilities',
				koa.context
			)

			debug('Core utilities loaded')

			// utilities for skills-kit
			sprucebot.skillskit.factories.context(
				utilitiesDir,
				'utilities',
				koa.context
			)

			debug('Kit utilities loaded')

			// make sure services and utilities can access each other
			_.each(koa.context.services, service => {
				service.services = koa.context.services
				service.utilities = koa.context.utilities
				service.sb = sprucebot
			})

			_.each(koa.context.utilities, util => {
				util.utilities = koa.context.utilities
				util.services = koa.context.services
				util.sb = sprucebot
			})

			debug('Utilities and services can now reference each other')
		} catch (err) {
			console.error('Leading services & utilities failed.')
			console.error(err)
			throw err
		}

		/*======================================
        =            	Cron	        	   =
        ======================================*/
		const cronController = require(path.join(controllersDir, 'cron'))
		cronController(cron)
		debug('CronController running')

		/*=========================================
        =            	Middleware	              =
        =========================================*/
		koa.use(async (ctx, next) => {
			// make Sprucebot available
			ctx.sb = sprucebot
			await next()
		})

		// Error Handling
		koa.use(async (ctx, next) => {
			try {
				await next()
			} catch (err) {
				const errorResponse = Object.assign(
					{},
					allErrors[err.message] || allErrors['UNKNOWN']
				)
				errorResponse.path = ctx.path
				ctx.status = errorResponse.code
				ctx.body = errorResponse
				console.error(err)
			}
		})

		// middleware
		try {
			// build-in
			sprucebot.skillskit.factories.wares(
				path.join(__dirname, 'middleware'),
				router
			)

			debug('Core middleware loaded')

			// skills-kit
			sprucebot.skillskit.factories.wares(middlewareDir, router)

			debug('Kit middleware loaded')
		} catch (err) {
			console.error('Failed to boot middleware', err)
		}

		// Response headers
		koa.use(async (ctx, next) => {
			const date = Date.now()
			await next()
			const ms = Date.now() - date

			// On a redirect, headers have already been sent
			if (!ctx.res.headersSent) {
				ctx.set('X-Response-Time', `${ms}ms`)
				ctx.set('X-Powered-By', `Sprucebot v${version}`)
				debug('x-headers set at end of response', ctx.path)
			} else {
				debug(
					'x-headers ignored since headers have already been sent',
					ctx.path
				)
			}
		})

		// Response Code Handling
		koa.use(async (ctx, next) => {
			// default response code
			ctx.res.statusCode = 200
			await next()

			// If this is an API call with no body (no controller answered), respond with a 404 and a json body
			if (ctx.path.search('/api') === 0 && !ctx.body) {
				ctx.throw('ROUTE_NOT_FOUND')
				debug('404 hit on', ctx.path)
			}
		})

		/*======================================
        =          Server Side Routes          =
        ======================================*/
		try {
			// built-in routes
			sprucebot.skillskit.factories.routes(
				path.join(__dirname, 'controllers'),
				router
			)

			debug('Core controllers loaded')

			// skills-kit routes
			sprucebot.skillskit.factories.routes(controllersDir, router)

			debug('Kit controllers loaded')
		} catch (err) {
			console.error('Loading controllers failed.')
			console.error(err)
			throw err
		}

		/*======================================
        =         	Event Listeners       	   =
        ======================================*/
		let listenersByEventName
		try {
			listenersByEventName = sprucebot.skillskit.factories.listeners(
				listenersDir
			)
			debug(
				'Event listeners found for events',
				Object.keys(listenersByEventName)
			)
		} catch (err) {
			console.error('Loading event listeners failed.')
			console.error(err)
		}

		router.post('/hook', async (ctx, next) => {
			const body = ctx.request.body

			debug('Event trigger', body.eventType)

			// only fire if we are listening to this event
			if (listenersByEventName[body.eventType]) {
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

				if (body.payload) {
					ctx.event.payload = body.payload
				}

				debug('Listener found', ctx.event)

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

		/*======================================
        =          Client Side Routes          =
        ======================================*/

		// The logic before handle() is to suppress nextjs from responding and letting koa finish the request
		// This allows our middleware to fire even after
		router.get('*', async ctx => {
			// if a controller already responded or we are making an API call, don't let next run at all
			if (ctx.body || ctx.path.search('/api') === 0) {
				return
			}
			ctx.body = await new Promise(resolve => {
				const _end = ctx.res.end
				ctx.res._end = _end

				// Hijack stream to set ctx.body
				const pipe = stream => {
					ctx.res.end = _end
					stream.unpipe(ctx.res)
					resolve(stream)
				}
				ctx.res.once('pipe', pipe)

				// Monkey patch res.end to set ctx.body
				ctx.res.end = body => {
					debug('Next has finished for', ctx.path)
					ctx.res.end = _end
					ctx.res.removeListener('pipe', pipe)
					if (ctx.res.redirect) {
						debug('Next wants us to redirect to', ctx.res.redirect)
						body = `Redirecting to ${ctx.res.redirect}`
						ctx.redirect(ctx.res.redirect)
						ctx.res.end(body)
						// return
					}
					resolve(body)
				}

				debug('Handing control off to nextjs ', ctx.path, '🤞🏼')
				handle(ctx.req, ctx.res)
			})
		})

		// tell Koa to use the router
		koa.use(router.routes())

		/*======================================
        =              	Serve            	   =
        ======================================*/
		// TODO better handling hosting only server or interface
		koa.listen(port, err => {
			if (err) throw err
			console.log(
				` 🌲  Skill launched at ${serverHost ? serverHost : interfaceHost}`
			)
		})
	})
}
