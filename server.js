require("dotenv").config();
const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise"); // ✅ Use Promises for async/await
const bcrypt = require("bcrypt");
const session = require("express-session");
const moment = require('moment');
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(
    session({
        secret: "admin_secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Set to true if using HTTPS
    })
);

const caCert = fs.readFileSync('./ca.pem'); // Correct path to your CA cert file


// ✅ Database Connection (Using Pool and Promises)
const db = mysql.createPool({
    host: process.env.DB_HOST, // Aiven MySQL host
    port: process.env.DB_PORT, // Aiven MySQL port (e.g., 24648)
    user: process.env.DB_USER, // Aiven MySQL user
    password: process.env.DB_PASS, // Aiven MySQL password
    database: process.env.DB_NAME, // Aiven MySQL database name
    ssl: {
        ca: caCert // Include the CA cert for SSL connection
    }
});

// ✅ Check Database Connection (Using Promises)
db.getConnection()
    .then(connection => {
        console.log("Connected to MySQL database!");
        connection.release(); // Release connection back to the pool
    })
    .catch(err => {
        console.error("Database connection failed: " + err.message);
    });

// Landing Page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});



// Serve Login & Registration Pages
app.get("/login/admin", (req, res) => res.sendFile(path.join(__dirname, "views", "admin-login.html")));
app.get("/login/candidate", (req, res) => res.sendFile(path.join(__dirname, "views", "candidate-login.html")));
app.get("/login/judge", (req, res) => res.sendFile(path.join(__dirname, "views", "judge-login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "views", "register.html")));

// ✅ Admin Login Route
app.post("/login/admin", async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const [results] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
        if (results.length === 0) return res.status(401).json({ error: "Admin not found" });

        const isMatch = await bcrypt.compare(password, results[0].password);
        if (!isMatch) return res.status(401).json({ error: "Incorrect password" });

        req.session.adminId = results[0].id;
        req.session.adminName = results[0].name; 
        res.redirect("/admin/dashboard");

    } catch (err) {
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// ✅ Protected Admin Dashboard
app.get("/admin/dashboard", (req, res) => {
    if (!req.session.adminId) {
        return res.redirect("/login/admin");
    }
    res.sendFile(path.join(__dirname, "views", "admin-dashboard.html"));
});

// ✅ Admin Logout
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login/admin");
    });
});

// ✅ Candidate Login Route
app.post('/login/candidate', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.execute('SELECT * FROM candidates WHERE email = ?', [email]);

        if (rows.length > 0) {
            const candidate = rows[0];
            const match = await bcrypt.compare(password, candidate.password);

            if (match) {
                req.session.candidateId = candidate.id; // Store session if needed
                res.sendFile(path.join(__dirname, 'views', 'candidate-dashboard.html'));
            } else {
                res.status(401).send('Invalid credentials');
            }
        } else {
            res.status(401).send('Candidate not found');
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).send('Internal Server Error');
    }
});



app.post('/judge-login', async (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT id, name, email, password FROM judges WHERE email = ?';

    db.query(query, [email], async (err, results) => {
        if (err) {
            console.error("❌ Database Error:", err);
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            console.warn("⚠️ Login Failed: No judge found with this email.");
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const judge = results[0];
        const match = await bcrypt.compare(password, judge.password);

        if (!match) {
            console.warn("⚠️ Login Failed: Incorrect password.");
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // ✅ Store judge ID in session
        req.session.judgeId = judge.id;
        req.session.user = { id: judge.id, name: judge.name, email: judge.email };

        console.log(`✅ Judge Logged In: ${judge.name} (ID: ${judge.id})`);
        console.log("🛠 Session Data After Login:", req.session);

        res.json({ 
            message: "Login successful", 
            judgeId: judge.id, 
            redirect: "/judge-dashboard" 
        });
    });
});

app.use((req, res, next) => {
    console.log("🔥 Checking Authentication Middleware");

    if (req.session?.judgeId) {
        req.user = { id: req.session.judgeId }; // ✅ Attach judge ID to req.user
        console.log("✅ Judge ID in Middleware:", req.user.id);
    } else {
        console.warn("⚠️ No judge ID found in session.");
    }

    next();
});

// Nodemailer Transporter (Configure with your email credentials)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "emailforeventratingsystem@gmail.com", 
        pass: "uyph xexs hirx uqhg" 
    }
});

