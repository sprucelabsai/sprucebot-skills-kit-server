module.exports = {
	isAboveOrEqual(user1, user2) {
		switch (user1.role) {
			case 'owner':
				return true
			case 'teammate':
				return user2.role === 'guest' || user2.role === 'teammate'
			case 'guest':
				return user2.role === 'guest'
			default:
				return false
		}
	},

	isAbove(user1, user2) {
		switch (user1.role) {
			case 'owner':
				return user2.role !== 'owner'
			case 'teammate':
				return user2.role === 'guest'
			default:
				return false
		}
	}
}
