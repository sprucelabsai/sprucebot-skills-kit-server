const debug = require('debug')('sprucebot-skills-kit-server')
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
const contextFactory = require('./factories/context')
const routesFactory = require('./factories/routes')
const waresFactory = require('./factories/wares')
const listenersFactory = require('./factories/listeners')
const sequelizeFactory = require('./factories/sequelize')
const lang = require('./helpers/lang')

const required = key => {
	throw new Error(`SkillKit server needs ${key}`)
}

module.exports = async ({
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
	sequelizeOptions,
	langDir = required('langDir'),
	staticDir = false,
	bodyParserOptions = { jsonLimit: '1mb' }
}) => {
	debug('Starting server boot sequence with port', port)
	// you can override error messages
	const allErrors = { ...defaultErrors, ...errors }

	// Setup NextJS App
	debug('Setting up Nextjs with', nextConfig)
	const app = next(nextConfig)
	const handle = app.getRequestHandler()

	// Kick off sync with platform
	debug('Starting sync with core')
	const syncResponse = await sprucebot.sync().catch(err => {
		console.error(
			`Failed to sync your skill's settings with ${sprucebot.https.host}`
		)
		throw err // Server can't really start without sync settings
	})

	debug('Sync complete. Response: ', syncResponse)

	// Next app ready
	await app.prepare()

	const koa = new Koa()

	/*=======================================
        =             	BASICS   	            =
        =======================================*/
	koa.use(cors())
	koa.use(bodyParser(bodyParserOptions))
	staticDir && koa.use(staticServe(staticDir))

	const router = new Router()

	/*=======================================
        =        Utilities/Services/Lang        =
        =======================================*/
	try {
		// make lang available via utilities
		if (langDir) {
			debug('langDir detected at', langDir)
			lang.configure(langDir)
			koa.context.utilities = { lang }
		} else {
			debug(
				'No landDir detected. ctx.utilities.lang.getText() will fail sever side'
			)
		}

		// services for core
		contextFactory(path.join(__dirname, 'services'), 'services', koa.context)

		// services for skill
		contextFactory(servicesDir, 'services', koa.context)

		debug('Kit services loaded')

		// utilities for core
		contextFactory(path.join(__dirname, 'utilities'), 'utilities', koa.context)

		debug('Core utilities loaded')

		// utilities for skills-kit
		contextFactory(utilitiesDir, 'utilities', koa.context)

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

		// orm if enabled
		if (syncResponse.database) {
			sequelizeFactory(
				{ ...sequelizeOptions, database: syncResponse.database },
				'db',
				koa.context
			)
			debug('Kit sequelize enabled')

			// Connect and run migrations if enabled
			await koa.context.db.sync()

			// Services and utils can access the orm
			_.each(koa.context.utilities, util => {
				util.db = koa.context.db
			})

			_.each(koa.context.services, service => {
				service.db = koa.context.db
			})

			debug('Utilities and services can now reference the orm')
		}
	} catch (err) {
		console.error('Leading services & utilities failed.')
		console.error(err)
		throw err
	}

	/*======================================
        =            	Cron	        	   =
        ======================================*/
	const cronController = require(path.join(controllersDir, 'cron'))
	cronController({ ...koa.context, sb: sprucebot }, cron)
	debug('CronController running')

	/*======================================
        =         	Event Listeners       	   =
        ======================================*/
	let listenersByEventName
	try {
		listenersByEventName = listenersFactory(listenersDir)
		debug('Event listeners found for events', Object.keys(listenersByEventName))
	} catch (err) {
		console.error('Loading event listeners failed.')
		console.error(err.stack || err)
	}

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
			const errKey = allErrors[err.message] ? err.message : 'UNKNOWN'
			const errorResponse = {
				...allErrors[errKey],
				name: errKey
			}

			// anything in the error thrown that matches these
			// keys, lets set back to the error
			for (let key of ['code', 'friendlyReason']) {
				if (err[key]) {
					errorResponse[key] = err[key]
				}
			}

			errorResponse.path = ctx.path
			ctx.status = errorResponse.code
			ctx.body = errorResponse
			console.error(err.stack || err)
		}
	})

	/*======================================
        =         	Core/Kit Middleware.       =
        ======================================*/
	try {
		// build-in
		waresFactory(path.join(__dirname, 'middleware'), router, {
			listenersByEventName
		})

		debug('Core middleware loaded')

		// skills-kit
		waresFactory(middlewareDir, router, { listenersByEventName })

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
			debug('x-headers set at end of response', ctx.path)
		} else {
			debug('x-headers ignored since headers have already been sent', ctx.path)
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
		routesFactory(path.join(__dirname, 'controllers'), router, {
			listenersByEventName
		})

		debug('Core controllers loaded')

		// skills-kit routes
		routesFactory(controllersDir, router, { listenersByEventName })

		debug('Kit controllers loaded')
	} catch (err) {
		console.error('Loading controllers failed.')
		console.error(err)
		throw err
	}

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
		debug('handing off to next and backing off', ctx.path)
		await handle(ctx.req, ctx.res)
		ctx.respond = false
		return

		// this does not work as desired
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

	return koa
}
