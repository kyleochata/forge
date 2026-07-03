function submit(form) {
  const errors = [];
  if (!form.email || form.email.indexOf('@') === -1) {
    errors.push('email');
  }
  if (!form.name || form.name.trim() === '') {
    errors.push('name');
  }
  return errors.length ? { ok: false, errors: errors } : { ok: true };
}
module.exports = { submit };
