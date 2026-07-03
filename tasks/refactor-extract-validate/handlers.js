function createUser(input) {
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    return { error: 'invalid name' };
  }
  if (typeof input.age !== 'number' || input.age < 0) {
    return { error: 'invalid age' };
  }
  return { ok: true, action: 'create', name: input.name.trim(), age: input.age };
}
function updateUser(input) {
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    return { error: 'invalid name' };
  }
  if (typeof input.age !== 'number' || input.age < 0) {
    return { error: 'invalid age' };
  }
  return { ok: true, action: 'update', name: input.name.trim(), age: input.age };
}
module.exports = { createUser, updateUser };
