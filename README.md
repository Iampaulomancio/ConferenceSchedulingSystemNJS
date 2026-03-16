# Conference Room Booking System

A full Node.js + Express + MySQL conference room reservation system with:

- User registration and login
- Admin dashboard and room management
- Calendar view showing occupied/vacant schedules
- Reservation creation and cancellation rules
- Users can cancel only their own bookings
- Recurring bookings (daily, weekly, monthly)
- Online meeting checkbox to flag bookings that need a Zoom link
- Email notifications and reminders
- Render-ready deployment config

## Tech Stack

- Node.js + Express
- MySQL
- EJS templates
- Bootstrap 5
- FullCalendar
- Nodemailer

## Local Setup

1. Copy `.env.example` to `.env` and update values.
2. Create the MySQL database and import `sql/schema.sql`.
3. Run:
   ```bash
   npm install
   npm start
   ```
4. Open `http://localhost:3000`

## Default Admin

The app seeds an admin account on startup using these env vars:

- `ADMIN_SEED_NAME`
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`

## Render Deployment

1. Push this project to GitHub.
2. In Render, create a new **Web Service** from the repo.
3. Render will detect `render.yaml`.
4. Set all `sync: false` environment variables.
5. Point the database vars to your MySQL server.
6. Import `sql/schema.sql` into your MySQL database.
7. Deploy.

## Notes

- Render Web Services must bind to `0.0.0.0` and usually listen on `PORT`.
- If you want MySQL on Render, run a separate MySQL service with a persistent disk, or use an external MySQL provider.
