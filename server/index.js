require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/posts',    require('./routes/posts'));
app.use('/api/gallery',  require('./routes/gallery'));
app.use('/api/slider',   require('./routes/slider'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/contact',  require('./routes/contact'));
app.use('/api/register', require('./routes/register'));
app.use('/api/upload',   require('./routes/upload'));

// Serve public site + admin panel
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
