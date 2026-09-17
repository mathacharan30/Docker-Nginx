const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';

let db;

MongoClient.connect(MONGO_URL).then(client => {
  db = client.db('mydb');
  console.log('Connected to MongoDB');
});

app.get('/', async (req, res) => {
  const items = await db.collection('items').find().toArray();
  res.json(items);
});

app.post('/add', async (req, res) => {
  await db.collection('items').insertOne(req.body);
  res.json({ message: 'Added!' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
