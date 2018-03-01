const modelName = 'Location'

module.exports = (sequelize, DataTypes) => {
	const attributes = {
		id: {
			type: DataTypes.UUID,
			defaultValue: DataTypes.UUIDV4,
			primaryKey: true
		},
		name: {
			type: DataTypes.STRING,
			comment: 'The location name',
			allowNull: true
		},
		openTime: {
			type: DataTypes.TIME,
			comment: 'Business open time',
			allowNull: false,
			defaultValue: '08:00:00'
		},
		closeTime: {
			type: DataTypes.TIME,
			comment: 'Business close time',
			allowNull: false,
			defaultValue: '20:00:00'
		},
		// https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
		timezone: {
			type: DataTypes.STRING,
			comment: 'The timezone',
			allowNull: false,
			defaultValue: 'America/Denver'
		},
		addressLine1: {
			type: DataTypes.STRING,
			comment: 'Address line 1',
			allowNull: true
		},
		addressLine2: {
			type: DataTypes.STRING,
			comment: 'Address line 2',
			allowNull: true
		},
		addressCity: {
			type: DataTypes.STRING,
			comment: 'City',
			allowNull: true
		},
		addressState: {
			type: DataTypes.STRING,
			comment: 'State / Province / Region',
			allowNull: true
		},
		addressZip: {
			type: DataTypes.STRING,
			comment: 'Zip / Postal Code',
			allowNull: true
		},
		addressCountry: {
			type: DataTypes.STRING,
			comment: 'The country',
			allowNull: true
		},
		geo: {
			type: 'POINT',
			comment: 'Users lng,lat point to get data in areas.',
			get() {
				const geoPoint = this.getDataValue('geo')
				return geoPoint === null
					? null
					: {
							lat: geoPoint.y,
							lng: geoPoint.x
						}
			},
			set(coords) {
				if (coords === null) {
					this.setDataValue('geo', null)
				} else {
					const lat = parseFloat(coords.lat)
					const lng = parseFloat(coords.lng)
					this.setDataValue(
						'geo',
						this.sequelize.literal(`POINT(${lng}, ${lat})`)
					)
				}
			}
		},
		profileImageUUID: {
			type: DataTypes.UUID,
			comment:
				'The base profile image uuid.  Used to build the filename for various profile image sizes.',
			allowNull: true
		},
		profileImages: {
			type: DataTypes.VIRTUAL,
			get() {
				return {}
			}
		},
		isPublic: {
			type: DataTypes.BOOLEAN,
			comment: 'Is this location visible to the world?',
			default: false
		}
	}
	const options = {
		doNotSync: true,
		scopes: {
			defaultScope: {
				attributes: [
					'id',
					'name',
					'addressLine1',
					'addressLine2',
					'addressCity',
					'addressState',
					'addressZip',
					'addressCountry',
					'geo',
					'OrganizationId',
					'Organization',
					'isConnected',
					'isPublic',
					'timezone'
				]
			}
		},
		classMethods: {
			associate(models) {
				this.hasMany(models.UserLocation, {
					onDelete: 'cascade'
				})
			}
		}
	}
	return sequelize.define(modelName, attributes, options)
}