app.post("/send-otp", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "Email is required!" });

    const otp = (Math.floor(Math.random() * 900000) + 100000).toString();
    req.session.otp = otp;
    req.session.email = email;

    const mailOptions = {
        from: "emailforeventratingsystem@gmail.com",
        to: email,
        subject: "Your OTP for Registration",
        text: `Your OTP is: ${otp}. It is valid for 5 minutes.`
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully:", info.response);
        res.json({ success: true, message: "OTP sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending OTP:", error);
        res.json({ success: false, message: "Error sending OTP!", error: error.message });
    }
});

// ✅ Candidate Registration Route (Redirect after success)
app.post("/register", async (req, res) => {
    const { name, email, otp, password } = req.body;

    try {
        if (!name || !email || !otp || !password) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        // Validate OTP
        if (req.session.otp !== otp || req.session.email !== email) {
            return res.status(401).json({ success: false, message: "Invalid or expired OTP!" });
        }

        // Hash password
        const hash = await bcrypt.hash(password, 10);

        // Insert into database
        await db.execute("INSERT INTO candidates (name, email, password) VALUES (?, ?, ?)", [name, email, hash]);

        // ✅ Clear OTP after success
        req.session.otp = null;
        req.session.email = null;

        // ✅ Send success response
        res.json({ success: true, message: "Candidate registered successfully!" });

    } catch (err) {
        console.error("Registration error:", err);

        // Handle MySQL duplicate entry error
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Email already registered!" });
        }

        res.status(500).json({ success: false, error: "Database error", details: err.message });
    }
});

// 🏠 Home Page
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});

// ✅ Manage Candidates Page
app.get("/manage-candidates", (req, res) => {
    if (!req.session.adminId) {
        return res.redirect("/login/admin");
    }
    res.sendFile(path.join(__dirname, "views", "manage-candidates.html"));
});

// ✅ Manage Pages
app.get("/manage-judges", (req, res) => res.sendFile(path.join(__dirname, "views", "manage-judges.html")));
app.get("/manage-events", (req, res) => res.sendFile(path.join(__dirname, "views", "manage-events.html")));
app.get("/winners", (req, res) => res.sendFile(path.join(__dirname, "views", "winners.html")));


// ✅ Publish Event & Notify Candidates
app.post('/publish-event', async (req, res) => {
    const { event_name, event_date, event_time, event_location, event_description } = req.body;

    try {
        // ✅ Combine event date & time into a single datetime format
        const event_datetime = `${event_date} ${event_time}`;

        // ✅ Insert the event into the database
        const [result] = await db.execute(
            'INSERT INTO events (event_name, event_datetime, event_location, event_description) VALUES (?, ?, ?, ?)',
            [event_name, event_datetime, event_location, event_description]
        );

        if (!result.insertId) {
            return res.status(500).send("Error publishing event.");
        }

        // ✅ Fetch all registered candidates' emails
        const [candidates] = await db.execute("SELECT email FROM candidates");

        if (candidates.length === 0) {
            return res.send('<script>alert("Event Published Successfully! No candidates to notify."); window.location.href="/admin/dashboard";</script>');
        }

        // ✅ Send email notifications
        candidates.forEach(candidate => {
            const mailOptions = {
                from: "emailforeventratingsystem@gmail.com",
                to: candidate.email,
                subject: "🎉 New Event Published!",
                text: `A new event "${event_name}" is happening on ${event_datetime} at ${event_location}. Don't miss out!`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error(`❌ Email failed for ${candidate.email}:`, error);
                } else {
                    console.log(`✅ Email sent to ${candidate.email}: ${info.response}`);
                }
            });
        });

        // ✅ Success message & redirect
        res.send('<script>alert("Event Published Successfully! Emails sent to candidates."); window.location.href="/admin/dashboard";</script>');

    } catch (err) {
        console.error("❌ Error publishing event:", err);
        res.status(500).send('Error saving event');
    }
});

// ✅ Get Events (Fixed Async Issues)
app.get('/get-events', async (req, res) => {
    try {
        const [events] = await db.query("SELECT * FROM events ORDER BY event_datetime ASC");
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: "Error fetching events", error: err.message });
    }
});

