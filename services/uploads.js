module.exports = {
	uploader: null,
	async init({ uploader, options = {} } = {}) {
		if (uploader) {
			this.uploader = require(uploader)
			this.uploader.init(options)
		}
	},

	async upload(data, options = {}) {
		if (!this.uploader) {
			throw new Error(
				'No uploader configured. see https://github.com/liquidg3/sprucebot-skills-kit/blob/dev/docs/uploads.md instructions'
			)
		}

		return this.uploader.upload(data, options)
	}
}
