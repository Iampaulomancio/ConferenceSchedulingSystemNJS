const cron = require('node-cron');
const dayjs = require('dayjs');
const db = require('../config/db');
const { sendBookingReminderEmail } = require('./emailService');

function startReminderJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const minutesBefore = Number(process.env.REMINDER_MINUTES_BEFORE || 60);
      const from = dayjs().add(minutesBefore - 5, 'minute').format('YYYY-MM-DD HH:mm:ss');
      const to = dayjs().add(minutesBefore + 5, 'minute').format('YYYY-MM-DD HH:mm:ss');

      const [rows] = await db.query(
        `SELECT b.*, r.name AS room_name, r.location
         FROM bookings b
         INNER JOIN conference_rooms r ON r.id = b.room_id
         WHERE b.status = 'active'
           AND b.reminder_sent_at IS NULL
           AND b.start_datetime BETWEEN ? AND ?`,
        [from, to]
      );

      for (const row of rows) {
        await sendBookingReminderEmail(row, { name: row.room_name, location: row.location });
        await db.query('UPDATE bookings SET reminder_sent_at = NOW() WHERE id = ?', [row.id]);
      }
    } catch (error) {
      console.error('Reminder job error:', error.message);
    }
  });
}

module.exports = { startReminderJob };
