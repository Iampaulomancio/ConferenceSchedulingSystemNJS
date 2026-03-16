const dayjs = require('dayjs');
const { getTransporter } = require('../config/mailer');

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('Email skipped: transporter not configured.');
    return { skipped: true };
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html
  });
}

function bookingTemplate(title, booking, room, actionLabel) {
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
      <h2>${title}</h2>
      <p>Hello <strong>${booking.reserved_by_name}</strong>,</p>
      <p>Your conference room reservation has been <strong>${actionLabel}</strong>.</p>
      <ul>
        <li><strong>Room:</strong> ${room.name}</li>
        <li><strong>Date:</strong> ${dayjs(booking.start_datetime).format('MMMM D, YYYY')}</li>
        <li><strong>Time:</strong> ${dayjs(booking.start_datetime).format('h:mm A')} - ${dayjs(booking.end_datetime).format('h:mm A')}</li>
        <li><strong>Purpose:</strong> ${booking.purpose || 'N/A'}</li>
        <li><strong>Meeting Type:</strong> ${booking.meeting_type === 'online' ? 'Online Meeting' : 'On-site Meeting'}</li>
      </ul>
      ${booking.meeting_type === 'online' ? '<p><strong>Note:</strong> Admin has been notified that this booking needs a Zoom/meeting link.</p>' : ''}
      <p>You can view your reservations here: <a href="' + appUrl + '/my-bookings">My Bookings</a></p>
    </div>
  `;
}

async function sendBookingCreatedEmail(booking, room) {
  return sendMail({
    to: booking.reserved_by_email,
    subject: `Reservation confirmed - ${room.name}`,
    html: bookingTemplate('Conference Room Reservation Confirmed', booking, room, 'confirmed')
  });
}

async function sendBookingReminderEmail(booking, room) {
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  return sendMail({
    to: booking.reserved_by_email,
    subject: `Reminder: ${room.name} booking at ${dayjs(booking.start_datetime).format('h:mm A')}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
        <h2>Booking Reminder</h2>
        <p>Hello <strong>${booking.reserved_by_name}</strong>,</p>
        <p>This is a reminder for your upcoming conference room reservation.</p>
        <ul>
          <li><strong>Room:</strong> ${room.name}</li>
          <li><strong>Date:</strong> ${dayjs(booking.start_datetime).format('MMMM D, YYYY')}</li>
          <li><strong>Time:</strong> ${dayjs(booking.start_datetime).format('h:mm A')} - ${dayjs(booking.end_datetime).format('h:mm A')}</li>
          <li><strong>Purpose:</strong> ${booking.purpose || 'N/A'}</li>
        </ul>
        <p>Open the system: <a href="${appUrl}">${appUrl}</a></p>
      </div>
    `
  });
}

async function sendBookingCancelledEmail(booking, room) {
  return sendMail({
    to: booking.reserved_by_email,
    subject: `Reservation cancelled - ${room.name}`,
    html: bookingTemplate('Conference Room Reservation Cancelled', booking, room, 'cancelled')
  });
}

module.exports = {
  sendBookingCreatedEmail,
  sendBookingReminderEmail,
  sendBookingCancelledEmail
};
