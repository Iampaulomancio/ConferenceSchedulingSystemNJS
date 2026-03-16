CREATE DATABASE IF NOT EXISTS conference_booking;
USE conference_booking;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conference_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) DEFAULT NULL,
  capacity INT DEFAULT 0,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  user_id INT NOT NULL,
  reserved_by_name VARCHAR(150) NOT NULL,
  reserved_by_email VARCHAR(191) NOT NULL,
  purpose VARCHAR(255) DEFAULT NULL,
  notes TEXT,
  meeting_type ENUM('onsite', 'online') NOT NULL DEFAULT 'onsite',
  zoom_link_required TINYINT(1) NOT NULL DEFAULT 0,
  recurrence_type ENUM('none', 'daily', 'weekly', 'monthly') NOT NULL DEFAULT 'none',
  series_id VARCHAR(64) DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  reminder_sent_at DATETIME DEFAULT NULL,
  cancelled_at DATETIME DEFAULT NULL,
  cancelled_by_user_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_room FOREIGN KEY (room_id) REFERENCES conference_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_booking_room_time (room_id, start_datetime, end_datetime),
  INDEX idx_booking_series (series_id),
  INDEX idx_booking_status (status)
);

INSERT INTO conference_rooms (name, location, capacity, description)
SELECT * FROM (
  SELECT 'Conference Room A', 'Main Office - 2nd Floor', 12, 'Default room for board and team meetings'
) AS tmp
WHERE NOT EXISTS (
  SELECT 1 FROM conference_rooms WHERE name = 'Conference Room A'
) LIMIT 1;

INSERT INTO conference_rooms (name, location, capacity, description)
SELECT * FROM (
  SELECT 'Conference Room B', 'Main Office - 3rd Floor', 8, 'Good for smaller department meetings'
) AS tmp
WHERE NOT EXISTS (
  SELECT 1 FROM conference_rooms WHERE name = 'Conference Room B'
) LIMIT 1;
