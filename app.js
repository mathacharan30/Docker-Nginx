const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';

let db;

async function connectWithRetry() {
  while (true) {
    try {
      const client = await MongoClient.connect(MONGO_URL);
      db = client.db('mydb');
      console.log('Connected to MongoDB');
      break;
    } catch (err) {
      console.log('MongoDB not ready, retrying in 3 seconds...');
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}

connectWithRetry();

app.get('/', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  const items = await db.collection('items').find().toArray();
  res.json(items);
});

app.post('/add', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  await db.collection('items').insertOne(req.body);
  res.json({ message: 'Added!' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
