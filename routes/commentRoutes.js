const express = require('express');
const router = express.Router();

const {
  addComment,
  getComments,
  deleteComment,
  likeComment,
} = require('../controllers/commentController');

// GET comments for a track
router.get('/:trackId', getComments);

// POST comment
router.post('/', addComment);

// LIKE comment
router.post('/like/:id', likeComment);

// DELETE comment
router.delete('/:id', deleteComment);

module.exports = router;