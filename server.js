require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db = require('./config/db');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { sendBookingCreatedEmail, sendBookingCancelledEmail } = require('./services/emailService');
const { startReminderJob } = require('./services/reminderJob');
const { seedAdminUser } = require('./services/bootstrap');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
app.use(expressLayouts);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.danger = req.flash('danger');
  res.locals.warning = req.flash('warning');
  res.locals.dayjs = dayjs;
  next();
});

function getDateTimesFromInput(date, startTime, endTime) {
  const start = dayjs(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
  const end = dayjs(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm');
  return { start, end };
}

function validateBookingDates(start, end) {
  if (!start.isValid() || !end.isValid()) return 'Invalid date or time.';
  if (!end.isAfter(start)) return 'End time must be later than start time.';
  if (start.isBefore(dayjs().subtract(1, 'minute'))) return 'You cannot reserve a past schedule.';
  return null;
}

function buildRecurringDates(start, end, recurrenceType, recurrenceEndDate) {
  const slots = [{ start, end }];
  if (recurrenceType === 'none') return slots;

  const endBoundary = dayjs(`${recurrenceEndDate} 23:59`, 'YYYY-MM-DD HH:mm');
  if (!endBoundary.isValid() || endBoundary.isBefore(start)) {
    throw new Error('Invalid recurrence end date.');
  }

  let nextStart = start;
  let nextEnd = end;
  const unit = recurrenceType === 'daily' ? 'day' : recurrenceType === 'weekly' ? 'week' : 'month';

  while (true) {
    nextStart = nextStart.add(1, unit);
    nextEnd = nextEnd.add(1, unit);
    if (nextStart.isAfter(endBoundary)) break;
    slots.push({ start: nextStart, end: nextEnd });
    if (slots.length > 365) throw new Error('Recurring limit exceeded. Keep it within 365 occurrences.');
  }

  return slots;
}

async function findConflict(roomId, start, end) {
  const [rows] = await db.query(
    `SELECT b.*, r.name AS room_name
     FROM bookings b
     INNER JOIN conference_rooms r ON r.id = b.room_id
     WHERE b.room_id = ?
       AND b.status = 'active'
       AND (? < b.end_datetime AND ? > b.start_datetime)
     LIMIT 1`,
    [roomId, start.format('YYYY-MM-DD HH:mm:ss'), end.format('YYYY-MM-DD HH:mm:ss')]
  );
  return rows[0] || null;
}

async function getRooms() {
  const [rows] = await db.query('SELECT * FROM conference_rooms WHERE is_active = 1 ORDER BY name ASC');
  return rows;
}

app.get('/', async (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const rooms = await getRooms();
  res.render('home', { title: 'Conference Room Booking System', rooms });
});

app.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Register' });
});

app.post('/register', async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  try {
    if (!name || !email || !password) {
      req.flash('danger', 'Name, email, and password are required.');
      return res.redirect('/register');
    }
    if (password !== confirmPassword) {
      req.flash('danger', 'Passwords do not match.');
      return res.redirect('/register');
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (existing.length) {
      req.flash('danger', 'Email is already registered.');
      return res.redirect('/register');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, 'user']
    );

    req.flash('success', 'Registration successful. Please log in.');
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    req.flash('danger', 'Registration failed.');
    res.redirect('/register');
  }
});

app.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user) {
      req.flash('danger', 'Invalid email or password.');
      return res.redirect('/login');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      req.flash('danger', 'Invalid email or password.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    req.flash('success', `Welcome, ${user.name}!`);
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    req.flash('danger', 'Login failed.');
    res.redirect('/login');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const rooms = await getRooms();
  const [stats] = await db.query(
    `SELECT
      SUM(CASE WHEN status = 'active' AND start_datetime >= NOW() THEN 1 ELSE 0 END) AS upcomingBookings,
      SUM(CASE WHEN status = 'active' AND zoom_link_required = 1 AND start_datetime >= NOW() THEN 1 ELSE 0 END) AS onlineMeetingNeeds,
      (SELECT COUNT(*) FROM conference_rooms WHERE is_active = 1) AS activeRooms
     FROM bookings`
  );
  res.render('dashboard', { title: 'Dashboard', rooms, stats: stats[0] || {} });
});

