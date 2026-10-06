const { MongoClient } = require('mongodb');
const { app, setDb } = require('./app');

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';

async function connectWithRetry() {
  while (true) {
    try {
      const client = await MongoClient.connect(MONGO_URL);
      setDb(client.db('mydb'));
      console.log('Connected to MongoDB');
      break;
    } catch (err) {
      console.log('MongoDB not ready, retrying in 3 seconds...');
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}

connectWithRetry();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
