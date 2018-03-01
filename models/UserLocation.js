const modelName = 'UserLocation'

module.exports = (sequelize, DataTypes) => {
	const attributes = {
		id: {
			type: DataTypes.UUID,
			defaultValue: DataTypes.UUIDV4,
			primaryKey: true
		},
		role: {
			type: DataTypes.STRING,
			defaultValue: 'guest',
			comment: 'This tells us what type of user this is at this location',
			validate: {
				isIn: {
					args: [['owner', 'teammate', 'guest']],
					msg: 'The user permissions per location'
				}
			}
		},
		email: {
			type: DataTypes.STRING,
			allowNull: true,
			comment: 'A valid user email.',
			validate: {
				isEmail: {
					args: true,
					msg: 'Please enter a valid email address.'
				},
				max: {
					args: 254,
					msg: 'The email address you entered is to long. Please try again.'
				}
			}
		},
		status: {
			type: DataTypes.STRING,
			defaultValue: 'offline',
			comment: 'The current status of the user at the location',
			validate: {
				isIn: {
					args: [['online', 'offline']],
					msg: 'Status must be online or offline'
				}
			}
		},
		visits: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
			comment: 'Number of total visits of a user to a location'
		},
		isConnected: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
			allowNull: false
		},
		lastRecordedVisit: {
			type: DataTypes.DATE,
			allowNull: true
		},
		isDev: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		}
	}
	const options = {
		doNotSync: true,
		classMethods: {
			associate(models) {
				this.belongsTo(models.User)
				this.belongsTo(models.Location)
			}
		}
	}
	return sequelize.define(modelName, attributes, options)
}