app.get('/calendar', requireAuth, async (req, res) => {
  const rooms = await getRooms();
  res.render('bookings/calendar', { title: 'Calendar', rooms });
});

app.get('/api/bookings', requireAuth, async (req, res) => {
  const roomId = req.query.roomId;
  const { start, end } = req.query;
  let query = `SELECT b.id, b.room_id, b.user_id, b.reserved_by_name, b.purpose, b.notes,
                      b.meeting_type, b.zoom_link_required, b.recurrence_type,
                      b.start_datetime, b.end_datetime, b.status,
                      r.name AS room_name
               FROM bookings b
               INNER JOIN conference_rooms r ON r.id = b.room_id
               WHERE b.status = 'active'`;
  const params = [];

  if (roomId) {
    query += ' AND b.room_id = ?';
    params.push(roomId);
  }
  if (start && end) {
    query += ' AND b.start_datetime < ? AND b.end_datetime > ?';
    params.push(end, start);
  }
  query += ' ORDER BY b.start_datetime ASC';

  const [rows] = await db.query(query, params);
  const events = rows.map((row) => ({
    id: row.id,
    title: `${row.room_name} • ${row.reserved_by_name}`,
    start: dayjs(row.start_datetime).format('YYYY-MM-DDTHH:mm:ss'),
    end: dayjs(row.end_datetime).format('YYYY-MM-DDTHH:mm:ss'),
    extendedProps: {
      roomName: row.room_name,
      purpose: row.purpose,
      reservedBy: row.reserved_by_name,
      meetingType: row.meeting_type,
      zoomNeeded: !!row.zoom_link_required
    }
  }));

  res.json(events);
});

app.get('/bookings/new', requireAuth, async (req, res) => {
  const rooms = await getRooms();
  res.render('bookings/new', { title: 'New Reservation', rooms });
});

