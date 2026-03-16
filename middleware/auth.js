function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('danger', 'Please log in first.');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.flash('danger', 'Please log in first.');
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    req.flash('danger', 'Admin access only.');
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
