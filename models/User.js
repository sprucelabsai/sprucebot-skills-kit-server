const modelName = 'User'

module.exports = (sequelize, DataTypes) => {
	const attributes = {
		id: {
			type: DataTypes.UUID,
			defaultValue: DataTypes.UUIDV4,
			primaryKey: true
		},
		firstName: {
			type: DataTypes.STRING,
			comment: 'The users full name.',
			allowNull: true,
			validate: {
				len: {
					args: [1, 254],
					msg: 'Name must be 1-254 characters'
				}
			}
		},
		lastName: {
			type: DataTypes.STRING,
			comment: 'The users full name.',
			allowNull: true,
			validate: {
				len: {
					args: [1, 254],
					msg: 'Name must be 1-254 characters'
				}
			}
		},
		name: {
			type: DataTypes.VIRTUAL
			// get() {
			// 	let name = lthr.lang.getText('Friend')
			// 	if (firstName) {
			// 		name = firstName

			// 		if (lastName && lastName.length > 0) {
			// 			name += ` ${lastName}`
			// 		}
			// 	}
			// 	return name
			// }
		},
		casualName: {
			type: DataTypes.VIRTUAL
			// get() {
			// 	let name = lthr.lang.getText('Friend')
			// 	if (firstName) {
			// 		name = firstName
			// 	}
			// 	return name
			// }
		},
		phoneNumber: {
			type: DataTypes.STRING,
			allowNull: false,
			comment: "The user's phone number",
			unique: {
				args: true,
				msg: 'Phone number already associated with another account'
			}
		},
		type: {
			type: DataTypes.STRING,
			defaultValue: 'regular',
			comment: 'The base user type.',
			allowNull: false,
			validate: {
				isIn: {
					args: [['regular', 'superuser']],
					msg: 'Must be user type of regular or superuser'
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
				return null
			}
		},
		defaultProfileImages: {
			type: DataTypes.VIRTUAL,
			get() {
				return null
			}
		},
		superuser: {
			type: DataTypes.BOOLEAN,
			comment:
				'Whether the user should have access to system administration functions.',
			allowNull: false,
			defaultValue: false
		},
		snsEndpointArn: {
			type: DataTypes.STRING
		},
		snsMobilePlatform: {
			type: DataTypes.STRING
		},
		snsDeviceToken: {
			type: DataTypes.STRING
		},
		socketId: {
			type: DataTypes.STRING
		}
	}
	const options = {
		defaultScope: {
			attributes: [
				'id',
				'firstName',
				'lastName',
				'name',
				'profileImageUUID',
				'profileImages',
				'defaultProfileImages',
				'casualName'
			]
		},
		classMethods: {
			associate(models) {
				this.belongsToMany(models.Location, {
					through: 'UserLocation'
				})
			}
		}
	}
	return sequelize.define(modelName, attributes, options)
}
