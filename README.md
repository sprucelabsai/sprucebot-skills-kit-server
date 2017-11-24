# `sprucebot-skills-kit-server`
This module relies heavily on [koajs](http://koajs.com) and [koa-router](https://github.com/alexmingoia/koa-router). It can help to be familiar with those modules, but it's probably not 100% necessary.

## Where to start?
If you haven't already, you should totally checkout the [sprucebot-skills-kit's documentation](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs). In fact, this readme is assuming you already read it.  

## File structure
It is probably a good idea to go through each file to understand how they work. It'll help a lot when building your skill.

 * `.vscode` - Settings for your favorite IDE.
 * `controllers` - For built in [`controllers`](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs/server.md#controllers) that are made available in every skill.
    * `auth.js` - An [authentication](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs/server.md#auth) endpoint. Also, a condition role set for when `DEV_MODE` is enabled in your skill.
* `factories` - Factories for helping us setup and run your skill.
    * `context.js` - Reusable factory for dropping things onto your `ctx`. Used to populate `services` and `utilities`.
    * `listeners.js` - Sets up all your [`listeners`](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs/events.md), which are `.js` files that exist in `server/events` in your skill.
    * `routes.js` - Sets up your `controllers`.
    * `wares.js` - Sets up your [middleware](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs/server.md#middleware).
* `helpers` - Simple `utilities` we make available to your skill.
    * `lang.js` - Handles [language support](https://github.com/sprucelabsai/sprucebot-skills-kit/blob/dev/docs/lang.md). **TODO: move to separate module and import**.
* `middleware` - Built-in middleware that works on all skills.
    * `auth.js` - Handles authorization, i.e. locks routes by role.
* `node_modules` - Nodejs stuff.
* `services` - Built-in [`services`](https://github.com/liquidg3/sprucebot-skills-kit/blob/dev/docs/server.md#services).
    * `uploads` - Built in upload adapters.
        * `s3.js` - For uploads to [S3](https://aws.amazon.com/s3).
    * `uploads.js` - Handles picking the upload adapter and passing it your file.
* `support` - Built-in configs and settings made available to your skill.
    * `errors.js` - Built-in errors.
* `utilities` - Built-in `utilities` made available to your skill.
    * `auth.js` - Helpful methods for checking role hierarchy.

## Checking permissions
Lets say you want to send an alert to the team when a `user` arrives. But, you have rules around how it should work. 

* `guest` arrives -> notify `teammates` and `owners`
* `teammate` arrives -> notify `owners`
* `owner` arrives -> no notification

Using the built-in `auth` `utility`, you have the following.

 * `auth.isAbove(teammate, guest)` 
 * `auth.isAboveOrEqual(teammate, guest)`

You should check the source of `utilities/auth` in this module to see how it works.

For the rules defined above, we'll use `auth.isAbove()`.

```js
// server/events/did-enter.js
module.exports = async (ctx, next) => {
    next() // let sprucebot to it's usual (which is nothing on did-enter)
    try {
        // we are probs gonna want special error reporting here so we can know the context
        // of the failure. remember, everything good goes in utilities or services
        await ctx.services.alerts.send(ctx.event)

    } catch (err) {

        // a helpful message about the error to help us track it down from the logs
        console.error('did-enter failed to send alert')

        // followed be the actual error
        console.error(err)
    }
}
```

Now we'll create our `service` for sending the alerts.

```js
// server/services/alerts.js
module.exports = {

    // an event object mirrors a user object, so this works 100%
    async send(user) {

        // load all teammates
        const teammates = await this.sb.users(locationId, { role: 'ownerteammate' })
        const sendTo = teammates.reduce((sendTo, teammate) => {

            // use built in auth utilities to check role. Honors rules above.
            if (this.utilities.auth.isAbove(teammate, user)) {
                sendTo.push(teammate)
            }

            return sendTo

        }, [])

        //send to everyone
        await Promise.all(sendTo.map(teammate => {
            return this.sb.message(teammate.Location.id, teammate.User.id, this.utilities.lang.getText('arrivalAlert', { teammate, user }))
        }))

    }
}
```

For the sake of it, lets define our lang.
```js
// lang/default.js
module.exports = {
    arrivalAlert ({ teammate, user }) => `Hey ${teammate.user.firstName || teammate.user.name}, ${teammate.user.name} has arrived!`
}
```

## Uploading files
Currently the only data store built-in is S3. You can add your own very easily. Lets start by setting up S3 and along the way talk about how to specify your own.

We'll start on the `interface` with a file input. We're gonna make the file input hidden because it's ugly. Instead, we'll prompt the `user` to upload a file after they tap a fancy `<Button />`.

We're going to depend on newer browser features, including `FileReader` to make this work. Also, we'll only let them upload a pdf.

```js
// interface/pages/owner/index.js
import { Container, Button } from 'react-sprucebot'

class OwnerDashboard extends Component {

    constructor (props) {
        super(props)
        this.state = {
            errorMessage: undefined
        }
    }
    // setup the file reader when client side
    componentDidMount() {
		// is browser out-to-date
		if (typeof FileReader === 'undefined') {
			this.setState({
				errorMessage: this.props.lang.getText('outOfDateBrowserMessage')
			})
		} else {
			// setup file reader, we're
			this.reader = new FileReader()
			this.reader.onload = this.onFileReaderLoadFile.bind(this)
			this.reader.onerror = this.onFileReaderLoadFileFail.bind(this)
        }
        
        this.props.skill.read()
        this.props.actions.files.fetch()
	}
    
    // tiggered when clicking our nice <Button />
    selectFile() {

        // triggers the "select file" prompt
        this.fileInput.click()
    }

    // triggered when a file is selected
    onFileSelect(e) {
        // pull the first file (only one at a time for this example)
        const file = e.target.files[0]

        // always good to do a mime-type check
        if (file.type !== 'application/pdf') {
			this.setState({
                errorMessage: this.props.lang.getText('badFileFormatErrorMessage')
            })
			return
		}


        // read the file using the reader
        this.reader.readAsDataURL(file)
    }

    // called when the FileReader has read the whole file
    onFileReaderLoadFile(e) {
        const content = e.target.result
        const name = e.target.name

     
        // defined in our actions in the code sample below
        this.props.actions.files.upload(content, name)
	}

    // if the FileReader fails for some reason
	onFileReaderLoadImageFail(err) {
		console.error(err)
		this.setState({ errorMessage: this.props.lang.getText('uploadImageFailedMessage') })
	}


    render() {

        const { lang, files } = this.props
        const { errorMessage } = this.state

        // errors can be set in our state or by an action failing
        const error = errorMessage || (files.uploadError && files.uploadingError.friendlyMessage)

        return (
            <Container className="ownerDashboard">
                {!error && (
                    <BotText>{lang.getText('ownerDashboardBotText')}</BotText>
                )}
                
                {error && (
                    <BotText>{error}</BotText>
                )}

                {files.file.value && (
                    <BotText>{`Current file url: ${files.file.value}`}</BotText>
                )}
                
                <Button busy={files.uploading} primary onClick={this.selectFile.bind(this)}>
                    {lang.getText('uploadFileButtonLabel')}
                </Button>

                <input 
                    type="file" 
                    ref={input => {
                        this.fileInput = input
                    }}
                    onChange={this.onFileSelect.bind(this)}
                    style={{ display:'none' }} 
                />
            </Container>
        )
    }
}

```
Some things to notice in the above example:
 * We can manually set an error using `state`, but also errors in `actions` are reported through `props`. So, we check both places. This can feel tedious until you actually want to handle different errors differently, then it's a life saver.
 * We use `<Button busy={files.uploading}>` to show a nice `<Loader />` inside the button while the upload is in progress.
 * We check `files.file.value` for the currently uploaded file. This is actually the `url` of the file which is saved as `meta` after upload (which is why we check `value`)

Lets move into the `action` for this upload process.

```js
// interface/store/actions/files.js
export const FETCH_FILE_REQUEST = 'files/FETCH_FILE_REQUEST'
export const FETCH_FILE_SUCCESS = 'files/FETCH_FILE_SUCCESS'
export const FETCH_FILE_ERROR = 'files/FETCH_FILE_ERROR'

export const UPLOAD_FILE_REQUEST = 'files/UPLOAD_FILE_REQUEST'
export const UPLOAD_FILE_SUCCESS = 'files/UPLOAD_FILE_SUCCESS'
export const UPLOAD_FILE_ERROR = 'files/UPLOAD_FILE_ERROR'

export function fetch() {
    return {
        types: [
            FETCH_FILE_REQUEST,
            FETCH_FILE_SUCCESS,
            FETCH_FILE_ERROR
        ],
        promise: (client, auth) => client.get(`/api/1.0/owner/files/file.json`)
    }
}

export function upload(content, name) {
    return {
        types: [
            UPLOAD_FILE_REQUEST,
            UPLOAD_FILE_SUCCESS,
            UPLOAD_FILE_ERROR
        ],
        promise: (client, auth) =>
            client.post(`/api/1.0/owner/files/upload.json`, {
            body: {
                content,
                name
            }
        })
    }
}
```
Don't forget to let your `interface` know your new action exists.

```js
// interface/store/actions/index.js
import * as users from './users'
import * as locations from './locations'
import * as files from './files'

module.exports = {
    users,
    locations,
    files
}

```
Ok, time for the `reducer`.
```js
// interface/store/reducers/files.js
import {
    FETCH_FILE_REQUEST,
    FETCH_FILE_SUCCESS,
    FETCH_FILE_ERROR,
    UPLOAD_FILE_REQUEST,
    UPLOAD_FILE_SUCCESS,
    UPLOAD_FILE_ERROR
} from '../actions/files'

export default function reducer(state = null, action) {
    switch (action.type) {
        case FETCH_FILE_REQUEST:
            return {
                ...state,
                fetching: true
            }
        case FETCH_FILE_SUCCESS:
            return {
                ...state,
                file: action.result,
                fetchError: false,
                fetching: false
            }
        case FETCH_FILE_ERROR:
            return {
                ...state,
                fetchError: action.error,
                fetching: false
            }
        case UPLOAD_FILE_REQUEST:
            return {
                ...state,
                uploading: true
            }
        case UPLOAD_FILE_SUCCESS:
            return {
                ...state,
                file: action.result,
                uploadError: false,
                uploading: false
            }
        case UPLOAD_FILE_ERROR:
            return {
                ...state,
                uploadError: action.error,
                uploading: false
            }
        default:
            return state
	}
}

```
Expose your `reducer` to the `interface`.
```js
// interface/store/reducers/index.js
import users from './users'
import locations from './locations'
import files from './files'

module.exports = {
    users,
    locations,
    files
}
```
Ok, `interface` is good to go. Lets setup the `controller` on the `server` to receive the file and pass it to S3 (or whatever storage platform we want). We're going to store the files URL in `meta` for when we want it later. In this example, we're going to save the file for the `location`.

```js
// controllers/owner/files.js
module.exports = router => {

    router.get('/api/1.0/owner/files/files.json', async (ctx, next) {

        // check if the file has been uploaded yet
        const meta = await ctx.sb.meta('file', {
            locationId: ctx.auth.Location.id
        })

        ctx.body = meta || {}

        await next()

    })

    router.post('/api/1.0/owner/files/upload.json', async (ctx, next) {

        // ensure file and name exist
        ctx.assert(typeof(ctx.body.content) === 'string', 'FILE_MISSING')
        ctx.assert(typeof(ctx.body.name) === 'string', 'NAME_MISSING')

        // stop race condition if multiple owners are uploading files
        // with this is place, last upload will win, but we'll never
        // end up with duplicates
        const key = `saving-file-for-${ctx.auth.Location.id}`
        await ctx.sb.wait(key)

        try {

            // upload the file (THIS WILL overwrite a file be the same name)
            // this is using s3, which is is defined in `config/default.js`
            const url = await ctx.services.uploads.upload(ctx.body.content, {
                Key: `uploads/${ctx.body.name}`,
                ACL: 'public-read'
            })

            // save the image to meta for later
            const meta = ctx.sb.upsertMeta('file', url, {
                locationId: ctx.auth.Location.Id
            })

            ctx.body = meta

        } catch(err) {

            console.error(error)
            ctx.throw('UPLOAD_FAILED')

        } finally {

            // always unblock
            ctx.sb.go(key)
            await next()
        }

    })
}
```

Ok, we're almost there! We need to configure our uploads `service` to work properly.

```js
// config/default.js
module.exports = {
    ...,
    services: {
		uploads: {
			uploader: './uploads/s3.js',
			options: {
				Bucket: 'my-bucket-name',
				accessKeyId: process.env.AWS_ACCESS_KEY_ID,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
			}
		}
	}
}

```
That's it! Now, if you want to create your own upload `service`, you could do this.

```js
// config/default.js
module.exports = {
    ...,
    services: {
        uploads: {
            uploader: path.join(__dirname, '../services/ftp.js'),
            options: {
                endpoint: process.env.FTP_ENDPOINT,
                path: process.env.FTP_PATH
            }
        }
    }
}

```
Now, when you call `ctx.services.files.upload()` it'll invoke your `service`'s `upload()` method. 

Note: Make sure you define `init(options)` in your uploader. It'll receive whatever is defined in `config/default.js` -> `services.uploads.options`.

# What's next?
Hmm, tbd on this one.