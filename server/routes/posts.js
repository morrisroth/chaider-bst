const router = require('express').Router();
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');

// public
router.get('/', (req, res) => {
  let posts = read('posts.json').filter(p => p.published);
  if (req.query.featured) posts = posts.filter(p => p.featured);
  if (req.query.category) posts = posts.filter(p => p.category === req.query.category);
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(posts);
});

router.get('/admin/all', auth, (_, res) => {
  const posts = read('posts.json').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(posts);
});

// admin: single post regardless of published state
router.get('/admin/:id', auth, (req, res) => {
  const post = read('posts.json').find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'לא נמצא' });
  res.json(post);
});

router.get('/:id', (req, res) => {
  const post = read('posts.json').find(p => p.id === req.params.id && p.published);
  if (!post) return res.status(404).json({ error: 'לא נמצא' });
  res.json(post);
});

// admin
router.post('/', auth, (req, res) => {
  const posts = read('posts.json');
  const post = {
    id: uuid(),
    title: req.body.title || '',
    excerpt: req.body.excerpt || '',
    content: req.body.content || '',
    image: req.body.image || '',
    category: req.body.category || 'כללי',
    date: req.body.date || new Date().toISOString().slice(0, 10),
    featured: req.body.featured ? 1 : 0,
    published: req.body.published ? 1 : 0,
    created_at: new Date().toISOString()
  };
  posts.push(post);
  write('posts.json', posts);
  res.status(201).json(post);
});

router.put('/:id', auth, (req, res) => {
  const posts = read('posts.json');
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  posts[idx] = { ...posts[idx], ...req.body, id: posts[idx].id, created_at: posts[idx].created_at };
  write('posts.json', posts);
  res.json(posts[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const posts = read('posts.json');
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  posts.splice(idx, 1);
  write('posts.json', posts);
  res.json({ ok: true });
});

module.exports = router;
