import mongoose from 'mongoose';
export async function connectDb() {
  if (!process.env.MONGODB_URI) { console.log('MONGODB_URI blank: using in-memory demo data'); return; }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
  console.log('Connected to MongoDB');
}
export const mongoReady = () => mongoose.connection.readyState === 1;