app.post('/update-event', async (req, res) => {
    const { id, name, date, time, location, description } = req.body;

    if (!id || !name || !date || !time || !location || !description) {
        console.error("❌ Missing Fields:", req.body);
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        console.log(`🔹 Updating Event ID: ${id} with Data:`, req.body);

        // Combine date and time into a single datetime string
        const event_datetime = `${date} ${time}`;

        // ✅ Ensure db.promise() is used
        const [result] = await db.query( 
            'UPDATE events SET event_name = ?, event_datetime = ?, event_location = ?, event_description = ? WHERE id = ?',
            [name, event_datetime, location, description, id]
        );

        console.log("🔹 SQL Result:", result);

        if (result.affectedRows === 0) {
            console.warn("⚠️ No Rows Affected: Event may not exist or data is unchanged.");
            return res.status(404).json({ message: "Event not found or no changes made!" });
        }

        res.json({ message: "✅ Event updated successfully!" });

    } catch (error) {
        console.error("❌ Update Event Error:", error);
        res.status(500).json({ message: "Error updating event", error: error.message });
    }
});

// ✅ Delete Event
app.delete('/delete-event/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM events WHERE id = ?', [id]);
        res.json({ message: 'Event deleted successfully' });

    } catch (err) {
        res.status(500).json({ message: 'Error deleting event', error: err.message });
    }
});


