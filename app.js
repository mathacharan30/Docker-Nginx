const express = require('express');
const { ObjectId } = require('mongodb');

const app = express();
app.use(express.json());

let db;

function setDb(database) {
  db = database;
}

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

module.exports = { app, setDb };
