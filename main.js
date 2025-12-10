const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Command } = require('commander');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const program = new Command();
program
  .option('-h, --host <host>', 'Server host', '0.0.0.0')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-c, --cache <cache>', 'Cache folder', '/app/uploads');
program.parse(process.argv);
const options = program.opts();

const HOST = options.host || process.env.SERVER_HOST || '0.0.0.0';
const PORT = options.port || process.env.SERVER_PORT || 3000;
const CACHE_DIR = options.cache || process.env.CACHE_PATH || './uploads';

console.log('testeeeeeee');
console.log('test2');
console.log('test3');

// Підключення до PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@db:5432/${process.env.DB_NAME}`,
});

const photoFolder = path.resolve(CACHE_DIR);
if (!fs.existsSync(photoFolder)) {
  fs.mkdirSync(photoFolder, { recursive: true });
}

// Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photoFolder),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

// Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Inventory Service API', version: '1.0.0', description: 'API documentation' },
    servers: [{ url: `http://${HOST}:${PORT}` }]
  },
  apis: ['./main.js']
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


app.get('/RegisterForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'RegisterForm.html'))
);

app.get('/SearchForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'SearchForm.html'))
);

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Створено
 *       400:
 *         description: Не вказано name
 */
app.post('/register', upload.single('photo'), async (req, res) => {
  const name = req.body.inventory_name;
  if (!name) return res.status(400).json({ error: 'no inventory_name' });

  try {
    const photoFile = req.file ? path.basename(req.file.path) : null;
    const result = await pool.query(
      'INSERT INTO items (inventory_name, description, photoFile) VALUES ($1, $2, $3) RETURNING *',
      [name, req.body.description || '', photoFile]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список всіх речей
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: Масив інвентаря
 */
app.get('/inventory', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати річ за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Успішно
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити ім'я або опис
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Оновлено
 *       404:
 *         description: Не знайдено
 */
app.put('/inventory/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const item = result.rows[0];
    const newName = req.body.inventory_name !== undefined ? req.body.inventory_name : item.inventory_name;
    const newDesc = req.body.description !== undefined ? req.body.description : item.description;

    const updateResult = await pool.query(
      'UPDATE items SET inventory_name = $1, description = $2 WHERE id = $3 RETURNING *',
      [newName, newDesc, req.params.id]
    );
    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Фото
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id/photo', async (req, res) => {
  try {
    const result = await pool.query('SELECT photoFile FROM items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].photofile) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(photoFolder, result.rows[0].photofile);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo file missing' });

    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Не знайдено
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const result = await pool.query('SELECT photoFile FROM items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Not found' });
    }

    // Видалити старе фото
    const oldPhoto = result.rows[0].photofile;
    if (oldPhoto) {
      const oldFilePath = path.join(photoFolder, oldPhoto);
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    }

    // Оновити новим фото
    const newPhotoFile = req.file ? path.basename(req.file.path) : null;
    await pool.query('UPDATE items SET photoFile = $1 WHERE id = $2', [newPhotoFile, req.params.id]);

    const updatedResult = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    res.json(updatedResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити річ
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 */
app.delete('/inventory/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING photoFile', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    // Видалити фото
    const photoFile = result.rows[0].photofile;
    if (photoFile) {
      const filePath = path.join(photoFolder, photoFile);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук речі за ID
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               includePhoto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Результат пошуку
 *       404:
 *         description: Не знайдено
 */
app.post('/search', async (req, res) => {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).json({ error: 'no id' });

    const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const item = result.rows[0];
    const response = { ...item };
    if (req.body.includePhoto === 'on' && item.photofile) {
      response.photo_url = `/inventory/${id}/photo`;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Пошук речі за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: includePhoto
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Результат пошуку
 *       404:
 *         description: Не знайдено
 *       500:
 *         description: Помилка сервера
 */
app.get('/search', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'no id' });

    const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const item = result.rows[0];
    const response = { ...item };
    
    if (req.query.includePhoto && item.photofile) {
      response.photo_url = `/inventory/${id}/photo`;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.use((req, res) => res.status(405).json({ error: 'Method not allowed' }));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});