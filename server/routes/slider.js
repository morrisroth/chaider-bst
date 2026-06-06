const router = require('express').Router();
const { read, write, uuid } = require('../db');
const auth = require('../middleware/auth');

router.get('/', (_, res) => {
  const slides = read('slider.json').sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(slides);
});

router.post('/', auth, (req, res) => {
  const slides = read('slider.json');
  const slide = { id: uuid(), image: req.body.image || '', title: req.body.title || '', caption: req.body.caption || '', order: slides.length };
  slides.push(slide);
  write('slider.json', slides);
  res.status(201).json(slide);
});

router.patch('/:id', auth, (req, res) => {
  const slides = read('slider.json');
  const idx = slides.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  slides[idx] = { ...slides[idx], ...req.body, id: slides[idx].id };
  write('slider.json', slides);
  res.json(slides[idx]);
});

router.delete('/:id', auth, (req, res) => {
  const slides = read('slider.json');
  const idx = slides.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  slides.splice(idx, 1);
  write('slider.json', slides);
  res.json({ ok: true });
});

module.exports = router;
