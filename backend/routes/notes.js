const express = require('express');
const router = express.Router();
const { authMiddleware, staffMiddleware, parseIntParam } = require('../middleware/auth');

// All routes require authentication and staff level
router.use(authMiddleware);
router.use(staffMiddleware);

// Get notes for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  const pool = req.app.locals.pool;
  const { entityType } = req.params;
  const entityId = parseIntParam(req.params.entityId);

  // Validate entity type
  const validTypes = ['user', 'order', 'domain'];
  if (!validTypes.includes(entityType)) {
    return res.status(400).json({ error: 'Invalid entity type' });
  }

  if (entityId === null) {
    return res.status(400).json({ error: 'Invalid entity ID' });
  }

  try {
    const result = await pool.query(
      `SELECT sn.*, u.username as staff_username, u.full_name as staff_name
       FROM staff_notes sn
       LEFT JOIN users u ON u.id = sn.staff_user_id
       WHERE sn.entity_type = $1 AND sn.entity_id = $2
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [entityType, entityId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// Create a note
router.post('/:entityType/:entityId', async (req, res) => {
  const pool = req.app.locals.pool;
  const { entityType } = req.params;
  const entityId = parseIntParam(req.params.entityId);
  const { note, is_pinned = false } = req.body;

  // Validate entity type
  const validTypes = ['user', 'order', 'domain'];
  if (!validTypes.includes(entityType)) {
    return res.status(400).json({ error: 'Invalid entity type' });
  }

  if (entityId === null) {
    return res.status(400).json({ error: 'Invalid entity ID' });
  }

  if (!note || note.trim().length === 0) {
    return res.status(400).json({ error: 'Note content is required' });
  }

  try {
    // Verify entity exists
    let entityExists = false;
    if (entityType === 'user') {
      const check = await pool.query('SELECT id FROM users WHERE id = $1', [entityId]);
      entityExists = check.rows.length > 0;
    } else if (entityType === 'order') {
      const check = await pool.query('SELECT id FROM orders WHERE id = $1', [entityId]);
      entityExists = check.rows.length > 0;
    } else if (entityType === 'domain') {
      const check = await pool.query('SELECT id FROM domains WHERE id = $1', [entityId]);
      entityExists = check.rows.length > 0;
    }

    if (!entityExists) {
      return res.status(404).json({ error: `${entityType} not found` });
    }

    const result = await pool.query(
      `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [entityType, entityId, req.user.id, note.trim(), is_pinned]
    );

    // Fetch with staff info
    const noteWithStaff = await pool.query(
      `SELECT sn.*, u.username as staff_username, u.full_name as staff_name
       FROM staff_notes sn
       LEFT JOIN users u ON u.id = sn.staff_user_id
       WHERE sn.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(noteWithStaff.rows[0]);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update a note
router.put('/:noteId', async (req, res) => {
  const pool = req.app.locals.pool;
  const noteId = parseIntParam(req.params.noteId);
  const { note, is_pinned } = req.body;

  if (noteId === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  try {
    // Check if note exists
    const existing = await pool.query(
      `SELECT * FROM staff_notes WHERE id = $1`,
      [noteId]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only allow edit if they created it or are admin (level 3+)
    const noteRow = existing.rows[0];
    if (noteRow.staff_user_id !== req.user.id && req.user.role_level < 3 && !req.user.is_admin) {
      return res.status(403).json({ error: 'You can only edit your own notes' });
    }

    const result = await pool.query(
      `UPDATE staff_notes SET
        note = COALESCE($1, note),
        is_pinned = COALESCE($2, is_pinned),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [note, is_pinned, noteId]
    );

    // Fetch with staff info
    const noteWithStaff = await pool.query(
      `SELECT sn.*, u.username as staff_username, u.full_name as staff_name
       FROM staff_notes sn
       LEFT JOIN users u ON u.id = sn.staff_user_id
       WHERE sn.id = $1`,
      [noteId]
    );

    res.json(noteWithStaff.rows[0]);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
router.delete('/:noteId', async (req, res) => {
  const pool = req.app.locals.pool;
  const noteId = parseIntParam(req.params.noteId);

  if (noteId === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  try {
    // Check ownership or admin status
    const existing = await pool.query(
      `SELECT staff_user_id FROM staff_notes WHERE id = $1`,
      [noteId]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only allow delete if they created it or are admin (level 3+)
    if (existing.rows[0].staff_user_id !== req.user.id && req.user.role_level < 3 && !req.user.is_admin) {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    await pool.query(`DELETE FROM staff_notes WHERE id = $1`, [noteId]);

    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Toggle pin status
router.post('/:noteId/toggle-pin', async (req, res) => {
  const pool = req.app.locals.pool;
  const noteId = parseIntParam(req.params.noteId);

  if (noteId === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  try {
    // Check if note exists and get ownership info
    const existing = await pool.query(
      `SELECT staff_user_id FROM staff_notes WHERE id = $1`,
      [noteId]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only allow toggle if they created it or are admin (level 3+)
    if (existing.rows[0].staff_user_id !== req.user.id && req.user.role_level < 3 && !req.user.is_admin) {
      return res.status(403).json({ error: 'You can only toggle pin on your own notes' });
    }

    const result = await pool.query(
      `UPDATE staff_notes SET
        is_pinned = NOT is_pinned,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [noteId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

module.exports = router;
