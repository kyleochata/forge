function displayName(user) {
  return user.profile.firstName + ' ' + user.profile.lastName;
}
module.exports = { displayName };
