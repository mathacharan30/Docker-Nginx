const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

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

app.get('/api/items', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  const items = await db.collection('items').find().toArray();
  res.json(items);
});

app.post('/api/items', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  const result = await db.collection('items').insertOne(req.body);
  res.json({ message: 'Added!', id: result.insertedId });
});

app.put('/api/items/:id', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  await db.collection('items').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.json({ message: 'Updated!' });
});

app.delete('/api/items/:id', async (req, res) => {
  if (!db) return res.status(503).json({ message: 'DB not ready yet' });
  await db.collection('items').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: 'Deleted!' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
