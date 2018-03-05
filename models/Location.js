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
					'isPublic',
					'timezone'
				]
			}
		}
	}
	const Location = sequelize.define(modelName, attributes, options)

	Location.associate = function(models) {
		this.hasMany(models.UserLocation, {
			onDelete: 'cascade'
		})
	}

	return Location
}
