const aws = require('aws-sdk')

const required = key => {
	throw new Error(
		`${key} is required for sprucebot-skills-kit-server/services/uploads/s3`
	)
}

module.exports = {
	init({
		Bucket = required('Bucket'),
		accessKeyId = required('accessKeyId'),
		secretAccessKey = require('secretAccessKey')
	}) {
		this.s3 = new aws.S3({ accessKeyId, secretAccessKey })
		this.Bucket = Bucket
	},

	async upload(data, options = {}) {
		const s3options = { Body: data, Bucket: this.Bucket, ...options }

		const results = await new Promise((resolve, reject) => {
			this.s3.putObject(s3options, (err, data) => {
				if (err) {
					reject(err)
				} else {
					resolve(data)
				}
			})
		})

		return `https://s3.amazonaws.com/${this.Bucket}/${options.Key}`
	}
}
