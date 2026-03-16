const nodemailer = require('nodemailer');
require('dotenv').config();

function getTransporter() {
  const host = process.env.MAIL_HOST;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
    auth: { user, pass }
  });
}

module.exports = { getTransporter };