app.post('/bookings', requireAuth, async (req, res) => {
  const {
    room_id,
    reserved_by_name,
    reserved_by_email,
    purpose,
    notes,
    meeting_type,
    booking_date,
    start_time,
    end_time,
    recurrence_type,
    recurrence_end_date,
    zoom_link_required
  } = req.body;

  const { start, end } = getDateTimesFromInput(booking_date, start_time, end_time);
  const validationError = validateBookingDates(start, end);
  if (validationError) {
    req.flash('danger', validationError);
    return res.redirect('/bookings/new');
  }

  try {
    const recurrence = recurrence_type || 'none';
    const slots = buildRecurringDates(start, end, recurrence, recurrence_end_date);
    const seriesId = recurrence === 'none' ? null : uuidv4();

    for (const slot of slots) {
      const conflict = await findConflict(room_id, slot.start, slot.end);
      if (conflict) {
        req.flash(
          'danger',
          `Conflict found in ${conflict.room_name} on ${dayjs(conflict.start_datetime).format('MMM D, YYYY h:mm A')}.`
        );
        return res.redirect('/bookings/new');
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (const slot of slots) {
        await connection.query(
          `INSERT INTO bookings (
            room_id, user_id, reserved_by_name, reserved_by_email, purpose, notes,
            meeting_type, zoom_link_required, recurrence_type, series_id,
            start_datetime, end_datetime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            room_id,
            req.session.user.id,
            reserved_by_name.trim(),
            reserved_by_email.trim().toLowerCase(),
            purpose || null,
            notes || null,
            meeting_type || 'onsite',
            zoom_link_required ? 1 : 0,
            recurrence,
            seriesId,
            slot.start.format('YYYY-MM-DD HH:mm:ss'),
            slot.end.format('YYYY-MM-DD HH:mm:ss')
          ]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [roomRows] = await db.query('SELECT * FROM conference_rooms WHERE id = ?', [room_id]);
    const room = roomRows[0];
    await sendBookingCreatedEmail(
      {
        reserved_by_name,
        reserved_by_email,
        purpose,
        meeting_type,
        start_datetime: start.toDate(),
        end_datetime: end.toDate()
      },
      room
    );

    req.flash('success', `Reservation created successfully${slots.length > 1 ? ` with ${slots.length} recurring entries` : ''}.`);
    res.redirect('/my-bookings');
  } catch (error) {
    console.error(error);
    req.flash('danger', error.message || 'Reservation failed.');
    res.redirect('/bookings/new');
  }
});

app.get('/my-bookings', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.*, r.name AS room_name, r.location
     FROM bookings b
     INNER JOIN conference_rooms r ON r.id = b.room_id
     WHERE b.user_id = ?
     ORDER BY b.start_datetime DESC`,
    [req.session.user.id]
  );

  res.render('bookings/my-bookings', { title: 'My Bookings', bookings: rows });
});

app.post('/bookings/:id/cancel', requireAuth, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const [rows] = await db.query(
      `SELECT b.*, r.name AS room_name, r.location
       FROM bookings b
       INNER JOIN conference_rooms r ON r.id = b.room_id
       WHERE b.id = ? LIMIT 1`,
      [bookingId]
    );

    const booking = rows[0];
    if (!booking) {
      req.flash('danger', 'Booking not found.');
      return res.redirect('/my-bookings');
    }

    const isOwner = booking.user_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      req.flash('danger', 'You cannot cancel another user\'s reservation.');
      return res.redirect('/my-bookings');
    }

    if (booking.status === 'cancelled') {
      req.flash('warning', 'This booking is already cancelled.');
      return res.redirect('/my-bookings');
    }

    await db.query(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = ?
       WHERE id = ?`,
      [req.session.user.id, bookingId]
    );

    await sendBookingCancelledEmail(booking, { name: booking.room_name, location: booking.location });
    req.flash('success', 'Booking cancelled successfully.');
    res.redirect(isAdmin ? '/admin/bookings' : '/my-bookings');
  } catch (error) {
    console.error(error);
    req.flash('danger', 'Unable to cancel booking.');
    res.redirect('/my-bookings');
  }
});

app.get('/admin/rooms', requireAdmin, async (req, res) => {
  const [rooms] = await db.query('SELECT * FROM conference_rooms ORDER BY created_at DESC');
  res.render('admin/rooms/index', { title: 'Manage Rooms', rooms });
});

app.post('/admin/rooms', requireAdmin, async (req, res) => {
  const { name, location, capacity, description, is_active } = req.body;
  try {
    await db.query(
      'INSERT INTO conference_rooms (name, location, capacity, description, is_active) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), location || null, Number(capacity || 0), description || null, is_active ? 1 : 0]
    );
    req.flash('success', 'Conference room added successfully.');
  } catch (error) {
    console.error(error);
    req.flash('danger', 'Unable to add conference room.');
  }
  res.redirect('/admin/rooms');
});

app.post('/admin/rooms/:id/update', requireAdmin, async (req, res) => {
  const { name, location, capacity, description, is_active } = req.body;
  try {
    await db.query(
      `UPDATE conference_rooms
       SET name = ?, location = ?, capacity = ?, description = ?, is_active = ?
       WHERE id = ?`,
      [name.trim(), location || null, Number(capacity || 0), description || null, is_active ? 1 : 0, req.params.id]
    );
    req.flash('success', 'Conference room updated successfully.');
  } catch (error) {
    console.error(error);
    req.flash('danger', 'Unable to update conference room.');
  }
  res.redirect('/admin/rooms');
});

app.get('/admin/bookings', requireAdmin, async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.*, r.name AS room_name
     FROM bookings b
     INNER JOIN conference_rooms r ON r.id = b.room_id
     ORDER BY b.start_datetime DESC`
  );
  res.render('admin/bookings', { title: 'All Bookings', bookings: rows });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

(async function start() {
  try {
    await db.query('SELECT 1');
    await seedAdminUser();
    startReminderJob();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start app:', error.message);
    process.exit(1);
  }
})();
