const Koa = require('koa')
const next = require('next')
const Router = require('koa-router')
const cron = require('node-cron')
const bodyParser = require('koa-bodyparser')
const { version } = require('./package.json')
const defaultErrors = require('./support/errors')
const glob = require('glob')
const path = require('path')

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
}) => {
	// you can override error messages
	const allErrors = { ...defaultErrors, ...errors }

	// Setup NextJS App
	const app = next(nextConfig)
	const handle = app.getRequestHandler()

	// Kick off sync with platform
	sprucebot.sync().catch(err => {
		console.error(`Failed to sync your skill's settings with ${sprucebot.https.host}`)
		console.error(err)
	})

	app.prepare().then(async () => {
		const koa = new Koa()
		const router = new Router()

		/*=======================================
        =            Utilities/Services          =
        =======================================*/
		try {


			// services for skills-kit
			sprucebot.skillskit.factories.context(
				servicesDir,
				'services',
				koa.context
			)
			// utilities for skills-kit
			sprucebot.skillskit.factories.context(
				utilitiesDir,
				'utilities',
				koa.context
			)
		} catch (err) {
			console.error('Leading services & utilities failed.')
			console.error(err)
		}

		/*======================================
        =            	Cron	        	   =
        ======================================*/
		const cronController = require(path.join(controllersDir, 'cron'))
		cronController(cron)

		// POST support
		koa.use(bodyParser())

		/*=========================================
        =            	Middleware	              =
        =========================================*/
		koa.use(async (ctx, next) => {
			ctx.sb = sprucebot
			await next()
		})

		// Error Handling
		koa.use(async (ctx, next) => {
			try {
				await next()
			} catch (err) {
				const errorResponse = Object.assign({},allErrors[err.message] || allErrors['UNKNOWN'])
				errorResponse.path = ctx.path;
				ctx.status = errorResponse.code
				ctx.body = errorResponse
			}
		})

		// middleware
		try {

			// build-in
			sprucebot.skillskit.factories.wares(
				path.join(__dirname, 'middleware'),
				router
			)

			// skills-kit
			sprucebot.skillskit.factories.wares(
				middlewareDir,
				router
			)
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
			}
		})

		/*======================================
        =          Server Side Routes          =
        ======================================*/
		try {
			// built-in routes
			sprucebot.skillskit.factories.routes(path.join(__dirname, 'controllers'), router)

			// skills-kit routes
			sprucebot.skillskit.factories.routes(controllersDir, router)
			
		} catch (err) {
			console.error('Loading controllers failed.')
			console.error(err)
		}

		/*======================================
        =         		Event Listeners          =
        ======================================*/
		let listenersByEventName
		try {
			listenersByEventName = sprucebot.skillskit.factories.listeners(
				listenersDir
			)
		} catch (err) {
			console.error('Loading event listeners failed.')
			console.error(err)
		}

		router.post('/hook', async (ctx, next) => {
			const body = ctx.request.body
			ctx.event = await ctx.sb.user(body.locationId, body.userId)

			if(listenersByEventName[body.eventType]) {
				await listenersByEventName[body.eventType](ctx, next)
			}
			next()
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
					ctx.res.end = _end
					ctx.res.removeListener('pipe', pipe)
					if (ctx.res.redirect) {
						ctx.redirect(ctx.res.redirect)
						body = `Redirecting to ${ctx.res.redirect}`
						ctx.res.end()
					}
					resolve(body)
				}

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
