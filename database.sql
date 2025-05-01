-- Admins Table
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Candidates Table
CREATE TABLE candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE candidates ADD COLUMN event_id INT DEFAULT NULL;


-- Judges Table
CREATE TABLE judges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_datetime DATETIME NOT NULL,
    event_location VARCHAR(255) NOT NULL,
    event_description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT,
    event_id INT,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

ALTER TABLE events ADD COLUMN status VARCHAR(20) DEFAULT 'published';

UPDATE events SET status = 'published' WHERE id IN (3, 4, 5);

CREATE TABLE ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    candidate_id INT NOT NULL,
    judge_id INT NOT NULL,
    performance INT NOT NULL CHECK (performance BETWEEN 1 AND 5),
    presentation INT NOT NULL CHECK (presentation BETWEEN 1 AND 5),
    time INT NOT NULL CHECK (time BETWEEN 1 AND 5),
    engagement INT NOT NULL CHECK (engagement BETWEEN 1 AND 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (judge_id) REFERENCES judges(id) ON DELETE CASCADE
);

ALTER TABLE candidates MODIFY COLUMN event_id INT DEFAULT NULL;

ALTER TABLE candidates
ADD COLUMN otp VARCHAR(6),
ADD COLUMN otp_expiration DATETIME;




