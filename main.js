const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); //обробка файлів у HTML формах
const { Command } = require('commander');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const program = new Command();
program
  .requiredOption('-h, --host <host>')
  .requiredOption('-p, --port <port>')
  .requiredOption('-c, --cache <cache>');
program.parse(process.argv);
const options = program.opts();

const photoFolder = path.resolve(options.cache); //складає шлях починаючи з поточної директорії
if (!fs.existsSync(photoFolder)) fs.mkdirSync(photoFolder, { recursive: true });

// express
const app = express(); 
app.use(express.json()); // автоматично парсить JSON з тіла запиту
app.use(express.urlencoded({ extended: true })); // парсить дані форм (x-www-form-urlencoded)

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photoFolder), //callback, який каже де зберігати
  filename: (req, file, cb) =>
    cb(null, `${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

////////
const inventory = {}; //об'єкт, що зберігає всі предмети
let nextId = 1;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Inventory Service API', version: '1.0.0', description: 'API documentation' },
    servers: [{ url: `http://${options.host}:${options.port}` }]
  },
  apis: ['./main.js']
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//HTML forms
/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Повертає форму реєстрації
 *     tags: [HTML Forms]
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
app.get('/RegisterForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'RegisterForm.html'))
);

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Повертає форму пошуку
 *     tags: [HTML Forms]
 *     responses:
 *       200:
 *         description: HTML сторінка
 */
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
app.post('/register', upload.single('photo'), (req, res) => {
  const name = req.body.inventory_name;
  if (!name) return res.status(400).json({ error: 'no inventory_name' });

  const id = String(nextId++);
  const newitem = {
    id,
    inventory_name: name,
    description: req.body.description || '',
    photoFile: req.file ? path.basename(req.file.path) : null //basename отримує ім'я файлу без шляху
  };
  inventory[id] = newitem; 
  res.status(201).json(newitem);
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
app.get('/inventory', (req, res) => {
  res.json(Object.values(inventory));
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
 *           type: string
 *     responses:
 *       200:
 *         description: Успішно
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id', (req, res) => { // :id - динамічна частина url
  const item = inventory[req.params.id]; //req.params.id отримує ID з URL
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
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
 *           type: string
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
app.put('/inventory/:id', (req, res) => {
  const item = inventory[req.params.id]; 
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
  if (req.body.description !== undefined) item.description = req.body.description;

  res.json(item);
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
 *           type: string
 *     responses:
 *       200:
 *         description: Фото
 *       404:
 *         description: Не знайдено
 */
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventory[req.params.id];
  if (!item || !item.photoFile) return res.status(404).json({ error: 'Photo not found' });

  const filePath = path.join(photoFolder, item.photoFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo file missing' });

  res.sendFile(filePath);
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
 *           type: string
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
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => { //оновлює або додає фото
  const item = inventory[req.params.id];
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.photoFile) {
    const oldFile = path.join(photoFolder, item.photoFile);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  item.photoFile = path.basename(req.file.path);
  res.json(item);
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
 *           type: string
 *     responses:
 *       200:
 *         description: Видалено
 *       404:
 *         description: Не знайдено
 */
app.delete('/inventory/:id', (req, res) => {
  const item = inventory[req.params.id];
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.photoFile) {
    const ph = path.join(photoFolder, item.photoFile);
    if (fs.existsSync(ph)) fs.unlinkSync(ph);
  }

  delete inventory[req.params.id];
  res.json({ message: 'Deleted' });
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
 *                 type: string
 *               includePhoto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Результат пошуку
 *       404:
 *         description: Не знайдено
 */
app.post('/search', (req, res) => {
  const id = req.body.id; //ID в тілі запиту (форма)
  if (!id) return res.status(400).json({ error: 'no id' });

  const item = inventory[id];
  if (!item) return res.status(404).json({ error: 'Not found' });

  const result = { ...item };
  if (req.body.includePhoto === 'on' && item.photoFile) {
    result.photo_url = `/inventory/${id}/photo`;
  }

  res.json(result);
});

app.use((req, res) => res.status(405).json({ error: 'Method not allowed' })); // викликається для всіх методів, якщо жоден попередній маршрут не підійшов

app.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}`);
});