//for judge-management
// 🔹 GET all judges
app.get("/judges", async (req, res) => {
    try {
        const [results] = await db.query("SELECT id, name, email, created_at FROM judges");
        res.json(results);
    } catch (err) {
        console.error("Database Query Error:", err);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// 🔹 ADD a new judge
app.post("/judges", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [results] = await db.query(
            "INSERT INTO judges (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword]
        );
        res.json({ message: "Judge added successfully!", judgeId: results.insertId });
    } catch (err) {
        console.error("Error inserting judge:", err);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// 🔹 UPDATE a judge
app.put("/judges/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query("UPDATE judges SET name = ?, email = ?, password = ? WHERE id = ?", 
            [name, email, hashedPassword, id]
        );
        res.json({ message: "Judge updated successfully!" });
    } catch (err) {
        console.error("Error updating judge:", err);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// 🔹 DELETE a judge
app.delete('/judges/:id', (req, res) => {
    const judgeId = req.params.id;
    db.query("DELETE FROM judges WHERE id = ?", [judgeId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Database error" });
        }
        res.json({ message: "Judge deleted successfully" });
    });
});

app.post("/login/judge", async (req, res) => {
    const { email, password } = req.body;

    try {
        const [results] = await db.query("SELECT * FROM judges WHERE email = ?", [email]);
        if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

        const judge = results[0];
        const match = await bcrypt.compare(password, judge.password);

        if (!match) return res.status(401).json({ error: "Invalid credentials" });

        req.session.judgeId = judge.id;
        res.redirect("/judge/dashboard");

    } catch (err) {
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// ✅ Serve Judge Dashboard
app.get("/judge/dashboard", (req, res) => {
    if (!req.session.judgeId) return res.redirect("/login/judge");
    res.sendFile(path.join(__dirname, "views", "judge-dashboard.html"));
});


// candidate-management
app.get("/candidates", async (req, res) => {
    try {
        const [candidates] = await db.execute("SELECT id, name, email FROM candidates");
        res.json(candidates); // ✅ Sending JSON
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal server error" }); // ✅ Sending JSON error
    }
});

saltRounds=10
// Create a new candidate
app.post("/candidates", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert candidate into the database with hashed password
        const result = await db.query(
            "INSERT INTO candidates (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword]
        );

        res.status(201).json({ id: result.insertId, name, email });
    } catch (error) {
        console.error("Error inserting candidate:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.put("/candidates/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;

    try {
        let hashedPassword;
        if (password) {
            // Hash the password only if it's provided
            hashedPassword = await bcrypt.hash(password, saltRounds);
        }

        // Update candidate in the database with hashed password
        const updateQuery = hashedPassword
            ? "UPDATE candidates SET name = ?, email = ?, password = ? WHERE id = ?"
            : "UPDATE candidates SET name = ?, email = ? WHERE id = ?";
        
        const queryParams = hashedPassword
            ? [name, email, hashedPassword, id]
            : [name, email, id];

        await db.query(updateQuery, queryParams);

        res.status(200).json({ id, name, email });
    } catch (error) {
        console.error("Error updating candidate:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 🔹 DELETE a candidates
app.delete('/candidates/:id', (req, res) => {
    const candidateId = req.params.id;
    db.query("DELETE FROM candidates WHERE id = ?", [candidateId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Database error" });
        }
        res.json({ message: "candidates deleted successfully" });
    });
});

// ✅ Serve the Publish Event Page
app.get('/publish-event', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'publish-event.html'));
});

// ✅ Fetch upcoming events
app.get("/get-events", async (req, res) => {
    try {
        const [events] = await db.execute("SELECT * FROM events ORDER BY event_datetime ASC");
        res.json(events);
    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).json({ message: "Error fetching events", error: err.message });
    }
});

// ✅ Enroll in an event (Prevent duplicate enrollments & time conflicts)
app.post("/enroll", async (req, res) => {
    if (!req.session.candidateId) {
        return res.status(401).json({ message: "Unauthorized. Please log in first." });
    }

    const { eventId } = req.body;
    const candidateId = req.session.candidateId;

    if (!eventId) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    try {
        // ✅ Check if event exists
        const [event] = await db.execute("SELECT id, event_name, event_datetime FROM events WHERE id = ?", [eventId]);
        if (event.length === 0) {
            return res.status(404).json({ message: "Event not found!" });
        }

        const eventName = event[0].event_name;
        const eventDateTime = event[0].event_datetime;

        // ✅ Check if the candidate is already enrolled in this event
        const [existingEnrollment] = await db.execute(
            "SELECT * FROM enrollments WHERE event_id = ? AND candidate_id = ?",
            [eventId, candidateId]
        );

        if (existingEnrollment.length > 0) {
            return res.status(400).json({ message: "You are already enrolled in this event!" });
        }

        // ✅ Check for conflicts (same date AND same time)
        const [conflictingEvents] = await db.execute(
            `SELECT e.event_name FROM enrollments en 
             JOIN events e ON en.event_id = e.id 
             WHERE en.candidate_id = ? AND e.event_datetime = ?`,
            [candidateId, eventDateTime]
        );

        if (conflictingEvents.length > 0) {
            return res.status(400).json({
                message: `You are already enrolled in another event at the same date and time: ${conflictingEvents[0].event_name}`
            });
        }

        // ✅ Insert enrollment
        await db.execute("INSERT INTO enrollments (event_id, candidate_id) VALUES (?, ?)", [eventId, candidateId]);

        // ✅ Get candidate email
        const [candidate] = await db.execute("SELECT email FROM candidates WHERE id = ?", [candidateId]);
        const candidateEmail = candidate[0].email;

        // ✅ Send Email Confirmation
        const mailOptions = {
            from: "01homelap@gmail.com",
            to: candidateEmail,
            subject: "Event Enrollment Confirmation",
            text: `You have successfully enrolled in "${eventName}" on ${eventDateTime}.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("❌ Error sending email:", error);
            }
        });

        res.status(200).json({ message: "Enrollment successful! Confirmation email sent." });

    } catch (error) {
        console.error("Enrollment error:", error);
        res.status(500).json({ message: "Failed to enroll in event" });
    }
});

app.get("/api/enrolled-candidates", async (req, res) => {
    if (!req.session.adminId) {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    try {
        const [enrollments] = await db.execute(`
            SELECT e.id, c.name AS candidate_name, c.email, ev.event_name, ev.event_datetime
            FROM enrollments e
            JOIN candidates c ON e.candidate_id = c.id
            JOIN events ev ON e.event_id = ev.id
            ORDER BY ev.event_datetime DESC
        `);

        console.log("Raw Enrollments Data:", enrollments);

        const formattedEnrollments = enrollments.map(enrollment => ({
            ...enrollment,
            event_datetime: new Date(enrollment.event_datetime).toLocaleString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short"
            })
        }));

        res.json(formattedEnrollments);
    } catch (err) {
        console.error("Error fetching enrolled candidates:", err.message);
        res.status(500).json({ error: "Failed to fetch enrolled candidates" });
    }
});


// Route for login page
app.get("/login", (req, res) => {
    res.render("login");  // Assuming you are rendering a login page
});


//for enrolled candidates

// ✅ Serve Enrolled Candidates Page (GET /enrolled-candidates)
app.get("/enrolled-candidates", (req, res) => {
    if (!req.session.adminId) { // Ensure only admins can access
        return res.redirect("/login/admin");
    }
    res.sendFile(path.join(__dirname, "views", "enrolled-candidates.html"));
});


// API to fetch events assigned to the judge
app.get('/api/judge/events', async (req, res) => {
    try {
        console.log("Fetching judge events..."); // Debugging log

        // Fix potential issue: Check column names in DB
        const [events] = await db.query("SELECT id, event_name, event_datetime FROM events WHERE status = 'published'");

        console.log("Fetched Events:", events); // Debugging log

        if (events.length === 0) {
            return res.status(404).json({ message: "No events found." });
        }

        // Properly format response
        const formattedEvents = events.map(event => ({
            id: event.id,
            name: event.event_name,
            date: new Date(event.event_datetime).toLocaleString()
        }));

        res.json(formattedEvents);
    } catch (error) {
        console.error("Error fetching judge events:", error); // Detailed error logging
        res.status(500).json({ error: "Failed to fetch events", details: error.message });
    }
});

// API for fetching candidates dynamically
app.get('/api/event-candidates/:id', async (req, res) => {
    const eventId = req.params.id;

    try {
        // Fetch candidates for the selected event
        const [candidates] = await db.query(
            "SELECT candidates.id, candidates.name FROM candidates " +
            "JOIN enrollments ON candidates.id = enrollments.candidate_id " +
            "WHERE enrollments.event_id = ?",
            [eventId]
        );

        res.json(candidates);
    } catch (error) {
        console.error("Error fetching candidates:", error);
        res.status(500).json({ error: "Failed to fetch candidates" });
    }
});

app.get('/eventsforjudge', async (req, res) => {
    try {
        const [events] = await db.query(
            "SELECT id, event_name, event_datetime FROM events WHERE status = 'published'"
        );

        console.log("Fetched Events:", events); // 🔍 Debugging log

        if (events.length === 0) {
            return res.status(404).json({ message: "No events found." });
        }

        const formattedEvents = events.map(event => ({
            id: event.id,
            name: event.event_name,
            date: moment(event.event_datetime).format("MMMM D, YYYY - h:mm A")
        }));

        res.json(formattedEvents);
    } catch (error) {
        console.error("Database Error:", error.message); // Log only the error message
        res.status(500).json({ error: "Failed to fetch events" });
    }
});


// Serve the Judge Dashboard page
app.get('/judge/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'judge-dashboard.html'));
});

app.get('/rate-events', (req, res) => {
    res.sendFile(__dirname + '/views/rate-events.html');
});


app.get('/api/event-candidates/:eventId', async (req, res) => {
    const eventId = req.params.eventId;
    console.log("Fetching candidates for event ID:", eventId); // Debugging log

    try {
        const [candidates] = await db.promise().query(
            "SELECT users.id, users.name FROM event_registrations INNER JOIN users ON event_registrations.user_id = users.id WHERE event_registrations.event_id = ?",
            [eventId]
        );

        console.log("Candidates fetched:", candidates); // Debugging log

        if (candidates.length === 0) {
            return res.status(404).json({ message: "No candidates found for this event." });
        }

        res.json(candidates);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Failed to fetch candidates" });
    }
});

app.get('/api/judge-info', (req, res) => {
    if (!req.session.judgeId) {
        return res.status(401).json({ error: "Unauthorized: No judge logged in" });
    }

    res.json({ judgeId: req.session.judgeId });
});


app.get('/api/event/:eventId/candidates', async (req, res) => {
    console.log("🔍 Checking Authentication...");
    console.log("Current User:", req.user); // Debug log

    const eventId = req.params.eventId;
    const judgeId = req.user?.id;

    if (!judgeId) {
        console.log("❌ No judge ID found in req.user");
        return res.status(401).json({ error: "Unauthorized: Judge not logged in" });
    }

    if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
    }

    try {
        const [candidates] = await db.query(
            `SELECT c.id, c.name 
             FROM candidates c
             JOIN enrollments e ON c.id = e.candidate_id
             WHERE e.event_id = ? 
             AND c.id NOT IN (
                 SELECT candidate_id FROM ratings 
                 WHERE event_id = ? 
                 AND judge_id = ?
             ) 
             ORDER BY c.name ASC`,
            [eventId, eventId, judgeId]
        );

        console.log(`✅ Candidates fetched for Judge ${judgeId}:`, candidates);
        res.json(candidates);
    } catch (error) {
        console.error("❌ Database error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get('/judge/rate-candidate', (req, res) => {
    res.sendFile(__dirname + "/views/rate-events.html");
});

app.get("/rate.html", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "rate.html"));
});

app.get("/api/candidate/:id", async (req, res) => {
    const candidateId = req.params.id;
    
    try {
        const [rows] = await db.execute("SELECT name FROM candidates WHERE id = ?", [candidateId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Candidate not found" });
        }

        res.json({ name: rows[0].name });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/*
app.post('/api/rate-candidate', async (req, res) => {
    const { eventId, candidateId, performance, presentation, time, engagement } = req.body;

    console.log("Submitting rating for:", { eventId, candidateId, performance, presentation, time, engagement });

    // Validate required fields
    if (!eventId || !candidateId || !performance || !presentation || !time || !engagement) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        // Fetch judge_id from session (if using sessions)
        let judgeId = req.session.judgeId;

        // If session does not store judgeId, fetch it from the database
        if (!judgeId) {
            const [judgeResult] = await db.query(
                "SELECT id FROM users WHERE role = 'judge' LIMIT 1" // Fetch first judge (modify as needed)
            );

            if (judgeResult.length === 0) {
                return res.status(403).json({ error: "Judge not authenticated" });
            }

            judgeId = judgeResult[0].id;
            req.session.judgeId = judgeId; // Store in session
        }

        // Insert rating into database
        const [result] = await db.query(
            "INSERT INTO ratings (event_id, candidate_id, judge_id, performance, presentation, time, engagement) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [eventId, candidateId, judgeId, performance, presentation, time, engagement]
        );

        console.log("Database insert result:", result);
        res.json({ success: true, message: "Rating submitted successfully" });

    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
*/

app.post('/api/rate-candidate', async (req, res) => {
    const { eventId, candidateId, performance, presentation, time, engagement } = req.body;

    console.log("Submitting rating for:", { eventId, candidateId, performance, presentation, time, engagement });

    // Validate required fields
    if (!eventId || !candidateId || !performance || !presentation || !time || !engagement) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        // Store eventId in session if not already set
        if (!req.session.eventId) {
            req.session.eventId = eventId;
        }

        // Fetch judge_id from session (if using sessions)
        let judgeId = req.session.judgeId;

        // If session does not store judgeId, fetch it from the database
        if (!judgeId) {
            const [judgeResult] = await db.query(
                "SELECT id FROM users WHERE role = 'judge' LIMIT 1"
            );

            if (judgeResult.length === 0) {
                return res.status(403).json({ error: "Judge not authenticated" });
            }

            judgeId = judgeResult[0].id;
            req.session.judgeId = judgeId; // Store in session
        }

        // Insert rating into database
        const [result] = await db.query(
            "INSERT INTO ratings (event_id, candidate_id, judge_id, performance, presentation, time, engagement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
            [eventId, candidateId, judgeId, performance, presentation, time, engagement]
        );

        console.log("Database insert result:", result);

        // Fetch the next unrated candidate for the same event
        const [nextCandidate] = await db.query(
            "SELECT * FROM candidates WHERE event_id = ? AND id NOT IN (SELECT candidate_id FROM ratings WHERE judge_id = ? AND event_id = ?) LIMIT 1",
            [eventId, judgeId, eventId]
        );

        if (nextCandidate.length === 0) {
            return res.json({ success: true, message: "Rating submitted successfully. No more candidates to rate." });
        }

        res.json({
            success: true,
            message: "Rating submitted successfully.",
            nextCandidate: nextCandidate[0] // Send next candidate details
        });

    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/event/:eventId/candidates", async (req, res) => {
    try {
        const eventId = req.params.eventId;
        const judgeId = req.query.judgeId; // Get judge ID from query params

        if (!eventId || !judgeId) {
            return res.status(400).json({ error: "Missing eventId or judgeId" });
        }

        console.log(`🔍 Fetching candidates for Event ID: ${eventId}, Judge ID: ${judgeId}`);

        // Fetch all candidates for this event
        const [candidates] = await db.query("SELECT id, name FROM candidates WHERE event_id = ?", [eventId]);
        console.log("✅ All candidates from DB:", candidates);

        if (!candidates || candidates.length === 0) {
            console.warn("⚠ No candidates found for this event.");
            return res.json([]);
        }

        // Fetch candidates that this judge has already rated
        const [ratedCandidates] = await db.query(
            "SELECT candidate_id FROM ratings WHERE event_id = ? AND judge_id = ?",
            [eventId, judgeId]
        );

        console.log("✅ Already rated candidates:", ratedCandidates);

        // Ensure the ratedCandidates is an array of objects with candidate_id
        if (!ratedCandidates) {
            console.warn("⚠ No ratings found for this judge.");
        }

        // Convert rated candidates into a Set for easy lookup
        const ratedCandidateIds = new Set(ratedCandidates.map(row => row.candidate_id));

        // Filter out already rated candidates
        const unratedCandidates = candidates.filter(candidate => !ratedCandidateIds.has(candidate.id));

        console.log("✅ Unrated candidates:", unratedCandidates);

        if (unratedCandidates.length === 0) {
            console.warn("⚠ No more unrated candidates left.");
        }

        res.json(unratedCandidates);
    } catch (error) {
        console.error("❌ Error fetching candidates:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/next-candidate", async (req, res) => {
    try {
        let { eventId } = req.query;
        const judgeId = req.session.judgeId;

        if (!judgeId) {
            return res.status(401).json({ error: "Unauthorized. Please log in first." });
        }

        // If eventId is not provided in query, get it from session
        if (!eventId) {
            eventId = req.session.eventId;
        } else {
            // Store eventId in session for later use
            req.session.eventId = eventId;
        }

        if (!eventId) {
            return res.status(400).json({ error: "Event ID is required." });
        }

        console.log(`Fetching next candidate for eventId: ${eventId}, judgeId: ${judgeId}`);

        // Fetch next candidate
        const [results] = await db.promise().query(
            `SELECT c.id, c.name FROM candidates c
            JOIN enrollments e ON c.id = e.candidate_id
            WHERE e.event_id = ? 
            AND NOT EXISTS (
                SELECT 1 FROM ratings r 
                WHERE r.candidate_id = c.id AND r.judge_id = ? AND r.event_id = ?
            )
            LIMIT 1`,
            [eventId, judgeId, eventId]
        );

        if (results.length === 0) {
            return res.status(404).json({ 
                error: "No more candidates available.", 
                redirect: "/dashboard" 
            });
        }

        res.json(results[0]); // ✅ Return candidate data

    } catch (error) {
        console.error("Error fetching next candidate:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//winner page


app.get('/manage-winners', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'winner.html'));
});

app.get('/api/events', async (req, res) => {
    try {
      const [results] = await db.query('SELECT id, event_name AS name FROM events');
      res.json(results);
    } catch (err) {
      console.error('❌ Error fetching events:', err);
      res.status(500).json({ error: 'Database error while fetching events' });
    }
  });
  

  app.get('/api/winners', async (req, res) => {
    const event_id = req.query.event_id;
    if (!event_id) return res.status(400).json([]);
  
    try {
      const [results] = await db.query(`
        SELECT 
          r.candidate_id,
          c.name AS candidate_name,
          AVG(r.performance + r.presentation + r.time + r.engagement) / 4 AS avg_score
        FROM ratings r
        JOIN candidates c ON r.candidate_id = c.id
        WHERE r.event_id = ?
        GROUP BY r.candidate_id, c.name
        ORDER BY avg_score DESC
        LIMIT 5;
      `, [event_id]);
  
      res.json(results);
    } catch (err) {
      console.error('❌ Error fetching winners:', err);
      res.status(500).json([]);
    }
  });
    
// ✅ Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
